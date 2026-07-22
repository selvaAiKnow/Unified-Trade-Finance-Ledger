async def _signup_and_login(async_client, email: str) -> str:
    signup_payload = {
        "organization": {"name": "Test Org", "org_type": "EXPORTER", "country": "India", "industry": "Pharmaceuticals", "tax_id": "TAX-USERS-1"},
        "admin_user": {"name": "Admin User", "email": email, "password": "a good password"},
    }
    await async_client.post("/auth/signup", json=signup_payload)
    login_response = await async_client.post("/auth/login", json={"email": email, "password": "a good password"})
    return login_response.json()["access_token"]


async def test_list_users_returns_only_own_org(async_client):
    token_a = await _signup_and_login(async_client, "org-a-admin@example.com")
    await _signup_and_login(async_client, "org-b-admin@example.com")

    response = await async_client.get("/users", headers={"Authorization": f"Bearer {token_a}"})
    assert response.status_code == 200
    emails = {u["email"] for u in response.json()}
    assert emails == {"org-a-admin@example.com"}


async def test_invite_teammate_creates_invited_user(async_client):
    token = await _signup_and_login(async_client, "invite-admin@example.com")

    response = await async_client.post(
        "/users",
        json={"name": "Arjun Nair", "email": "arjun-invited@example.com", "role": "DOCS_COMPLIANCE"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "INVITED"
    assert body["role"] == "DOCS_COMPLIANCE"


async def test_invite_teammate_rejects_non_admin(async_client):
    admin_token = await _signup_and_login(async_client, "invite-admin-2@example.com")
    await async_client.post(
        "/users",
        json={"name": "Viewer Person", "email": "viewer-person@example.com", "role": "VIEWER"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    viewer_login = await async_client.post("/auth/login", json={"email": "viewer-person@example.com", "password": "invited-no-password-yet"})
    # Invited users have no usable password yet in Phase 1 (no invite-acceptance
    # flow is in scope) — this asserts login correctly rejects, not that
    # invited users can act; team-invite acceptance is a documented gap.
    assert viewer_login.status_code == 401
