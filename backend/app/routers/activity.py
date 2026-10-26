import json
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Query
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from ..deps import DB, AdminUser
from ..models import ActivityLog, User, utcnow
from ..schemas import ActivityOut, ActivityPage, ActivityPerson, UserPublic

router = APIRouter(prefix="/admin/activity", tags=["activity"])

Category = Literal["auth", "task", "update", "project", "user"]


def _out(row: ActivityLog) -> ActivityOut:
    try:
        details = json.loads(row.details) if row.details else {}
    except ValueError:
        details = {}
    return ActivityOut(
        id=row.id,
        user=UserPublic.model_validate(row.user) if row.user else None,
        action=row.action,
        entity_type=row.entity_type,
        entity_id=row.entity_id,
        summary=row.summary,
        details=details,
        ip=row.ip,
        created_at=row.created_at,
    )


@router.get("", response_model=ActivityPage)
def list_activity(
    db: DB,
    _: AdminUser,
    user_id: int | None = None,
    category: Category | None = None,
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    q: str | None = None,
    before: int | None = Query(default=None, description="Return entries older than this id"),
    limit: int = Query(default=50, ge=1, le=200),
) -> ActivityPage:
    """Everything people did, newest first. Admins only."""
    stmt = select(ActivityLog).options(selectinload(ActivityLog.user)).order_by(ActivityLog.id.desc()).limit(limit + 1)
    if user_id is not None:
        stmt = stmt.where(ActivityLog.user_id == user_id)
    if category:
        stmt = stmt.where(ActivityLog.action.like(f"{category}.%"))
    if date_from:
        stmt = stmt.where(ActivityLog.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        stmt = stmt.where(ActivityLog.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    if q:
        stmt = stmt.where(ActivityLog.summary.ilike(f"%{q.strip()}%"))
    if before is not None:
        stmt = stmt.where(ActivityLog.id < before)
    rows = list(db.scalars(stmt))
    more = len(rows) > limit
    rows = rows[:limit]
    return ActivityPage(items=[_out(r) for r in rows], next_before=rows[-1].id if more and rows else None)


@router.get("/people", response_model=list[ActivityPerson])
def activity_by_person(db: DB, _: AdminUser) -> list[ActivityPerson]:
    """Per person: how active they've been in the last 30 days and when they last signed in."""
    since = utcnow() - timedelta(days=30)
    users = list(db.scalars(select(User).order_by(User.is_active.desc(), User.full_name)))

    def per_user(*conds):
        return dict(db.execute(select(ActivityLog.user_id, func.count()).where(*conds).group_by(ActivityLog.user_id)).all())

    actions = per_user(ActivityLog.created_at >= since, ActivityLog.action.not_like("auth.%"))
    failed = per_user(ActivityLog.created_at >= since, ActivityLog.action == "auth.login_failed")
    last_any = dict(db.execute(select(ActivityLog.user_id, func.max(ActivityLog.created_at)).group_by(ActivityLog.user_id)).all())
    last_login = dict(
        db.execute(
            select(ActivityLog.user_id, func.max(ActivityLog.created_at))
            .where(ActivityLog.action == "auth.login")
            .group_by(ActivityLog.user_id)
        ).all()
    )
    return [
        ActivityPerson(
            user=UserPublic.model_validate(u),
            actions_30d=actions.get(u.id, 0),
            last_activity=last_any.get(u.id),
            last_sign_in=last_login.get(u.id),
            failed_sign_ins_30d=failed.get(u.id, 0),
        )
        for u in users
    ]
