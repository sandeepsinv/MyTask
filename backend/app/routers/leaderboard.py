from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from ..deps import DB, CurrentUser
from ..models import DailyUpdate, Task, User, UserAchievement
from ..queries import TASK_LOAD, UPDATE_LOAD
from ..schemas import (
    AchievementDef,
    AchievementStatus,
    AwardedAchievement,
    EarnedRow,
    LeaderboardEntry,
    MemberSnapshot,
    MyStats,
    Period,
    ScoreBreakdown,
    TeamOverview,
    UpdateEntry,
    UserPublic,
)
from ..services.achievements import ACHIEVEMENTS, BY_KEY, to_def, user_metrics
from ..services.leaderboard import build_leaderboard
from ..services.scoring import Score, period_start

router = APIRouter(tags=["leaderboard"])


def _breakdown(score: Score) -> ScoreBreakdown:
    b = score.breakdown
    return ScoreBreakdown(tasks=b.tasks, on_time=b.on_time, updates=b.updates, streak=b.streak, achievements=b.achievements)


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def leaderboard(db: DB, _: CurrentUser, period: Period = "all") -> list[LeaderboardEntry]:
    return [
        LeaderboardEntry(
            rank=rank,
            user=UserPublic.model_validate(user),
            score=score.total,
            tasks_completed=score.tasks_completed,
            update_days=score.update_days,
            streak=score.streak,
            achievements=n_ach,
            breakdown=_breakdown(score),
        )
        for rank, user, score, n_ach in build_leaderboard(db, period)
    ]


@router.get("/achievements", response_model=list[AchievementDef])
def achievement_catalog(_: CurrentUser) -> list[dict]:
    return [to_def(a) for a in ACHIEVEMENTS]


@router.get("/users/{user_id}/achievements", response_model=list[AchievementStatus])
def user_achievements(user_id: int, db: DB, _: CurrentUser) -> list[AchievementStatus]:
    if db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    earned = {
        ua.achievement_key: ua.awarded_at
        for ua in db.scalars(select(UserAchievement).where(UserAchievement.user_id == user_id))
    }
    metrics = user_metrics(db, user_id)
    out = []
    for a in ACHIEVEMENTS:
        unlocked = a.key in earned
        progress = 1.0 if unlocked else min(a.value(metrics) / a.target, 1.0)
        out.append(
            AchievementStatus(**to_def(a), unlocked=unlocked, awarded_at=earned.get(a.key), progress=round(progress, 3))
        )
    return out


@router.get("/achievements/earned", response_model=list[EarnedRow])
def earned_matrix(db: DB, _: CurrentUser) -> list[EarnedRow]:
    """Which achievements each active person holds, for the team matrix."""
    users = list(db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.full_name)))
    held: dict[int, list[str]] = {u.id: [] for u in users}
    for ua in db.scalars(select(UserAchievement)):
        if ua.user_id in held and ua.achievement_key in BY_KEY:
            held[ua.user_id].append(ua.achievement_key)
    order = [a.key for a in ACHIEVEMENTS]
    return [EarnedRow(user=UserPublic.model_validate(u), keys=sorted(held[u.id], key=order.index)) for u in users]


@router.get("/achievements/recent", response_model=list[AwardedAchievement])
def recent_achievements(db: DB, _: CurrentUser, limit: int = 10) -> list[AwardedAchievement]:
    return _recent(db, limit)


def _recent(db: DB, limit: int) -> list[AwardedAchievement]:
    rows = db.scalars(
        select(UserAchievement)
        .join(UserAchievement.user)
        .where(User.is_active.is_(True), UserAchievement.achievement_key.in_(list(BY_KEY)))
        .options(selectinload(UserAchievement.user))
        .order_by(UserAchievement.awarded_at.desc())
        .limit(limit)
    )
    return [
        AwardedAchievement(
            user=UserPublic.model_validate(ua.user),
            achievement=AchievementDef(**to_def(BY_KEY[ua.achievement_key])),
            awarded_at=ua.awarded_at,
        )
        for ua in rows
    ]


@router.get("/stats/overview", response_model=TeamOverview)
def overview(db: DB, _: CurrentUser) -> TeamOverview:
    today = date.today()
    week_start = period_start("week", today)
    assert week_start is not None

    users = list(db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.full_name)))
    active_ids = {u.id for u in users}
    tasks = [t for t in db.scalars(select(Task).options(*TASK_LOAD)) if t.owner_id in active_ids]

    # Each person's most recent update, and everyone's updates for today.
    latest: dict[int, DailyUpdate] = {}
    today_updates: list[DailyUpdate] = []
    recent_updates = (
        select(DailyUpdate)
        .where(DailyUpdate.date >= today - timedelta(days=60))
        .options(*UPDATE_LOAD)
        .order_by(DailyUpdate.date.desc(), DailyUpdate.created_at.desc())
    )
    for u in db.scalars(recent_updates):
        if u.user_id not in active_ids:
            continue
        latest.setdefault(u.user_id, u)
        if u.date == today:
            today_updates.append(u)
    updated_today = {u.user_id for u in today_updates}

    counts = {s: 0 for s in ("todo", "in_progress", "blocked", "done")}
    for t in tasks:
        counts[t.status] = counts.get(t.status, 0) + 1

    members = []
    for user in users:
        mine = [t for t in tasks if t.owner_id == user.id]
        in_progress = sorted((t for t in mine if t.status == "in_progress"), key=lambda t: t.updated_at, reverse=True)
        members.append(
            MemberSnapshot(
                user=UserPublic.model_validate(user),
                current_task=in_progress[0] if in_progress else None,
                open_tasks=sum(1 for t in mine if t.status != "done"),
                blocked_tasks=sum(1 for t in mine if t.status == "blocked"),
                latest_update=UpdateEntry.model_validate(latest[user.id]) if user.id in latest else None,
                updated_today=user.id in updated_today,
            )
        )

    return TeamOverview(
        status_counts=counts,
        overdue=sum(1 for t in tasks if t.is_overdue),
        completed_this_week=sum(1 for t in tasks if t.completed_at and t.completed_at.date() >= week_start),
        people=len(users),
        people_updated_today=len(updated_today),
        updates_today=len(today_updates),
        unmapped_open_tasks=sum(1 for t in tasks if t.project_id is None and t.status != "done"),
        members=members,
        recent_achievements=_recent(db, 8),
    )


@router.get("/stats/me", response_model=MyStats)
def my_stats(db: DB, user: CurrentUser) -> MyStats:
    board = build_leaderboard(db, "all")
    row = next((r for r in board if r[1].id == user.id), None)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not on the leaderboard")
    rank, _, score, _ = row
    today = date.today()
    week_start = period_start("week", today)
    days = set(db.scalars(select(DailyUpdate.date).where(DailyUpdate.user_id == user.id, DailyUpdate.date >= week_start)))
    mine = db.scalars(select(Task).where(Task.owner_id == user.id, Task.status != "done")).all()
    return MyStats(
        score=score.total,
        rank=rank,
        streak=score.streak,
        update_days_this_week=len(days),
        tasks_completed=score.tasks_completed,
        open_tasks=len(mine),
        unmapped_tasks=sum(1 for t in mine if t.project_id is None),
        updated_today=today in days,
        breakdown=_breakdown(score),
    )
