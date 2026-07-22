async def signup_and_login(async_client, email: str, org_type: str = "EXPORTER", industry: str = "Pharmaceuticals") -> tuple[str, str]:
    signup_payload = {
        "organization": {"name": f"Org for {email}", "org_type": org_type, "country": "India", "industry": industry, "tax_id": f"TAX-{email}"},
        "admin_user": {"name": "Admin User", "email": email, "password": "a good password"},
    }
    response = await async_client.post("/auth/signup", json=signup_payload)
    org_id = response.json()["organization"]["id"]
    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    return org_id, login_response.json()["access_token"]


async def create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id):
    payload = {
        "lc_reference": "MUFGJP2026LC1187",
        "industry": "Pharmaceuticals",
        "instrument_type": "Letter of Credit",
        "exporter_org_id": exporter_org_id,
        "buyer_org_id": buyer_org_id,
        "issuing_bank_org_id": issuing_bank_org_id,
        "advising_bank_org_id": advising_bank_org_id,
        "product_description": "Paracetamol Tablets 500mg, HS 3004.90",
        "order_value": "80000.00",
        "currency": "USD",
        "incoterm": "CIF Osaka",
        "payment_term": "Usance LC, 60 days",
    }
    return await async_client.post("/trades", json=payload, headers={"Authorization": f"Bearer {exporter_token}"})


async def test_create_and_get_trade(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "exporter-1@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "buyer-1@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await signup_and_login(async_client, "issuing-bank-1@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "advising-bank-1@example.com", org_type="BANK")

    create_response = await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    assert create_response.status_code == 201
    trade = create_response.json()
    assert trade["status"] == "DRAFT"
    assert trade["lc_reference"] == "MUFGJP2026LC1187"

    get_response = await async_client.get(f"/trades/{trade['id']}", headers={"Authorization": f"Bearer {exporter_token}"})
    assert get_response.status_code == 200
    assert get_response.json()["id"] == trade["id"]


async def test_trade_list_is_scoped_to_participant_orgs(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "exporter-2@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "buyer-2@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await signup_and_login(async_client, "issuing-bank-2@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "advising-bank-2@example.com", org_type="BANK")
    _unrelated_org_id, unrelated_token = await signup_and_login(async_client, "unrelated-2@example.com", org_type="BANK")

    await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)

    own_list = await async_client.get("/trades", headers={"Authorization": f"Bearer {exporter_token}"})
    assert len(own_list.json()) == 1

    unrelated_list = await async_client.get("/trades", headers={"Authorization": f"Bearer {unrelated_token}"})
    assert unrelated_list.json() == []


async def test_get_trade_rejects_non_participant(async_client):
    exporter_org_id, exporter_token = await signup_and_login(async_client, "exporter-3@example.com")
    buyer_org_id, _ = await signup_and_login(async_client, "buyer-3@example.com", org_type="BUYER")
    issuing_bank_org_id, _ = await signup_and_login(async_client, "issuing-bank-3@example.com", org_type="BANK")
    advising_bank_org_id, _ = await signup_and_login(async_client, "advising-bank-3@example.com", org_type="BANK")
    _unrelated_org_id, unrelated_token = await signup_and_login(async_client, "unrelated-3@example.com", org_type="BANK")

    create_response = await create_trade(async_client, exporter_token, exporter_org_id, buyer_org_id, issuing_bank_org_id, advising_bank_org_id)
    trade_id = create_response.json()["id"]

    response = await async_client.get(f"/trades/{trade_id}", headers={"Authorization": f"Bearer {unrelated_token}"})
    assert response.status_code == 404
