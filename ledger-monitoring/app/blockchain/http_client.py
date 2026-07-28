import json
from typing import Any

import httpx

from app.blockchain.client import BlockchainLayerError, BlockchainLayerUnreachableError


class HttpBlockchainLayerClient:
    def __init__(
        self,
        base_url: str,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 60.0,
    ) -> None:
        self._base_url = base_url
        self._transport = transport
        self._timeout = timeout

    async def ship_goods(
        self, linear_id: str, document_id: str, document_type: str, on_chain_hash: str
    ) -> dict[str, Any]:
        return await self._post_flow(
            "/flows/ship-goods",
            {
                "linearId": linear_id,
                "documentId": document_id,
                "documentType": document_type,
                "onChainHash": on_chain_hash,
            },
        )

    async def settle_payment(
        self, linear_id: str, document_id: str, document_type: str, on_chain_hash: str
    ) -> dict[str, Any]:
        return await self._post_flow(
            "/flows/settle-payment",
            {
                "linearId": linear_id,
                "documentId": document_id,
                "documentType": document_type,
                "onChainHash": on_chain_hash,
            },
        )

    async def _post_flow(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(
                base_url=self._base_url, transport=self._transport, timeout=self._timeout
            ) as client:
                response = await client.post(path, json=payload)
        except httpx.RequestError as exc:
            raise BlockchainLayerUnreachableError(f"{type(exc).__name__}: {exc}") from exc

        if response.status_code >= 400:
            try:
                body = response.json()
            except (json.JSONDecodeError, ValueError):
                body = {"error": response.text[:500]}
            raise BlockchainLayerError(status_code=response.status_code, body=body)

        try:
            return response.json()
        except (json.JSONDecodeError, ValueError) as exc:
            raise BlockchainLayerUnreachableError(
                f"blockchain-layer returned a non-JSON success body (status {response.status_code})"
            ) from exc
