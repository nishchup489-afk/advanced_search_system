from fastapi import APIRouter, Query

from advanced_search_system.search.v4.search import search_products


router = APIRouter(
    prefix="/api/v4",
    tags=["V4 - Fuzzy Search with pg_trgm"],
)


@router.get("/search")
def search(
    q: str = Query(
        ...,
        min_length=1,
        max_length=200,
        description="Typo-tolerant product search query",
    ),
    limit: int = Query(
        10,
        ge=1,
        le=100,
        description="Maximum number of results to return",
    ),
    offset: int = Query(
        0,
        ge=0,
        description="Number of matching results to skip",
    ),
):
    result = search_products(q.strip())
    all_results = result.get("results", [])
    total_count = len(all_results)
    page_results = all_results[offset:offset + limit]

    return {
        **result,
        "count": len(page_results),
        "total_count": total_count,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(page_results) < total_count,
        "fallback_used": True,
        "results": page_results,
    }
