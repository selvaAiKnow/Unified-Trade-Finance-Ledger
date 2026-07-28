import httpx
import pytest

from app.blockchain.client import BlockchainLayerError, BlockchainLayerUnreachableError
from app.blockchain.http_client import HttpBlockchainLayerClient


def _handler_returning(status_code: int, json_body: dict):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, json=json_body)

    return handler


async def test_ship_goods_posts_to_flows_ship_goods_with_camelcase_body():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["body"] = httpx.Request("POST", request.url, content=request.content).content
        import json

        captured["json"] = json.loads(request.content)
        return httpx.Response(201, json={"linearId": "abc-123", "txId": "tx-1", "status": "SHIPPED"})

    transport = httpx.MockTransport(handler)
    client = HttpBlockchainLayerClient(base_url="http://blockchain-layer.test", transport=transport)

    result = await client.ship_goods(
        linear_id="abc-123", document_id="DOC-3", document_type="BILL_OF_LADING", on_chain_hash="AAAA"
    )

    assert captured["path"] == "/flows/ship-goods"
    assert captured["json"] == {
        "linearId": "abc-123",
        "documentId": "DOC-3",
        "documentType": "BILL_OF_LADING",
        "onChainHash": "AAAA",
    }
    assert result == {"linearId": "abc-123", "txId": "tx-1", "status": "SHIPPED"}


async def test_settle_payment_posts_to_flows_settle_payment():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/flows/settle-payment"
        return httpx.Response(201, json={"linearId": "abc-123", "txId": "tx-5", "status": "SETTLED"})

    transport = httpx.MockTransport(handler)
    client = HttpBlockchainLayerClient(base_url="http://blockchain-layer.test", transport=transport)

    result = await client.settle_payment(
        linear_id="abc-123", document_id="DOC-5", document_type="MT202", on_chain_hash="BBBB"
    )

    assert result == {"linearId": "abc-123", "txId": "tx-5", "status": "SETTLED"}


async def test_ship_goods_raises_blockchain_layer_error_on_4xx():
    transport = httpx.MockTransport(_handler_returning(400, {"error": "Contract verification failed"}))
    client = HttpBlockchainLayerClient(base_url="http://blockchain-layer.test", transport=transport)

    with pytest.raises(BlockchainLayerError) as exc_info:
        await client.ship_goods(linear_id="x", document_id="d", document_type="t", on_chain_hash="h")

    assert exc_info.value.status_code == 400
    assert exc_info.value.body == {"error": "Contract verification failed"}


async def test_ship_goods_raises_blockchain_layer_error_on_5xx():
    transport = httpx.MockTransport(_handler_returning(502, {"error": "Could not connect to Corda RPC"}))
    client = HttpBlockchainLayerClient(base_url="http://blockchain-layer.test", transport=transport)

    with pytest.raises(BlockchainLayerError) as exc_info:
        await client.ship_goods(linear_id="x", document_id="d", document_type="t", on_chain_hash="h")

    assert exc_info.value.status_code == 502
    assert exc_info.value.body == {"error": "Could not connect to Corda RPC"}


async def test_ship_goods_raises_unreachable_error_on_connection_failure():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused", request=request)

    transport = httpx.MockTransport(handler)
    client = HttpBlockchainLayerClient(base_url="http://blockchain-layer.test", transport=transport)

    with pytest.raises(BlockchainLayerUnreachableError):
        await client.ship_goods(linear_id="x", document_id="d", document_type="t", on_chain_hash="h")
