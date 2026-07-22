from sqlalchemy import select

from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.user import User


async def test_signup_creates_org_user_and_kyb_checks(async_client):
    payload = {
        "organization": {
            "name": "MedCure Pharma Exports Pvt. Ltd.",
            "org_type": "EXPORTER",
            "country": "India",
            "industry": "Pharmaceuticals",
            "tax_id": "27AAECM1234B1Z5",
        },
        "admin_user": {
            "name": "Priya Shah",
            "email": "priya@medcurepharma.example",
            "password": "correct horse battery staple",
        },
    }

    response = await async_client.post("/auth/signup", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["organization"]["name"] == "MedCure Pharma Exports Pvt. Ltd."
    assert body["organization"]["kyb_status"] == "CLEAR"
    assert body["user"]["email"] == "priya@medcurepharma.example"
    assert body["user"]["role"] == "EXPORTER_ADMIN"


async def test_signup_creates_three_kyb_check_rows(async_client, db_session):
    payload = {
        "organization": {
            "name": "Kyoto Textile Trading Co.",
            "org_type": "EXPORTER",
            "country": "India",
            "industry": "Textiles",
            "tax_id": "29AABCT1111C1Z2",
        },
        "admin_user": {"name": "Arjun Nair", "email": "arjun@kyototextile.example", "password": "another secret"},
    }
    response = await async_client.post("/auth/signup", json=payload)
    org_id = response.json()["organization"]["id"]

    rows = (await db_session.execute(select(KybCheck).where(KybCheck.org_id == org_id))).scalars().all()
    assert len(rows) == 3
    by_type = {r.check_type: r for r in rows}
    assert by_type["SANCTIONS_SCREENING"].status == "PASSED"
    assert by_type["SANCTIONS_SCREENING"].detail is not None
    assert by_type["BUSINESS_REGISTRATION"].status == "PASSED"
    assert by_type["BANK_ACCOUNT"].status == "PASSED"


async def test_signup_rejects_duplicate_email(async_client):
    payload = {
        "organization": {"name": "Org A", "org_type": "EXPORTER", "country": "India", "industry": "Pharmaceuticals", "tax_id": "TAX-A"},
        "admin_user": {"name": "User A", "email": "dupe@example.com", "password": "password one"},
    }
    await async_client.post("/auth/signup", json=payload)

    payload2 = {
        "organization": {"name": "Org B", "org_type": "EXPORTER", "country": "India", "industry": "Pharmaceuticals", "tax_id": "TAX-B"},
        "admin_user": {"name": "User B", "email": "dupe@example.com", "password": "password two"},
    }
    response = await async_client.post("/auth/signup", json=payload2)
    assert response.status_code == 409
