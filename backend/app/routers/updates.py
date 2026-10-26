from datetime import date

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from ..activity import AuditDep
from ..deps import DB, CurrentUser
from ..models import DailyUpdate, Task, User, utcnow
from ..queries import UPDATE_LOAD
from ..schemas import UpdateCreate, UpdateEntry, UpdateOut
from ..services.achievements import evaluate_and_award
from .tasks import get_task, require_owner

router = APIRouter(tags=["updates"])


@router.get("/updates", response_model=list[UpdateEntry])
def list_updates(
    db: DB,
    _: CurrentUser,
    on: date | None = Query(default=None, description="Only updates for this day"),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    user_id: int | None = None,
    project_id: int | None = None,
    limit: int = Query(default=200, le=1000),
) -> list[DailyUpdate]:
    """What people worked on: everyone's updates, newest first."""
    stmt = (
        select(DailyUpdate)
        .join(DailyUpdate.user)
        .join(DailyUpdate.task)
        .where(User.is_active.is_(True))
        .options(*UPDATE_LOAD)
        .order_by(DailyUpdate.date.desc(), DailyUpdate.created_at.desc())
        .limit(limit)
    )
    if on:
        stmt = stmt.where(DailyUpdate.date == on)
    if date_from:
        stmt = stmt.where(DailyUpdate.date >= date_from)
    if date_to:
        stmt = stmt.where(DailyUpdate.date <= date_to)
    if user_id is not None:
        stmt = stmt.where(DailyUpdate.user_id == user_id)
    if project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)
    return list(db.scalars(stmt))


@router.get("/tasks/{task_id}/updates", response_model=list[UpdateOut])
def task_updates(task_id: int, db: DB, _: CurrentUser) -> list[DailyUpdate]:
    return get_task(db, task_id).updates


@router.post("/tasks/{task_id}/updates", response_model=UpdateOut, status_code=status.HTTP_201_CREATED)
def add_update(task_id: int, body: UpdateCreate, db: DB, user: CurrentUser, audit: AuditDep) -> DailyUpdate:
    task = get_task(db, task_id)
    require_owner(task, user)
    if body.date > date.today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "You can't post an update for a future day")
    # The update belongs to whoever wrote it (an admin may post on someone else's task).
    update = DailyUpdate(task_id=task.id, user_id=user.id, date=body.date, note=body.note)
    db.add(update)
    # Working on something means it has started.
    if task.status == "todo":
        task.status = "in_progress"
    task.updated_at = utcnow()
    db.flush()
    audit.log(
        user,
        "update.posted",
        f'Posted an update on "{task.title}"' + ("" if body.date == date.today() else f" for {body.date.isoformat()}"),
        "update",
        update.id,
        task_id=task.id,
        task=task.title,
        date=body.date,
        note=body.note,
    )
    db.commit()
    db.refresh(update)
    evaluate_and_award(db, user)
    return update


@router.delete("/tasks/{task_id}/updates/{update_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_update(task_id: int, update_id: int, db: DB, user: CurrentUser, audit: AuditDep) -> None:
    task: Task = get_task(db, task_id)
    update = db.get(DailyUpdate, update_id)
    if update is None or update.task_id != task.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Update not found")
    # Only the person who wrote an update (or an admin) can delete it.
    if update.user_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only delete updates you posted")
    audit.log(
        user,
        "update.deleted",
        f'Deleted an update on "{task.title}" from {update.date.isoformat()}',
        "update",
        update.id,
        task_id=task.id,
        task=task.title,
        date=update.date,
        note=update.note,
    )
    db.delete(update)
    db.commit()
