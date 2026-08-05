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
