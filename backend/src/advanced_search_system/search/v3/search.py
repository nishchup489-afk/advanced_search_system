from time import perf_counter
import tracemalloc

from advanced_search_system.db.connection import get_connection



SQL = """
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


def search_products(query: str) -> dict:

    # ============================================================
    # APPLICATION-SIDE MEASUREMENT
    # ============================================================

    connection = get_connection()

    rows = []

    tracemalloc.start()

    start_timer = perf_counter()

    try:
        with connection.cursor() as cursor:

            cursor.execute(
                SQL,
                (query,),
            )

            rows = cursor.fetchall()

        end_timer = perf_counter()

        current_memory, peak_memory = (
            tracemalloc.get_traced_memory()
        )

    finally:
        connection.close()

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
    # EXPLAIN ANALYZE executes the query again.
    #
    # Therefore it is intentionally NOT included in
    # application_time_ms.
    # ============================================================

    explain_sql = f"""
    EXPLAIN (
        ANALYZE,
        BUFFERS,
        FORMAT JSON
    )

    {SQL}
    """


    explain_row = None

    with get_connection() as conn:

        with conn.cursor() as cursor:

            cursor.execute(
                explain_sql,
                (query,),
            )

            explain_row = cursor.fetchone()


    # ============================================================
    # EXTRACT QUERY PLAN
    # ============================================================

    query_plan = None

    if explain_row:

        explain_data = explain_row[
            "QUERY PLAN"
        ]

        if explain_data:
            query_plan = explain_data[0]


    # ============================================================
    # RESPONSE
    # ============================================================

    return {
        "version": "v3",

        "engine": "postgresql_fts_gin",

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


# ================================================================
# CLI TESTING
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
        f"\nResults: "
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


if __name__ == "__main__":
    main()