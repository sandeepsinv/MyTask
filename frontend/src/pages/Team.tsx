import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useMembers, useOverview, useTasks } from '../api/hooks'
import type { Task, TaskStatus, UserPublic } from '../api/types'
import { useTaskDrawer } from '../components/TaskDrawer'
import { Empty, ErrorLine, Person, Progress, Skel, STATUSES, STATUS_LABEL, StatusPill } from '../components/ui'
import { dueLabel, fmtHours, fmtInt, plural } from '../lib/format'
import { TaskTable } from './MyWork'

const OPEN: TaskStatus[] = ['in_progress', 'blocked', 'todo']

export default function Team() {
  const [view, setView] = useState<'people' | 'list'>('people')
  const [owner, setOwner] = useState<number | ''>('')
  const [status, setStatus] = useState<TaskStatus | 'open' | ''>('open')
  const [q, setQ] = useState('')
  const members = useMembers()
  const tasks = useTasks({
    owner_id: owner === '' ? undefined : owner,
    status: status === 'open' ? OPEN : status === '' ? undefined : [status],
    q,
  })
  const ov = useOverview()

  const hoursByUser = useMemo(
    () => new Map(ov.data?.members.map((m) => [m.user.id, m.hours_this_week]) ?? []),
    [ov.data],
  )

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Team</h1>
          <p className="sub">
            {tasks.data
              ? `${plural(tasks.data.length, 'task')} ${status === 'open' ? 'open' : 'shown'} across ${plural(new Set(tasks.data.map((t) => t.owner_id)).size, 'person', 'people')}`
              : ' '}
          </p>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Search aria-hidden="true" />
          <input className="input" placeholder="Search tasks and tags" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" />
        </div>
        <select className="select" value={owner} onChange={(e) => setOwner(e.target.value === '' ? '' : Number(e.target.value))} aria-label="Person">
          <option value="">Everyone</option>
          {members.data?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </select>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | 'open' | '')} aria-label="Status">
          <option value="open">Open tasks</option>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <span className="grow" />
        <div className="segmented" role="group" aria-label="View">
          <button aria-pressed={view === 'people'} onClick={() => setView('people')}>
            By person
          </button>
          <button aria-pressed={view === 'list'} onClick={() => setView('list')}>
            List
          </button>
        </div>
      </div>

      {tasks.isError ? (
        <div className="panel">
          <ErrorLine what="the team's tasks" onRetry={() => tasks.refetch()} />
        </div>
      ) : tasks.isLoading || !tasks.data || !members.data ? (
        <div className="people-grid">
          {[0, 1, 2].map((i) => (
            <div className="panel" key={i}>
              <Skel w="100%" h={160} />
            </div>
          ))}
        </div>
      ) : view === 'list' ? (
        <TaskTable tasks={tasks.data} showOwner />
      ) : (
        <People
          members={owner === '' ? members.data : members.data.filter((m) => m.id === owner)}
          tasks={tasks.data}
          hours={hoursByUser}
          filtered={q !== ''}
          onShowAll={(id) => {
            setOwner(id)
            setView('list')
          }}
        />
      )}
    </>
  )
}

function People({
  members,
  tasks,
  hours,
  filtered,
  onShowAll,
}: {
  members: UserPublic[]
  tasks: Task[]
  hours: Map<number, number>
  filtered: boolean
  onShowAll: (userId: number) => void
}) {
  const { open } = useTaskDrawer()
  const byOwner = new Map<number, Task[]>()
  for (const t of tasks) byOwner.set(t.owner_id, [...(byOwner.get(t.owner_id) ?? []), t])
  const rank = { blocked: 0, in_progress: 1, todo: 2, done: 3 }

  // When searching, only show people with matches.
  // People with matching tasks first, so the grid opens on work rather than empty cards.
  const withWork = (m: UserPublic) => (byOwner.get(m.id)?.length ?? 0)
  const shown = (filtered ? members.filter((m) => byOwner.has(m.id)) : members)
    .slice()
    .sort((a, b) => Number(withWork(b) > 0) - Number(withWork(a) > 0))
  if (shown.length === 0) return <div className="panel"><Empty>No tasks match.</Empty></div>

  return (
    <div className="people-grid">
      {shown.map((m) => {
        const mine = [...(byOwner.get(m.id) ?? [])].sort((a, b) => rank[a.status] - rank[b.status])
        const visible = mine.slice(0, 3)
        return (
          <section className="panel member-card" key={m.id} aria-label={m.full_name}>
            <div className="mh">
              <Person user={m} sub={m.title ?? (m.role === 'admin' ? 'Admin' : 'Member')} />
            </div>
            <div className="mstats" style={{ marginBottom: 14 }}>
              <span>
                <b>{fmtInt(mine.length)}</b> shown
              </span>
              <span>
                <b>{fmtInt(mine.filter((t) => t.status === 'blocked').length)}</b> blocked
              </span>
              <span>
                <b>{fmtHours(hours.get(m.id) ?? 0)} h</b> this week
              </span>
            </div>
            {visible.length === 0 ? (
              <Empty>No tasks here.</Empty>
            ) : (
              visible.map((t) => (
                <a
                  key={t.id}
                  href={`?task=${t.id}`}
                  className="mini-task"
                  onClick={(e) => {
                    e.preventDefault()
                    open(t.id)
                  }}
                >
                  <div className="mt">
                    <span className="mtt">{t.title}</span>
                    <StatusPill status={t.status} />
                  </div>
                  {t.status === 'in_progress' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                      <div style={{ flex: 1 }}>
                        <Progress value={t.progress_pct} accent />
                      </div>
                      <span className="num muted" style={{ fontSize: 12 }}>
                        {t.progress_pct}%
                      </span>
                    </div>
                  ) : null}
                  <div className="mp">
                    {t.pending_notes ? `Pending: ${t.pending_notes.split('\n')[0]}` : null}
                    {!t.pending_notes && t.due_date ? (
                      <span className={t.is_overdue ? 'overdue' : ''}>{dueLabel(t.due_date, t.status === 'done')}</span>
                    ) : null}
                    {!t.pending_notes && !t.due_date ? `${fmtHours(t.hours_logged)} h logged` : null}
                  </div>
                </a>
              ))
            )}
            {mine.length > visible.length ? (
              <div className="foot">
                <span>{fmtInt(mine.length - visible.length)} more</span>
                <button className="link" style={{ background: 'none', borderTop: 0, borderLeft: 0, borderRight: 0, padding: 0 }} onClick={() => onShowAll(m.id)}>
                  View all {fmtInt(mine.length)}
                </button>
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
