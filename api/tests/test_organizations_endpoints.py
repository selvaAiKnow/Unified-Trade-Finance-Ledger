from tests.test_trades_endpoints import create_trade, signup_and_login


async def _signup_and_login(async_client, email: str) -> tuple[str, str]:
    signup_payload = {
        "organization": {"name": "Test Org", "org_type": "EXPORTER", "country": "India", "industry": "Pharmaceuticals", "tax_id": "TAX-ORG-1"},
        "admin_user": {"name": "Test User", "email": email, "password": "a good password"},
    }
    signup_response = await async_client.post("/auth/signup", json=signup_payload)
    org_id = signup_response.json()["organization"]["id"]

    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    token = login_response.json()["access_token"]
    return org_id, token


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
