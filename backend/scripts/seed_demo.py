"""Fill the database with a small demo team, projects, tasks and three weeks of daily updates.

    python -m scripts.seed_demo            # adds the demo team (skips people who already exist)
    python -m scripts.seed_demo --reset    # wipes the database first

Every demo member's password is "demo1234".
"""

import random
import sys
from datetime import date, datetime, time, timedelta

from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.main import init_db, seed_admin
from app.models import DailyUpdate, Project, Task, User
from app.security import hash_password
from app.services.achievements import evaluate_and_award

PEOPLE = [
    ("sara.haddad", "Sara Haddad", "Product lead", "#2563eb"),
    ("omar.farouk", "Omar Farouk", "Backend engineer", "#c2410c"),
    ("priya.nair", "Priya Nair", "Frontend engineer", "#0d9488"),
    ("daniel.ortiz", "Daniel Ortiz", "Designer", "#be123c"),
    ("lina.chen", "Lina Chen", "QA engineer", "#a16207"),
    ("yusuf.kaya", "Yusuf Kaya", "DevOps engineer", "#4d7c0f"),
]

PROJECTS = [
    ("Billing v2", "Move invoicing and payments onto the provider's v2 API.", "#2563eb", "omar.farouk"),
    ("Q4 release 2.3", "Everything that ships in the 2.3 release.", "#1b6e66", "sara.haddad"),
    ("Platform reliability", "Staging cluster, backups and alerting.", "#4d7c0f", "yusuf.kaya"),
    ("Hiring", "Frontend hire and interview loop.", "#be123c", "sara.haddad"),
]

# (title, project, priority, status, progress, pending, tags, [daily notes, newest last])
TASKS = {
    "sara.haddad": [
        ("Q4 roadmap review with leadership", "Q4 release 2.3", "high", "in_progress", 60,
         "Waiting on the finance numbers for the pricing slide", "planning",
         ["Collected feature requests from support", "Drafted the roadmap outline", "Reviewed scope with Omar and Priya", "Built the pricing slide", "Rehearsed the review"]),
        ("Write onboarding flow spec", "Q4 release 2.3", "medium", "done", 100, "", "spec,onboarding",
         ["Mapped the current onboarding steps", "Wrote the spec draft", "Folded in design feedback"]),
        ("Interview loop for the frontend hire", "Hiring", "medium", "todo", 0, "", "hiring", []),
        ("Customer call notes: Northwind", None, "low", "done", 100, "", "research",
         ["Call with Northwind's ops team, wrote up notes"]),
    ],
    "omar.farouk": [
        ("Migrate invoices to the v2 billing API", "Billing v2", "critical", "blocked", 45,
         "Blocked on the payments provider enabling the sandbox webhook", "billing,backend",
         ["Mapped old invoice fields to v2", "Wrote the migration script", "Dry run on a copy of production", "Raised the sandbox webhook issue with the provider"]),
        ("Rate limiting on the public API", "Platform reliability", "high", "in_progress", 70, "Load test against staging", "backend,api",
         ["Picked a token-bucket design", "Implemented the limiter middleware", "Added per-key limits and tests", "Tuned limits with Yusuf"]),
        ("Fix duplicate email notifications", "Q4 release 2.3", "high", "done", 100, "", "bug",
         ["Reproduced the duplicate send", "Fixed the retry race and added a test"]),
        ("Postgres index for task search", None, "medium", "done", 100, "", "backend,perf",
         ["Profiled slow search queries", "Added a trigram index"]),
    ],
    "priya.nair": [
        ("Kanban drag and drop", "Q4 release 2.3", "high", "in_progress", 80, "Keyboard fallback for moving cards", "frontend",
         ["Prototyped drag between columns", "Wired drops to the status API", "Polished drop targets", "Fixed a flicker on drop", "Started the keyboard fallback"]),
        ("Dark theme pass", "Q4 release 2.3", "medium", "done", 100, "", "frontend,design",
         ["Audited colours in dark mode", "Fixed contrast on pills and charts"]),
        ("Accessibility audit fixes", None, "medium", "todo", 0, "", "a11y", []),
        ("Billing settings page", "Billing v2", "low", "in_progress", 30, "", "frontend",
         ["Built the layout from Daniel's mock"]),
    ],
    "daniel.ortiz": [
        ("Leaderboard and badge visuals", "Q4 release 2.3", "high", "in_progress", 55, "Gold tier icon still reads too similar to silver", "design",
         ["Explored three badge styles", "Picked the outline style with the team", "Drew the tier icons", "Second pass on the gold tier"]),
        ("Empty states copy and layout", "Q4 release 2.3", "medium", "done", 100, "", "design,copy",
         ["Wrote empty-state copy for every screen", "Handed off to Priya"]),
        ("Billing settings mock", "Billing v2", "medium", "done", 100, "", "design",
         ["Sketched the billing settings layout", "Final mock in Figma"]),
        ("Usability test, round 2", None, "medium", "todo", 0, "", "research", []),
    ],
    "lina.chen": [
        ("Regression suite for task permissions", "Q4 release 2.3", "high", "in_progress", 35, "Need an admin test account on staging", "qa",
         ["Listed the permission cases", "Automated the member-vs-owner cases", "Started the admin cases"]),
        ("Smoke tests in CI", "Platform reliability", "medium", "done", 100, "", "qa,ci",
         ["Wrote the smoke suite", "Hooked it into the CI pipeline"]),
        ("Bug bash for the 2.3 release", "Q4 release 2.3", "critical", "todo", 0, "", "qa,release", []),
    ],
    "yusuf.kaya": [
        ("Move staging to the new cluster", "Platform reliability", "high", "in_progress", 65, "DNS cut-over scheduled for Thursday", "infra",
         ["Provisioned the new cluster", "Migrated the databases", "Moved the workers", "Load-tested staging with Omar", "Prepared the DNS cut-over plan"]),
        ("Nightly database backups", "Platform reliability", "critical", "done", 100, "", "infra",
         ["Set up nightly snapshots", "Tested a full restore"]),
        ("Cost report for October", None, "low", "blocked", 20, "Waiting on the cloud invoice", "infra,finance",
         ["Pulled usage from the cloud console"]),
    ],
}


def working_days_back(today: date, n: int, rng: random.Random) -> list[date]:
    """n distinct recent days, mostly weekdays, newest last."""
    days: list[date] = []
    d = today
    while len(days) < n:
        if d.weekday() < 5 or rng.random() < 0.15:
            days.append(d)
        d -= timedelta(days=rng.choice([1, 1, 1, 2]))
    return sorted(days)


def main(reset: bool) -> None:
    if reset:
        Base.metadata.drop_all(engine)
    init_db()
    rng = random.Random(7)
    today = date.today()

    with SessionLocal() as db:
        seed_admin(db)
        users: dict[str, User] = {}
        for username, name, title, color in PEOPLE:
            existing = db.scalar(select(User).where(User.username == username))
            if existing:
                print(f"skip {username} (exists)")
                continue
            users[username] = User(
                username=username,
                full_name=name,
                title=title,
                email=f"{username}@northlight.studio",
                hashed_password=hash_password("demo1234"),
                avatar_color=color,
            )
            db.add(users[username])
        db.flush()

        projects: dict[str, Project] = {}
        for name, description, color, creator in PROJECTS:
            project = db.scalar(select(Project).where(Project.name == name))
            if project is None and creator in users:
                project = Project(name=name, description=description, color=color, created_by_id=users[creator].id)
                db.add(project)
            if project is not None:
                projects[name] = project
        db.flush()

        for username, user in users.items():
            for title, project, priority, status, progress, pending, tags, notes in TASKS[username]:
                start = today - timedelta(days=rng.randint(10, 20))
                task = Task(
                    owner_id=user.id,
                    project_id=projects[project].id if project in projects else None,
                    title=title,
                    status=status,
                    priority=priority,
                    start_date=start,
                    due_date=start + timedelta(days=rng.randint(8, 20)),
                    progress_pct=progress,
                    pending_notes=pending,
                    tags=tags,
                )
                db.add(task)
                db.flush()
                if not notes:
                    continue
                # Finished work ended a while ago; open work runs up to today.
                end = today - timedelta(days=rng.randint(3, 8)) if status == "done" else today
                for day, note in zip(working_days_back(end, len(notes), rng), notes):
                    db.add(DailyUpdate(task_id=task.id, user_id=user.id, date=day, note=note))
                if status == "done":
                    task.completed_at = datetime.combine(end, time(16, 30))
            db.commit()
            evaluate_and_award(db, user)
            print(f"added {username}")
    print("Done. Demo members sign in with password: demo1234")


if __name__ == "__main__":
    main(reset="--reset" in sys.argv)
