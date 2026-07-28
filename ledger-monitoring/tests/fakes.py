from typing import Any


class FakeBlockchainLayerClient:
    def __init__(self) -> None:
        self.ship_goods_result: dict[str, Any] | None = None
        self.ship_goods_error: Exception | None = None
        self.last_ship_goods_args: tuple | None = None

        self.settle_payment_result: dict[str, Any] | None = None
        self.settle_payment_error: Exception | None = None
        self.last_settle_payment_args: tuple | None = None

    async def ship_goods(
        self, linear_id: str, document_id: str, document_type: str, on_chain_hash: str
    ) -> dict[str, Any]:
        self.last_ship_goods_args = (linear_id, document_id, document_type, on_chain_hash)
        if self.ship_goods_error:
            raise self.ship_goods_error
        assert self.ship_goods_result is not None, "ship_goods_result not configured"
        return self.ship_goods_result

    async def settle_payment(
        self, linear_id: str, document_id: str, document_type: str, on_chain_hash: str
    ) -> dict[str, Any]:
        self.last_settle_payment_args = (linear_id, document_id, document_type, on_chain_hash)
        if self.settle_payment_error:
            raise self.settle_payment_error
        assert self.settle_payment_result is not None, "settle_payment_result not configured"
        return self.settle_payment_result
