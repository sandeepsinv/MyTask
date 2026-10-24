from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import Base, SessionLocal, engine
from .models import User
from .routers import auth, leaderboard, tasks, users
from .security import hash_password


def seed_admin(db: Session) -> None:
    """Create the first admin from settings if no admin exists yet."""
    if db.scalar(select(User).where(User.role == "admin")):
        return
    settings = get_settings()
    db.add(
        User(
            username=settings.admin_username.lower(),
            full_name="Administrator",
            role="admin",
            hashed_password=hash_password(settings.admin_password),
            avatar_color="#1f2937",
        )
    )
    db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_admin(db)
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="MyTask — team task tracker", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for r in (auth.router, users.router, tasks.router, leaderboard.router):
        app.include_router(r, prefix="/api")

    @app.get("/api/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
