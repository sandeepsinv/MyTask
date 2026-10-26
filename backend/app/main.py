from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import Base, engine
from .migrations import upgrade
from .routers import activity, auth, leaderboard, projects, tasks, updates, users


def init_db() -> None:
    """Create missing tables, then apply in-place upgrades to existing ones."""
    Base.metadata.create_all(bind=engine)
    upgrade(engine)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
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
    for r in (auth.router, users.router, projects.router, tasks.router, updates.router, leaderboard.router, activity.router):
        app.include_router(r, prefix="/api")

    @app.get("/api/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
