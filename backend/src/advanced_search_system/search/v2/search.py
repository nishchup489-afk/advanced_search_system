from advanced_search_system.db.connection import get_connection
from time import perf_counter
import tracemalloc

SQL = """
WITH searchable_products AS (
    SELECT
        id,
        name,
        description,
        brand,
        category,
        tags,
        price,
        rating,
        stock,
        created_at,

        setweight(
            to_tsvector(
                'english',
                COALESCE(name, '')
            ),
            'A'
        )
        ||
        setweight(
            to_tsvector(
                'english',
                COALESCE(brand, '')
            ),
            'B'
        )
        ||
        setweight(
            to_tsvector(
                'english',
                COALESCE(category, '')
            ),
            'B'
        )
        ||
        setweight(
            to_tsvector(
                'english',
                COALESCE(array_to_string(tags, ' '), '')
            ),
            'C'
        )
        ||
        setweight(
            to_tsvector(
                'english',
                COALESCE(description, '')
            ),
            'D'
        ) AS search_vector

    FROM products
),

search_input AS (
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

    COUNT(*) OVER () AS total_count,

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

FROM searchable_products AS p
CROSS JOIN search_input AS q

WHERE p.search_vector @@ q.query

ORDER BY
    rank DESC,
    p.id ASC

LIMIT %s
OFFSET %s
;
"""


def search_products(
    query: str,
    limit: int = 10,
    offset: int = 0,
) -> dict:
    connection = get_connection()

    tracemalloc.start()
    start_timer = perf_counter()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                SQL,
                (query, limit, offset),
            )

            rows = cursor.fetchall()

        end_timer = perf_counter()

        current_memory, peak_memory = (
            tracemalloc.get_traced_memory()
        )

    finally:
        tracemalloc.stop()
        connection.close()

    application_time_ms = (
        end_timer - start_timer
    ) * 1000

    current_memory_mb = (
        current_memory / (1024 * 1024)
    )

    peak_memory_mb = (
        peak_memory / (1024 * 1024)
    )

    total_count = (
        rows[0]["total_count"]
        if rows
        else 0
    )

    for row in rows:
        row.pop("total_count", None)

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
                (query, limit, offset),
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

        "total_count": total_count,

        "limit": limit,

        "offset": offset,

        "has_more": (
            offset + len(rows) < total_count
        ),

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

        "raw_sql": SQL.strip(),

        "results": rows,
    }
