async def _signup(async_client, email: str, password: str) -> None:
    payload = {
        "organization": {"name": "Test Org", "org_type": "EXPORTER", "country": "India", "industry": "Pharmaceuticals", "tax_id": "TAX-1"},
        "admin_user": {"name": "Test User", "email": email, "password": password},
    }
    response = await async_client.post("/auth/signup", json=payload)
    assert response.status_code == 201


async def test_forgot_password_returns_otp_code_for_existing_user(async_client):
    await _signup(async_client, "forgot-test@example.com", "the original password")

    response = await async_client.post("/auth/forgot-password", json={"email": "forgot-test@example.com"})

    assert response.status_code == 200
    body = response.json()
    assert len(body["otp_code"]) == 6
    assert body["otp_code"].isdigit()


async def test_forgot_password_rejects_unknown_email(async_client):
    response = await async_client.post("/auth/forgot-password", json={"email": "nobody@example.com"})

    assert response.status_code == 404
