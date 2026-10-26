from datetime import date

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select

from ..activity import STATUS_LABEL, TASK_FIELDS, AuditDep, diff
from ..deps import DB, CurrentUser
from ..models import Project, Task, User, utcnow
from ..queries import TASK_LOAD
from ..schemas import Priority, Status, TaskCreate, TaskDetail, TaskOut, TaskUpdate
from ..services.achievements import evaluate_and_award

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _tags(tags: list[str]) -> str:
    seen: list[str] = []
    for t in tags:
        t = t.strip().replace(",", "")[:30]
        if t and t not in seen:
            seen.append(t)
    return ",".join(seen[:8])


def get_task(db: DB, task_id: int) -> Task:
    task = db.scalar(select(Task).where(Task.id == task_id).options(*TASK_LOAD))
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return task


def require_owner(task: Task, user: User) -> None:
    if task.owner_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only change your own tasks")


def _check_project(db: DB, project_id: int | None) -> None:
    if project_id is None:
        return
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That project doesn't exist")
    if project.status != "active":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That project is archived")


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
    project_id: int | None = None,
    unmapped: bool = False,
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
        .options(*TASK_LOAD)
        .order_by(Task.updated_at.desc())
        .limit(limit)
    )
    if owner_id is not None:
        stmt = stmt.where(Task.owner_id == owner_id)
    if unmapped:
        stmt = stmt.where(Task.project_id.is_(None))
    elif project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)
    if status_:
        stmt = stmt.where(Task.status.in_(status_))
    if priority:
        stmt = stmt.where(Task.priority == priority)
    # A task overlaps [from, to] if it started before `to` and is due after `from`.
    if date_from:
        stmt = stmt.where(or_(Task.due_date.is_(None), Task.due_date >= date_from))
    if date_to:
        stmt = stmt.where(or_(Task.start_date.is_(None), Task.start_date <= date_to))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Task.title.ilike(like), Task.description.ilike(like), Task.tags.ilike(like)))
    return list(db.scalars(stmt))


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(body: TaskCreate, db: DB, user: CurrentUser, audit: AuditDep) -> Task:
    if body.start_date and body.due_date and body.due_date < body.start_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Due date cannot be before start date")
    _check_project(db, body.project_id)
    data = body.model_dump(exclude={"tags", "status"})
    task = Task(**data, owner_id=user.id, tags=_tags(body.tags), status="todo")
    _apply_status(task, body.status)
    db.add(task)
    db.flush()
    project = db.get(Project, task.project_id) if task.project_id else None
    audit.log(
        user,
        "task.created",
        f'Created task "{task.title}"' + (f" in {project.name}" if project else ""),
        "task",
        task.id,
        title=task.title,
        project=project.name if project else None,
    )
    db.commit()
    if task.status == "done" or task.project_id:
        evaluate_and_award(db, user)
    return get_task(db, task.id)


@router.get("/{task_id}", response_model=TaskDetail)
def read_task(task_id: int, db: DB, _: CurrentUser) -> Task:
    return get_task(db, task_id)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, body: TaskUpdate, db: DB, user: CurrentUser, audit: AuditDep) -> Task:
    task = get_task(db, task_id)
    require_owner(task, user)
    before = {k: getattr(task, k) for k in TASK_FIELDS}
    data = body.model_dump(exclude_unset=True)
    new_status = data.pop("status", None)
    if "project_id" in data and data["project_id"] != task.project_id:
        _check_project(db, data["project_id"])
    if "tags" in data:
        data["tags"] = _tags(data["tags"] or [])
    for key, value in data.items():
        setattr(task, key, value)
    if task.start_date and task.due_date and task.due_date < task.start_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Due date cannot be before start date")
    if new_status:
        _apply_status(task, new_status)
    changes = diff(before, {k: getattr(task, k) for k in TASK_FIELDS}, TASK_FIELDS)
    if changes:
        audit.log(user, *_describe_change(db, task, changes), "task", task.id, title=task.title, changes=changes)
    db.commit()
    evaluate_and_award(db, task.owner)
    db.expire_all()
    return get_task(db, task.id)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: int, db: DB, user: CurrentUser, audit: AuditDep) -> None:
    task = get_task(db, task_id)
    require_owner(task, user)
    audit.log(
        user,
        "task.deleted",
        f'Deleted task "{task.title}"' + (f" (owned by {task.owner.full_name})" if task.owner_id != user.id else ""),
        "task",
        task.id,
        title=task.title,
        updates_removed=len(task.updates),
    )
    db.delete(task)
    db.commit()


def _describe_change(db: DB, task: Task, changes: dict) -> tuple[str, str]:
    """(action, sentence) for a task edit; status and project moves get their own wording."""
    title = f'"{task.title}"'
    # Completing sets progress to 100% too, so a status change may carry a progress change.
    if "status" in changes and set(changes) <= {"status", "progress_pct"}:
        old, new = changes["status"]
        if new == "done":
            return "task.completed", f"Completed {title}"
        return "task.status", f"Moved {title} from {STATUS_LABEL[old]} to {STATUS_LABEL[new]}"
    if set(changes) == {"project_id"}:
        old_id, new_id = changes["project_id"]
        old = db.get(Project, old_id) if old_id else None
        new = db.get(Project, new_id) if new_id else None
        if new is None:
            return "task.unmapped", f"Removed {title} from {old.name if old else 'its project'}"
        if old is None:
            return "task.mapped", f"Mapped {title} to {new.name}"
        return "task.mapped", f"Moved {title} from {old.name} to {new.name}"
    names = ", ".join(TASK_FIELDS[k] for k in changes)
    return "task.updated", f"Edited {title}: {names}"
