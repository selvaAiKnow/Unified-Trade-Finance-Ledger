from tests.test_trades_endpoints import create_trade, signup_and_login


async def test_trigger_and_list_sanctions_screening(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "sanc-exporter-1@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "sanc-buyer-1@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await signup_and_login(async_client, "sanc-issuing-1@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "sanc-advising-1@example.com", org_type="BANK")

    trade_response = await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    trade_id = trade_response.json()["id"]

    trigger_response = await async_client.post(
        f"/trades/{trade_id}/sanctions-screening",
        json={"party_screened": "Osaka Pharma Distribution K.K."},
        headers={"Authorization": f"Bearer {exporter_token}"},
    )
    assert trigger_response.status_code == 201
    assert trigger_response.json()["status"] == "CLEAR"

    list_response = await async_client.get(f"/trades/{trade_id}/sanctions-screening", headers={"Authorization": f"Bearer {exporter_token}"})
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


async def test_sanctions_screening_rejects_non_participant(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "sanc-exporter-2@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "sanc-buyer-2@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await signup_and_login(async_client, "sanc-issuing-2@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "sanc-advising-2@example.com", org_type="BANK")
    _unrelated_org_id, unrelated_token = await signup_and_login(async_client, "sanc-unrelated-2@example.com", org_type="BANK")

    trade_response = await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    trade_id = trade_response.json()["id"]

    response = await async_client.post(
        f"/trades/{trade_id}/sanctions-screening",
        json={"party_screened": "Someone"},
        headers={"Authorization": f"Bearer {unrelated_token}"},
    )
    assert response.status_code == 404
