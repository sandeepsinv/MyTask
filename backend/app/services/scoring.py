"""Score computation. Pure functions over plain values so they are easy to test."""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

PRIORITY_POINTS = {"low": 5, "medium": 10, "high": 20, "critical": 35}
ON_TIME_BONUS = 5
POINTS_PER_HOUR = 2
STREAK_POINTS_PER_DAY = 3
STREAK_CAP = 30


@dataclass(frozen=True)
class CompletedTask:
    priority: str
    completed_at: datetime
    due_date: date | None

    @property
    def on_time(self) -> bool:
        return self.due_date is not None and self.completed_at.date() <= self.due_date

    @property
    def days_early(self) -> int:
        if self.due_date is None:
            return 0
        return (self.due_date - self.completed_at.date()).days


@dataclass(frozen=True)
class LogEntry:
    date: date
    hours: float


@dataclass
class Breakdown:
    tasks: int = 0
    on_time: int = 0
    hours: int = 0
    streak: int = 0
    achievements: int = 0

    @property
    def total(self) -> int:
        return self.tasks + self.on_time + self.hours + self.streak + self.achievements


@dataclass
class Metrics:
    """All-time facts about a user, used by achievements."""

    tasks_completed: int = 0
    on_time_completed: int = 0
    critical_completed: int = 0
    max_days_early: int = 0
    total_hours: float = 0.0
    max_hours_one_day: float = 0.0
    current_streak: int = 0
    longest_streak: int = 0
    hours_by_day: dict[date, float] = field(default_factory=dict)


def period_start(period: str, today: date) -> date | None:
    if period == "week":
        return today - timedelta(days=today.weekday())
    if period == "month":
        return today.replace(day=1)
    return None


def current_streak(log_days: Iterable[date], today: date) -> int:
    """Consecutive days with logged work ending today, or ending yesterday so a
    streak isn't lost before the user has had a chance to log today."""
    days = set(log_days)
    cursor = today if today in days else today - timedelta(days=1)
    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def longest_streak(log_days: Iterable[date]) -> int:
    best = run = 0
    prev: date | None = None
    for d in sorted(set(log_days)):
        run = run + 1 if prev is not None and d - prev == timedelta(days=1) else 1
        best = max(best, run)
        prev = d
    return best


def compute_metrics(tasks: list[CompletedTask], logs: list[LogEntry], today: date) -> Metrics:
    by_day: dict[date, float] = defaultdict(float)
    for log in logs:
        by_day[log.date] += log.hours
    return Metrics(
        tasks_completed=len(tasks),
        on_time_completed=sum(1 for t in tasks if t.on_time),
        critical_completed=sum(1 for t in tasks if t.priority == "critical"),
        max_days_early=max((t.days_early for t in tasks), default=0),
        total_hours=round(sum(by_day.values()), 2),
        max_hours_one_day=round(max(by_day.values(), default=0.0), 2),
        current_streak=current_streak(by_day.keys(), today),
        longest_streak=longest_streak(by_day.keys()),
        hours_by_day=dict(by_day),
    )


@dataclass
class Score:
    breakdown: Breakdown
    tasks_completed: int
    hours: float
    streak: int

    @property
    def total(self) -> int:
        return self.breakdown.total


def compute_score(
    tasks: list[CompletedTask],
    logs: list[LogEntry],
    achievement_points: int,
    period: str,
    today: date,
) -> Score:
    """Tasks and hours count only inside the period; the current streak always
    counts; achievement points count only on the all-time board."""
    start = period_start(period, today)
    in_tasks = [t for t in tasks if start is None or t.completed_at.date() >= start]
    in_logs = [log for log in logs if start is None or log.date >= start]
    hours = round(sum(log.hours for log in in_logs), 2)
    streak = current_streak((log.date for log in logs), today)

    breakdown = Breakdown(
        tasks=sum(PRIORITY_POINTS.get(t.priority, 0) for t in in_tasks),
        on_time=ON_TIME_BONUS * sum(1 for t in in_tasks if t.on_time),
        hours=int(round(hours * POINTS_PER_HOUR)),
        streak=min(streak * STREAK_POINTS_PER_DAY, STREAK_CAP),
        achievements=achievement_points if period == "all" else 0,
    )
    return Score(breakdown, len(in_tasks), hours, streak)
