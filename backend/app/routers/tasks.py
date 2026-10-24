from datetime import date

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from ..deps import DB, CurrentUser
from ..models import Task, User, WorkLog, utcnow
from ..schemas import Priority, Status, TaskCreate, TaskDetail, TaskOut, TaskUpdate, WorkLogCreate, WorkLogOut
from ..services.achievements import evaluate_and_award

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _tags(tags: list[str]) -> str:
    seen: list[str] = []
    for t in tags:
        t = t.strip().replace(",", "")[:30]
        if t and t not in seen:
            seen.append(t)
    return ",".join(seen[:8])


def _get_task(db: DB, task_id: int) -> Task:
    task = db.scalar(
        select(Task)
        .where(Task.id == task_id)
        .options(selectinload(Task.owner), selectinload(Task.logs))
    )
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return task


def _require_owner(task: Task, user: User) -> None:
    if task.owner_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only change your own tasks")


def _apply_status(task: Task, new_status: str) -> None:
    if new_status == "done" and task.status != "done":
        task.completed_at = utcnow()
        task.progress_pct = 100
    elif new_status != "done":
        task.completed_at = None
    task.status = new_status


@router.get("", response_model=list[TaskOut])
def list_tasks(
    db: DB,
    _: CurrentUser,
    owner_id: int | None = None,
    status_: list[Status] | None = Query(default=None, alias="status"),
    priority: Priority | None = None,
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    q: str | None = None,
    limit: int = Query(default=500, le=1000),
) -> list[Task]:
    stmt = (
        select(Task)
        .join(Task.owner)
        .where(User.is_active.is_(True))
        .options(selectinload(Task.owner), selectinload(Task.logs))
        .order_by(Task.updated_at.desc())
        .limit(limit)
    )
    if owner_id is not None:
        stmt = stmt.where(Task.owner_id == owner_id)
    if status_:
        stmt = stmt.where(Task.status.in_(status_))
    if priority:
        stmt = stmt.where(Task.priority == priority)
    # A task overlaps [from, to] if it started before `to` and is due (or was created) after `from`.
    if date_from:
        stmt = stmt.where(or_(Task.due_date.is_(None), Task.due_date >= date_from))
    if date_to:
        stmt = stmt.where(or_(Task.start_date.is_(None), Task.start_date <= date_to))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Task.title.ilike(like), Task.description.ilike(like), Task.tags.ilike(like)))
    return list(db.scalars(stmt))


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(body: TaskCreate, db: DB, user: CurrentUser) -> Task:
    if body.start_date and body.due_date and body.due_date < body.start_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Due date cannot be before start date")
    data = body.model_dump(exclude={"tags", "status"})
    task = Task(**data, owner_id=user.id, tags=_tags(body.tags), status="todo")
    _apply_status(task, body.status)
    db.add(task)
    db.commit()
    if task.status == "done":
        evaluate_and_award(db, user)
    return _get_task(db, task.id)


@router.get("/{task_id}", response_model=TaskDetail)
def get_task(task_id: int, db: DB, _: CurrentUser) -> Task:
    return _get_task(db, task_id)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, body: TaskUpdate, db: DB, user: CurrentUser) -> Task:
    task = _get_task(db, task_id)
    _require_owner(task, user)
    data = body.model_dump(exclude_unset=True)
    new_status = data.pop("status", None)
    if "tags" in data:
        data["tags"] = _tags(data["tags"] or [])
    for key, value in data.items():
        setattr(task, key, value)
    if task.start_date and task.due_date and task.due_date < task.start_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Due date cannot be before start date")
    if new_status:
        _apply_status(task, new_status)
    db.commit()
    if task.status == "done":
        evaluate_and_award(db, task.owner)
    return _get_task(db, task.id)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: DB, user: CurrentUser) -> None:
    task = _get_task(db, task_id)
    _require_owner(task, user)
    db.delete(task)
    db.commit()


# ---------- work logs ----------
@router.get("/{task_id}/logs", response_model=list[WorkLogOut])
def list_logs(task_id: int, db: DB, _: CurrentUser) -> list[WorkLog]:
    return _get_task(db, task_id).logs


@router.post("/{task_id}/logs", response_model=WorkLogOut, status_code=status.HTTP_201_CREATED)
def add_log(task_id: int, body: WorkLogCreate, db: DB, user: CurrentUser) -> WorkLog:
    task = _get_task(db, task_id)
    _require_owner(task, user)
    if body.date > date.today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "You can't log hours in the future")
    log = WorkLog(task_id=task.id, user_id=task.owner_id, date=body.date, hours=body.hours, note=body.note)
    db.add(log)
    if task.status == "todo":
        task.status = "in_progress"
    task.updated_at = utcnow()
    db.commit()
    db.refresh(log)
    evaluate_and_award(db, task.owner)
    return log


@router.delete("/{task_id}/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log(task_id: int, log_id: int, db: DB, user: CurrentUser) -> None:
    task = _get_task(db, task_id)
    _require_owner(task, user)
    log = db.get(WorkLog, log_id)
    if log is None or log.task_id != task.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Log entry not found")
    db.delete(log)
    db.commit()
