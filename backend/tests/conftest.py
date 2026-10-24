import os

os.environ["JWT_SECRET"] = "test-secret-that-is-long-enough-for-hs256"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "admin123"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app, seed_admin


@pytest.fixture
def db_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with TestingSession() as s:
        seed_admin(s)
    yield TestingSession
    engine.dispose()


@pytest.fixture
def db(db_session) -> Session:
    with db_session() as s:
        yield s


@pytest.fixture
def client(db_session):
    def override():
        s = db_session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override
    # Not used as a context manager, so the app lifespan (which touches the real DB) does not run.
    yield TestClient(app)
    app.dependency_overrides.clear()


def login(client: TestClient, username: str, password: str) -> dict[str, str]:
    r = client.post("/api/auth/login", data={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def admin_headers(client) -> dict[str, str]:
    return login(client, "admin", "admin123")


@pytest.fixture
def make_member(client, admin_headers):
    def _make(username: str = "alice", full_name: str = "Alice Smith", password: str = "secret1"):
        r = client.post(
            "/api/admin/users",
            json={"username": username, "full_name": full_name, "password": password},
            headers=admin_headers,
        )
        assert r.status_code == 201, r.text
        return r.json(), login(client, username, password)

    return _make


@pytest.fixture
def alice(make_member):
    return make_member("alice", "Alice Smith")


@pytest.fixture
def bob(make_member):
    return make_member("bob", "Bob Jones")
