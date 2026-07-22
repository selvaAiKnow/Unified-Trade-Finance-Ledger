import uuid

from app.auth.security import create_access_token
from app.models.user import User


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


async def test_invited_user_cannot_log_in(async_client):
    admin_token = await _signup_and_login(async_client, "invite-admin-2@example.com")
    await async_client.post(
        "/users",
        json={"name": "Viewer Person", "email": "viewer-person@example.com", "role": "VIEWER"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    viewer_login = await async_client.post("/auth/login", json={"email": "viewer-person@example.com", "password": "invited-no-password-yet"})
    # Invited users have no usable password yet in Phase 1 (no invite-acceptance
    # flow is in scope) — this asserts login correctly rejects; team-invite
    # acceptance is a documented gap.
    assert viewer_login.status_code == 401


async def test_post_users_rejects_non_admin(async_client, db_session):
    # Create org A with admin
    admin_token = await _signup_and_login(async_client, "org-a-admin-403@example.com")

    # Get the org ID by creating a user first to fetch the org
    org_response = await async_client.get("/users", headers={"Authorization": f"Bearer {admin_token}"})
    admin_user = org_response.json()[0]
    org_id = uuid.UUID(admin_user["org_id"])

    # Create a non-admin (VIEWER) user directly in the database with ACTIVE status
    non_admin_user = User(
        id=uuid.uuid4(),
        org_id=org_id,
        name="Non Admin User",
        email="non-admin-viewer@example.com",
        password_hash="dummy-hash-that-wont-be-used",
        role="VIEWER",
        status="ACTIVE",
    )
    db_session.add(non_admin_user)
    await db_session.commit()

    # Create a token for the non-admin user
    non_admin_token = create_access_token(
        user_id=str(non_admin_user.id),
        org_id=str(non_admin_user.org_id),
        role=non_admin_user.role,
    )

    # Try to invite a user as the non-admin user
    response = await async_client.post(
        "/users",
        json={"name": "Someone Else", "email": "someone-else@example.com", "role": "VIEWER"},
        headers={"Authorization": f"Bearer {non_admin_token}"},
    )

    # Should get 403 Forbidden
    assert response.status_code == 403
