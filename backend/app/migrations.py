"""Small, idempotent schema upgrades run on startup.

`create_all` only creates missing tables, so changes to existing tables are applied here.
Each step checks the live schema first, so running it again is a no-op.
"""

from sqlalchemy import Engine, inspect, text

from .brand import to_brand

# Achievements that were retired when hours tracking was removed.
RETIRED_ACHIEVEMENTS = ("marathon", "centurion")


def _can_drop_columns(engine: Engine) -> bool:
    if engine.dialect.name != "sqlite":
        return True
    import sqlite3

    return sqlite3.sqlite_version_info >= (3, 35, 0)


def upgrade(engine: Engine) -> None:
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    task_cols = {c["name"] for c in insp.get_columns("tasks")} if "tasks" in tables else set()

    with engine.begin() as conn:
        # 1. Tasks can belong to a project.
        if task_cols and "project_id" not in task_cols:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_tasks_project_id ON tasks (project_id)"))

        # 2. Hours are gone: drop the estimate column. SQLite before 3.35 can't drop columns;
        #    the column is nullable and unused, so leaving it there is harmless.
        if "estimated_hours" in task_cols and _can_drop_columns(engine):
            conn.execute(text("ALTER TABLE tasks DROP COLUMN estimated_hours"))

        # 3. Hour logs become daily updates; the note is kept, the hours are dropped.
        if "work_logs" in tables:
            conn.execute(
                text(
                    "INSERT INTO daily_updates (task_id, user_id, date, note, created_at) "
                    "SELECT task_id, user_id, date, "
                    "CASE WHEN TRIM(COALESCE(note, '')) = '' THEN 'Worked on this' ELSE note END, created_at "
                    "FROM work_logs"
                )
            )
            conn.execute(text("DROP TABLE work_logs"))

        # 4. Remove achievements that no longer exist so counts and points stay honest.
        if "user_achievements" in tables:
            for key in RETIRED_ACHIEVEMENTS:
                conn.execute(text("DELETE FROM user_achievements WHERE achievement_key = :k"), {"k": key})

        # 5. Rebrand: move project and avatar colours onto the logo's palette (no-op once they're on it).
        for table, column in (("projects", "color"), ("users", "avatar_color")):
            if table not in tables:
                continue
            for row_id, color in conn.execute(text(f"SELECT id, {column} FROM {table}")).all():
                new = to_brand(color, row_id)
                if new != color:
                    conn.execute(text(f"UPDATE {table} SET {column} = :c WHERE id = :i"), {"c": new, "i": row_id})
