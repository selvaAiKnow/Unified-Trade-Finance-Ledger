from typing import Any

import httpx

from app.blockchain.client import BlockchainLayerError, BlockchainLayerUnreachableError


class HttpBlockchainLayerClient:
    def __init__(self, base_url: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._base_url = base_url
        self._transport = transport

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
            async with httpx.AsyncClient(base_url=self._base_url, transport=self._transport, timeout=10.0) as client:
                response = await client.post(path, json=payload)
        except httpx.RequestError as exc:
            raise BlockchainLayerUnreachableError(str(exc)) from exc

        if response.status_code >= 400:
            raise BlockchainLayerError(status_code=response.status_code, body=response.json())
        return response.json()
