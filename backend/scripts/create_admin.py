"""Create an admin account. Only needed once, on a brand-new database.

    python -m scripts.create_admin

Asks for the username, name and password (the password is not echoed or stored anywhere
but the database). After that, admins add everyone else from the Members page.
"""

import getpass
import sys

from sqlalchemy import select

from app.database import SessionLocal
from app.main import init_db
from app.models import User
from app.security import hash_password


def create_admin(db, username: str, password: str, full_name: str) -> User:
    username = username.strip().lower()
    if not username or len(password) < 6:
        raise ValueError("A username and a password of at least 6 characters are required")
    if db.scalar(select(User).where(User.username == username)):
        raise ValueError(f'"{username}" already exists')
    user = User(
        username=username,
        full_name=full_name.strip() or username,
        role="admin",
        hashed_password=hash_password(password),
        avatar_color="#14163f",
    )
    db.add(user)
    db.commit()
    return user


def main() -> int:
    init_db()
    with SessionLocal() as db:
        admins = db.scalars(select(User.username).where(User.role == "admin", User.is_active.is_(True))).all()
        if admins:
            print(f"This database already has an admin ({', '.join(admins)}).")
            if input("Create another admin anyway? [y/N] ").strip().lower() != "y":
                return 0
        username = input("Username: ")
        full_name = input("Full name: ")
        password = getpass.getpass("Password: ")
        if password != getpass.getpass("Repeat password: "):
            print("The passwords don't match.")
            return 1
        try:
            user = create_admin(db, username, password, full_name)
        except ValueError as e:
            print(e)
            return 1
        print(f"Admin {user.username} created. Sign in and add your team from Members.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
