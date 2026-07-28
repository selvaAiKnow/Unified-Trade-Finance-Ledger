from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.blockchain.client import BlockchainLayerError, BlockchainLayerUnreachableError
from app.routers import events

app = FastAPI(title="UTFL Ledger Monitoring")
app.include_router(events.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(BlockchainLayerError)
async def blockchain_layer_error_handler(request: Request, exc: BlockchainLayerError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.body)


@app.exception_handler(BlockchainLayerUnreachableError)
async def blockchain_layer_unreachable_handler(
    request: Request, exc: BlockchainLayerUnreachableError
) -> JSONResponse:
    return JSONResponse(status_code=502, content={"error": f"blockchain-layer unreachable: {exc}"})
