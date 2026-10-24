def test_admin_is_seeded_and_can_login(client, admin_headers):
    r = client.get("/api/auth/me", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["username"] == "admin"
    assert r.json()["role"] == "admin"


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", data={"username": "admin", "password": "nope"})
    assert r.status_code == 401


def test_login_is_case_insensitive_on_username(client):
    r = client.post("/api/auth/login", data={"username": "ADMIN", "password": "admin123"})
    assert r.status_code == 200


def test_protected_route_requires_token(client):
    assert client.get("/api/tasks").status_code == 401
    assert client.get("/api/tasks", headers={"Authorization": "Bearer garbage"}).status_code == 401


def test_change_password(client, alice):
    _, headers = alice
    bad = client.post(
        "/api/auth/change-password",
        json={"current_password": "wrong", "new_password": "newpass1"},
        headers=headers,
    )
    assert bad.status_code == 400
    ok = client.post(
        "/api/auth/change-password",
        json={"current_password": "secret1", "new_password": "newpass1"},
        headers=headers,
    )
    assert ok.status_code == 204
    assert client.post("/api/auth/login", data={"username": "alice", "password": "secret1"}).status_code == 401
    assert client.post("/api/auth/login", data={"username": "alice", "password": "newpass1"}).status_code == 200


def test_deactivated_user_cannot_login_or_use_token(client, admin_headers, alice):
    user, headers = alice
    r = client.patch(f"/api/admin/users/{user['id']}", json={"is_active": False}, headers=admin_headers)
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert client.post("/api/auth/login", data={"username": "alice", "password": "secret1"}).status_code == 403
