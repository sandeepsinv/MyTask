from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Role = Literal["admin", "member"]
Status = Literal["todo", "in_progress", "blocked", "done"]
Priority = Literal["low", "medium", "high", "critical"]
Period = Literal["week", "month", "all"]
ProjectStatus = Literal["active", "archived"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- auth ----------
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


# ---------- users ----------
class UserPublic(ORM):
    id: int
    username: str
    full_name: str
    title: str | None = None
    avatar_color: str
    role: Role
    is_active: bool


class UserOut(UserPublic):
    email: str | None = None
    created_at: datetime


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=r"^[a-zA-Z0-9_.-]+$")
    full_name: str = Field(min_length=1, max_length=120)
    email: EmailStr | None = None
    title: str | None = Field(default=None, max_length=120)
    password: str = Field(min_length=6, max_length=128)
    role: Role = "member"

    @field_validator("username")
    @classmethod
    def lower(cls, v: str) -> str:
        return v.lower()


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    title: str | None = Field(default=None, max_length=120)
    role: Role | None = None
    is_active: bool | None = None
    avatar_color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


class PasswordReset(BaseModel):
    new_password: str = Field(min_length=6, max_length=128)


# ---------- projects ----------
class ProjectRef(ORM):
    id: int
    name: str
    color: str
    status: ProjectStatus


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    color: str = Field(default="#1b6e66", pattern=r"^#[0-9a-fA-F]{6}$")


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    status: ProjectStatus | None = None


# ---------- daily updates ----------
class UpdateCreate(BaseModel):
    date: date
    note: str = Field(min_length=1, max_length=2000)

    @field_validator("note")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Say what you worked on")
        return v


class UpdateOut(ORM):
    id: int
    task_id: int
    user_id: int
    date: date
    note: str
    created_at: datetime


class TaskRef(ORM):
    id: int
    title: str
    status: Status
    project: ProjectRef | None


class UpdateEntry(ORM):
    """An update with who wrote it and which task (and project) it was about."""

    id: int
    date: date
    note: str
    created_at: datetime
    user: UserPublic
    task: TaskRef


# ---------- tasks ----------
class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    status: Status = "todo"
    priority: Priority = "medium"
    project_id: int | None = None
    start_date: date | None = None
    due_date: date | None = None
    progress_pct: int = Field(default=0, ge=0, le=100)
    pending_notes: str = ""
    tags: list[str] = []


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    status: Status | None = None
    priority: Priority | None = None
    project_id: int | None = None  # send null to unmap
    start_date: date | None = None
    due_date: date | None = None
    progress_pct: int | None = Field(default=None, ge=0, le=100)
    pending_notes: str | None = None
    tags: list[str] | None = None


class TaskOut(ORM):
    id: int
    owner_id: int
    owner: UserPublic
    project_id: int | None
    project: ProjectRef | None
    title: str
    description: str
    status: Status
    priority: Priority
    start_date: date | None
    due_date: date | None
    completed_at: datetime | None
    progress_pct: int
    pending_notes: str
    tags: list[str]
    is_overdue: bool
    last_update: UpdateOut | None
    created_at: datetime
    updated_at: datetime

    @field_validator("tags", mode="before")
    @classmethod
    def split_tags(cls, v: object) -> object:
        if isinstance(v, str):
            return [t for t in v.split(",") if t]
        return v


class TaskDetail(TaskOut):
    updates: list[UpdateOut]


# ---------- project summaries ----------
class ProjectMember(BaseModel):
    user: UserPublic
    open_tasks: int
    last_update: UpdateEntry | None


class ProjectSummary(BaseModel):
    id: int
    name: str
    description: str
    color: str
    status: ProjectStatus
    created_by: UserPublic
    created_at: datetime
    counts: dict[str, int]  # todo, in_progress, blocked, done
    total_tasks: int
    overdue: int
    last_activity: date | None
    members: list[ProjectMember]
    recent_updates: list[UpdateEntry]


class ProjectDetail(ProjectSummary):
    tasks: list[TaskOut]


# ---------- achievements ----------
class AchievementDef(BaseModel):
    key: str
    name: str
    description: str
    icon: str
    points: int
    tier: Literal["bronze", "silver", "gold"]
    target: float


class AchievementStatus(AchievementDef):
    unlocked: bool
    awarded_at: datetime | None
    progress: float


class EarnedRow(BaseModel):
    user: UserPublic
    keys: list[str]


class AwardedAchievement(BaseModel):
    user: UserPublic
    achievement: AchievementDef
    awarded_at: datetime


# ---------- leaderboard / stats ----------
class ScoreBreakdown(BaseModel):
    tasks: int
    on_time: int
    updates: int
    streak: int
    achievements: int


class LeaderboardEntry(BaseModel):
    rank: int
    user: UserPublic
    score: int
    tasks_completed: int
    update_days: int
    streak: int
    achievements: int
    breakdown: ScoreBreakdown


class MemberSnapshot(BaseModel):
    user: UserPublic
    current_task: TaskOut | None
    open_tasks: int
    blocked_tasks: int
    latest_update: UpdateEntry | None
    updated_today: bool


class TeamOverview(BaseModel):
    status_counts: dict[str, int]
    overdue: int
    completed_this_week: int
    people: int
    people_updated_today: int
    updates_today: int
    unmapped_open_tasks: int
    members: list[MemberSnapshot]
    recent_achievements: list[AwardedAchievement]


class MyStats(BaseModel):
    score: int
    rank: int
    streak: int
    update_days_this_week: int
    tasks_completed: int
    open_tasks: int
    unmapped_tasks: int
    updated_today: bool
    breakdown: ScoreBreakdown
