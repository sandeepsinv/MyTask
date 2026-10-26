from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from ..activity import AuditDep
from ..deps import DB, CurrentUser
from ..models import User
from ..schemas import PasswordChange, Token, UserOut
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(db: DB, audit: AuditDep, form: Annotated[OAuth2PasswordRequestForm, Depends()]) -> Token:
    username = form.username.strip().lower()
    user = db.scalar(select(User).where(User.username == username))
    if user is None or not verify_password(form.password, user.hashed_password):
        # Failed attempts are recorded against the account when it exists, so admins can spot guessing.
        audit.log(user, "auth.login_failed", f'Failed sign-in as "{username}"', "user", user.id if user else None, username=username)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password")
    if not user.is_active:
        audit.log(user, "auth.login_blocked", "Tried to sign in to a deactivated account", "user", user.id)
        db.commit()
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated")
    audit.log(user, "auth.login", "Signed in", "user", user.id)
    db.commit()
    return Token(access_token=create_access_token(user.id))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(user: CurrentUser, db: DB, audit: AuditDep) -> None:
    """Tokens are stateless, so this only records the sign-out."""
    audit.log(user, "auth.logout", "Signed out", "user", user.id)
    db.commit()


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> User:
    return user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: PasswordChange, user: CurrentUser, db: DB, audit: AuditDep) -> None:
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.hashed_password = hash_password(body.new_password)
    audit.log(user, "auth.password_changed", "Changed their password", "user", user.id)
    db.commit()
