import { ChevronDown, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useActivity, useActivityPeople, type ActivityFilters } from '../api/hooks'
import type { ActivityCategory, ActivityEntry } from '../api/types'
import { useTaskDrawer } from '../components/TaskDrawer'
import { Avatar, Empty, ErrorLine, Person, Skel } from '../components/ui'
import { fmtDayLong, fmtInt, isoDate } from '../lib/format'

const CATEGORIES: { id: ActivityCategory | ''; label: string }[] = [
  { id: '', label: 'Everything' },
  { id: 'auth', label: 'Sign-ins' },
  { id: 'task', label: 'Tasks' },
  { id: 'update', label: 'Updates' },
  { id: 'project', label: 'Projects' },
  { id: 'user', label: 'People' },
]

const FIELD_LABEL: Record<string, string> = {
  project_id: 'project',
  progress_pct: 'progress',
  pending_notes: 'pending note',
  due_date: 'due date',
  start_date: 'start date',
  full_name: 'name',
  is_active: 'active',
  avatar_color: 'colour',
}
const STATUS: Record<string, string> = { todo: 'Up next', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' }

const timeFmt = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' })
const dateTimeFmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' })

/** API timestamps are naive UTC. */
const asDate = (iso: string) => new Date(iso.endsWith('Z') ? iso : `${iso}Z`)

function show(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (field === 'status' && typeof value === 'string') return STATUS[value] ?? value
  if (field === 'progress_pct') return `${value}%`
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  const text = String(value)
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

export default function AdminActivity() {
  const [params, setParams] = useSearchParams()
  const userId = Number(params.get('user')) || undefined
  const category = (params.get('category') ?? '') as ActivityCategory | ''
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')
  const set = (key: string, value: string | null) =>
    setParams((p) => {
      if (value) p.set(key, value)
      else p.delete(key)
      return p
    })

  const filters: ActivityFilters = {
    user_id: userId,
    category: category || undefined,
    from: from || undefined,
    to: to || undefined,
    q: q.trim() || undefined,
  }
  const log = useActivity(filters)
  const people = useActivityPeople()
  const person = people.data?.find((p) => p.user.id === userId)

  const items = useMemo(() => log.data?.pages.flatMap((p) => p.items) ?? [], [log.data])
  const days = useMemo(() => {
    const out: { day: string; rows: ActivityEntry[] }[] = []
    for (const row of items) {
      const day = isoDate(asDate(row.created_at))
      const last = out[out.length - 1]
      if (last && last.day === day) last.rows.push(row)
      else out.push({ day, rows: [row] })
    }
    return out
  }, [items])

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Activity log</h1>
          <p className="sub">
            {person ? `Everything ${person.user.full_name} did, newest first.` : 'Everything everyone did, newest first.'} Only admins can see this page.
          </p>
        </div>
      </div>

      <section className="panel" style={{ marginBottom: 'var(--gap)' }} aria-labelledby="people-h">
        <div className="panel-head">
          <h2 id="people-h">By person</h2>
          <span className="meta">Last 30 days · pick a row to see only their activity</span>
        </div>
        {people.isError ? (
          <ErrorLine what="people" onRetry={() => people.refetch()} />
        ) : !people.data ? (
          <Skel w="100%" h={160} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Person</th>
                  <th className="num">Actions</th>
                  <th className="num">Failed sign-ins</th>
                  <th className="hide-phone">Last signed in</th>
                  <th className="hide-phone">Last active</th>
                </tr>
              </thead>
              <tbody>
                {people.data.map((p) => (
                  <tr
                    key={p.user.id}
                    className={`clickable ${p.user.id === userId ? 'me-row' : ''}`}
                    onClick={() => set('user', p.user.id === userId ? null : String(p.user.id))}
                    style={{ opacity: p.user.is_active ? 1 : 0.6 }}
                  >
                    <td>
                      <Person user={p.user} sub={p.user.is_active ? `@${p.user.username}` : 'Deactivated'} />
                    </td>
                    <td className="num">{fmtInt(p.actions_30d)}</td>
                    <td className={`num ${p.failed_sign_ins_30d ? 'overdue' : ''}`}>{fmtInt(p.failed_sign_ins_30d)}</td>
                    <td className="hide-phone muted">{p.last_sign_in ? when(p.last_sign_in) : <span className="dash">—</span>}</td>
                    <td className="hide-phone muted">{p.last_activity ? when(p.last_activity) : <span className="dash">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Kind of activity">
          {CATEGORIES.map((c) => (
            <button key={c.id} aria-pressed={category === c.id} onClick={() => set('category', c.id || null)}>
              {c.label}
            </button>
          ))}
        </div>
        <span className="grow" />
        <select className="select" value={userId ?? ''} onChange={(e) => set('user', e.target.value || null)} aria-label="Person">
          <option value="">Everyone</option>
          {people.data?.map((p) => (
            <option key={p.user.id} value={p.user.id}>
              {p.user.full_name}
            </option>
          ))}
        </select>
        <div className="day-nav">
          <input type="date" className="input" value={from} max={to || isoDate()} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <span className="muted">to</span>
          <input type="date" className="input" value={to} min={from} max={isoDate()} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        </div>
        <div className="search" style={{ width: 220 }}>
          <Search aria-hidden="true" />
          <input className="input" placeholder="Search the log" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the log" />
        </div>
      </div>

      <section className="panel" aria-label="Activity">
        {log.isError ? (
          <ErrorLine what="the activity log" onRetry={() => log.refetch()} />
        ) : log.isLoading ? (
          <Skel w="100%" h={300} />
        ) : items.length === 0 ? (
          <Empty>No activity matches these filters.</Empty>
        ) : (
          <>
            {days.map((d) => (
              <div key={d.day} className="log-day">
                <h3>{fmtDayLong(d.day)}</h3>
                <ul>
                  {d.rows.map((row) => (
                    <LogRow key={row.id} row={row} />
                  ))}
                </ul>
              </div>
            ))}
            {log.hasNextPage ? (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
                <button className="btn" onClick={() => log.fetchNextPage()} disabled={log.isFetchingNextPage}>
                  {log.isFetchingNextPage ? 'Loading…' : 'Load older activity'}
                </button>
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 16 }}>
                That's everything — {fmtInt(items.length)} {items.length === 1 ? 'entry' : 'entries'}.
              </p>
            )}
          </>
        )}
      </section>
    </>
  )
}

function when(iso: string): string {
  const d = asDate(iso)
  const day = fmtDayLong(isoDate(d))
  return `${day}, ${timeFmt.format(d)}`
}

function LogRow({ row }: { row: ActivityEntry }) {
  const { open } = useTaskDrawer()
  const [expanded, setExpanded] = useState(false)
  const changes = row.details.changes ? Object.entries(row.details.changes) : []
  const hasMore = changes.length > 0 || !!row.details.note || !!row.ip
  const failed = row.action === 'auth.login_failed' || row.action === 'auth.login_blocked'
  const taskId = row.entity_type === 'task' ? row.entity_id : row.details.task_id
  const deleted = row.action.endsWith('.deleted')

  return (
    <li className={`log-row ${failed ? 'failed' : ''}`}>
      <time dateTime={row.created_at} title={dateTimeFmt.format(asDate(row.created_at))}>
        {timeFmt.format(asDate(row.created_at))}
      </time>
      {row.user ? <Avatar user={row.user} size="sm" /> : <span className="avatar sm" aria-hidden="true">?</span>}
      <div className="lr-body">
        <p>
          <b>{row.user ? row.user.full_name : 'Unknown account'}</b> <span>{lowerFirst(row.summary)}</span>
        </p>
        <div className="lr-meta">
          <code>{row.action}</code>
          {taskId && !deleted && row.action !== 'update.deleted' ? (
            <a
              href={`?task=${taskId}`}
              onClick={(e) => {
                e.preventDefault()
                open(taskId)
              }}
            >
              Open task
            </a>
          ) : null}
          {row.entity_type === 'project' && row.entity_id && !deleted ? <Link to={`/projects/${row.entity_id}`}>Open project</Link> : null}
          {hasMore ? (
            <button className="text-btn lr-toggle" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
              Details <ChevronDown aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
            </button>
          ) : null}
        </div>
        {expanded ? (
          <dl className="lr-details">
            {changes.map(([field, [before, after]]) => (
              <div key={field}>
                <dt>{FIELD_LABEL[field] ?? field}</dt>
                <dd>
                  <span className="old">{show(field, before)}</span> → <span>{show(field, after)}</span>
                </dd>
              </div>
            ))}
            {row.details.note ? (
              <div>
                <dt>note</dt>
                <dd>{row.details.note}</dd>
              </div>
            ) : null}
            {row.ip ? (
              <div>
                <dt>IP address</dt>
                <dd>{row.ip}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </li>
  )
}

/** "Created task …" reads as "Sara created task …". */
function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}
