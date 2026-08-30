from fastapi import APIRouter, Query

from advanced_search_system.search.v2.search import search_products


router = APIRouter(
    prefix="/api/v2",
    tags=["V2 - Full-Text Search"],
)


# GET /api/v2/search?q=gaming%20mechanical%20keyboard
@router.get("/search")
def search(
    q: str = Query(
        ...,
        min_length=1,
        max_length=200,
        description="Product full-text search query",
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
    query = q.strip()

    return search_products(
        query=query,
        limit=limit,
        offset=offset,
    )
