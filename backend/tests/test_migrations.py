from sqlalchemy import create_engine, inspect, text

from app.database import Base
from app.migrations import upgrade

OLD_SCHEMA = [
    "CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR(50), full_name VARCHAR(120), email VARCHAR(255),"
    " title VARCHAR(120), hashed_password VARCHAR(255), role VARCHAR(20), is_active BOOLEAN, avatar_color VARCHAR(20),"
    " created_at DATETIME)",
    "CREATE TABLE tasks (id INTEGER PRIMARY KEY, owner_id INTEGER, title VARCHAR(200), description TEXT, status VARCHAR(20),"
    " priority VARCHAR(20), start_date DATE, due_date DATE, completed_at DATETIME, estimated_hours FLOAT,"
    " progress_pct INTEGER, pending_notes TEXT, tags VARCHAR(255), created_at DATETIME, updated_at DATETIME)",
    "CREATE TABLE work_logs (id INTEGER PRIMARY KEY, task_id INTEGER, user_id INTEGER, date DATE, hours FLOAT,"
    " note TEXT, created_at DATETIME)",
    "CREATE TABLE user_achievements (id INTEGER PRIMARY KEY, user_id INTEGER, achievement_key VARCHAR(50), awarded_at DATETIME)",
    "INSERT INTO users VALUES (1, 'sara', 'Sara', NULL, NULL, 'x', 'member', 1, '#2563eb', '2026-10-01 09:00:00')",
    "INSERT INTO tasks VALUES (1, 1, 'Roadmap', '', 'in_progress', 'high', NULL, NULL, NULL, 12, 40, '', '',"
    " '2026-10-01 09:00:00', '2026-10-01 09:00:00')",
    "INSERT INTO work_logs VALUES (1, 1, 1, '2026-10-20', 3, 'Drafted the slides', '2026-10-20 17:00:00')",
    "INSERT INTO work_logs VALUES (2, 1, 1, '2026-10-21', 2, '', '2026-10-21 17:00:00')",
    "INSERT INTO user_achievements VALUES (1, 1, 'marathon', '2026-10-20 17:00:00')",
    "INSERT INTO user_achievements VALUES (2, 1, 'first_steps', '2026-10-20 17:00:00')",
]


def test_upgrade_converts_hour_logs_and_is_idempotent(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        for stmt in OLD_SCHEMA:
            conn.execute(text(stmt))

    for _ in range(2):  # running twice must be harmless
        Base.metadata.create_all(engine)
        upgrade(engine)

    insp = inspect(engine)
    cols = {c["name"] for c in insp.get_columns("tasks")}
    assert "project_id" in cols
    assert "estimated_hours" not in cols
    assert "work_logs" not in insp.get_table_names()

    with engine.connect() as conn:
        updates = conn.execute(text("SELECT task_id, user_id, date, note FROM daily_updates ORDER BY date")).all()
        keys = [r[0] for r in conn.execute(text("SELECT achievement_key FROM user_achievements"))]
        title = conn.execute(text("SELECT title, project_id FROM tasks")).one()
    assert [(u[0], u[1], str(u[2]), u[3]) for u in updates] == [
        (1, 1, "2026-10-20", "Drafted the slides"),
        (1, 1, "2026-10-21", "Worked on this"),
    ]
    assert keys == ["first_steps"]
    assert title == ("Roadmap", None)
    engine.dispose()
