from httpx import ASGITransport, AsyncClient

from app.blockchain.client import BlockchainLayerError, BlockchainLayerUnreachableError
from app.blockchain.dependency import get_blockchain_layer_client
from app.main import app
from tests.fakes import FakeBlockchainLayerClient


async def _post(path: str, json_body: dict, fake_client: FakeBlockchainLayerClient):
    app.dependency_overrides[get_blockchain_layer_client] = lambda: fake_client
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post(path, json=json_body)
    finally:
        app.dependency_overrides.clear()


async def test_shipment_confirmed_calls_ship_goods_and_returns_the_result():
    fake_client = FakeBlockchainLayerClient()
    fake_client.ship_goods_result = {"linearId": "abc-123", "txId": "tx-1", "status": "SHIPPED"}

    response = await _post(
        "/events/shipment-confirmed",
        {"linearId": "abc-123", "documentId": "DOC-3", "documentType": "BILL_OF_LADING", "onChainHash": "AAAA"},
        fake_client,
    )

    assert response.status_code == 201
    assert response.json() == {"linearId": "abc-123", "txId": "tx-1", "status": "SHIPPED"}
    assert fake_client.last_ship_goods_args == ("abc-123", "DOC-3", "BILL_OF_LADING", "AAAA")


async def test_shipment_confirmed_relays_blockchain_layer_error_verbatim():
    fake_client = FakeBlockchainLayerClient()
    fake_client.ship_goods_error = BlockchainLayerError(status_code=400, body={"error": "Contract verification failed"})

    response = await _post(
        "/events/shipment-confirmed",
        {"linearId": "abc-123", "documentId": "DOC-3", "documentType": "BILL_OF_LADING", "onChainHash": "AAAA"},
        fake_client,
    )

    assert response.status_code == 400
    assert response.json() == {"error": "Contract verification failed"}


async def test_shipment_confirmed_returns_502_when_blockchain_layer_unreachable():
    fake_client = FakeBlockchainLayerClient()
    fake_client.ship_goods_error = BlockchainLayerUnreachableError("Connection refused")

    response = await _post(
        "/events/shipment-confirmed",
        {"linearId": "abc-123", "documentId": "DOC-3", "documentType": "BILL_OF_LADING", "onChainHash": "AAAA"},
        fake_client,
    )

    assert response.status_code == 502
    assert "Connection refused" in response.json()["error"]


async def _post_payment(json_body: dict, fake_client: FakeBlockchainLayerClient):
    return await _post("/events/payment-confirmed", json_body, fake_client)


async def test_payment_confirmed_calls_settle_payment_and_returns_the_result():
    fake_client = FakeBlockchainLayerClient()
    fake_client.settle_payment_result = {"linearId": "abc-123", "txId": "tx-5", "status": "SETTLED"}

    response = await _post_payment(
        {"linearId": "abc-123", "documentId": "DOC-5", "documentType": "MT202", "onChainHash": "BBBB"},
        fake_client,
    )

    assert response.status_code == 201
    assert response.json() == {"linearId": "abc-123", "txId": "tx-5", "status": "SETTLED"}
    assert fake_client.last_settle_payment_args == ("abc-123", "DOC-5", "MT202", "BBBB")


async def test_payment_confirmed_relays_blockchain_layer_error_verbatim():
    fake_client = FakeBlockchainLayerClient()
    fake_client.settle_payment_error = BlockchainLayerError(status_code=404, body={"error": "No trade found"})

    response = await _post_payment(
        {"linearId": "abc-123", "documentId": "DOC-5", "documentType": "MT202", "onChainHash": "BBBB"},
        fake_client,
    )

    assert response.status_code == 404
    assert response.json() == {"error": "No trade found"}


async def test_payment_confirmed_returns_502_when_blockchain_layer_unreachable():
    fake_client = FakeBlockchainLayerClient()
    fake_client.settle_payment_error = BlockchainLayerUnreachableError("Connection refused")

    response = await _post_payment(
        {"linearId": "abc-123", "documentId": "DOC-5", "documentType": "MT202", "onChainHash": "BBBB"},
        fake_client,
    )

    assert response.status_code == 502
    assert "Connection refused" in response.json()["error"]
