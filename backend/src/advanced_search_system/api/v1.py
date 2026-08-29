from fastapi import APIRouter, Query

from advanced_search_system.search.v1.search import search_products


router = APIRouter(
    prefix="/api/v1",
    tags=["V1 - ILIKE"],
)


# GET /api/v1/search?q=keyboard

@router.get("/search")
def search(
    q: str = Query(
        ...,
        min_length=1,
        max_length=200,
        description="Product search query",
    ),
):
    query = q.strip()

    return search_products(query)