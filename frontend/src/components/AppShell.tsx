import { Activity, Award, FolderKanban, Home, KanbanSquare, LogOut, Menu, Moon, NotebookPen, Sun, Trophy, Users, UserCog, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth, useMe } from '../auth/AuthContext'
import { useTheme } from '../lib/theme'
import { TaskDrawerHost } from './TaskDrawer'
import { Avatar } from './ui'

export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="13" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 14.5l3.8 3.8L19.5 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/daily', label: 'Daily updates', icon: NotebookPen },
  { to: '/my-work', label: 'My work', icon: KanbanSquare },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/achievements', label: 'Achievements', icon: Award },
]

const TITLES: Record<string, string> = {
  '/': 'Home',
  '/projects': 'Projects',
  '/daily': 'Daily updates',
  '/my-work': 'My work',
  '/team': 'Team',
  '/leaderboard': 'Leaderboard',
  '/achievements': 'Achievements',
  '/profile': 'Profile',
  '/admin/members': 'Members',
  '/admin/activity': 'Activity log',
}

export function AppShell() {
  const me = useMe()
  const { logout } = useAuth()
  const { dark, toggle } = useTheme()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="app">
      <header className="topbar">
        <BrandMark />
        <span className="where">{TITLES[location.pathname] ?? (location.pathname.startsWith('/projects/') ? 'Project' : 'MyTask')}</span>
        <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
          {open ? <X /> : <Menu />}
        </button>
      </header>

      <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Main" onClick={(e) => (e.target as HTMLElement).closest('a') && setOpen(false)}>
        <div className="brand">
          <BrandMark />
          <span className="brand-name">MyTask</span>
        </div>
        <div className="scope">Team workspace</div>

        <div className="nav-group">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="nav-item">
              <Icon aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>

        {me.role === 'admin' ? (
          <div className="nav-group">
            <div className="nav-label">Admin</div>
            <NavLink to="/admin/members" className="nav-item">
              <UserCog aria-hidden="true" />
              Members
            </NavLink>
            <NavLink to="/admin/activity" className="nav-item">
              <Activity aria-hidden="true" />
              Activity log
            </NavLink>
          </div>
        ) : null}

        <div className="sidebar-foot">
          <button className="nav-item" style={{ border: 0, background: 'transparent', width: '100%' }} onClick={toggle}>
            {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            {dark ? 'Light theme' : 'Dark theme'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <NavLink to="/profile" className="user-row" style={{ flex: 1, minWidth: 0 }}>
              <Avatar user={me} />
              <span className="who">
                <b>{me.full_name}</b>
                <span>{me.role === 'admin' ? 'Admin' : me.title || 'Member'}</span>
              </span>
            </NavLink>
            <button className="icon-btn" onClick={logout} aria-label="Sign out" title="Sign out">
              <LogOut />
            </button>
          </div>
        </div>
      </nav>

      <main className="canvas">
        <div className="column">
          <Outlet />
        </div>
      </main>
      <TaskDrawerHost />
    </div>
  )
}
