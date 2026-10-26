"""Loader options shared by routers, so responses never lazy-load per row."""

from sqlalchemy.orm import selectinload

from .models import DailyUpdate, Task

TASK_LOAD = (selectinload(Task.owner), selectinload(Task.project), selectinload(Task.updates))
UPDATE_LOAD = (
    selectinload(DailyUpdate.user),
    selectinload(DailyUpdate.task).selectinload(Task.project),
)
