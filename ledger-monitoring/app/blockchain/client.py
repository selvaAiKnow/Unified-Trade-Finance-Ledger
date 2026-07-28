from typing import Any, Protocol


class BlockchainLayerError(Exception):
    """Raised when blockchain-layer responds with a 4xx/5xx status.

    Carries the exact status code and JSON body blockchain-layer returned,
    so the caller of ledger-monitoring can see the same error verbatim.
    """

    def __init__(self, status_code: int, body: dict[str, Any]) -> None:
        super().__init__(f"blockchain-layer returned {status_code}: {body}")
        self.status_code = status_code
        self.body = body


class BlockchainLayerUnreachableError(Exception):
    """Raised when blockchain-layer cannot be reached at all (connection error, timeout)."""


class BlockchainLayerClient(Protocol):
    async def ship_goods(
        self, linear_id: str, document_id: str, document_type: str, on_chain_hash: str
    ) -> dict[str, Any]: ...

    async def settle_payment(
        self, linear_id: str, document_id: str, document_type: str, on_chain_hash: str
    ) -> dict[str, Any]: ...
