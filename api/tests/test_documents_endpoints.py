import hashlib

from tests.test_trades_endpoints import create_trade, signup_and_login


async def test_upload_and_list_documents(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "doc-exporter-1@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "doc-buyer-1@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await signup_and_login(async_client, "doc-issuing-1@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "doc-advising-1@example.com", org_type="BANK")

    trade_response = await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    trade_id = trade_response.json()["id"]

    file_content = b"fake pdf bytes for Certificate of Analysis"
    upload_response = await async_client.post(
        f"/trades/{trade_id}/documents",
        data={"category": "Regulatory / Compliance", "document_type": "Certificate of Analysis (CoA)"},
        files={"file": ("coa.pdf", file_content, "application/pdf")},
        headers={"Authorization": f"Bearer {exporter_token}"},
    )
    assert upload_response.status_code == 201
    document = upload_response.json()
    assert document["verification_status"] == "UPLOADED"
    assert document["on_chain_hash"] == hashlib.sha256(file_content).hexdigest()

    list_response = await async_client.get(f"/trades/{trade_id}/documents", headers={"Authorization": f"Bearer {exporter_token}"})
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


async def test_reupload_same_document_type_appends_new_row(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "doc-exporter-2@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "doc-buyer-2@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await signup_and_login(async_client, "doc-issuing-2@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "doc-advising-2@example.com", org_type="BANK")

    trade_response = await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    trade_id = trade_response.json()["id"]

    for content in (b"first version", b"corrected version"):
        await async_client.post(
            f"/trades/{trade_id}/documents",
            data={"category": "Regulatory / Compliance", "document_type": "Free Sale Certificate"},
            files={"file": ("fsc.pdf", content, "application/pdf")},
            headers={"Authorization": f"Bearer {exporter_token}"},
        )

    list_response = await async_client.get(f"/trades/{trade_id}/documents", headers={"Authorization": f"Bearer {exporter_token}"})
    matching = [d for d in list_response.json() if d["document_type"] == "Free Sale Certificate"]
    assert len(matching) == 2
