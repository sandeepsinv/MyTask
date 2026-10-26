"""Score computation. Pure functions over plain values so they are easy to test."""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta

PRIORITY_POINTS = {"low": 5, "medium": 10, "high": 20, "critical": 35}
ON_TIME_BONUS = 5
POINTS_PER_UPDATE_DAY = 3
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
class UpdateEntry:
    date: date
    project_id: int | None = None


@dataclass
class Breakdown:
    tasks: int = 0
    on_time: int = 0
    updates: int = 0
    streak: int = 0
    achievements: int = 0

    @property
    def total(self) -> int:
        return self.tasks + self.on_time + self.updates + self.streak + self.achievements


@dataclass
class Metrics:
    """All-time facts about a user, used by achievements."""

    tasks_completed: int = 0
    on_time_completed: int = 0
    critical_completed: int = 0
    max_days_early: int = 0
    update_days: int = 0
    projects_touched: int = 0
    current_streak: int = 0
    longest_streak: int = 0


def period_start(period: str, today: date) -> date | None:
    if period == "week":
        return today - timedelta(days=today.weekday())
    if period == "month":
        return today.replace(day=1)
    return None


def current_streak(update_days: Iterable[date], today: date) -> int:
    """Consecutive days with an update ending today, or ending yesterday so a
    streak isn't lost before the user has had a chance to post today."""
    days = set(update_days)
    cursor = today if today in days else today - timedelta(days=1)
    streak = 0
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def longest_streak(update_days: Iterable[date]) -> int:
    best = run = 0
    prev: date | None = None
    for d in sorted(set(update_days)):
        run = run + 1 if prev is not None and d - prev == timedelta(days=1) else 1
        best = max(best, run)
        prev = d
    return best


def compute_metrics(
    tasks: list[CompletedTask], updates: list[UpdateEntry], today: date, done_project_ids: Iterable[int | None] = ()
) -> Metrics:
    days = {u.date for u in updates}
    projects = {u.project_id for u in updates} | set(done_project_ids)
    projects.discard(None)
    return Metrics(
        tasks_completed=len(tasks),
        on_time_completed=sum(1 for t in tasks if t.on_time),
        critical_completed=sum(1 for t in tasks if t.priority == "critical"),
        max_days_early=max((t.days_early for t in tasks), default=0),
        update_days=len(days),
        projects_touched=len(projects),
        current_streak=current_streak(days, today),
        longest_streak=longest_streak(days),
    )


@dataclass
class Score:
    breakdown: Breakdown
    tasks_completed: int
    update_days: int
    streak: int

    @property
    def total(self) -> int:
        return self.breakdown.total


def compute_score(
    tasks: list[CompletedTask],
    updates: list[UpdateEntry],
    achievement_points: int,
    period: str,
    today: date,
) -> Score:
    """Tasks finished and days with an update count only inside the period; the
    current streak always counts; achievement points count only on the all-time board."""
    start = period_start(period, today)
    in_tasks = [t for t in tasks if start is None or t.completed_at.date() >= start]
    days = {u.date for u in updates}
    in_days = {d for d in days if start is None or d >= start}
    streak = current_streak(days, today)

    breakdown = Breakdown(
        tasks=sum(PRIORITY_POINTS.get(t.priority, 0) for t in in_tasks),
        on_time=ON_TIME_BONUS * sum(1 for t in in_tasks if t.on_time),
        updates=POINTS_PER_UPDATE_DAY * len(in_days),
        streak=min(streak * STREAK_POINTS_PER_DAY, STREAK_CAP),
        achievements=achievement_points if period == "all" else 0,
    )
    return Score(breakdown, len(in_tasks), len(in_days), streak)
