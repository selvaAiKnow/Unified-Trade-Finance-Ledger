async def _signup(async_client, email: str, password: str, org_type: str = "EXPORTER") -> None:
    payload = {
        "organization": {"name": "Test Org", "org_type": org_type, "country": "India", "industry": "Pharmaceuticals", "tax_id": "TAX-1"},
        "admin_user": {"name": "Test User", "email": email, "password": password},
    }
    response = await async_client.post("/auth/signup", json=payload)
    assert response.status_code == 201


async def test_login_returns_jwt_and_me_returns_profile(async_client):
    await _signup(async_client, "login-test@example.com", "correct horse battery staple")

    login_response = await async_client.post(
        "/auth/login", json={"email": "login-test@example.com", "password": "correct horse battery staple"}
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    assert token

    me_response = await async_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "login-test@example.com"


async def test_login_rejects_wrong_password(async_client):
    await _signup(async_client, "wrongpass@example.com", "the real password")

    response = await async_client.post("/auth/login", json={"email": "wrongpass@example.com", "password": "not it"})
    assert response.status_code == 401


async def test_me_rejects_missing_token(async_client):
    response = await async_client.get("/auth/me")
    assert response.status_code in (401, 403)
