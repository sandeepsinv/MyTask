from collections import defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import DailyUpdate, Task, User, UserAchievement
from .achievements import BY_KEY, achievement_points
from .scoring import CompletedTask, Score, UpdateEntry, compute_score


def build_leaderboard(db: Session, period: str, today: date | None = None) -> list[tuple[int, User, Score, int]]:
    """Rank all active users. Returns (rank, user, score, achievement_count) tuples."""
    today = today or date.today()
    users = db.scalars(select(User).where(User.is_active.is_(True))).all()

    tasks: dict[int, list[CompletedTask]] = defaultdict(list)
    for t in db.scalars(select(Task).where(Task.status == "done", Task.completed_at.is_not(None))):
        tasks[t.owner_id].append(CompletedTask(t.priority, t.completed_at, t.due_date))  # type: ignore[arg-type]

    updates: dict[int, list[UpdateEntry]] = defaultdict(list)
    for user_id, d in db.execute(select(DailyUpdate.user_id, DailyUpdate.date)):
        updates[user_id].append(UpdateEntry(d))

    earned: dict[int, list[str]] = defaultdict(list)
    for ua in db.scalars(select(UserAchievement)):
        if ua.achievement_key in BY_KEY:
            earned[ua.user_id].append(ua.achievement_key)

    scored = [
        (u, compute_score(tasks[u.id], updates[u.id], achievement_points(earned[u.id]), period, today), len(earned[u.id]))
        for u in users
    ]
    scored.sort(key=lambda row: (-row[1].total, -row[1].update_days, row[0].full_name.lower()))

    # Ties share a rank (1, 2, 2, 4).
    ranked: list[tuple[int, User, Score, int]] = []
    for i, (user, score, n_ach) in enumerate(scored):
        rank = ranked[-1][0] if ranked and ranked[-1][2].total == score.total else i + 1
        ranked.append((rank, user, score, n_ach))
    return ranked
