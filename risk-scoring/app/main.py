from fastapi import FastAPI

app = FastAPI(title="UTFL Risk Scoring")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
