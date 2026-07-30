from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, bank_review, document_registry, documents, organizations, sanctions_screening, trades, users

app = FastAPI(title="UTFL Trade Finance API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(organizations.router)
app.include_router(users.router)
app.include_router(document_registry.router)
app.include_router(trades.router)
app.include_router(documents.router)
app.include_router(sanctions_screening.router)
app.include_router(bank_review.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
