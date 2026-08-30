from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from advanced_search_system.api.v1 import router as v1_router
from advanced_search_system.api.v2 import router as v2_router
from advanced_search_system.api.v3 import router as v3_router
from advanced_search_system.api.v4 import router as v4_router
from advanced_search_system.api.v5 import router as v5_router

app = FastAPI(
    title="SearchLab API",
    description="PostgreSQL search evolution lab",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://advanced-search-system.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8765",
        "http://127.0.0.1:8765",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "SearchLab API",
    }



app.include_router(v1_router)
app.include_router(v2_router)
app.include_router(v3_router)
app.include_router(v4_router)
app.include_router(v5_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
