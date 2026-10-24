from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Role = Literal["admin", "member"]
Status = Literal["todo", "in_progress", "blocked", "done"]
Priority = Literal["low", "medium", "high", "critical"]
Period = Literal["week", "month", "all"]


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


# ---------- tasks ----------
class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    status: Status = "todo"
    priority: Priority = "medium"
    start_date: date | None = None
    due_date: date | None = None
    estimated_hours: float | None = Field(default=None, ge=0, le=10000)
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
    start_date: date | None = None
    due_date: date | None = None
    estimated_hours: float | None = Field(default=None, ge=0, le=10000)
    progress_pct: int | None = Field(default=None, ge=0, le=100)
    pending_notes: str | None = None
    tags: list[str] | None = None


class WorkLogCreate(BaseModel):
    date: date
    hours: float = Field(gt=0, le=24)
    note: str = ""


class WorkLogOut(ORM):
    id: int
    task_id: int
    user_id: int
    date: date
    hours: float
    note: str
    created_at: datetime


class TaskOut(ORM):
    id: int
    owner_id: int
    owner: UserPublic
    title: str
    description: str
    status: Status
    priority: Priority
    start_date: date | None
    due_date: date | None
    completed_at: datetime | None
    estimated_hours: float | None
    progress_pct: int
    pending_notes: str
    tags: list[str]
    hours_logged: float
    is_overdue: bool
    created_at: datetime
    updated_at: datetime

    @field_validator("tags", mode="before")
    @classmethod
    def split_tags(cls, v: object) -> object:
        if isinstance(v, str):
            return [t for t in v.split(",") if t]
        return v


class TaskDetail(TaskOut):
    logs: list[WorkLogOut]


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
    hours: int
    streak: int
    achievements: int


class LeaderboardEntry(BaseModel):
    rank: int
    user: UserPublic
    score: int
    tasks_completed: int
    hours: float
    streak: int
    achievements: int
    breakdown: ScoreBreakdown


class MemberSnapshot(BaseModel):
    user: UserPublic
    current_task: TaskOut | None
    open_tasks: int
    blocked_tasks: int
    hours_this_week: float


class DailyHours(BaseModel):
    date: date
    hours: float


class TeamOverview(BaseModel):
    status_counts: dict[str, int]
    overdue: int
    hours_this_week: float
    hours_last_week: float
    completed_this_week: int
    daily_hours: list[DailyHours]
    members: list[MemberSnapshot]
    recent_achievements: list[AwardedAchievement]


class MyStats(BaseModel):
    score: int
    rank: int
    streak: int
    hours_this_week: float
    tasks_completed: int
    open_tasks: int
    breakdown: ScoreBreakdown
