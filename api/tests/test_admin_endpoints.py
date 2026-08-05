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

    # Test GET /admin/trades
    response = await async_client.get("/admin/trades", headers={"Authorization": f"Bearer {token}"})
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
