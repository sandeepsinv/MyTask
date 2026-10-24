import random

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from ..deps import DB, AdminUser, CurrentUser
from ..models import User
from ..schemas import PasswordReset, UserCreate, UserOut, UserPublic, UserUpdate
from ..security import hash_password

router = APIRouter(tags=["users"])

AVATAR_COLORS = ["#2563eb", "#0d9488", "#c2410c", "#4d7c0f", "#be123c", "#15803d", "#a16207", "#0369a1"]


@router.get("/users", response_model=list[UserPublic])
def list_members(db: DB, _: CurrentUser) -> list[User]:
    """Everyone can see who is on the team."""
    return list(db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.full_name)))


@router.get("/admin/users", response_model=list[UserOut])
def admin_list_users(db: DB, _: AdminUser) -> list[User]:
    return list(db.scalars(select(User).order_by(User.is_active.desc(), User.full_name)))


@router.post("/admin/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, db: DB, _: AdminUser) -> User:
    if db.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(status.HTTP_409_CONFLICT, "That username is already taken")
    user = User(
        username=body.username,
        full_name=body.full_name.strip(),
        email=body.email,
        title=body.title,
        role=body.role,
        hashed_password=hash_password(body.password),
        avatar_color=random.choice(AVATAR_COLORS),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _active_admins(db: DB) -> int:
    return db.scalar(select(func.count()).where(User.role == "admin", User.is_active.is_(True))) or 0


@router.patch("/admin/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: DB, admin: AdminUser) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    data = body.model_dump(exclude_unset=True)

    losing_admin = user.role == "admin" and user.is_active and (
        data.get("role") == "member" or data.get("is_active") is False
    )
    if losing_admin and _active_admins(db) <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "There must always be at least one active admin")
    if user.id == admin.id and data.get("is_active") is False:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot deactivate your own account")

    for key, value in data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/admin/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(user_id: int, body: PasswordReset, db: DB, _: AdminUser) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    user.hashed_password = hash_password(body.new_password)
    db.commit()
