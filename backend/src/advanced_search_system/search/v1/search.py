from time import perf_counter
import tracemalloc


from advanced_search_system.db.connection import get_connection


def search_products(query: str):
    pattern = f"%{query}%"

    sql = """
    SELECT
        id,
        name,
        description,
        brand,
        category,
        price,
        rating,
        stock
    FROM products
    WHERE
        name ILIKE %s
        OR description ILIKE %s
        OR brand ILIKE %s
        OR category ILIKE %s
    ;
    """

    params = (
        pattern,
        pattern,
        pattern,
        pattern,
    )


    tracemalloc.start()

    start_timer = perf_counter()

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    end_timer = perf_counter()

    current_memory, peak_memory = (
        tracemalloc.get_traced_memory()
    )

    tracemalloc.stop()


    execution_time_ms = (
        end_timer - start_timer
    ) * 1000

    current_memory_mb = (
        current_memory / (1024 * 1024)
    )

    peak_memory_mb = (
        peak_memory / (1024 * 1024)
    )



    explain_sql = f"""
    EXPLAIN (
        ANALYZE,
        BUFFERS,
        FORMAT JSON
    )
    {sql}
    """


    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                explain_sql,
                params,
            )

            explain_row = cur.fetchone()



    query_plan = None

    if explain_row:
        explain_data = explain_row["QUERY PLAN"]

        if explain_data:
            query_plan = explain_data[0]


    return {
        "query": query,

        "count": len(rows),

        "metrics": {
            "execution_time_ms": round(
                execution_time_ms,
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

        "results": rows,
    }