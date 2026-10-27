# PSITasky — team task dashboard

PSITasky shows what everyone on the team worked on each day, which projects are moving, and what's stuck. It also runs a leaderboard with points and achievements.

- **Sign-in only.** There is no public sign-up. An admin creates every member's username and password from **Members** in the dashboard.
- **Projects.** Any member can create a project. Tasks belong to a project, and a task can be moved to a different project or have no project at all. A project's people are whoever has a task in it.
- **Tasks.** Each task has a status (Up next, In progress, Blocked, Done), a priority, start and due dates, progress %, and a *what's pending* note.
- **Daily updates.** Members post a short note on a task saying what they worked on that day. The **Daily updates** page shows what each person did on any day, and who hasn't posted.
- **Everyone sees everything.** Home, Projects, Team and the leaderboard show every member's work. Only a task's owner or an admin can change the task.
- **Leaderboard.** Scores are kept for this week, this month and all time. **Achievements** come in bronze, silver and gold tiers and add bonus points.

Stack: **FastAPI + SQLAlchemy + SQLite** (backend), **Vite + React + TypeScript** (frontend), **pytest** and **Vitest** for tests.

```
project-management/
├── backend/
│   ├── app/
│   │   ├── main.py            FastAPI app; creates/upgrades tables and the first admin on startup
│   │   ├── migrations.py      small idempotent schema upgrades for existing databases
│   │   ├── config.py          settings from env / .env
│   │   ├── models.py          User, Project, Task, DailyUpdate, UserAchievement
│   │   ├── schemas.py         request / response models
│   │   ├── security.py        bcrypt + JWT
│   │   ├── deps.py            current user / admin guards
│   │   ├── routers/           auth, users (admin), projects, tasks, updates, leaderboard / achievements / stats
│   │   └── services/          scoring.py (pure functions), achievements.py, leaderboard.py
│   ├── scripts/seed_demo.py   optional demo team
│   └── tests/                 pytest suite (in-memory SQLite)
└── frontend/
    ├── src/
    │   ├── api/               axios client, typed React Query hooks, types
    │   ├── auth/              AuthContext, RequireAuth, RequireAdmin
    │   ├── components/        shell, task drawer and form, project cards, shared UI
    │   ├── pages/             Login, Home, Projects, ProjectDetail, Daily, MyWork, Team,
    │   │                      Leaderboard, Achievements, Profile, AdminMembers
    │   └── styles.css         design tokens + all styles (light and dark)
    └── tests/                 Vitest + Testing Library + MSW
```

## Run it locally

You need Python 3.12+ and Node 20+.

### 1. Backend (port 8000)

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate     macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                  # then set JWT_SECRET
uvicorn app.main:app --reload --port 8000
```

On first start the backend creates `pulse.db`. A brand-new database has no accounts, so create the first admin once (it asks for a username, name and password):

```bash
python -m scripts.create_admin
```

After that, admins add everyone else from **Members**. The interactive API docs are at http://localhost:8000/docs.

Optional demo data: this adds six members, four projects, tasks and three weeks of daily updates. Every demo password is `demo1234`; if the database has no admin yet, a demo admin `admin` / `demo1234` is added too.

```bash
python -m scripts.seed_demo            # add the demo team
python -m scripts.seed_demo --reset    # wipe the database first
```

### 2. Frontend (port 5173)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in as the admin. The dev server proxies `/api` to `localhost:8000`; set `API_PROXY` to point it at another backend. If you host the API somewhere else, set `VITE_API_URL` (for example `https://api.example.com/api`) and add the frontend's origin to `CORS_ORIGINS` in the backend's `.env`.

## Tests

```bash
cd backend && pytest          # API, permissions, projects, updates, scoring, achievements, migrations
cd frontend && npm test       # login, route guards, task form, leaderboard, daily updates
```

## How points work

Scoring lives in `backend/app/services/scoring.py`. It is computed from the data on every request, so scores never drift.

| Earned by | Points |
|---|---|
| Finishing a task | low 5 · medium 10 · high 20 · critical 35 |
| Finishing on or before the due date | +5 |
| A day with at least one update | 3 per day |
| Daily streak (consecutive days with an update) | 3 per day, capped at 30 |
| Achievements | their points, on the all-time board only |

Weekly and monthly boards count only the tasks finished and the days with updates in that period. Achievements are permanent once earned. They are defined in `backend/app/services/achievements.py`:

| Achievement | Requirement | Tier · points |
|---|---|---|
| First Steps | Complete a task | bronze · 10 |
| Heavy Lifter | Complete a critical task | bronze · 15 |
| Team Player | Work on tasks in 3 different projects | bronze · 10 |
| Early Bird | Finish 2+ days before the due date | bronze · 10 |
| Punctual | 5 tasks finished on time | silver · 20 |
| Getting Things Done | 10 tasks completed | silver · 25 |
| On Fire | Post an update 7 days in a row | silver · 30 |
| Storyteller | Post updates on 30 different days | gold · 50 |

## Roles and permissions

| | Member | Admin |
|---|---|---|
| See all projects, tasks, updates, leaderboard, achievements | ✓ | ✓ |
| Create projects | ✓ | ✓ |
| Edit, archive or delete a project | if they created it | ✓ |
| Create tasks, map them to projects, post updates on own tasks | ✓ | ✓ |
| Edit / delete the tasks they created | ✓ | ✓ |
| Delete the updates they posted | ✓ | ✓ |
| Edit / delete anyone's tasks, updates and projects | | ✓ |
| Add members, reset passwords, change roles, deactivate | | ✓ |
| View the activity log | | ✓ |

Deleting a project keeps its tasks; they become unmapped.

## Activity log

Admins have an **Activity log** page (Admin › Activity log) showing everything people did, newest first: sign-ins, sign-outs and failed sign-in attempts (with IP address), tasks created, edited, moved, completed and deleted (with each changed field's old and new value), updates posted and deleted, project changes, and admin actions on people. It can be filtered by person, kind of activity, date range and text, and a per-person table shows each member's actions and failed sign-ins over the last 30 days and when they last signed in. Entries are written in the same transaction as the change they describe, so the log can't miss or invent an action. The app always keeps at least one active admin, and an admin can't deactivate their own account. Deactivated members can't sign in. They are hidden from the board, but their history is kept.

## Configuration (`backend/.env`)

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./pulse.db` | Any SQLAlchemy URL. Postgres works with `psycopg` installed |
| `JWT_SECRET` | dev value | **Set a long random string in production** |
| `JWT_EXPIRE_MINUTES` | `720` | Session length |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma separated |

## Database changes

On startup the backend creates any missing tables, then `app/migrations.py` applies small in-place upgrades to existing ones (each step checks the live schema first, so it is safe to run every time). For example, older databases that tracked hours have their hour logs turned into daily updates, keeping each note. For larger schema changes in future, switch to Alembic.
