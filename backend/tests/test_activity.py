from datetime import date

from .test_tasks import create_task
from .test_updates import post_update


def activity(client, headers, **params):
    r = client.get("/api/admin/activity", params=params, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def actions(client, headers, **params):
    return [(a["user"]["username"] if a["user"] else None, a["action"]) for a in activity(client, headers, **params)["items"]]


def test_only_admins_can_read_the_log(client, alice):
    _, headers = alice
    assert client.get("/api/admin/activity", headers=headers).status_code == 403
    assert client.get("/api/admin/activity/people", headers=headers).status_code == 403


def test_sign_ins_and_failures_are_logged(client, admin_headers, alice):
    client.post("/api/auth/login", data={"username": "alice", "password": "wrong"})
    client.post("/api/auth/login", data={"username": "nobody", "password": "x"})
    _, headers = alice
    client.post("/api/auth/logout", headers=headers)

    rows = activity(client, admin_headers, category="auth")["items"]
    seen = [(r["user"]["username"] if r["user"] else None, r["action"]) for r in rows]
    assert ("alice", "auth.logout") in seen
    assert ("alice", "auth.login_failed") in seen
    assert (None, "auth.login_failed") in seen
    unknown = next(r for r in rows if r["user"] is None)
    assert unknown["details"]["username"] == "nobody"
    assert unknown["ip"]


def test_task_lifecycle_is_logged_with_changes(client, admin_headers, alice):
    _, headers = alice
    project = client.post("/api/projects", json={"name": "Billing v2"}, headers=headers).json()
    task = create_task(client, headers, title="Invoices")
    client.patch(f"/api/tasks/{task['id']}", json={"project_id": project["id"]}, headers=headers)
    client.patch(f"/api/tasks/{task['id']}", json={"status": "blocked"}, headers=headers)
    client.patch(f"/api/tasks/{task['id']}", json={"title": "Invoices v2", "priority": "critical"}, headers=headers)
    client.patch(f"/api/tasks/{task['id']}", json={"status": "done"}, headers=headers)
    client.delete(f"/api/tasks/{task['id']}", headers=headers)

    rows = activity(client, admin_headers, user_id=alice[0]["id"], category="task")["items"]
    summaries = [r["summary"] for r in reversed(rows)]
    assert summaries == [
        'Created task "Invoices"',
        'Mapped "Invoices" to Billing v2',
        'Moved "Invoices" from Up next to Blocked',
        'Edited "Invoices v2": title, priority',
        'Completed "Invoices v2"',
        'Deleted task "Invoices v2"',
    ]
    edit = next(r for r in rows if r["action"] == "task.updated")
    assert edit["details"]["changes"]["priority"] == ["high", "critical"]


def test_unchanged_edit_is_not_logged(client, admin_headers, alice):
    _, headers = alice
    task = create_task(client, headers, title="Same")
    client.patch(f"/api/tasks/{task['id']}", json={"title": "Same"}, headers=headers)
    assert [a for _, a in actions(client, admin_headers, category="task")] == ["task.created"]


def test_project_and_update_actions_are_logged(client, admin_headers, alice):
    _, headers = alice
    p = client.post("/api/projects", json={"name": "Launch"}, headers=headers).json()
    client.patch(f"/api/projects/{p['id']}", json={"status": "archived"}, headers=headers)
    client.delete(f"/api/projects/{p['id']}", headers=headers)
    task = create_task(client, headers)
    u = post_update(client, headers, task["id"], "Wrote the parser").json()
    client.delete(f"/api/tasks/{task['id']}/updates/{u['id']}", headers=headers)

    assert [a for _, a in actions(client, admin_headers, category="project")] == [
        "project.deleted",
        "project.archived",
        "project.created",
    ]
    rows = activity(client, admin_headers, category="update")["items"]
    assert [r["action"] for r in rows] == ["update.deleted", "update.posted"]
    assert rows[1]["details"]["note"] == "Wrote the parser"


def test_admin_actions_on_people_are_logged(client, admin_headers, alice):
    user, _ = alice
    client.post(f"/api/admin/users/{user['id']}/reset-password", json={"new_password": "fresh12"}, headers=admin_headers)
    client.patch(f"/api/admin/users/{user['id']}", json={"is_active": False}, headers=admin_headers)
    rows = activity(client, admin_headers, category="user")["items"]
    assert [r["summary"] for r in rows] == [
        "Deactivated Alice Smith",
        "Reset Alice Smith's password",
        "Added Alice Smith (@alice) as a member",
    ]
    assert all(r["user"]["username"] == "admin" for r in rows)


def test_paging_and_search(client, admin_headers, alice):
    _, headers = alice
    for i in range(5):
        create_task(client, headers, title=f"Task {i}")
    page1 = activity(client, admin_headers, category="task", limit=3)
    assert len(page1["items"]) == 3 and page1["next_before"]
    page2 = activity(client, admin_headers, category="task", limit=3, before=page1["next_before"])
    assert len(page2["items"]) == 2 and page2["next_before"] is None
    assert [r["summary"] for r in activity(client, admin_headers, q="Task 3")["items"]] == ['Created task "Task 3"']
    assert activity(client, admin_headers, **{"from": str(date.today())})["items"]


def test_people_summary(client, admin_headers, alice):
    _, headers = alice
    create_task(client, headers)
    client.post("/api/auth/login", data={"username": "alice", "password": "nope"})
    people = {p["user"]["username"]: p for p in client.get("/api/admin/activity/people", headers=admin_headers).json()}
    assert people["alice"]["actions_30d"] == 1
    assert people["alice"]["failed_sign_ins_30d"] == 1
    assert people["alice"]["last_sign_in"] is not None


def test_updates_belong_to_their_author(client, admin_headers, alice, bob):
    a_user, a_headers = alice
    task = create_task(client, a_headers)
    # An admin posting on Alice's task is recorded as the admin, not as Alice.
    by_admin = post_update(client, admin_headers, task["id"], "Unblocked the deploy").json()
    by_alice = post_update(client, a_headers, task["id"], "Wrote the parser").json()
    assert by_admin["user_id"] != a_user["id"]
    assert by_alice["user_id"] == a_user["id"]

    # The task owner can't delete someone else's update; its author or an admin can.
    assert client.delete(f"/api/tasks/{task['id']}/updates/{by_admin['id']}", headers=a_headers).status_code == 403
    assert client.delete(f"/api/tasks/{task['id']}/updates/{by_alice['id']}", headers=bob[1]).status_code == 403
    assert client.delete(f"/api/tasks/{task['id']}/updates/{by_alice['id']}", headers=a_headers).status_code == 204
    assert client.delete(f"/api/tasks/{task['id']}/updates/{by_admin['id']}", headers=admin_headers).status_code == 204


def test_creators_can_delete_what_they_created(client, alice, bob):
    _, a_headers = alice
    _, b_headers = bob
    project = client.post("/api/projects", json={"name": "Alice's"}, headers=a_headers).json()
    task = create_task(client, a_headers, project_id=project["id"])
    assert client.delete(f"/api/tasks/{task['id']}", headers=b_headers).status_code == 403
    assert client.delete(f"/api/projects/{project['id']}", headers=b_headers).status_code == 403
    assert client.delete(f"/api/tasks/{task['id']}", headers=a_headers).status_code == 204
    assert client.delete(f"/api/projects/{project['id']}", headers=a_headers).status_code == 204
