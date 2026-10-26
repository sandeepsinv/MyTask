from collections.abc import Callable
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import DailyUpdate, Task, User, UserAchievement
from .scoring import CompletedTask, Metrics, UpdateEntry, compute_metrics


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
    Achievement("team_player", "Team Player", "Work on tasks in 3 different projects",
                "layers", 10, "bronze", 3, lambda m: m.projects_touched),
    Achievement("early_bird", "Early Bird", "Finish a task 2+ days before its due date",
                "sunrise", 10, "bronze", 2, lambda m: m.max_days_early),
    Achievement("punctual", "Punctual", "Finish 5 tasks on or before their due date",
                "calendar-check", 20, "silver", 5, lambda m: m.on_time_completed),
    Achievement("getting_things_done", "Getting Things Done", "Complete 10 tasks",
                "list-checks", 25, "silver", 10, lambda m: m.tasks_completed),
    Achievement("on_fire", "On Fire", "Post an update 7 days in a row",
                "flame", 30, "silver", 7, lambda m: m.longest_streak),
    Achievement("storyteller", "Storyteller", "Post updates on 30 different days",
                "notebook-pen", 50, "gold", 30, lambda m: m.update_days),
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


def user_metrics(db: Session, user_id: int, today: date | None = None) -> Metrics:
    done = db.scalars(
        select(Task).where(Task.owner_id == user_id, Task.status == "done", Task.completed_at.is_not(None))
    ).all()
    rows = db.execute(
        select(DailyUpdate.date, Task.project_id)
        .join(Task, DailyUpdate.task_id == Task.id)
        .where(DailyUpdate.user_id == user_id)
    ).all()
    return compute_metrics(
        [CompletedTask(t.priority, t.completed_at, t.due_date) for t in done if t.completed_at],
        [UpdateEntry(d, p) for d, p in rows],
        today or date.today(),
        done_project_ids=[t.project_id for t in done],
    )


def evaluate_and_award(db: Session, user: User, today: date | None = None) -> list[str]:
    """Award newly earned achievements and return their keys. Idempotent.
    Achievements are permanent once earned, even if the work is later removed."""
    metrics = user_metrics(db, user.id, today)
    have = set(
        db.scalars(select(UserAchievement.achievement_key).where(UserAchievement.user_id == user.id))
    )
    new = [a.key for a in ACHIEVEMENTS if a.key not in have and a.value(metrics) >= a.target]
    for key in new:
        db.add(UserAchievement(user_id=user.id, achievement_key=key))
    if new:
        db.commit()
    return new


def achievement_points(keys: list[str]) -> int:
    return sum(BY_KEY[k].points for k in keys if k in BY_KEY)
