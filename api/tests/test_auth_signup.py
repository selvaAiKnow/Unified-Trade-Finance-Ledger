from sqlalchemy import select

from app.models.kyb_check import KybCheck

SIGNUP_PAYLOAD = {
    "org_name": "MedCure Pharma Exports Pvt. Ltd.",
    "org_type": "EXPORTER",
    "country": "India",
    "industry": "Pharmaceuticals",
    "tax_id": "27AAECM1234B1Z5",
    "admin_name": "Priya Shah",
    "admin_email": "priya@medcurepharma.example",
    "password": "correct horse battery staple",
}


async def test_signup_creates_org_user_and_kyb_checks(async_client):
    response = await async_client.post("/auth/signup", json=SIGNUP_PAYLOAD)

    assert response.status_code == 201
    body = response.json()
    assert body["organization"]["name"] == "MedCure Pharma Exports Pvt. Ltd."
    assert body["organization"]["kyb_status"] == "CLEAR"
    assert body["user"]["email"] == "priya@medcurepharma.example"
    assert body["user"]["role"] == "EXPORTER_ADMIN"
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert len(body["kyb_checks"]) == 3
    by_type = {c["check_type"]: c for c in body["kyb_checks"]}
    assert by_type["BUSINESS_REGISTRATION"]["status"] == "PENDING"
    assert by_type["BUSINESS_REGISTRATION"]["detail"] is None
    assert by_type["SANCTIONS_SCREENING"]["status"] == "PASSED"
    assert by_type["SANCTIONS_SCREENING"]["detail"] is not None
    assert by_type["BANK_ACCOUNT"]["status"] == "PASSED"


async def test_signup_creates_three_kyb_check_rows(async_client, db_session):
    response = await async_client.post(
        "/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "org_name": "Kyoto Textile Trading Co.",
            "industry": "Textiles",
            "tax_id": "29AABCT1111C1Z2",
            "admin_name": "Arjun Nair",
            "admin_email": "arjun@kyototextile.example",
            "password": "another secret",
        },
    )
    org_id = response.json()["organization"]["id"]

    rows = (await db_session.execute(select(KybCheck).where(KybCheck.org_id == org_id))).scalars().all()
    assert len(rows) == 3
    by_type = {r.check_type: r for r in rows}
    assert by_type["SANCTIONS_SCREENING"].status == "PASSED"
    assert by_type["SANCTIONS_SCREENING"].detail is not None
    assert by_type["BUSINESS_REGISTRATION"].status == "PENDING"
    assert by_type["BANK_ACCOUNT"].status == "PASSED"


async def test_signup_with_both_org_type_creates_exporter_admin(async_client):
    response = await async_client.post(
        "/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "org_name": "Sample Global Exports Pvt. Ltd.",
            "org_type": "BOTH",
            "tax_id": "AASCS1234F",
            "admin_name": "Rohan Mehta",
            "admin_email": "exports@sampleglobal.in",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["organization"]["org_type"] == "BOTH"
    assert body["user"]["role"] == "EXPORTER_ADMIN"


async def test_signup_rejects_duplicate_email(async_client):
    await async_client.post(
        "/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "org_name": "Org A",
            "tax_id": "TAX-A",
            "admin_name": "User A",
            "admin_email": "dupe@example.com",
            "password": "password one",
        },
    )

    response = await async_client.post(
        "/auth/signup",
        json={
            **SIGNUP_PAYLOAD,
            "org_name": "Org B",
            "tax_id": "TAX-B",
            "admin_name": "User B",
            "admin_email": "dupe@example.com",
            "password": "password two",
        },
    )
    assert response.status_code == 409


async def test_signup_returns_a_working_access_token(async_client):
    response = await async_client.post(
        "/auth/signup",
        json={**SIGNUP_PAYLOAD, "admin_email": "token-check@medcurepharma.example"},
    )
    token = response.json()["access_token"]

    me_response = await async_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "token-check@medcurepharma.example"
