from fastapi import FastAPI

from app.routers import auth, document_registry, documents, organizations, trades, users

app = FastAPI(title="UTFL Trade Finance API")
app.include_router(auth.router)
app.include_router(organizations.router)
app.include_router(users.router)
app.include_router(document_registry.router)
app.include_router(trades.router)
app.include_router(documents.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
