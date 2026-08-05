from sqlalchemy import select

from app.models.kyb_check import KybCheck
from app.models.organization import Organization
from app.models.user import User
from app.storage import get_bytes

SIGNUP_FORM_DATA = {
    "org_name": "MedCure Pharma Exports Pvt. Ltd.",
    "org_type": "EXPORTER",
    "country": "India",
    "industry": "Pharmaceuticals",
    "tax_id": "27AAECM1234B1Z5",
    "admin_name": "Priya Shah",
    "admin_email": "priya@medcurepharma.example",
    "password": "correct horse battery staple",
}
SIGNUP_FILES = {"business_registration_document": ("certificate.pdf", b"fake certificate bytes", "application/pdf")}


async def test_signup_creates_org_user_and_kyb_checks(async_client):
    response = await async_client.post("/auth/signup", data=SIGNUP_FORM_DATA, files=SIGNUP_FILES)

    assert response.status_code == 201
    body = response.json()
    assert body["organization"]["name"] == "MedCure Pharma Exports Pvt. Ltd."
    assert body["organization"]["kyb_status"] == "CLEAR"
    assert body["user"]["email"] == "priya@medcurepharma.example"
    assert body["user"]["role"] == "EXPORTER_ADMIN"
    assert len(body["kyb_checks"]) == 3
    by_type = {c["check_type"]: c for c in body["kyb_checks"]}
    assert by_type["BUSINESS_REGISTRATION"]["status"] == "PASSED"
    assert by_type["BUSINESS_REGISTRATION"]["detail"] is not None
    assert by_type["SANCTIONS_SCREENING"]["status"] == "PASSED"
    assert by_type["SANCTIONS_SCREENING"]["detail"] is not None
    assert by_type["BANK_ACCOUNT"]["status"] == "PASSED"


async def test_signup_stores_the_business_registration_document(async_client):
    response = await async_client.post(
        "/auth/signup",
        data={**SIGNUP_FORM_DATA, "admin_email": "storage-check@medcurepharma.example"},
        files=SIGNUP_FILES,
    )
    org_id = response.json()["organization"]["id"]
    by_type = {c["check_type"]: c for c in response.json()["kyb_checks"]}

    object_key = by_type["BUSINESS_REGISTRATION"]["detail"]
    assert object_key.startswith(f"org/{org_id}/")
    assert object_key.endswith("-certificate.pdf")
    assert get_bytes(object_key) == b"fake certificate bytes"


async def test_signup_rejects_missing_business_registration_document(async_client):
    response = await async_client.post(
        "/auth/signup",
        data={**SIGNUP_FORM_DATA, "admin_email": "no-doc@medcurepharma.example"},
    )

    assert response.status_code == 422


async def test_signup_creates_three_kyb_check_rows(async_client, db_session):
    response = await async_client.post(
        "/auth/signup",
        data={
            **SIGNUP_FORM_DATA,
            "org_name": "Kyoto Textile Trading Co.",
            "industry": "Textiles",
            "tax_id": "29AABCT1111C1Z2",
            "admin_name": "Arjun Nair",
            "admin_email": "arjun@kyototextile.example",
            "password": "another secret",
        },
        files=SIGNUP_FILES,
    )
    org_id = response.json()["organization"]["id"]

    rows = (await db_session.execute(select(KybCheck).where(KybCheck.org_id == org_id))).scalars().all()
    assert len(rows) == 3
    by_type = {r.check_type: r for r in rows}
    assert by_type["SANCTIONS_SCREENING"].status == "PASSED"
    assert by_type["SANCTIONS_SCREENING"].detail is not None
    assert by_type["BUSINESS_REGISTRATION"].status == "PASSED"
    assert by_type["BANK_ACCOUNT"].status == "PASSED"


async def test_signup_with_both_org_type_creates_exporter_admin(async_client):
    response = await async_client.post(
        "/auth/signup",
        data={
            **SIGNUP_FORM_DATA,
            "org_name": "Sample Global Exports Pvt. Ltd.",
            "org_type": "BOTH",
            "tax_id": "AASCS1234F",
            "admin_name": "Rohan Mehta",
            "admin_email": "exports@sampleglobal.in",
        },
        files=SIGNUP_FILES,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["organization"]["org_type"] == "BOTH"
    assert body["user"]["role"] == "EXPORTER_ADMIN"


async def test_signup_sanitizes_a_path_traversal_filename(async_client):
    response = await async_client.post(
        "/auth/signup",
        data={**SIGNUP_FORM_DATA, "admin_email": "traversal@medcurepharma.example"},
        files={
            "business_registration_document": (
                "../../../evil.txt",
                b"fake certificate bytes",
                "application/pdf",
            )
        },
    )

    assert response.status_code == 201
    org_id = response.json()["organization"]["id"]
    by_type = {c["check_type"]: c for c in response.json()["kyb_checks"]}
    object_key = by_type["BUSINESS_REGISTRATION"]["detail"]

    assert ".." not in object_key
    assert object_key.startswith(f"org/{org_id}/")
    assert object_key.endswith("-evil.txt")
    assert get_bytes(object_key) == b"fake certificate bytes"


async def test_signup_rejects_oversized_document(async_client, db_session):
    oversized_content = b"x" * (10 * 1024 * 1024 + 1)
    response = await async_client.post(
        "/auth/signup",
        data={**SIGNUP_FORM_DATA, "admin_email": "oversized@medcurepharma.example"},
        files={"business_registration_document": ("certificate.pdf", oversized_content, "application/pdf")},
    )

    assert response.status_code == 422

    org_count = (await db_session.execute(select(Organization).where(Organization.name == SIGNUP_FORM_DATA["org_name"]))).scalars().all()
    assert org_count == []
    user_result = await db_session.execute(select(User).where(User.email == "oversized@medcurepharma.example"))
    assert user_result.scalar_one_or_none() is None


async def test_signup_rejects_disallowed_content_type(async_client, db_session):
    response = await async_client.post(
        "/auth/signup",
        data={**SIGNUP_FORM_DATA, "admin_email": "badtype@medcurepharma.example"},
        files={"business_registration_document": ("certificate.txt", b"not a real document", "text/plain")},
    )

    assert response.status_code == 422

    user_result = await db_session.execute(select(User).where(User.email == "badtype@medcurepharma.example"))
    assert user_result.scalar_one_or_none() is None


async def test_signup_rejects_duplicate_email(async_client):
    await async_client.post(
        "/auth/signup",
        data={**SIGNUP_FORM_DATA, "org_name": "Org A", "tax_id": "TAX-A", "admin_name": "User A", "admin_email": "dupe@example.com", "password": "password one"},
        files=SIGNUP_FILES,
    )

    response = await async_client.post(
        "/auth/signup",
        data={**SIGNUP_FORM_DATA, "org_name": "Org B", "tax_id": "TAX-B", "admin_name": "User B", "admin_email": "dupe@example.com", "password": "password two"},
        files=SIGNUP_FILES,
    )
    assert response.status_code == 409
