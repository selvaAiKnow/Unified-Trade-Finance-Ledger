from app.blockchain.client import BlockchainLayerClient
from app.blockchain.http_client import HttpBlockchainLayerClient
from app.config import settings


def get_blockchain_layer_client() -> BlockchainLayerClient:
    return HttpBlockchainLayerClient(
        base_url=settings.blockchain_layer_url,
        timeout=settings.blockchain_layer_timeout_seconds,
    )
