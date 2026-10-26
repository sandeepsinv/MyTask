"""Activity log: one row per meaningful action, written in the same transaction as the change."""

import json
from datetime import date
from typing import Annotated, Any

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from .database import get_db
from .models import ActivityLog, User

STATUS_LABEL = {"todo": "Up next", "in_progress": "In progress", "blocked": "Blocked", "done": "Done"}

# Task fields worth recording when they change, with how to name them in a sentence.
TASK_FIELDS = {
    "title": "title",
    "status": "status",
    "priority": "priority",
    "project_id": "project",
    "start_date": "start date",
    "due_date": "due date",
    "progress_pct": "progress",
    "pending_notes": "pending note",
    "description": "details",
    "tags": "tags",
}


def _plain(value: Any) -> Any:
    if isinstance(value, date):
        return value.isoformat()
    return value


def client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


class Audit:
    def __init__(self, db: Session, ip: str | None):
        self.db = db
        self.ip = ip

    def log(
        self,
        actor: User | None,
        action: str,
        summary: str,
        entity_type: str | None = None,
        entity_id: int | None = None,
        **details: Any,
    ) -> None:
        """Queue an entry; it is saved by the caller's next commit."""
        self.db.add(
            ActivityLog(
                user_id=actor.id if actor else None,
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                summary=summary,
                details=json.dumps({k: _plain(v) for k, v in details.items()}, default=str) if details else "",
                ip=self.ip,
            )
        )


def get_audit(request: Request, db: Annotated[Session, Depends(get_db)]) -> Audit:
    return Audit(db, client_ip(request))


AuditDep = Annotated[Audit, Depends(get_audit)]


def diff(before: dict[str, Any], after: dict[str, Any], fields: dict[str, str]) -> dict[str, list[Any]]:
    """{field: [old, new]} for the fields that actually changed."""
    return {
        k: [_plain(before.get(k)), _plain(after.get(k))]
        for k in fields
        if k in after and _plain(before.get(k)) != _plain(after.get(k))
    }
