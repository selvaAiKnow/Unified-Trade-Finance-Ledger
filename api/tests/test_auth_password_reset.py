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


async def test_verify_otp_returns_reset_token_for_correct_code(async_client):
    await _signup(async_client, "verify-test@example.com", "the original password")
    forgot_response = await async_client.post("/auth/forgot-password", json={"email": "verify-test@example.com"})
    otp_code = forgot_response.json()["otp_code"]

    response = await async_client.post("/auth/verify-otp", json={"email": "verify-test@example.com", "code": otp_code})

    assert response.status_code == 200
    assert response.json()["reset_token"]


async def test_verify_otp_rejects_wrong_code(async_client):
    await _signup(async_client, "verify-wrong@example.com", "the original password")
    await async_client.post("/auth/forgot-password", json={"email": "verify-wrong@example.com"})

    response = await async_client.post("/auth/verify-otp", json={"email": "verify-wrong@example.com", "code": "000000"})

    assert response.status_code == 400


async def test_verify_otp_locks_out_after_five_wrong_attempts(async_client):
    await _signup(async_client, "verify-lockout@example.com", "the original password")
    forgot_response = await async_client.post("/auth/forgot-password", json={"email": "verify-lockout@example.com"})
    correct_code = forgot_response.json()["otp_code"]
    wrong_code = "000000" if correct_code != "000000" else "111111"

    for _ in range(5):
        response = await async_client.post("/auth/verify-otp", json={"email": "verify-lockout@example.com", "code": wrong_code})
        assert response.status_code == 400

    # Even the correct code is now rejected — the OTP is locked out, not just that one guess.
    response = await async_client.post("/auth/verify-otp", json={"email": "verify-lockout@example.com", "code": correct_code})
    assert response.status_code == 400


async def test_full_password_reset_flow_lets_user_log_in_with_new_password(async_client):
    await _signup(async_client, "reset-flow@example.com", "the original password")
    forgot_response = await async_client.post("/auth/forgot-password", json={"email": "reset-flow@example.com"})
    otp_code = forgot_response.json()["otp_code"]
    verify_response = await async_client.post("/auth/verify-otp", json={"email": "reset-flow@example.com", "code": otp_code})
    reset_token = verify_response.json()["reset_token"]

    reset_response = await async_client.post(
        "/auth/reset-password", json={"reset_token": reset_token, "new_password": "a brand new password"}
    )
    assert reset_response.status_code == 200

    old_password_login = await async_client.post(
        "/auth/login", json={"email": "reset-flow@example.com", "password": "the original password"}
    )
    assert old_password_login.status_code == 401

    new_password_login = await async_client.post(
        "/auth/login", json={"email": "reset-flow@example.com", "password": "a brand new password"}
    )
    assert new_password_login.status_code == 200


async def test_reset_password_rejects_garbage_token(async_client):
    response = await async_client.post(
        "/auth/reset-password", json={"reset_token": "not-a-real-token", "new_password": "a brand new password"}
    )
    assert response.status_code == 400


async def test_reset_password_rejects_short_password(async_client):
    await _signup(async_client, "reset-short@example.com", "the original password")
    forgot_response = await async_client.post("/auth/forgot-password", json={"email": "reset-short@example.com"})
    verify_response = await async_client.post(
        "/auth/verify-otp", json={"email": "reset-short@example.com", "code": forgot_response.json()["otp_code"]}
    )
    reset_token = verify_response.json()["reset_token"]

    response = await async_client.post("/auth/reset-password", json={"reset_token": reset_token, "new_password": "short"})

    assert response.status_code == 422
