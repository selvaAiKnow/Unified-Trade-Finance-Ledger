from app.config import settings


async def _signup_and_login(async_client, email: str, org_type: str = "EXPORTER") -> tuple[str, str]:
    payload = {
        "org_name": f"Org for {email}",
        "org_type": org_type,
        "country": "India",
        "industry": "Pharmaceuticals",
        "tax_id": f"TAX-{email}",
        "admin_name": "Business User",
        "admin_email": email,
        "password": "a good password",
    }
    response = await async_client.post("/auth/signup", json=payload)
    body = response.json()
    return body["organization"]["id"], body["access_token"]


async def _bootstrap_admin_and_login(async_client, monkeypatch, email: str = "admin@utfl.example") -> str:
    monkeypatch.setattr(settings, "admin_bootstrap_secret", "test-bootstrap-secret")
    await async_client.post(
        "/admin/bootstrap",
        json={"secret": "test-bootstrap-secret", "name": "Ops Admin", "email": email, "password": "a good password"},
    )
    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    return login_response.json()["access_token"]


async def _create_trade(async_client, token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id):
    payload = {
        "lc_reference": "ADMIN-TEST-LC-1",
        "industry": "Pharmaceuticals",
        "instrument_type": "Letter of Credit",
        "exporter_org_id": exporter_org_id,
        "buyer_org_id": buyer_org_id,
        "issuing_bank_org_id": issuing_bank_org_id,
        "advising_bank_org_id": advising_bank_org_id,
        "product_description": "Paracetamol Tablets 500mg",
        "order_value": "80000.00",
        "currency": "USD",
        "incoterm": "CIF Osaka",
        "payment_term": "Usance LC, 60 days",
        "shipment_deadline": "2026-09-15",
    }
    return await async_client.post("/trades", json=payload, headers={"Authorization": f"Bearer {token}"})


async def test_non_admin_gets_403_from_admin_routes(async_client):
    org_id, token = await _signup_and_login(async_client, "business-user-1@example.com")

    # Test GET /admin/organizations
    response = await async_client.get("/admin/organizations", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403

    # Test GET /admin/organizations/{org_id}/kyb-checks
    response = await async_client.get(
        f"/admin/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403

    # Test GET /admin/organizations/{org_id}
    response = await async_client.get(
        f"/admin/organizations/{org_id}", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403

    # Test PATCH /admin/organizations/{org_id}/kyb-status
    response = await async_client.patch(
        f"/admin/organizations/{org_id}/kyb-status",
        json={"kyb_status": "BLOCK"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403

    # Test GET /admin/users
    response = await async_client.get("/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403

    # Test POST /admin/users
    response = await async_client.post(
        "/admin/users",
        json={"name": "X", "email": "x@example.com", "org_id": org_id, "role": "VIEWER"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403

    # Test GET /admin/users/{id}
    response = await async_client.get(
        "/admin/users/00000000-0000-0000-0000-000000000000", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403

    # Test PATCH /admin/users/{id}
    response = await async_client.patch(
        "/admin/users/00000000-0000-0000-0000-000000000000",
        json={"name": "X", "org_id": org_id, "role": "VIEWER", "status": "ACTIVE"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403

    # Test PATCH /admin/users/{id}/status
    response = await async_client.patch(
        "/admin/users/00000000-0000-0000-0000-000000000000/status",
        json={"status": "SUSPENDED"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403

    # Test GET /admin/kyb-checks/business-registration
    response = await async_client.get(
        "/admin/kyb-checks/business-registration", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403

    # Test PATCH /admin/kyb-checks/{id}/decision
    response = await async_client.patch(
        "/admin/kyb-checks/00000000-0000-0000-0000-000000000000/decision",
        json={"status": "PASSED"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403

    # Test GET /admin/kyb-checks/{id}/document
    response = await async_client.get(
        "/admin/kyb-checks/00000000-0000-0000-0000-000000000000/document",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403

    # Test GET /admin/trades
    response = await async_client.get("/admin/trades", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403

    # Test GET /admin/trades/{id}
    response = await async_client.get(
        "/admin/trades/00000000-0000-0000-0000-000000000000", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403


async def test_admin_sees_organizations_across_every_org(async_client, monkeypatch):
    await _signup_and_login(async_client, "org-a@example.com", org_type="EXPORTER")
    await _signup_and_login(async_client, "org-b@example.com", org_type="BUYER")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get("/admin/organizations", headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200
    names = {org["name"] for org in response.json()}
    assert "Org for org-a@example.com" in names
    assert "Org for org-b@example.com" in names


async def test_admin_sees_kyb_checks_for_any_organization(async_client, monkeypatch):
    org_id, _ = await _signup_and_login(async_client, "org-e@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get(
        f"/admin/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 200
    check_types = {check["check_type"] for check in response.json()}
    assert check_types == {"BUSINESS_REGISTRATION", "SANCTIONS_SCREENING", "BANK_ACCOUNT"}


async def test_admin_can_override_kyb_status(async_client, monkeypatch):
    org_id, _ = await _signup_and_login(async_client, "org-d@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.patch(
        f"/admin/organizations/{org_id}/kyb-status",
        json={"kyb_status": "BLOCK"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.json()["kyb_status"] == "BLOCK"

    org_list = await async_client.get("/admin/organizations", headers={"Authorization": f"Bearer {admin_token}"})
    updated = next(org for org in org_list.json() if org["id"] == org_id)
    assert updated["kyb_status"] == "BLOCK"


async def test_admin_sees_users_across_every_org(async_client, monkeypatch):
    await _signup_and_login(async_client, "org-c@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200
    emails = {user["email"] for user in response.json()}
    assert "org-c@example.com" in emails


async def test_admin_token_against_business_endpoints_is_safe_but_useless(async_client, monkeypatch):
    # Characterization test: no other test in this feature ever sends a
    # PLATFORM_ADMIN token to an endpoint outside /admin/*. That gap is exactly
    # what let GET /auth/me 500 for admins ship undetected (see
    # test_admin_bootstrap.test_bootstrapped_admin_can_call_auth_me).
    #
    # This pins today's *safe-by-accident* behavior for the pre-existing,
    # non-admin-aware endpoints: a platform admin has org_id=NULL, and both
    # trades_query_for_user() and user_can_access_org() (app/access.py) compare
    # against user.org_id with plain equality, so NULL never matches anything.
    # An admin therefore sees an empty list from GET /trades (not another org's
    # trades) and a 404 from GET /organizations/{id} (not that org's data) rather
    # than raising an error.
    #
    # IMPORTANT: if app/access.py is ever changed to treat a NULL org_id as a
    # wildcard granting access to everything, this test's assertions must be
    # revisited deliberately -- it should not be allowed to silently start
    # failing (or worse, silently start passing with different semantics).
    org_id, exporter_token = await _signup_and_login(async_client, "characterization-org@example.com")
    buyer_org_id, _ = await _signup_and_login(async_client, "characterization-buyer@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await _signup_and_login(async_client, "characterization-issuing@example.com", org_type="BANK")
    advising_bank_org_id, _ = await _signup_and_login(async_client, "characterization-advising@example.com", org_type="BANK")
    await _create_trade(async_client, exporter_token, org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)

    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    trades_response = await async_client.get("/trades", headers={"Authorization": f"Bearer {admin_token}"})
    assert trades_response.status_code == 200
    assert trades_response.json() == []

    org_response = await async_client.get(f"/organizations/{org_id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert org_response.status_code == 404


async def test_admin_sees_trades_across_every_org(async_client, monkeypatch):
    exporter_org_id, exporter_token = await _signup_and_login(async_client, "trade-exporter@example.com")
    buyer_org_id, _ = await _signup_and_login(async_client, "trade-buyer@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await _signup_and_login(async_client, "trade-issuing@example.com", org_type="BANK")
    advising_bank_org_id, _ = await _signup_and_login(async_client, "trade-advising@example.com", org_type="BANK")
    await _create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)

    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    response = await async_client.get("/admin/trades", headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200
    assert any(trade["exporter_org_id"] == exporter_org_id for trade in response.json())


async def test_admin_can_create_a_user(async_client, monkeypatch):
    org_id, _ = await _signup_and_login(async_client, "create-target-org@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.post(
        "/admin/users",
        json={"name": "New Hire", "email": "new-hire@example.com", "org_id": org_id, "role": "VIEWER"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "New Hire"
    assert body["email"] == "new-hire@example.com"
    assert body["org_id"] == org_id
    assert body["role"] == "VIEWER"
    assert body["status"] == "INVITED"


async def test_admin_create_user_rejects_platform_admin_role(async_client, monkeypatch):
    org_id, _ = await _signup_and_login(async_client, "reject-role-org@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.post(
        "/admin/users",
        json={"name": "Wannabe Admin", "email": "wannabe@example.com", "org_id": org_id, "role": "PLATFORM_ADMIN"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 400


async def test_admin_create_user_rejects_unknown_organization(async_client, monkeypatch):
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.post(
        "/admin/users",
        json={
            "name": "Ghost",
            "email": "ghost@example.com",
            "org_id": "00000000-0000-0000-0000-000000000000",
            "role": "VIEWER",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 404


async def test_admin_create_user_rejects_duplicate_email(async_client, monkeypatch):
    org_id, _ = await _signup_and_login(async_client, "dupe-target-org@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.post(
        "/admin/users",
        json={"name": "Duplicate", "email": "dupe-target-org@example.com", "org_id": org_id, "role": "VIEWER"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 409


async def test_admin_can_get_a_single_user(async_client, monkeypatch):
    await _signup_and_login(async_client, "get-target-org@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    users_response = await async_client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    target = next(u for u in users_response.json() if u["email"] == "get-target-org@example.com")

    response = await async_client.get(f"/admin/users/{target['id']}", headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200
    assert response.json()["email"] == "get-target-org@example.com"


async def test_admin_get_user_404_for_unknown_id(async_client, monkeypatch):
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get(
        "/admin/users/00000000-0000-0000-0000-000000000000", headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 404


async def test_admin_can_update_a_user(async_client, monkeypatch):
    await _signup_and_login(async_client, "update-target-org@example.com")
    other_org_id, _ = await _signup_and_login(async_client, "update-other-org@example.com", org_type="BUYER")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    users_response = await async_client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    target = next(u for u in users_response.json() if u["email"] == "update-target-org@example.com")

    response = await async_client.patch(
        f"/admin/users/{target['id']}",
        json={"name": "Renamed User", "org_id": other_org_id, "role": "FINANCE", "status": "ACTIVE"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Renamed User"
    assert body["org_id"] == other_org_id
    assert body["role"] == "FINANCE"
    assert body["status"] == "ACTIVE"


async def test_admin_update_user_rejects_platform_admin_target(async_client, monkeypatch):
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    org_id, _ = await _signup_and_login(async_client, "irrelevant-org-for-admin-target@example.com")
    users_response = await async_client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    admin_user = next(u for u in users_response.json() if u["role"] == "PLATFORM_ADMIN")

    response = await async_client.patch(
        f"/admin/users/{admin_user['id']}",
        json={"name": "Hijacked", "org_id": org_id, "role": "VIEWER", "status": "ACTIVE"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 400


async def test_admin_update_user_rejects_platform_admin_role(async_client, monkeypatch):
    org_id, _ = await _signup_and_login(async_client, "reject-update-role-org@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    users_response = await async_client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    target = next(u for u in users_response.json() if u["email"] == "reject-update-role-org@example.com")

    response = await async_client.patch(
        f"/admin/users/{target['id']}",
        json={"name": "Wannabe Admin", "org_id": org_id, "role": "PLATFORM_ADMIN", "status": "ACTIVE"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 400


async def test_admin_can_update_a_users_status(async_client, monkeypatch):
    await _signup_and_login(async_client, "status-target-org@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    users_response = await async_client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    target = next(u for u in users_response.json() if u["email"] == "status-target-org@example.com")

    response = await async_client.patch(
        f"/admin/users/{target['id']}/status",
        json={"status": "SUSPENDED"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "SUSPENDED"


async def test_admin_update_status_rejects_platform_admin_target(async_client, monkeypatch):
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    users_response = await async_client.get("/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    admin_user = next(u for u in users_response.json() if u["role"] == "PLATFORM_ADMIN")

    response = await async_client.patch(
        f"/admin/users/{admin_user['id']}/status",
        json={"status": "SUSPENDED"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 400


async def test_admin_can_list_business_registration_checks(async_client, monkeypatch):
    org_id, token = await _signup_and_login(async_client, "kyc-review-1@example.com")
    await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get(
        "/admin/kyb-checks/business-registration", headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 200
    checks = response.json()
    assert {c["check_type"] for c in checks} == {"BUSINESS_REGISTRATION"}
    assert org_id in {c["org_id"] for c in checks}


async def test_admin_business_registration_list_includes_uploader_and_ai_summary(async_client, monkeypatch):
    org_id, token = await _signup_and_login(async_client, "kyc-admin-visibility-1@example.com")
    await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get(
        "/admin/kyb-checks/business-registration", headers={"Authorization": f"Bearer {admin_token}"}
    )
    business_registration = next(c for c in response.json() if c["org_id"] == org_id)

    assert business_registration["uploaded_by"] is not None
    assert business_registration["ai_summary"] is not None


async def test_admin_can_approve_a_flagged_check(async_client, monkeypatch):
    from app.kyc_intelligence.checker import KybDocumentCheckResult
    from app.kyc_intelligence.dependency import get_kyb_document_checker
    from app.main import app

    class StubUnverifiedChecker:
        async def check(self, content, org_name, media_type):
            return KybDocumentCheckResult(verified=False, summary="Needs review.")

    app.dependency_overrides[get_kyb_document_checker] = lambda: StubUnverifiedChecker()
    try:
        org_id, token = await _signup_and_login(async_client, "kyc-review-2@example.com")
        await async_client.post(
            f"/organizations/{org_id}/kyb-checks/business-registration-document",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
        )
    finally:
        app.dependency_overrides.pop(get_kyb_document_checker, None)

    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    list_response = await async_client.get(
        "/admin/kyb-checks/business-registration", headers={"Authorization": f"Bearer {admin_token}"}
    )
    check_id = next(c["id"] for c in list_response.json() if c["org_id"] == org_id)

    response = await async_client.patch(
        f"/admin/kyb-checks/{check_id}/decision",
        json={"status": "PASSED"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "PASSED"


async def test_admin_can_reject_a_flagged_check(async_client, monkeypatch):
    org_id, token = await _signup_and_login(async_client, "kyc-review-3@example.com")
    await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    list_response = await async_client.get(
        "/admin/kyb-checks/business-registration", headers={"Authorization": f"Bearer {admin_token}"}
    )
    check_id = next(c["id"] for c in list_response.json() if c["org_id"] == org_id)

    response = await async_client.patch(
        f"/admin/kyb-checks/{check_id}/decision",
        json={"status": "FAILED"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "FAILED"


async def test_admin_decision_rejects_non_business_registration_check(async_client, monkeypatch):
    org_id, token = await _signup_and_login(async_client, "kyc-review-4@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    checks_response = await async_client.get(
        f"/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"}
    )
    sanctions_check_id = next(c["id"] for c in checks_response.json() if c["check_type"] == "SANCTIONS_SCREENING")

    response = await async_client.patch(
        f"/admin/kyb-checks/{sanctions_check_id}/decision",
        json={"status": "FAILED"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 400


async def test_admin_can_download_the_uploaded_document(async_client, monkeypatch):
    org_id, token = await _signup_and_login(async_client, "kyc-review-5@example.com")
    await async_client.post(
        f"/organizations/{org_id}/kyb-checks/business-registration-document",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("certificate.pdf", b"fake certificate bytes", "application/pdf")},
    )
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    list_response = await async_client.get(
        "/admin/kyb-checks/business-registration", headers={"Authorization": f"Bearer {admin_token}"}
    )
    check_id = next(c["id"] for c in list_response.json() if c["org_id"] == org_id)

    response = await async_client.get(
        f"/admin/kyb-checks/{check_id}/document", headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 200
    assert response.content == b"fake certificate bytes"
    assert response.headers["content-type"] == "application/pdf"


async def test_admin_document_download_404s_when_nothing_uploaded(async_client, monkeypatch):
    org_id, token = await _signup_and_login(async_client, "kyc-review-6@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    checks_response = await async_client.get(
        f"/organizations/{org_id}/kyb-checks", headers={"Authorization": f"Bearer {token}"}
    )
    business_registration_check_id = next(
        c["id"] for c in checks_response.json() if c["check_type"] == "BUSINESS_REGISTRATION"
    )

    response = await async_client.get(
        f"/admin/kyb-checks/{business_registration_check_id}/document",
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 404


async def test_admin_can_get_a_single_organization(async_client, monkeypatch):
    org_id, _ = await _signup_and_login(async_client, "org-get-1@example.com")
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get(f"/admin/organizations/{org_id}", headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200
    assert response.json()["id"] == org_id


async def test_admin_get_organization_404_for_unknown_id(async_client, monkeypatch):
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get(
        "/admin/organizations/00000000-0000-0000-0000-000000000000", headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 404


async def test_admin_can_get_a_single_trade(async_client, monkeypatch):
    exporter_org_id, exporter_token = await _signup_and_login(async_client, "trade-get-exporter@example.com")
    buyer_org_id, _ = await _signup_and_login(async_client, "trade-get-buyer@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await _signup_and_login(async_client, "trade-get-issuing@example.com", org_type="BANK")
    advising_bank_org_id, _ = await _signup_and_login(async_client, "trade-get-advising@example.com", org_type="BANK")
    trade_response = await _create_trade(
        async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id
    )
    trade_id = trade_response.json()["id"]

    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)
    response = await async_client.get(f"/admin/trades/{trade_id}", headers={"Authorization": f"Bearer {admin_token}"})

    assert response.status_code == 200
    assert response.json()["id"] == trade_id


async def test_admin_get_trade_404_for_unknown_id(async_client, monkeypatch):
    admin_token = await _bootstrap_admin_and_login(async_client, monkeypatch)

    response = await async_client.get(
        "/admin/trades/00000000-0000-0000-0000-000000000000", headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 404
