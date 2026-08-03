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


async def test_document_registry_falls_back_to_generic_checklist_for_unseeded_combination(async_client):
    token = await _signup_and_login(async_client, "registry-fallback@example.com")

    response = await async_client.get(
        "/document-registry",
        params={"industry": "Steel & Metals", "instrument_type": "Documentary Collection"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    entries = response.json()
    document_types = {e["document_type"] for e in entries}
    assert document_types == {"Commercial Invoice", "Packing List", "Certificate of Origin", "Bill of Lading"}
    assert all(e["industry"] == "Steel & Metals" for e in entries)
    assert all(e["instrument_type"] == "Documentary Collection" for e in entries)
    assert all(e["mandatory"] is True for e in entries)
    assert all(e["lc_required"] is False for e in entries)


async def test_document_registry_fallback_marks_lc_required_for_letter_of_credit(async_client):
    token = await _signup_and_login(async_client, "registry-fallback-lc@example.com")

    response = await async_client.get(
        "/document-registry",
        params={"industry": "Steel & Metals", "instrument_type": "Letter of Credit"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    entries = response.json()
    assert all(e["lc_required"] is True for e in entries)


async def test_document_registry_fallback_is_stable_across_requests(async_client):
    token = await _signup_and_login(async_client, "registry-fallback-stable@example.com")

    first = await async_client.get(
        "/document-registry",
        params={"industry": "Steel & Metals", "instrument_type": "Open Account"},
        headers={"Authorization": f"Bearer {token}"},
    )
    second = await async_client.get(
        "/document-registry",
        params={"industry": "Steel & Metals", "instrument_type": "Open Account"},
        headers={"Authorization": f"Bearer {token}"},
    )
    first_ids = sorted(e["id"] for e in first.json())
    second_ids = sorted(e["id"] for e in second.json())
    assert first_ids == second_ids
