def test_admin_creates_member(client, admin_headers):
    r = client.post(
        "/api/admin/users",
        json={"username": "Carol", "full_name": "Carol King", "password": "secret1", "email": "carol@example.com"},
        headers=admin_headers,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["username"] == "carol"
    assert body["role"] == "member"
    assert "hashed_password" not in body


def test_duplicate_username_rejected(client, admin_headers, alice):
    r = client.post(
        "/api/admin/users",
        json={"username": "alice", "full_name": "Other", "password": "secret1"},
        headers=admin_headers,
    )
    assert r.status_code == 409


def test_member_cannot_use_admin_endpoints(client, alice, bob):
    _, headers = alice
    bob_user, _ = bob
    assert client.get("/api/admin/users", headers=headers).status_code == 403
    assert (
        client.post(
            "/api/admin/users",
            json={"username": "eve", "full_name": "Eve", "password": "secret1"},
            headers=headers,
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/admin/users/{bob_user['id']}/reset-password", json={"new_password": "hacked1"}, headers=headers
        ).status_code
        == 403
    )


def test_members_can_list_team(client, alice, bob):
    _, headers = alice
    r = client.get("/api/users", headers=headers)
    assert r.status_code == 200
    names = {u["username"] for u in r.json()}
    assert {"admin", "alice", "bob"} <= names
    assert "email" not in r.json()[0]


def test_admin_reset_password(client, admin_headers, alice):
    user, _ = alice
    r = client.post(f"/api/admin/users/{user['id']}/reset-password", json={"new_password": "fresh12"}, headers=admin_headers)
    assert r.status_code == 204
    assert client.post("/api/auth/login", data={"username": "alice", "password": "fresh12"}).status_code == 200


def test_cannot_remove_last_admin(client, admin_headers):
    me = client.get("/api/auth/me", headers=admin_headers).json()
    r = client.patch(f"/api/admin/users/{me['id']}", json={"role": "member"}, headers=admin_headers)
    assert r.status_code == 400


def test_short_password_rejected(client, admin_headers):
    r = client.post(
        "/api/admin/users", json={"username": "dan", "full_name": "Dan", "password": "123"}, headers=admin_headers
    )
    assert r.status_code == 422
