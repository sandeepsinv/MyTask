from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from ..activity import AuditDep, diff
from ..deps import DB, CurrentUser
from ..models import DailyUpdate, Project, Task, User
from ..schemas import (
    ProjectCreate,
    ProjectDetail,
    ProjectMember,
    ProjectSummary,
    ProjectUpdate,
    TaskOut,
    UpdateEntry,
    UserPublic,
)

router = APIRouter(prefix="/projects", tags=["projects"])

PROJECT_LOAD = (
    selectinload(Project.created_by),
    selectinload(Project.tasks).selectinload(Task.owner),
    selectinload(Project.tasks).selectinload(Task.project),
    selectinload(Project.tasks).selectinload(Task.updates).selectinload(DailyUpdate.user),
)


def summarize(project: Project, recent: int = 4) -> dict:
    tasks = [t for t in project.tasks if t.owner.is_active]
    counts = {s: 0 for s in ("todo", "in_progress", "blocked", "done")}
    for t in tasks:
        counts[t.status] = counts.get(t.status, 0) + 1

    updates = sorted(
        (u for t in tasks for u in t.updates),
        key=lambda u: (u.date, u.created_at),
        reverse=True,
    )

    members: dict[int, ProjectMember] = {}
    for t in sorted(tasks, key=lambda t: t.owner.full_name.lower()):
        m = members.get(t.owner_id)
        if m is None:
            m = members[t.owner_id] = ProjectMember(user=UserPublic.model_validate(t.owner), open_tasks=0, last_update=None)
        if t.status != "done":
            m.open_tasks += 1
    for u in updates:  # newest first, so the first one seen per person is their latest
        m = members.get(u.user_id)
        if m is not None and m.last_update is None:
            m.last_update = UpdateEntry.model_validate(u)

    # People with the freshest update first.
    ordered = sorted(
        members.values(),
        key=lambda m: (m.last_update is None, -(m.last_update.date.toordinal() if m.last_update else 0)),
    )
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "color": project.color,
        "status": project.status,
        "created_by": UserPublic.model_validate(project.created_by),
        "created_at": project.created_at,
        "counts": counts,
        "total_tasks": len(tasks),
        "overdue": sum(1 for t in tasks if t.is_overdue),
        "last_activity": updates[0].date if updates else None,
        "members": ordered,
        "recent_updates": [UpdateEntry.model_validate(u) for u in updates[:recent]],
        "_tasks": tasks,
    }


def _get(db: DB, project_id: int) -> Project:
    project = db.scalar(select(Project).where(Project.id == project_id).options(*PROJECT_LOAD))
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


PROJECT_FIELDS = {"name": "name", "description": "description", "color": "colour", "status": "status"}


def _require_editor(project: Project, user: User) -> None:
    if project.created_by_id != user.id and user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the project's creator or an admin can change it")


@router.get("", response_model=list[ProjectSummary])
def list_projects(db: DB, _: CurrentUser, state: Literal["active", "archived", "all"] = "active") -> list[dict]:
    stmt = select(Project).options(*PROJECT_LOAD)
    if state != "all":
        stmt = stmt.where(Project.status == state)
    rows = [summarize(p) for p in db.scalars(stmt)]
    # Most recently active first; projects with no updates yet go last, newest first.
    rows.sort(key=lambda r: (r["last_activity"] or date.min, r["created_at"]), reverse=True)
    return rows


@router.post("", response_model=ProjectSummary, status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectCreate, db: DB, user: CurrentUser, audit: AuditDep) -> dict:
    name = body.name.strip()
    if db.scalar(select(Project).where(Project.name.ilike(name), Project.status == "active")):
        raise HTTPException(status.HTTP_409_CONFLICT, "There's already an active project with that name")
    project = Project(name=name, description=body.description.strip(), color=body.color, created_by_id=user.id)
    db.add(project)
    db.flush()
    audit.log(user, "project.created", f'Created project "{project.name}"', "project", project.id, name=project.name)
    db.commit()
    return summarize(_get(db, project.id))


@router.get("/{project_id}", response_model=ProjectDetail)
def read_project(project_id: int, db: DB, _: CurrentUser) -> dict:
    data = summarize(_get(db, project_id), recent=30)
    data["tasks"] = [TaskOut.model_validate(t) for t in sorted(data["_tasks"], key=lambda t: t.updated_at, reverse=True)]
    return data


@router.patch("/{project_id}", response_model=ProjectSummary)
def update_project(project_id: int, body: ProjectUpdate, db: DB, user: CurrentUser, audit: AuditDep) -> dict:
    project = _get(db, project_id)
    _require_editor(project, user)
    before = {k: getattr(project, k) for k in PROJECT_FIELDS}
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        data["name"] = data["name"].strip()
    if "description" in data:
        data["description"] = (data["description"] or "").strip()
    for key, value in data.items():
        setattr(project, key, value)
    changes = diff(before, {k: getattr(project, k) for k in PROJECT_FIELDS}, PROJECT_FIELDS)
    if changes:
        name = f'"{project.name}"'
        if set(changes) == {"status"}:
            action, summary = (
                ("project.archived", f"Archived project {name}")
                if project.status == "archived"
                else ("project.restored", f"Restored project {name}")
            )
        else:
            action = "project.updated"
            summary = f"Edited project {name}: " + ", ".join(PROJECT_FIELDS[k] for k in changes)
        audit.log(user, action, summary, "project", project.id, name=project.name, changes=changes)
    db.commit()
    return summarize(_get(db, project_id))


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: DB, user: CurrentUser, audit: AuditDep) -> None:
    """Delete the project. Its tasks are kept and become unmapped."""
    project = _get(db, project_id)
    _require_editor(project, user)
    audit.log(
        user,
        "project.deleted",
        f'Deleted project "{project.name}"' + (f", unmapping {len(project.tasks)} task(s)" if project.tasks else ""),
        "project",
        project.id,
        name=project.name,
        tasks_unmapped=len(project.tasks),
    )
    db.execute(update(Task).where(Task.project_id == project_id).values(project_id=None))
    db.delete(project)
    db.commit()
