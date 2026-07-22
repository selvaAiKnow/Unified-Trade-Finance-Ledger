from tests.test_trades_endpoints import create_trade, signup_and_login


async def test_bank_reviewer_can_record_and_list_findings(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "bank-exporter-1@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "bank-buyer-1@example.com", org_type="BUYER")
    issuing_bank_org_id, issuing_bank_token = await signup_and_login(async_client, "bank-issuing-1@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "bank-advising-1@example.com", org_type="BANK")

    trade_response = await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    trade_id = trade_response.json()["id"]

    upload_response = await async_client.post(
        f"/trades/{trade_id}/documents",
        data={"category": "Banking / LC", "document_type": "Bill of Exchange"},
        files={"file": ("boe.pdf", b"bill of exchange bytes", "application/pdf")},
        headers={"Authorization": f"Bearer {exporter_token}"},
    )
    document_id = upload_response.json()["id"]

    review_response = await async_client.post(
        f"/trades/{trade_id}/bank-review",
        json={"document_id": document_id, "result": "DISCREPANCY", "note": "Tenor mismatch: LC states 60 days, BoE shows 90 days"},
        headers={"Authorization": f"Bearer {issuing_bank_token}"},
    )
    assert review_response.status_code == 201
    assert review_response.json()["result"] == "DISCREPANCY"

    list_response = await async_client.get(f"/trades/{trade_id}/bank-review", headers={"Authorization": f"Bearer {exporter_token}"})
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


async def test_non_bank_role_cannot_record_findings(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "bank-exporter-2@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "bank-buyer-2@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await signup_and_login(async_client, "bank-issuing-2@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "bank-advising-2@example.com", org_type="BANK")

    trade_response = await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    trade_id = trade_response.json()["id"]
    upload_response = await async_client.post(
        f"/trades/{trade_id}/documents",
        data={"category": "Banking / LC", "document_type": "Bill of Exchange"},
        files={"file": ("boe.pdf", b"bill of exchange bytes", "application/pdf")},
        headers={"Authorization": f"Bearer {exporter_token}"},
    )
    document_id = upload_response.json()["id"]

    response = await async_client.post(
        f"/trades/{trade_id}/bank-review",
        json={"document_id": document_id, "result": "MATCHES_LC", "note": None},
        headers={"Authorization": f"Bearer {exporter_token}"},
    )
    assert response.status_code == 403
