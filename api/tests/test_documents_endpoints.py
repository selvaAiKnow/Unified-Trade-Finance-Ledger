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
    assert document["verification_status"] == "PENDING"
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


async def test_uploaded_document_is_verified_compliant_by_the_background_check(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "docai-exporter-1@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "docai-buyer-1@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await signup_and_login(async_client, "docai-issuing-1@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "docai-advising-1@example.com", org_type="BANK")
    trade_response = await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    trade_id = trade_response.json()["id"]

    files = {"file": ("invoice.pdf", b"%PDF-1.4 fake content", "application/pdf")}
    data = {"category": "Regulatory / Compliance", "document_type": "Commercial Invoice"}
    upload_response = await async_client.post(
        f"/trades/{trade_id}/documents", data=data, files=files, headers={"Authorization": f"Bearer {exporter_token}"}
    )
    assert upload_response.status_code == 201

    list_response = await async_client.get(f"/trades/{trade_id}/documents", headers={"Authorization": f"Bearer {exporter_token}"})
    documents = list_response.json()
    assert len(documents) == 1
    assert documents[0]["verification_status"] == "VERIFIED"
    assert documents[0]["ai_discrepancies"] == []
    assert documents[0]["ai_checked_at"] is not None


async def test_uploaded_document_is_flagged_discrepancy_when_checker_finds_one(async_client):
    from app.document_intelligence.checker import DocumentCheckResult
    from app.document_intelligence.dependency import get_document_checker
    from app.main import app

    class StubDiscrepancyChecker:
        async def check(self, content, trade_terms):
            return DocumentCheckResult(compliant=False, discrepancies=["Invoice value does not match trade terms."], summary="Found a value mismatch.")

    app.dependency_overrides[get_document_checker] = lambda: StubDiscrepancyChecker()
    try:
        exporter_org_id, exporter_token = await signup_and_login(async_client, "docai-exporter-2@example.com")
        buyer_org_id, _ = await signup_and_login(async_client, "docai-buyer-2@example.com", org_type="BUYER")
        issuing_bank_org_id, _ = await signup_and_login(async_client, "docai-issuing-2@example.com", org_type="BANK")
        advising_bank_org_id, _ = await signup_and_login(async_client, "docai-advising-2@example.com", org_type="BANK")
        trade_response = await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
        trade_id = trade_response.json()["id"]

        files = {"file": ("invoice.pdf", b"%PDF-1.4 fake content", "application/pdf")}
        data = {"category": "Regulatory / Compliance", "document_type": "Commercial Invoice"}
        upload_response = await async_client.post(
            f"/trades/{trade_id}/documents", data=data, files=files, headers={"Authorization": f"Bearer {exporter_token}"}
        )
        assert upload_response.status_code == 201

        list_response = await async_client.get(f"/trades/{trade_id}/documents", headers={"Authorization": f"Bearer {exporter_token}"})
        documents = list_response.json()
        assert documents[0]["verification_status"] == "DISCREPANCY"
        assert documents[0]["ai_discrepancies"] == ["Invoice value does not match trade terms."]
    finally:
        app.dependency_overrides.pop(get_document_checker, None)
