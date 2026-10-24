from collections.abc import Callable
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Task, User, UserAchievement, WorkLog
from .scoring import CompletedTask, LogEntry, Metrics, compute_metrics


@dataclass(frozen=True)
class Achievement:
    key: str
    name: str
    description: str
    icon: str
    points: int
    tier: str
    target: float
    value: Callable[[Metrics], float]


ACHIEVEMENTS: list[Achievement] = [
    Achievement("first_steps", "First Steps", "Complete your first task",
                "flag", 10, "bronze", 1, lambda m: m.tasks_completed),
    Achievement("heavy_lifter", "Heavy Lifter", "Complete a critical-priority task",
                "dumbbell", 15, "bronze", 1, lambda m: m.critical_completed),
    Achievement("marathon", "Marathon", "Log 8 or more hours in a single day",
                "timer", 10, "bronze", 8, lambda m: m.max_hours_one_day),
    Achievement("early_bird", "Early Bird", "Finish a task 2+ days before its due date",
                "sunrise", 10, "bronze", 2, lambda m: m.max_days_early),
    Achievement("punctual", "Punctual", "Finish 5 tasks on or before their due date",
                "calendar-check", 20, "silver", 5, lambda m: m.on_time_completed),
    Achievement("getting_things_done", "Getting Things Done", "Complete 10 tasks",
                "list-checks", 25, "silver", 10, lambda m: m.tasks_completed),
    Achievement("on_fire", "On Fire", "Log work 7 days in a row",
                "flame", 30, "silver", 7, lambda m: m.longest_streak),
    Achievement("centurion", "Centurion", "Log 100 hours in total",
                "trophy", 50, "gold", 100, lambda m: m.total_hours),
]

BY_KEY = {a.key: a for a in ACHIEVEMENTS}


def to_def(a: Achievement) -> dict:
    return {
        "key": a.key,
        "name": a.name,
        "description": a.description,
        "icon": a.icon,
        "points": a.points,
        "tier": a.tier,
        "target": a.target,
    }


def load_user_inputs(db: Session, user_id: int) -> tuple[list[CompletedTask], list[LogEntry]]:
    tasks = db.scalars(
        select(Task).where(
            Task.owner_id == user_id, Task.status == "done", Task.completed_at.is_not(None)
        )
    ).all()
    logs = db.scalars(select(WorkLog).where(WorkLog.user_id == user_id)).all()
    return (
        [CompletedTask(t.priority, t.completed_at, t.due_date) for t in tasks if t.completed_at],
        [LogEntry(log.date, log.hours) for log in logs],
    )


def user_metrics(db: Session, user_id: int, today: date | None = None) -> Metrics:
    tasks, logs = load_user_inputs(db, user_id)
    return compute_metrics(tasks, logs, today or date.today())


def evaluate_and_award(db: Session, user: User, today: date | None = None) -> list[str]:
    """Award newly earned achievements and return their keys. Idempotent.
    Achievements are permanent once earned, even if the work is later removed."""
    metrics = user_metrics(db, user.id, today)
    have = set(
        db.scalars(
            select(UserAchievement.achievement_key).where(UserAchievement.user_id == user.id)
        )
    )
    new = [a.key for a in ACHIEVEMENTS if a.key not in have and a.value(metrics) >= a.target]
    for key in new:
        db.add(UserAchievement(user_id=user.id, achievement_key=key))
    if new:
        db.commit()
    return new


def achievement_points(keys: list[str]) -> int:
    return sum(BY_KEY[k].points for k in keys if k in BY_KEY)
