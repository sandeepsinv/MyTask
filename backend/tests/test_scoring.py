from datetime import date, datetime, timedelta

from app.services.scoring import (
    CompletedTask,
    LogEntry,
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


def test_current_streak_survives_until_today_is_logged():
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
    logs = [LogEntry(TODAY, 2), LogEntry(days_ago(1), 1.5)]
    score = compute_score(tasks, logs, achievement_points=25, period="all", today=TODAY)
    b = score.breakdown
    assert (b.tasks, b.on_time, b.hours, b.streak, b.achievements) == (60, 5, 7, 6, 25)
    assert score.total == 103
    assert score.tasks_completed == 3
    assert score.hours == 3.5


def test_week_period_excludes_old_work_and_achievements():
    tasks = [CompletedTask("medium", at(days_ago(1)), None), CompletedTask("medium", at(days_ago(10)), None)]
    logs = [LogEntry(days_ago(1), 4), LogEntry(days_ago(10), 8)]
    score = compute_score(tasks, logs, achievement_points=100, period="week", today=TODAY)
    assert score.tasks_completed == 1
    assert score.hours == 4
    assert score.breakdown.achievements == 0
    assert score.total == 10 + 8 + 3


def test_streak_points_capped():
    logs = [LogEntry(days_ago(i), 1) for i in range(20)]
    score = compute_score([], logs, 0, "all", TODAY)
    assert score.streak == 20
    assert score.breakdown.streak == 30


def test_metrics():
    tasks = [
        CompletedTask("critical", at(days_ago(5)), days_ago(1)),  # 4 days early
        CompletedTask("low", at(days_ago(1)), days_ago(2)),  # late
    ]
    logs = [LogEntry(days_ago(1), 5), LogEntry(days_ago(1), 4), LogEntry(TODAY, 1)]
    m = compute_metrics(tasks, logs, TODAY)
    assert m.tasks_completed == 2
    assert m.on_time_completed == 1
    assert m.critical_completed == 1
    assert m.max_days_early == 4
    assert m.total_hours == 10
    assert m.max_hours_one_day == 9
    assert m.current_streak == 2
