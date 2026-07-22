from fastapi import FastAPI

from app.routers import auth, organizations, users

app = FastAPI(title="UTFL Trade Finance API")
app.include_router(auth.router)
app.include_router(organizations.router)
app.include_router(users.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
