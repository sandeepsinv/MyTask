from datetime import date, datetime, timedelta

from app.services.scoring import (
    CompletedTask,
    UpdateEntry,
    compute_metrics,
    compute_score,
    current_streak,
    longest_streak,
    period_start,
)

TODAY = date(2026, 10, 22)  # a Thursday


def at(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, 12)


def days_ago(n: int) -> date:
    return TODAY - timedelta(days=n)


def test_period_start():
    assert period_start("week", TODAY) == date(2026, 10, 19)
    assert period_start("month", TODAY) == date(2026, 10, 1)
    assert period_start("all", TODAY) is None


def test_current_streak_counts_back_from_today():
    assert current_streak([TODAY, days_ago(1), days_ago(2), days_ago(4)], TODAY) == 3


def test_current_streak_survives_until_today_is_posted():
    assert current_streak([days_ago(1), days_ago(2)], TODAY) == 2


def test_current_streak_broken():
    assert current_streak([days_ago(2), days_ago(3)], TODAY) == 0
    assert current_streak([], TODAY) == 0


def test_longest_streak():
    assert longest_streak([days_ago(10), days_ago(9), days_ago(8), days_ago(1), TODAY]) == 3
    assert longest_streak([TODAY, TODAY]) == 1
    assert longest_streak([]) == 0


def test_score_breakdown_all_time():
    tasks = [
        CompletedTask("high", at(days_ago(1)), days_ago(0)),  # 20 + 5 on time
        CompletedTask("low", at(days_ago(1)), days_ago(3)),  # 5, late
        CompletedTask("critical", at(days_ago(40)), None),  # 35, no due date -> no bonus
    ]
    # Two updates today count as one day.
    updates = [UpdateEntry(TODAY), UpdateEntry(TODAY), UpdateEntry(days_ago(1))]
    score = compute_score(tasks, updates, achievement_points=25, period="all", today=TODAY)
    b = score.breakdown
    assert (b.tasks, b.on_time, b.updates, b.streak, b.achievements) == (60, 5, 6, 6, 25)
    assert score.total == 102
    assert score.tasks_completed == 3
    assert score.update_days == 2


def test_week_period_excludes_old_work_and_achievements():
    tasks = [CompletedTask("medium", at(days_ago(1)), None), CompletedTask("medium", at(days_ago(10)), None)]
    updates = [UpdateEntry(days_ago(1)), UpdateEntry(days_ago(10))]
    score = compute_score(tasks, updates, achievement_points=100, period="week", today=TODAY)
    assert score.tasks_completed == 1
    assert score.update_days == 1
    assert score.breakdown.achievements == 0
    assert score.total == 10 + 3 + 3


def test_streak_points_capped():
    updates = [UpdateEntry(days_ago(i)) for i in range(20)]
    score = compute_score([], updates, 0, "all", TODAY)
    assert score.streak == 20
    assert score.breakdown.streak == 30


def test_metrics():
    tasks = [
        CompletedTask("critical", at(days_ago(5)), days_ago(1)),  # 4 days early
        CompletedTask("low", at(days_ago(1)), days_ago(2)),  # late
    ]
    updates = [UpdateEntry(days_ago(1), 1), UpdateEntry(days_ago(1), 2), UpdateEntry(TODAY, None)]
    m = compute_metrics(tasks, updates, TODAY, done_project_ids=[3, None])
    assert m.tasks_completed == 2
    assert m.on_time_completed == 1
    assert m.critical_completed == 1
    assert m.max_days_early == 4
    assert m.update_days == 2
    assert m.projects_touched == 3
    assert m.current_streak == 2
