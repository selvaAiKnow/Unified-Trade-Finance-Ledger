from fastapi import FastAPI

from app.routers import auth

app = FastAPI(title="UTFL Trade Finance API")
app.include_router(auth.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
