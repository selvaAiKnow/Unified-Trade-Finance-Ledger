async def _signup_and_login(async_client, email: str) -> str:
    signup_payload = {
        "organization": {"name": "Test Org", "org_type": "EXPORTER", "country": "India", "industry": "Pharmaceuticals", "tax_id": "TAX-REG-1"},
        "admin_user": {"name": "Admin User", "email": email, "password": "a good password"},
    }
    await async_client.post("/auth/signup", json=signup_payload)
    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    return login_response.json()["access_token"]


async def test_document_registry_returns_pharma_checklist(async_client):
    token = await _signup_and_login(async_client, "registry-reader@example.com")

    response = await async_client.get(
        "/document-registry",
        params={"industry": "Pharmaceuticals", "instrument_type": "Letter of Credit"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    entries = response.json()
    document_types = {e["document_type"] for e in entries}
    assert "Drug Manufacturing License (Form 25/28)" in document_types
    assert "Certificate of Analysis (CoA)" in document_types
    assert all(e["industry"] == "Pharmaceuticals" for e in entries)
