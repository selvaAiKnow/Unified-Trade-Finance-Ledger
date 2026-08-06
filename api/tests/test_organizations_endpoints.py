from sqlalchemy import select

from app.models.kyb_check import KybCheck
from app.storage import get_bytes
from tests.test_trades_endpoints import create_trade, signup_and_login


async def _signup_and_login(async_client, email: str) -> tuple[str, str]:
    payload = {
        "org_name": "Test Org",
        "org_type": "EXPORTER",
        "country": "India",
        "industry": "Pharmaceuticals",
        "tax_id": "TAX-ORG-1",
        "admin_name": "Test User",
        "admin_email": email,
        "password": "a good password",
    }
    response = await async_client.post("/auth/signup", json=payload)
    body = response.json()
    return body["organization"]["id"], body["access_token"]


async def test_list_organizations_requires_auth(async_client):
    response = await async_client.get("/organizations")
    assert response.status_code in (401, 403)


async def test_list_organizations_returns_matches(async_client):
    _, token = await _signup_and_login(async_client, "org-list-1@example.com")
    payload = {
        "org_name": "Sakura Textiles K.K.",
        "org_type": "BUYER",
        "country": "Japan",
        "industry": "Textiles & Apparel",
        "tax_id": "TAX-ORG-LIST-1",
        "admin_name": "Test User",
        "admin_email": "org-list-2@example.com",
        "password": "a good password",
    }
    await async_client.post("/auth/signup", json=payload)

    response = await async_client.get("/organizations?search=sakura", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    names = [org["name"] for org in response.json()]
    assert names == ["Sakura Textiles K.K."]


async def test_list_organizations_search_is_case_insensitive_substring(async_client):
    _, token = await _signup_and_login(async_client, "org-list-3@example.com")
    payload = {
        "org_name": "Indus Exports Pvt. Ltd.",
        "org_type": "EXPORTER",
        "country": "India",
        "industry": "Textiles & Apparel",
        "tax_id": "TAX-ORG-LIST-2",
        "admin_name": "Test User",
        "admin_email": "org-list-4@example.com",
        "password": "a good password",
    }
    await async_client.post("/auth/signup", json=payload)

    response = await async_client.get("/organizations?search=EXPORTS", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    names = [org["name"] for org in response.json()]
    assert "Indus Exports Pvt. Ltd." in names


async def test_list_organizations_without_search_returns_all(async_client):
    _, token = await _signup_and_login(async_client, "org-list-5@example.com")

    response = await async_client.get("/organizations", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert len(response.json()) >= 1


async def test_get_organization_requires_auth(async_client):
    org_id, _ = await _signup_and_login(async_client, "org-read-1@example.com")
    response = await async_client.get(f"/organizations/{org_id}")
    assert response.status_code in (401, 403)


async def test_get_organization_returns_org(async_client):
    org_id, token = await _signup_and_login(async_client, "org-read-2@example.com")
    response = await async_client.get(f"/organizations/{org_id}", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["id"] == org_id


async def test_get_organization_kyb_checks(async_client):
    org_id, token = await _signup_and_login(async_client, "org-read-3@example.com")
    response = await async_client.get(f"/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    checks = response.json()
    assert len(checks) == 3
    assert {c["check_type"] for c in checks} == {"BUSINESS_REGISTRATION", "SANCTIONS_SCREENING", "BANK_ACCOUNT"}


async def test_get_organization_rejects_unrelated_org(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "org-scope-exporter-1@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "org-scope-buyer-1@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await signup_and_login(async_client, "org-scope-issuing-1@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "org-scope-advising-1@example.com", org_type="BANK")
    _unrelated_org_id, unrelated_token = await signup_and_login(async_client, "org-scope-unrelated-1@example.com", org_type="BANK")

    await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)

    response = await async_client.get(f"/organizations/{exporter_org_id}", headers={"Authorization": f"Bearer {unrelated_token}"})
    assert response.status_code == 404


async def test_get_organization_kyb_checks_rejects_unrelated_org(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "org-scope-exporter-2@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "org-scope-buyer-2@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await signup_and_login(async_client, "org-scope-issuing-2@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "org-scope-advising-2@example.com", org_type="BANK")
    _unrelated_org_id, unrelated_token = await signup_and_login(async_client, "org-scope-unrelated-2@example.com", org_type="BANK")

    await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)

    response = await async_client.get(f"/organizations/{exporter_org_id}/kyb-checks", headers={"Authorization": f"Bearer {unrelated_token}"})
    assert response.status_code == 404


async def test_get_organization_allows_shared_trade_participant(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "org-scope-exporter-3@example.com")
    buyer_org_id, buyer_token = await signup_and_login(async_client, "org-scope-buyer-3@example.com", org_type="BUYER")
    issuing_bank_org_id, issuing_token = await signup_and_login(async_client, "org-scope-issuing-3@example.com", org_type="BANK")
    advising_bank_org_id, advising_token = await signup_and_login(async_client, "org-scope-advising-3@example.com", org_type="BANK")

    await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)

    for token in (buyer_token, issuing_token, advising_token):
        response = await async_client.get(f"/organizations/{exporter_org_id}", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        assert response.json()["id"] == exporter_org_id


async def test_get_organization_kyb_checks_allows_shared_trade_participant(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "org-scope-exporter-4@example.com")
    buyer_org_id, buyer_token = await signup_and_login(async_client, "org-scope-buyer-4@example.com", org_type="BUYER")
    issuing_bank_org_id, issuing_token = await signup_and_login(async_client, "org-scope-issuing-4@example.com", org_type="BANK")
    advising_bank_org_id, advising_token = await signup_and_login(async_client, "org-scope-advising-4@example.com", org_type="BANK")

    await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)

    for token in (buyer_token, issuing_token, advising_token):
        response = await async_client.get(f"/organizations/{exporter_org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        checks = response.json()
        assert len(checks) == 3


async def test_upload_business_registration_document_is_auto_approved_by_ai(async_client, db_session):
    org_id, token = await _signup_and_login(async_client, "kyc-upload-1@example.com")

    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["check_type"] == "BUSINESS_REGISTRATION"
    assert body["detail"].startswith(f"org/{org_id}/")
    assert get_bytes(body["detail"]) == b"fake certificate bytes"

    checks_response = await async_client.get(
        f"/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"}
    )
    business_registration = next(c for c in checks_response.json() if c["check_type"] == "BUSINESS_REGISTRATION")
    assert business_registration["status"] == "PASSED"
    assert business_registration["checked_at"] is not None

    # uploaded_by and ai_summary are intentionally NOT exposed on the org-facing
    # endpoint (they'd leak to trade counterparties who can also read this
    # endpoint) — verify them directly against the database row instead.
    row = (
        await db_session.execute(
            select(KybCheck).where(KybCheck.org_id == org_id, KybCheck.check_type == "BUSINESS_REGISTRATION")
        )
    ).scalar_one()
    assert row.uploaded_by is not None
    assert row.ai_summary is not None


async def test_get_organization_kyb_checks_does_not_expose_uploader_or_ai_summary(async_client):
    org_id, token = await _signup_and_login(async_client, "kyc-privacy-1@example.com")
    await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )

    response = await async_client.get(f"/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"})
    business_registration = next(c for c in response.json() if c["check_type"] == "BUSINESS_REGISTRATION")

    assert "uploaded_by" not in business_registration
    assert "ai_summary" not in business_registration


async def test_upload_business_registration_document_requires_auth(async_client):
    org_id, _ = await _signup_and_login(async_client, "kyc-upload-2@example.com")

    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )

    assert response.status_code in (401, 403)


async def test_upload_business_registration_document_rejects_other_orgs_members(async_client):
    org_id, _ = await _signup_and_login(async_client, "kyc-upload-3@example.com")
    _, other_token = await _signup_and_login(async_client, "kyc-upload-4@example.com")

    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {other_token}"},
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )

    assert response.status_code == 404


async def test_upload_business_registration_document_rejects_shared_trade_participant(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "kyc-upload-scope-exporter-1@example.com")
    buyer_org_id, buyer_token = await signup_and_login(async_client, "kyc-upload-scope-buyer-1@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await signup_and_login(async_client, "kyc-upload-scope-issuing-1@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "kyc-upload-scope-advising-1@example.com", org_type="BANK")

    await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)

    # The buyer is a legitimate trade partner of the exporter and would pass the broader
    # user_can_access_org rule used by sibling GET endpoints. Uploading a compliance
    # document must remain restricted to members of the exact target org, so this must
    # still be rejected even though the buyer can otherwise view the exporter's org data.
    response = await async_client.post(
        f"/organizations/{exporter_org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {buyer_token}"},
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )

    assert response.status_code == 404


async def test_upload_business_registration_document_rejects_already_passed(async_client):
    org_id, token = await _signup_and_login(async_client, "kyc-upload-5@example.com")
    await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )

    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate2.pdf", b"other bytes", "application/pdf")},
    )

    assert response.status_code == 409


async def test_upload_business_registration_document_sanitizes_a_path_traversal_filename(async_client):
    org_id, token = await _signup_and_login(async_client, "kyc-upload-6@example.com")

    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("../../../evil.txt", b"fake certificate bytes", "application/pdf")},
    )

    assert response.status_code == 200
    object_key = response.json()["detail"]
    assert ".." not in object_key
    assert object_key.startswith(f"org/{org_id}/")
    assert object_key.endswith("-evil.txt")


async def test_upload_business_registration_document_rejects_oversized_file(async_client):
    org_id, token = await _signup_and_login(async_client, "kyc-upload-7@example.com")
    oversized_content = b"x" * (10 * 1024 * 1024 + 1)

    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.pdf", oversized_content, "application/pdf")},
    )

    assert response.status_code == 422


async def test_upload_business_registration_document_rejects_disallowed_content_type(async_client):
    org_id, token = await _signup_and_login(async_client, "kyc-upload-8@example.com")

    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.txt", b"not a real document", "text/plain")},
    )

    assert response.status_code == 422


async def test_upload_business_registration_document_is_flagged_when_ai_does_not_verify(async_client, db_session):
    from app.kyc_intelligence.checker import KybDocumentCheckResult
    from app.kyc_intelligence.dependency import get_kyb_document_checker
    from app.main import app

    class StubUnverifiedChecker:
        async def check(self, content, org_name, media_type):
            return KybDocumentCheckResult(verified=False, summary="The organization name on the document does not match.")

    app.dependency_overrides[get_kyb_document_checker] = lambda: StubUnverifiedChecker()
    try:
        org_id, token = await _signup_and_login(async_client, "kyc-upload-9@example.com")
        await async_client.post(
            f"/organizations/{org_id}/kyb-checks/business-registration-document",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
        )

        checks_response = await async_client.get(
            f"/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"}
        )
        business_registration = next(c for c in checks_response.json() if c["check_type"] == "BUSINESS_REGISTRATION")
        assert business_registration["status"] == "FLAGGED"

        # ai_summary is intentionally not exposed on the org-facing endpoint
        # (see test_get_organization_kyb_checks_does_not_expose_uploader_or_ai_summary);
        # verify it directly against the database row instead.
        row = (
            await db_session.execute(
                select(KybCheck).where(KybCheck.org_id == org_id, KybCheck.check_type == "BUSINESS_REGISTRATION")
            )
        ).scalar_one()
        assert row.ai_summary == "The organization name on the document does not match."
    finally:
        app.dependency_overrides.pop(get_kyb_document_checker, None)


async def test_upload_business_registration_document_is_flagged_when_ai_check_fails(async_client):
    from app.kyc_intelligence.dependency import get_kyb_document_checker
    from app.main import app

    class StubFailingChecker:
        async def check(self, content, org_name, media_type):
            raise RuntimeError("boom")

    app.dependency_overrides[get_kyb_document_checker] = lambda: StubFailingChecker()
    try:
        org_id, token = await _signup_and_login(async_client, "kyc-upload-10@example.com")
        await async_client.post(
            f"/organizations/{org_id}/kyb-checks/business-registration-document",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
        )

        checks_response = await async_client.get(
            f"/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"}
        )
        business_registration = next(c for c in checks_response.json() if c["check_type"] == "BUSINESS_REGISTRATION")
        assert business_registration["status"] == "FLAGGED"
    finally:
        app.dependency_overrides.pop(get_kyb_document_checker, None)


async def test_upload_business_registration_document_allows_retry_after_flagged(async_client):
    from app.kyc_intelligence.checker import KybDocumentCheckResult
    from app.kyc_intelligence.dependency import get_kyb_document_checker
    from app.main import app

    class StubUnverifiedChecker:
        async def check(self, content, org_name, media_type):
            return KybDocumentCheckResult(verified=False, summary="Needs review.")

    app.dependency_overrides[get_kyb_document_checker] = lambda: StubUnverifiedChecker()
    try:
        org_id, token = await _signup_and_login(async_client, "kyc-upload-11@example.com")
        await async_client.post(
            f"/organizations/{org_id}/kyb-checks/business-registration-document",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
        )
    finally:
        app.dependency_overrides.pop(get_kyb_document_checker, None)

    # The check is now FLAGGED. A fresh upload with the default (auto-verifying) fake
    # checker should be accepted and re-processed rather than rejected.
    response = await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate2.pdf", b"other bytes", "application/pdf")},
    )
    assert response.status_code == 200

    checks_response = await async_client.get(
        f"/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"}
    )
    business_registration = next(c for c in checks_response.json() if c["check_type"] == "BUSINESS_REGISTRATION")
    assert business_registration["status"] == "PASSED"
