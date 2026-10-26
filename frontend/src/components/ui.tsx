import {
  AlertCircle,
  CalendarCheck,
  Dumbbell,
  Flag,
  Flame,
  FolderOpen,
  Layers,
  ListChecks,
  NotebookPen,
  Sunrise,
  Timer,
  Trophy,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import type { Priority, ProjectRef, TaskStatus, UserPublic } from '../api/types'
import { initials } from '../lib/format'

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Up next',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
}
export const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done']
export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical']
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }

export function Avatar({ user, size }: { user: Pick<UserPublic, 'full_name' | 'avatar_color'>; size?: 'sm' | 'lg' }) {
  return (
    <span className={`avatar ${size ?? ''}`} style={{ '--hue': user.avatar_color } as CSSProperties} aria-hidden="true">
      {initials(user.full_name)}
    </span>
  )
}

export function Person({ user, sub }: { user: UserPublic; sub?: ReactNode }) {
  return (
    <span className="person">
      <Avatar user={user} />
      <span style={{ minWidth: 0 }}>
        <span className="name" style={{ display: 'block' }}>
          {user.full_name}
        </span>
        {sub !== undefined ? <span className="role" style={{ display: 'block' }}>{sub}</span> : null}
      </span>
    </span>
  )
}

export function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span className={`pill ${status}`}>
      <span className="dot" />
      {STATUS_LABEL[status]}
    </span>
  )
}

export function PriorityMark({ priority }: { priority: Priority }) {
  const level = PRIORITIES.indexOf(priority) + 1
  return (
    <span className={`prio ${priority}`} title={`${PRIORITY_LABEL[priority]} priority`}>
      <i aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <b key={n} className={n <= level ? 'on' : ''} />
        ))}
      </i>
      {PRIORITY_LABEL[priority]}
    </span>
  )
}

export function Progress({ value, accent, over }: { value: number; accent?: boolean; over?: boolean }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      className={`track ${accent ? 'accent' : ''} ${over ? 'over' : ''}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {pct > 0 ? <i style={{ width: `${pct}%` }} /> : null}
    </div>
  )
}

const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  flag: Flag,
  dumbbell: Dumbbell,
  timer: Timer,
  sunrise: Sunrise,
  'calendar-check': CalendarCheck,
  'list-checks': ListChecks,
  flame: Flame,
  layers: Layers,
  'notebook-pen': NotebookPen,
  trophy: Trophy,
}
export function AchievementIcon({ name }: { name: string }) {
  const Icon = ACHIEVEMENT_ICONS[name] ?? Trophy
  return <Icon aria-hidden="true" />
}

/** A project's name with its colour dot; links to the project unless `plain`. Unmapped tasks say so. */
export function ProjectChip({ project, plain }: { project: ProjectRef | null; plain?: boolean }) {
  if (!project)
    return (
      <span className="proj none">
        <FolderOpen aria-hidden="true" />
        No project
      </span>
    )
  const inner = (
    <>
      <i style={{ background: project.color }} aria-hidden="true" />
      {project.name}
    </>
  )
  return plain ? (
    <span className="proj">{inner}</span>
  ) : (
    <Link className="proj" to={`/projects/${project.id}`} onClick={(e) => e.stopPropagation()}>
      {inner}
    </Link>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function ErrorLine({ what, onRetry }: { what: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle aria-hidden="true" />
      <span>Couldn't load {what}.</span>
      {onRetry ? (
        <button className="btn ghost sm" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  )
}

export function Skel({ w, h = 14 }: { w: number | string; h?: number }) {
  return <span className="skeleton" style={{ width: w, height: h }} aria-hidden="true" />
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
}

export function Drawer({
  title,
  onClose,
  children,
  footer,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  useEscape(onClose)
  return createPortal(
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="drawer-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-foot">{footer}</div> : null}
      </aside>
    </>,
    document.body,
  )
}

export function Dialog({
  title,
  sub,
  onClose,
  children,
}: {
  title: string
  sub?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  useEscape(onClose)
  return createPortal(
    <>
      <div className="overlay" onClick={onClose} />
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {sub ? <p className="dsub">{sub}</p> : null}
        {children}
      </div>
    </>,
    document.body,
  )
}
