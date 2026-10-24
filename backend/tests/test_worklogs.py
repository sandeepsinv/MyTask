from datetime import date, timedelta

from .test_tasks import create_task


def test_log_hours_totals_on_task(client, alice):
    _, headers = alice
    task = create_task(client, headers)
    today = date.today()
    for d, h in [(today, 2.5), (today - timedelta(days=1), 3)]:
        r = client.post(f"/api/tasks/{task['id']}/logs", json={"date": str(d), "hours": h, "note": "work"}, headers=headers)
        assert r.status_code == 201

    detail = client.get(f"/api/tasks/{task['id']}", headers=headers).json()
    assert detail["hours_logged"] == 5.5
    assert len(detail["logs"]) == 2
    # Logging work on a todo task moves it to in progress.
    assert detail["status"] == "in_progress"


def test_invalid_hours_rejected(client, alice):
    _, headers = alice
    task = create_task(client, headers)
    for hours in (0, -1, 25):
        r = client.post(f"/api/tasks/{task['id']}/logs", json={"date": str(date.today()), "hours": hours}, headers=headers)
        assert r.status_code == 422


def test_future_log_rejected(client, alice):
    _, headers = alice
    task = create_task(client, headers)
    tomorrow = date.today() + timedelta(days=1)
    r = client.post(f"/api/tasks/{task['id']}/logs", json={"date": str(tomorrow), "hours": 1}, headers=headers)
    assert r.status_code == 422


def test_delete_log(client, alice):
    _, headers = alice
    task = create_task(client, headers)
    log = client.post(
        f"/api/tasks/{task['id']}/logs", json={"date": str(date.today()), "hours": 2}, headers=headers
    ).json()
    assert client.delete(f"/api/tasks/{task['id']}/logs/{log['id']}", headers=headers).status_code == 204
    assert client.get(f"/api/tasks/{task['id']}", headers=headers).json()["hours_logged"] == 0
