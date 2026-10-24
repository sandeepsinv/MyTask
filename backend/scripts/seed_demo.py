"""Fill the database with a small demo team, their tasks and three weeks of logged hours.

    python -m scripts.seed_demo            # adds the demo team (skips people who already exist)
    python -m scripts.seed_demo --reset    # wipes the database first

Every demo member's password is "demo1234".
"""

import random
import sys
from datetime import date, datetime, time, timedelta

from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.main import seed_admin
from app.models import Task, User, WorkLog
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

# (title, priority, status, progress, est hours, pending, tags)
TASKS = {
    "sara.haddad": [
        ("Q4 roadmap review with leadership", "high", "in_progress", 60, 12, "Waiting on the finance numbers for the pricing slide", "planning"),
        ("Write onboarding flow spec", "medium", "done", 100, 6, "", "spec,onboarding"),
        ("Interview loop for the frontend hire", "medium", "todo", 0, 5, "", "hiring"),
        ("Customer call notes: Northwind", "low", "done", 100, 2, "", "research"),
    ],
    "omar.farouk": [
        ("Migrate invoices to the v2 billing API", "critical", "blocked", 45, 24, "Blocked on the payments provider enabling the sandbox webhook", "billing,backend"),
        ("Rate limiting on the public API", "high", "in_progress", 70, 10, "Load test against staging", "backend,api"),
        ("Fix duplicate email notifications", "high", "done", 100, 4, "", "bug"),
        ("Postgres index for task search", "medium", "done", 100, 3, "", "backend,perf"),
    ],
    "priya.nair": [
        ("Kanban drag and drop", "high", "in_progress", 80, 14, "Keyboard fallback for moving cards", "frontend"),
        ("Dark theme pass", "medium", "done", 100, 8, "", "frontend,design"),
        ("Accessibility audit fixes", "medium", "todo", 0, 6, "", "a11y"),
        ("Settings page layout", "low", "done", 100, 5, "", "frontend"),
    ],
    "daniel.ortiz": [
        ("Leaderboard and badge visuals", "high", "in_progress", 55, 16, "Gold tier icon still reads too similar to silver", "design"),
        ("Empty states copy and layout", "medium", "done", 100, 4, "", "design,copy"),
        ("Usability test, round 2", "medium", "todo", 0, 8, "", "research"),
    ],
    "lina.chen": [
        ("Regression suite for task permissions", "high", "in_progress", 35, 10, "Need an admin test account on staging", "qa"),
        ("Smoke tests in CI", "medium", "done", 100, 6, "", "qa,ci"),
        ("Bug bash for the 2.3 release", "critical", "todo", 0, 6, "", "qa,release"),
    ],
    "yusuf.kaya": [
        ("Move staging to the new cluster", "high", "in_progress", 65, 18, "DNS cut-over scheduled for Thursday", "infra"),
        ("Nightly database backups", "critical", "done", 100, 5, "", "infra"),
        ("Cost report for October", "low", "blocked", 20, 3, "Waiting on the cloud invoice", "infra,finance"),
    ],
}

NOTES = ["Pairing session", "Implementation", "Review and fixes", "Tests", "Investigation", "Docs", "Meetings", "Follow-ups"]


def main(reset: bool) -> None:
    if reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    rng = random.Random(7)
    today = date.today()

    with SessionLocal() as db:
        seed_admin(db)
        for username, name, title, color in PEOPLE:
            if db.scalar(select(User).where(User.username == username)):
                print(f"skip {username} (exists)")
                continue
            user = User(
                username=username,
                full_name=name,
                title=title,
                email=f"{username}@northlight.studio",
                hashed_password=hash_password("demo1234"),
                avatar_color=color,
            )
            db.add(user)
            db.flush()

            # Logs on most weekdays of the last three weeks; a recent unbroken run for some people.
            streak_days = rng.choice([2, 4, 6, 9])
            for title_, priority, status, progress, est, pending, tags in TASKS[username]:
                start = today - timedelta(days=rng.randint(8, 20))
                due = start + timedelta(days=rng.randint(6, 18))
                task = Task(
                    owner_id=user.id,
                    title=title_,
                    description="",
                    status=status,
                    priority=priority,
                    start_date=start,
                    due_date=due,
                    estimated_hours=est,
                    progress_pct=progress,
                    pending_notes=pending,
                    tags=tags,
                )
                if status == "done":
                    finished = min(today, start + timedelta(days=rng.randint(2, 10)))
                    task.completed_at = datetime.combine(finished, time(16, 30))
                db.add(task)
                db.flush()

                if status == "todo":
                    continue
                last = task.completed_at.date() if task.completed_at else today
                budget = est * (progress / 100) * rng.uniform(0.85, 1.15)
                # Walk back from the last working day so open tasks have recent hours.
                d = last
                while d >= start and (budget > 0.4 or (today - d).days < streak_days):
                    recent = (today - d).days < streak_days
                    if (d.weekday() < 5 and rng.random() < 0.6) or recent:
                        h = round(max(0.5, min(budget, rng.choice([1, 1.5, 2, 2.5, 3, 4]))), 1)
                        db.add(WorkLog(task_id=task.id, user_id=user.id, date=d, hours=h, note=rng.choice(NOTES)))
                        budget -= h
                    d -= timedelta(days=1)
            db.commit()
            evaluate_and_award(db, user)
            print(f"added {username}")
    print("Done. Demo members sign in with password: demo1234")


if __name__ == "__main__":
    main(reset="--reset" in sys.argv)
