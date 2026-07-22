from fastapi import FastAPI

app = FastAPI(title="UTFL Trade Finance API")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
