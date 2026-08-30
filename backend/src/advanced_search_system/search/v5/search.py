from __future__ import annotations

import hashlib
import json
from time import perf_counter
import tracemalloc

from fastapi.encoders import jsonable_encoder
from redis.exceptions import RedisError

from advanced_search_system.cache.client import redis_client
from advanced_search_system.db.connection import get_connection


# ================================================================
# CONFIG
# ================================================================

CACHE_TTL_SECONDS = 300

# SearchLab:
# Keep this True so the UI can inspect PostgreSQL.
#
# Production:
# You would normally NOT run EXPLAIN ANALYZE on every request.
ENABLE_EXPLAIN = True


# ================================================================
# V3 — FULL-TEXT SEARCH + GIN
# ================================================================

FTS_SQL = """
WITH search_input AS (
    SELECT websearch_to_tsquery(
        'english',
        %s
    ) AS query
)

SELECT
    p.id,
    p.name,
    p.description,
    p.brand,
    p.category,
    p.tags,
    p.price,
    p.rating,
    p.stock,
    p.created_at,

    ts_rank_cd(
        p.search_vector,
        q.query
    ) AS rank,

    ts_headline(
        'english',
        COALESCE(p.description, ''),
        q.query,
        'StartSel=<mark>, StopSel=</mark>, MaxWords=30, MinWords=10'
    ) AS headline

FROM products AS p

CROSS JOIN search_input AS q

WHERE p.search_vector @@ q.query

ORDER BY
    rank DESC,
    p.id ASC;
"""


# ================================================================
# V4 — FUZZY FALLBACK
# ================================================================

FUZZY_SQL = """
WITH search_input AS (
    SELECT %s::text AS query
)

SELECT
    p.id,
    p.name,
    p.description,
    p.brand,
    p.category,
    p.tags,
    p.price,
    p.rating,
    p.stock,
    p.created_at,

    GREATEST(
        similarity(
            p.name,
            q.query
        ),

        similarity(
            COALESCE(p.brand, ''),
            q.query
        ),

        similarity(
            COALESCE(p.category, ''),
            q.query
        )
    ) AS fuzzy_score

FROM products AS p

CROSS JOIN search_input AS q

WHERE
       p.name %% q.query

    OR COALESCE(p.brand, '') %% q.query

    OR COALESCE(p.category, '') %% q.query

ORDER BY
    fuzzy_score DESC,
    p.id ASC;
"""


# ================================================================
# QUERY NORMALIZATION
# ================================================================

def normalize_query(query: str) -> str:
    """
    Make equivalent user queries produce the same cache key.

    Example:

        "   Logitech    Keyboard   "

    becomes:

        "logitech keyboard"
    """

    return " ".join(
        query.lower().split()
    )


# ================================================================
# CACHE KEY
# ================================================================

def build_cache_key(
    normalized_query: str,
) -> str:

    query_hash = hashlib.sha256(
        normalized_query.encode("utf-8")
    ).hexdigest()

    return (
        f"search:v5:{query_hash}"
    )


# ================================================================
# DATABASE QUERY EXECUTION
# ================================================================

def execute_search_query(
    sql: str,
    query: str,
) -> tuple[list, float]:

    start = perf_counter()

    with get_connection() as conn:
        with conn.cursor() as cur:

            cur.execute(
                sql,
                (query,),
            )

            rows = cur.fetchall()

    end = perf_counter()

    execution_time_ms = (
        end - start
    ) * 1000

    return (
        rows,
        execution_time_ms,
    )


# ================================================================
# EXPLAIN ANALYZE
# ================================================================

def explain_query(
    sql: str,
    query: str,
) -> tuple[dict | None, float]:

    explain_sql = f"""
    EXPLAIN (
        ANALYZE,
        BUFFERS,
        FORMAT JSON
    )

    {sql}
    """

    start = perf_counter()

    with get_connection() as conn:
        with conn.cursor() as cur:

            cur.execute(
                explain_sql,
                (query,),
            )

            explain_row = cur.fetchone()

    end = perf_counter()

    explain_time_ms = (
        end - start
    ) * 1000

    if not explain_row:
        return (
            None,
            explain_time_ms,
        )

    # ------------------------------------------------------------
    # Supports the dict-style row factory you have been using.
    #
    # Also has a tuple fallback in case connection.py ever changes.
    # ------------------------------------------------------------

    if isinstance(explain_row, dict):

        explain_data = explain_row.get(
            "QUERY PLAN"
        )

    else:

        explain_data = explain_row[0]

    if not explain_data:
        return (
            None,
            explain_time_ms,
        )

    # EXPLAIN FORMAT JSON normally gives a list
    # containing one top-level plan object.

    if isinstance(explain_data, list):
        query_plan = explain_data[0]

    else:
        query_plan = explain_data

    return (
        query_plan,
        explain_time_ms,
    )


# ================================================================
# REDIS — READ
# ================================================================

def get_cached_result(
    cache_key: str,
) -> tuple[
    dict | None,
    float,
    int | None,
    str | None,
]:

    start = perf_counter()

    try:

        cached_value = redis_client.get(
            cache_key
        )

        lookup_time_ms = (
            perf_counter() - start
        ) * 1000

        if cached_value is None:

            return (
                None,
                lookup_time_ms,
                None,
                None,
            )

        cached_result = json.loads(
            cached_value
        )

        # Remaining TTL is useful for the V5 UI.
        ttl_remaining = redis_client.ttl(
            cache_key
        )

        return (
            cached_result,
            lookup_time_ms,
            ttl_remaining,
            None,
        )

    except RedisError as exc:

        lookup_time_ms = (
            perf_counter() - start
        ) * 1000

        # Redis failure should NOT break search.
        return (
            None,
            lookup_time_ms,
            None,
            str(exc),
        )


# ================================================================
# REDIS — WRITE
# ================================================================

def cache_result(
    cache_key: str,
    result: dict,
) -> tuple[
    float,
    str | None,
]:

    start = perf_counter()

    try:

        redis_client.set(
            cache_key,
            json.dumps(
                jsonable_encoder(
                    result
                )
            ),
            ex=CACHE_TTL_SECONDS,
        )

        write_time_ms = (
            perf_counter() - start
        ) * 1000

        return (
            write_time_ms,
            None,
        )

    except RedisError as exc:

        write_time_ms = (
            perf_counter() - start
        ) * 1000

        # Search has already succeeded.
        # A cache failure should not destroy the response.

        return (
            write_time_ms,
            str(exc),
        )


# ================================================================
# ULTIMATE SEARCH
# ================================================================

def search_products(
    query: str,
) -> dict:

    normalized_query = normalize_query(
        query
    )

    if not normalized_query:
        raise ValueError(
            "Query cannot be empty."
        )


    cache_key = build_cache_key(
        normalized_query
    )


    # ============================================================
    # APPLICATION MEASUREMENT
    #
    # EXPLAIN ANALYZE is intentionally excluded.
    # ============================================================

    tracemalloc.start()

    application_start = perf_counter()


    try:

        # ========================================================
        # 1. REDIS LOOKUP
        # ========================================================

        (
            cached_result,
            cache_lookup_time_ms,
            ttl_remaining_seconds,
            cache_read_error,
        ) = get_cached_result(
            cache_key
        )


        # ========================================================
        # 2. CACHE HIT
        #
        # PostgreSQL is completely bypassed.
        # ========================================================

        if cached_result is not None:

            current_memory, peak_memory = (
                tracemalloc.get_traced_memory()
            )

            application_time_ms = (
                perf_counter()
                - application_start
            ) * 1000


            return {
                "version": "v5",

                "query": query,

                "normalized_query":
                    normalized_query,


                # -----------------------------------------------
                # SEARCH STRATEGY
                # -----------------------------------------------

                "strategy":
                    cached_result[
                        "strategy"
                    ],

                "fallback_used":
                    cached_result[
                        "fallback_used"
                    ],

                "engine":
                    cached_result[
                        "engine"
                    ],


                # -----------------------------------------------
                # CACHE
                # -----------------------------------------------

                "cache": {
                    "hit": True,

                    "key": cache_key,

                    "lookup_time_ms": round(
                        cache_lookup_time_ms,
                        3,
                    ),

                    "write_time_ms": 0,

                    "ttl_seconds":
                        CACHE_TTL_SECONDS,

                    "ttl_remaining_seconds":
                        ttl_remaining_seconds,

                    "error":
                        cache_read_error,
                },


                # -----------------------------------------------
                # DATABASE
                # -----------------------------------------------

                "database": {
                    "executed": False,

                    "fts_attempted": False,

                    "fuzzy_attempted": False,

                    "explain_executed": False,
                },


                # -----------------------------------------------
                # METRICS
                # -----------------------------------------------

                "metrics": {
                    "application_time_ms": round(
                        application_time_ms,
                        3,
                    ),

                    "fts_time_ms": 0,

                    "fuzzy_time_ms": 0,

                    "explain_time_ms": 0,

                    "current_memory_mb": round(
                        current_memory
                        / (1024 * 1024),
                        3,
                    ),

                    "peak_memory_mb": round(
                        peak_memory
                        / (1024 * 1024),
                        3,
                    ),
                },


                # -----------------------------------------------
                # IMPORTANT:
                #
                # No DB query happened on a cache hit,
                # therefore no EXPLAIN plan should be presented.
                # -----------------------------------------------

                "query_plan": None,

                "raw_sql": None,


                # -----------------------------------------------
                # RESULTS
                # -----------------------------------------------

                "count":
                    cached_result[
                        "count"
                    ],

                "results":
                    cached_result[
                        "results"
                    ],
            }


        # ========================================================
        # 3. CACHE MISS → PRIMARY V3 FTS
        # ========================================================

        (
            fts_rows,
            fts_time_ms,
        ) = execute_search_query(
            FTS_SQL,
            normalized_query,
        )


        fuzzy_time_ms = 0

        fallback_used = False


        # ========================================================
        # 4. FTS SUCCESS
        # ========================================================

        if fts_rows:

            strategy = "full_text"

            engine = (
                "postgresql_fts_gin"
            )

            active_sql = FTS_SQL

            rows = fts_rows


        # ========================================================
        # 5. FTS FAILED → V4 FUZZY FALLBACK
        # ========================================================

        else:

            fallback_used = True

            (
                rows,
                fuzzy_time_ms,
            ) = execute_search_query(
                FUZZY_SQL,
                normalized_query,
            )

            strategy = (
                "fuzzy_fallback"
            )

            engine = (
                "postgresql_pg_trgm"
            )

            active_sql = FUZZY_SQL


        # ========================================================
        # 6. CONVERT RESULTS TO JSON-SAFE VALUES
        #
        # Handles Decimal, datetime, etc.
        #
        # This also means Redis and normal API responses use the
        # same representation.
        # ========================================================

        safe_results = jsonable_encoder(
            rows
        )


        # ========================================================
        # 7. BUILD CACHEABLE RESULT
        #
        # Do NOT cache query plans or timing diagnostics.
        #
        # Those describe the execution that populated the cache,
        # not a future cache-hit request.
        # ========================================================

        cache_payload = {
            "strategy": strategy,

            "fallback_used":
                fallback_used,

            "engine": engine,

            "count":
                len(safe_results),

            "results":
                safe_results,
        }


        # ========================================================
        # 8. WRITE RESULT TO REDIS
        # ========================================================

        (
            cache_write_time_ms,
            cache_write_error,
        ) = cache_result(
            cache_key,
            cache_payload,
        )


        # ========================================================
        # STOP APPLICATION BENCHMARK
        #
        # EXPLAIN happens AFTER this.
        # ========================================================

        current_memory, peak_memory = (
            tracemalloc.get_traced_memory()
        )

        application_time_ms = (
            perf_counter()
            - application_start
        ) * 1000


    finally:

        if tracemalloc.is_tracing():
            tracemalloc.stop()


    # ============================================================
    # 9. EXPLAIN ACTIVE DATABASE STRATEGY
    #
    # This executes the selected SQL again.
    #
    # FTS result:
    #   explain FTS
    #
    # fuzzy fallback result:
    #   explain fuzzy query
    #
    # Cache hit:
    #   we never reach this block
    # ============================================================

    query_plan = None

    explain_time_ms = 0


    if ENABLE_EXPLAIN:

        (
            query_plan,
            explain_time_ms,
        ) = explain_query(
            active_sql,
            normalized_query,
        )


    # ============================================================
    # 10. FINAL RESPONSE
    # ============================================================

    return {
        "version": "v5",

        "query": query,

        "normalized_query":
            normalized_query,


        # --------------------------------------------------------
        # STRATEGY
        # --------------------------------------------------------

        "strategy": strategy,

        "fallback_used":
            fallback_used,

        "engine": engine,


        # --------------------------------------------------------
        # CACHE
        # --------------------------------------------------------

        "cache": {
            "hit": False,

            "key": cache_key,

            "lookup_time_ms": round(
                cache_lookup_time_ms,
                3,
            ),

            "write_time_ms": round(
                cache_write_time_ms,
                3,
            ),

            "ttl_seconds":
                CACHE_TTL_SECONDS,

            "ttl_remaining_seconds":
                CACHE_TTL_SECONDS,

            "read_error":
                cache_read_error,

            "write_error":
                cache_write_error,
        },


        # --------------------------------------------------------
        # DATABASE
        # --------------------------------------------------------

        "database": {
            "executed": True,

            "fts_attempted": True,

            "fuzzy_attempted":
                fallback_used,

            "explain_executed":
                ENABLE_EXPLAIN,
        },


        # --------------------------------------------------------
        # METRICS
        # --------------------------------------------------------

        "metrics": {
            "application_time_ms": round(
                application_time_ms,
                3,
            ),

            "fts_time_ms": round(
                fts_time_ms,
                3,
            ),

            "fuzzy_time_ms": round(
                fuzzy_time_ms,
                3,
            ),

            "explain_time_ms": round(
                explain_time_ms,
                3,
            ),

            "current_memory_mb": round(
                current_memory
                / (1024 * 1024),
                3,
            ),

            "peak_memory_mb": round(
                peak_memory
                / (1024 * 1024),
                3,
            ),
        },


        # --------------------------------------------------------
        # DIAGNOSTICS
        # --------------------------------------------------------

        "query_plan":
            query_plan,

        "raw_sql":
            active_sql,


        # --------------------------------------------------------
        # RESULTS
        # --------------------------------------------------------

        "count":
            len(safe_results),

        "results":
            safe_results,
    }


# ================================================================
# CLI
# ================================================================

def main() -> None:

    query = input(
        "Enter your query: "
    ).strip()


    if not query:

        print(
            "Query cannot be empty."
        )

        return


    result = search_products(
        query
    )


    print(
        f"\nQuery: "
        f"{result['query']}"
    )


    print(
        f"Normalized: "
        f"{result['normalized_query']}"
    )


    print(
        f"Cache hit: "
        f"{result['cache']['hit']}"
    )


    print(
        f"Strategy: "
        f"{result['strategy']}"
    )


    print(
        f"Fallback used: "
        f"{result['fallback_used']}"
    )


    print(
        f"Database executed: "
        f"{result['database']['executed']}"
    )


    print(
        f"Results: "
        f"{result['count']}"
    )


    print(
        f"Application time: "
        f"{result['metrics']['application_time_ms']} ms"
    )


    print(
        f"FTS time: "
        f"{result['metrics']['fts_time_ms']} ms"
    )


    print(
        f"Fuzzy time: "
        f"{result['metrics']['fuzzy_time_ms']} ms"
    )


    print(
        f"Peak Python memory: "
        f"{result['metrics']['peak_memory_mb']} MB"
    )


    print(
        "\nResults:\n"
    )


    for row in result["results"]:
        print(row)


if __name__ == "__main__":
    main()