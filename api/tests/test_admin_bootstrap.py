from app.config import settings


async def test_bootstrap_rejects_missing_secret(async_client, monkeypatch):
    monkeypatch.setattr(settings, "admin_bootstrap_secret", None)

    response = await async_client.post(
        "/admin/bootstrap",
        json={"secret": "anything", "name": "Ops Admin", "email": "admin@utfl.example", "password": "a good password"},
    )

    assert response.status_code == 403


async def test_bootstrap_rejects_wrong_secret(async_client, monkeypatch):
    monkeypatch.setattr(settings, "admin_bootstrap_secret", "test-bootstrap-secret")

    response = await async_client.post(
        "/admin/bootstrap",
        json={"secret": "wrong-secret", "name": "Ops Admin", "email": "admin@utfl.example", "password": "a good password"},
    )

    assert response.status_code == 403


async def test_bootstrap_creates_platform_admin_and_allows_login(async_client, monkeypatch):
    monkeypatch.setattr(settings, "admin_bootstrap_secret", "test-bootstrap-secret")

    response = await async_client.post(
        "/admin/bootstrap",
        json={"secret": "test-bootstrap-secret", "name": "Ops Admin", "email": "admin@utfl.example", "password": "a good password"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["role"] == "PLATFORM_ADMIN"
    assert body["org_id"] is None

    login_response = await async_client.post(
        "/auth/login", json={"email": "admin@utfl.example", "password": "a good password"}
    )
    assert login_response.status_code == 200
    assert "access_token" in login_response.json()


async def test_bootstrap_rejects_second_admin(async_client, monkeypatch):
    monkeypatch.setattr(settings, "admin_bootstrap_secret", "test-bootstrap-secret")
    payload = {"secret": "test-bootstrap-secret", "name": "Ops Admin", "email": "admin1@utfl.example", "password": "a good password"}

    first = await async_client.post("/admin/bootstrap", json=payload)
    assert first.status_code == 201

    second = await async_client.post("/admin/bootstrap", json={**payload, "email": "admin2@utfl.example"})
    assert second.status_code == 409
