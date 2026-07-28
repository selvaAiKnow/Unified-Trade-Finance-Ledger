from typing import Any

from fastapi import APIRouter, Depends, status

from app.blockchain.client import BlockchainLayerClient
from app.blockchain.dependency import get_blockchain_layer_client
from app.schemas import PaymentConfirmedRequest, ShipmentConfirmedRequest

router = APIRouter(prefix="/events", tags=["events"])


@router.post("/shipment-confirmed", status_code=status.HTTP_201_CREATED)
async def shipment_confirmed(
    payload: ShipmentConfirmedRequest,
    client: BlockchainLayerClient = Depends(get_blockchain_layer_client),
) -> dict[str, Any]:
    return await client.ship_goods(
        linear_id=payload.linear_id,
        document_id=payload.document_id,
        document_type=payload.document_type,
        on_chain_hash=payload.on_chain_hash,
    )


@router.post("/payment-confirmed", status_code=status.HTTP_201_CREATED)
async def payment_confirmed(
    payload: PaymentConfirmedRequest,
    client: BlockchainLayerClient = Depends(get_blockchain_layer_client),
) -> dict[str, Any]:
    return await client.settle_payment(
        linear_id=payload.linear_id,
        document_id=payload.document_id,
        document_type=payload.document_type,
        on_chain_hash=payload.on_chain_hash,
    )
