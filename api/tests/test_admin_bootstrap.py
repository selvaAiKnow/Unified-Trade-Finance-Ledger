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


async def test_bootstrapped_admin_can_call_auth_me(async_client, monkeypatch):
    # Regression test: GET /auth/me used to serialize through a second, separate
    # UserOut schema (app/schemas/auth.py) whose org_id was non-optional. Returning
    # a platform admin (org_id=NULL) through it raised a ResponseValidationError ->
    # 500, so a real admin could log in but /auth/me (called immediately after
    # login, and on every page refresh by the frontend) would 500 forever.
    monkeypatch.setattr(settings, "admin_bootstrap_secret", "test-bootstrap-secret")
    await async_client.post(
        "/admin/bootstrap",
        json={"secret": "test-bootstrap-secret", "name": "Ops Admin", "email": "me-admin@utfl.example", "password": "a good password"},
    )
    login_response = await async_client.post(
        "/auth/login", json={"email": "me-admin@utfl.example", "password": "a good password"}
    )
    token = login_response.json()["access_token"]

    response = await async_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    body = response.json()
    assert body["org_id"] is None
    assert body["role"] == "PLATFORM_ADMIN"


async def test_bootstrap_rejects_second_admin(async_client, monkeypatch):
    monkeypatch.setattr(settings, "admin_bootstrap_secret", "test-bootstrap-secret")
    payload = {"secret": "test-bootstrap-secret", "name": "Ops Admin", "email": "admin1@utfl.example", "password": "a good password"}

    first = await async_client.post("/admin/bootstrap", json=payload)
    assert first.status_code == 201

    second = await async_client.post("/admin/bootstrap", json={**payload, "email": "admin2@utfl.example"})
    assert second.status_code == 409
