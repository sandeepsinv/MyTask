from datetime import date, timedelta

from .test_tasks import create_task


def post_update(client, headers, task_id, note="Wrote the migration", on=None):
    return client.post(
        f"/api/tasks/{task_id}/updates", json={"date": str(on or date.today()), "note": note}, headers=headers
    )


def test_post_update_shows_on_task(client, alice):
    _, headers = alice
    task = create_task(client, headers)
    yesterday = date.today() - timedelta(days=1)
    assert post_update(client, headers, task["id"], "Sketched the schema", yesterday).status_code == 201
    assert post_update(client, headers, task["id"], "Wrote the migration").status_code == 201

    detail = client.get(f"/api/tasks/{task['id']}", headers=headers).json()
    assert [u["note"] for u in detail["updates"]] == ["Wrote the migration", "Sketched the schema"]
    assert detail["last_update"]["note"] == "Wrote the migration"
    # Posting work on a todo task moves it to in progress.
    assert detail["status"] == "in_progress"


def test_blank_or_future_update_rejected(client, alice):
    _, headers = alice
    task = create_task(client, headers)
    assert post_update(client, headers, task["id"], "   ").status_code == 422
    assert post_update(client, headers, task["id"], "Later", date.today() + timedelta(days=1)).status_code == 422


def test_delete_update(client, alice):
    _, headers = alice
    task = create_task(client, headers)
    update = post_update(client, headers, task["id"]).json()
    assert client.delete(f"/api/tasks/{task['id']}/updates/{update['id']}", headers=headers).status_code == 204
    assert client.get(f"/api/tasks/{task['id']}", headers=headers).json()["updates"] == []


def test_feed_for_a_day_includes_everyone_with_task_and_project(client, alice, bob):
    _, a_headers = alice
    _, b_headers = bob
    project = client.post("/api/projects", json={"name": "Billing v2"}, headers=a_headers).json()
    a_task = create_task(client, a_headers, title="Invoices", project_id=project["id"])
    b_task = create_task(client, b_headers, title="Webhooks")
    post_update(client, a_headers, a_task["id"], "Mapped old invoice fields")
    post_update(client, b_headers, b_task["id"], "Retried failed webhooks")
    post_update(client, b_headers, b_task["id"], "Old news", date.today() - timedelta(days=3))

    today = client.get(f"/api/updates?on={date.today()}", headers=a_headers).json()
    assert {u["note"] for u in today} == {"Mapped old invoice fields", "Retried failed webhooks"}
    alice_row = next(u for u in today if u["user"]["username"] == "alice")
    assert alice_row["task"]["title"] == "Invoices"
    assert alice_row["task"]["project"]["name"] == "Billing v2"

    by_project = client.get(f"/api/updates?project_id={project['id']}", headers=a_headers).json()
    assert [u["note"] for u in by_project] == ["Mapped old invoice fields"]
