from time import perf_counter
import tracemalloc

from advanced_search_system.db.connection import get_connection


SQL = """
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


def search_products(query: str) -> dict:

    # ============================================================
    # APPLICATION-SIDE MEASUREMENT
    # ============================================================

    tracemalloc.start()

    start_timer = perf_counter()

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:

                cur.execute(
                    SQL,
                    (query,),
                )

                rows = cur.fetchall()

        end_timer = perf_counter()

        current_memory, peak_memory = (
            tracemalloc.get_traced_memory()
        )

    finally:
        if tracemalloc.is_tracing():
            tracemalloc.stop()


    # ============================================================
    # APPLICATION METRICS
    # ============================================================

    application_time_ms = (
        end_timer - start_timer
    ) * 1000

    current_memory_mb = (
        current_memory
        / (1024 * 1024)
    )

    peak_memory_mb = (
        peak_memory
        / (1024 * 1024)
    )


    # ============================================================
    # POSTGRESQL EXECUTION PLAN
    #
    # IMPORTANT:
    # EXPLAIN ANALYZE executes the fuzzy query again.
    #
    # It is intentionally outside application_time_ms.
    # ============================================================

    explain_sql = f"""
    EXPLAIN (
        ANALYZE,
        BUFFERS,
        FORMAT JSON
    )

    {SQL}
    """


    with get_connection() as conn:
        with conn.cursor() as cur:

            cur.execute(
                explain_sql,
                (query,),
            )

            explain_row = cur.fetchone()


    # ============================================================
    # EXTRACT QUERY PLAN
    # ============================================================

    query_plan = None

    if explain_row:

        # This assumes your connection uses dict-like rows,
        # as in your previous versions.
        explain_data = explain_row["QUERY PLAN"]

        if explain_data:
            query_plan = explain_data[0]


    # ============================================================
    # RESPONSE
    # ============================================================

    return {
        "version": "v4",

        "engine": "postgresql_pg_trgm",

        "strategy": "fuzzy_search",

        "query": query,

        "count": len(rows),

        "metrics": {
            "application_time_ms": round(
                application_time_ms,
                3,
            ),

            "current_memory_mb": round(
                current_memory_mb,
                3,
            ),

            "peak_memory_mb": round(
                peak_memory_mb,
                3,
            ),
        },

        "query_plan": query_plan,

        "raw_sql": SQL,

        "results": rows,
    }


def main() -> None:

    query = input(
        "Enter your query: "
    ).strip()

    if not query:
        print("Query cannot be empty.")
        return


    result = search_products(
        query
    )


    print(
        f"\nQuery: "
        f"{result['query']}"
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
        f"Current Python memory: "
        f"{result['metrics']['current_memory_mb']} MB"
    )

    print(
        f"Peak Python memory: "
        f"{result['metrics']['peak_memory_mb']} MB"
    )

    print("\nResults:\n")

    for row in result["results"]:
        print(row)


if __name__ == "__main__":
    main()