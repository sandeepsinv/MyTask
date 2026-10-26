from datetime import date, timedelta


def create_task(client, headers, **overrides):
    body = {"title": "Build login page", "priority": "high", "tags": ["frontend", "auth"]} | overrides
    r = client.post("/api/tasks", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_task_sets_owner(client, alice):
    user, headers = alice
    task = create_task(client, headers, pending_notes="Hook up API")
    assert task["owner"]["id"] == user["id"]
    assert task["status"] == "todo"
    assert task["tags"] == ["frontend", "auth"]
    assert task["pending_notes"] == "Hook up API"
    assert task["project"] is None
    assert task["last_update"] is None


def test_everyone_sees_everyones_tasks(client, alice, bob):
    _, a_headers = alice
    _, b_headers = bob
    create_task(client, a_headers, title="Alice task")
    create_task(client, b_headers, title="Bob task")
    titles = {t["title"] for t in client.get("/api/tasks", headers=a_headers).json()}
    assert titles == {"Alice task", "Bob task"}


def test_member_cannot_edit_or_delete_others_task(client, alice, bob):
    _, a_headers = alice
    _, b_headers = bob
    task = create_task(client, a_headers)
    assert client.patch(f"/api/tasks/{task['id']}", json={"title": "x"}, headers=b_headers).status_code == 403
    assert client.delete(f"/api/tasks/{task['id']}", headers=b_headers).status_code == 403
    assert (
        client.post(
            f"/api/tasks/{task['id']}/updates", json={"date": str(date.today()), "note": "Sneaky"}, headers=b_headers
        ).status_code
        == 403
    )


def test_admin_can_edit_any_task(client, admin_headers, alice):
    _, a_headers = alice
    task = create_task(client, a_headers)
    r = client.patch(f"/api/tasks/{task['id']}", json={"status": "blocked"}, headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "blocked"


def test_completing_task_sets_completed_at_and_progress(client, alice):
    _, headers = alice
    task = create_task(client, headers)
    done = client.patch(f"/api/tasks/{task['id']}", json={"status": "done"}, headers=headers).json()
    assert done["completed_at"] is not None
    assert done["progress_pct"] == 100
    reopened = client.patch(f"/api/tasks/{task['id']}", json={"status": "in_progress"}, headers=headers).json()
    assert reopened["completed_at"] is None


def test_filters(client, alice, bob):
    a_user, a_headers = alice
    _, b_headers = bob
    create_task(client, a_headers, title="Write docs", priority="low")
    t = create_task(client, b_headers, title="Fix bug", priority="critical")
    client.patch(f"/api/tasks/{t['id']}", json={"status": "in_progress"}, headers=b_headers)

    by_owner = client.get(f"/api/tasks?owner_id={a_user['id']}", headers=a_headers).json()
    assert [x["title"] for x in by_owner] == ["Write docs"]
    by_status = client.get("/api/tasks?status=in_progress", headers=a_headers).json()
    assert [x["title"] for x in by_status] == ["Fix bug"]
    by_q = client.get("/api/tasks?q=docs", headers=a_headers).json()
    assert [x["title"] for x in by_q] == ["Write docs"]


def test_due_before_start_rejected(client, alice):
    _, headers = alice
    r = client.post(
        "/api/tasks",
        json={"title": "x", "start_date": str(date.today()), "due_date": str(date.today() - timedelta(days=1))},
        headers=headers,
    )
    assert r.status_code == 422


def test_overdue_flag(client, alice):
    _, headers = alice
    task = create_task(client, headers, due_date=str(date.today() - timedelta(days=1)))
    assert task["is_overdue"] is True


def test_delete_own_task(client, alice):
    _, headers = alice
    task = create_task(client, headers)
    assert client.delete(f"/api/tasks/{task['id']}", headers=headers).status_code == 204
    assert client.get(f"/api/tasks/{task['id']}", headers=headers).status_code == 404
