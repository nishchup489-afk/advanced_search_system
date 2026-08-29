from fastapi import FastAPI



app = FastAPI(
    title="Advanced Search Lab",
    version="0.1.0",
)


@app.get("/")
def read_root():
    return {"message": "Welcome to the Advanced Search Lab API!"}


@app.get("/health")
def health_check():
    return {"status": "ok"}