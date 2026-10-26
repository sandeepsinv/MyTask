from datetime import date, timedelta

from .test_tasks import create_task
from .test_updates import post_update


def unlocked(client, headers, user_id):
    r = client.get(f"/api/users/{user_id}/achievements", headers=headers)
    assert r.status_code == 200
    return {a["key"] for a in r.json() if a["unlocked"]}


def test_first_steps_and_heavy_lifter(client, alice):
    user, headers = alice
    assert unlocked(client, headers, user["id"]) == set()
    task = create_task(client, headers, priority="critical")
    client.patch(f"/api/tasks/{task['id']}", json={"status": "done"}, headers=headers)
    assert {"first_steps", "heavy_lifter"} <= unlocked(client, headers, user["id"])


def test_team_player_across_three_projects(client, alice):
    user, headers = alice
    for name in ("Alpha", "Beta", "Gamma"):
        assert "team_player" not in unlocked(client, headers, user["id"])
        p = client.post("/api/projects", json={"name": name}, headers=headers).json()
        t = create_task(client, headers, project_id=p["id"])
        post_update(client, headers, t["id"])
    assert "team_player" in unlocked(client, headers, user["id"])


def test_on_fire_streak(client, alice):
    user, headers = alice
    task = create_task(client, headers)
    for i in range(7):
        d = date.today() - timedelta(days=i)
        post_update(client, headers, task["id"], on=d)
    assert "on_fire" in unlocked(client, headers, user["id"])


def test_awarding_is_idempotent_and_permanent(client, alice, db):
    from app.models import UserAchievement

    user, headers = alice
    task = create_task(client, headers)
    client.patch(f"/api/tasks/{task['id']}", json={"status": "done"}, headers=headers)
    client.patch(f"/api/tasks/{task['id']}", json={"status": "in_progress"}, headers=headers)
    client.patch(f"/api/tasks/{task['id']}", json={"status": "done"}, headers=headers)
    rows = db.query(UserAchievement).filter_by(user_id=user["id"], achievement_key="first_steps").all()
    assert len(rows) == 1

    client.delete(f"/api/tasks/{task['id']}", headers=headers)
    assert "first_steps" in unlocked(client, headers, user["id"])


def test_earned_matrix(client, alice, bob):
    a_user, a_headers = alice
    t = create_task(client, a_headers, priority="critical")
    client.patch(f"/api/tasks/{t['id']}", json={"status": "done"}, headers=a_headers)
    rows = {r["user"]["username"]: r["keys"] for r in client.get("/api/achievements/earned", headers=a_headers).json()}
    assert rows["alice"] == ["first_steps", "heavy_lifter"]
    assert rows["bob"] == []


def test_progress_reported_for_locked(client, alice):
    user, headers = alice
    task = create_task(client, headers)
    for i in range(3):
        post_update(client, headers, task["id"], on=date.today() - timedelta(days=i))
    statuses = {a["key"]: a for a in client.get(f"/api/users/{user['id']}/achievements", headers=headers).json()}
    assert statuses["storyteller"]["unlocked"] is False
    assert statuses["storyteller"]["progress"] == 0.1


def test_leaderboard_ranks_and_includes_achievement_points(client, alice, bob):
    a_user, a_headers = alice
    b_user, b_headers = bob
    t = create_task(client, a_headers, priority="high")
    client.patch(f"/api/tasks/{t['id']}", json={"status": "done"}, headers=a_headers)
    t2 = create_task(client, b_headers, priority="low")
    post_update(client, b_headers, t2["id"])

    board = client.get("/api/leaderboard?period=all", headers=a_headers).json()
    first = board[0]
    assert first["user"]["id"] == a_user["id"]
    assert first["rank"] == 1
    # high task 20 + first_steps 10
    assert first["breakdown"]["tasks"] == 20
    assert first["breakdown"]["achievements"] == 10
    assert first["score"] == 30

    bob_row = next(r for r in board if r["user"]["id"] == b_user["id"])
    assert bob_row["score"] == 3 + 3  # 1 day with an update + 1-day streak
    assert bob_row["rank"] == 2

    week = client.get("/api/leaderboard?period=week", headers=a_headers).json()
    assert next(r for r in week if r["user"]["id"] == a_user["id"])["breakdown"]["achievements"] == 0


def test_stats_endpoints(client, alice):
    _, headers = alice
    t = create_task(client, headers)
    client.patch(f"/api/tasks/{t['id']}", json={"status": "in_progress"}, headers=headers)
    post_update(client, headers, t["id"], "Wired up the API")

    ov = client.get("/api/stats/overview", headers=headers).json()
    assert ov["status_counts"]["in_progress"] == 1
    assert ov["updates_today"] == 1
    assert ov["people_updated_today"] == 1
    assert ov["unmapped_open_tasks"] == 1
    alice_row = next(m for m in ov["members"] if m["user"]["username"] == "alice")
    assert alice_row["current_task"]["id"] == t["id"]
    assert alice_row["latest_update"]["note"] == "Wired up the API"
    assert alice_row["updated_today"] is True

    me = client.get("/api/stats/me", headers=headers).json()
    assert me["update_days_this_week"] == 1
    assert me["updated_today"] is True
    assert me["unmapped_tasks"] == 1
    assert me["open_tasks"] == 1
    assert me["rank"] >= 1
