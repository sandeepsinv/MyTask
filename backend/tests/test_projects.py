from datetime import date

from .test_tasks import create_task
from .test_updates import post_update


def new_project(client, headers, name="Billing v2", **extra):
    r = client.post("/api/projects", json={"name": name, **extra}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_any_member_can_create_a_project(client, alice):
    _, headers = alice
    p = new_project(client, headers, description="Move invoices to the new API", color="#2563eb")
    assert p["created_by"]["username"] == "alice"
    assert p["status"] == "active"
    assert p["total_tasks"] == 0
    assert p["members"] == []


def test_duplicate_active_name_rejected(client, alice, bob):
    new_project(client, alice[1], "Launch")
    assert client.post("/api/projects", json={"name": "launch"}, headers=bob[1]).status_code == 409


def test_map_and_unmap_task(client, alice):
    _, headers = alice
    p = new_project(client, headers)
    task = create_task(client, headers)
    assert client.get("/api/tasks?unmapped=true", headers=headers).json()[0]["id"] == task["id"]

    mapped = client.patch(f"/api/tasks/{task['id']}", json={"project_id": p["id"]}, headers=headers).json()
    assert mapped["project"]["name"] == "Billing v2"
    assert client.get("/api/tasks?unmapped=true", headers=headers).json() == []
    assert [t["id"] for t in client.get(f"/api/tasks?project_id={p['id']}", headers=headers).json()] == [task["id"]]

    unmapped = client.patch(f"/api/tasks/{task['id']}", json={"project_id": None}, headers=headers).json()
    assert unmapped["project"] is None


def test_task_can_move_between_projects(client, alice):
    _, headers = alice
    a = new_project(client, headers, "Alpha")
    b = new_project(client, headers, "Beta")
    task = create_task(client, headers, project_id=a["id"])
    moved = client.patch(f"/api/tasks/{task['id']}", json={"project_id": b["id"]}, headers=headers).json()
    assert moved["project"]["id"] == b["id"]


def test_cannot_map_to_missing_or_archived_project(client, alice):
    _, headers = alice
    p = new_project(client, headers)
    client.patch(f"/api/projects/{p['id']}", json={"status": "archived"}, headers=headers)
    task = create_task(client, headers)
    assert client.patch(f"/api/tasks/{task['id']}", json={"project_id": p["id"]}, headers=headers).status_code == 422
    assert client.patch(f"/api/tasks/{task['id']}", json={"project_id": 999}, headers=headers).status_code == 422


def test_summary_members_and_latest_updates(client, alice, bob):
    _, a_headers = alice
    _, b_headers = bob
    p = new_project(client, a_headers)
    t1 = create_task(client, a_headers, title="Invoices", project_id=p["id"])
    t2 = create_task(client, b_headers, title="Webhooks", project_id=p["id"])
    create_task(client, b_headers, title="Elsewhere")
    post_update(client, a_headers, t1["id"], "Mapped old invoice fields")
    post_update(client, b_headers, t2["id"], "Retried failed webhooks")
    client.patch(f"/api/tasks/{t2['id']}", json={"status": "blocked"}, headers=b_headers)

    summary = next(x for x in client.get("/api/projects", headers=a_headers).json() if x["id"] == p["id"])
    assert summary["total_tasks"] == 2
    assert summary["counts"] == {"todo": 0, "in_progress": 1, "blocked": 1, "done": 0}
    assert summary["last_activity"] == str(date.today())
    members = {m["user"]["username"]: m for m in summary["members"]}
    assert set(members) == {"alice", "bob"}
    assert members["bob"]["last_update"]["note"] == "Retried failed webhooks"
    assert {u["note"] for u in summary["recent_updates"]} == {"Mapped old invoice fields", "Retried failed webhooks"}

    detail = client.get(f"/api/projects/{p['id']}", headers=b_headers).json()
    assert {t["title"] for t in detail["tasks"]} == {"Invoices", "Webhooks"}


def test_only_creator_or_admin_can_edit(client, admin_headers, alice, bob):
    p = new_project(client, alice[1])
    assert client.patch(f"/api/projects/{p['id']}", json={"name": "Hijack"}, headers=bob[1]).status_code == 403
    assert client.patch(f"/api/projects/{p['id']}", json={"name": "Billing"}, headers=alice[1]).json()["name"] == "Billing"
    assert client.patch(f"/api/projects/{p['id']}", json={"status": "archived"}, headers=admin_headers).status_code == 200
    assert client.get("/api/projects", headers=alice[1]).json() == []
    assert len(client.get("/api/projects?state=archived", headers=alice[1]).json()) == 1


def test_delete_project_keeps_tasks_unmapped(client, alice):
    _, headers = alice
    p = new_project(client, headers)
    task = create_task(client, headers, project_id=p["id"])
    assert client.delete(f"/api/projects/{p['id']}", headers=headers).status_code == 204
    assert client.get(f"/api/tasks/{task['id']}", headers=headers).json()["project"] is None
