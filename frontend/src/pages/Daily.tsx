import { ChevronLeft, ChevronRight, NotebookPen } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMembers, useProjects, useTasks, useUpdates } from '../api/hooks'
import type { UpdateEntry, UserPublic } from '../api/types'
import { useMe } from '../auth/AuthContext'
import { PostUpdateForm, useTaskDrawer } from '../components/TaskDrawer'
import { Avatar, Dialog, Empty, ErrorLine, ProjectChip, Skel, StatusPill } from '../components/ui'
import { addDays, fmtDayLong, isoDate, plural } from '../lib/format'

/** What each person worked on, one day at a time. */
export default function Daily() {
  const me = useMe()
  const [params, setParams] = useSearchParams()
  const today = isoDate()
  const day = params.get('day') ?? today
  const projectId = Number(params.get('project')) || undefined
  const set = (key: string, value: string | null) =>
    setParams((p) => {
      if (value) p.set(key, value)
      else p.delete(key)
      return p
    })

  const members = useMembers()
  const projects = useProjects('all')
  const { data, isLoading, isError, refetch } = useUpdates({ on: day, project_id: projectId, limit: 500 })
  const [posting, setPosting] = useState(false)

  const byPerson = useMemo(() => {
    const map = new Map<number, UpdateEntry[]>()
    for (const u of data ?? []) map.set(u.user.id, [...(map.get(u.user.id) ?? []), u])
    return map
  }, [data])

  const posted = (members.data ?? []).filter((m) => byPerson.has(m.id))
  const notPosted = (members.data ?? []).filter((m) => !byPerson.has(m.id))
  const project = projects.data?.find((p) => p.id === projectId)
  const isToday = day === today

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Daily updates</h1>
          <p className="sub">
            {data && members.data
              ? project
                ? `${plural(data.length, 'update')} on ${project.name} ${isToday ? 'today' : `on ${fmtDayLong(day)}`}`
                : `${posted.length} of ${members.data.length} people posted ${isToday ? 'today' : `on ${fmtDayLong(day)}`}`
              : ' '}
          </p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setPosting(true)}>
            <NotebookPen /> Post an update
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="day-nav" role="group" aria-label="Day">
          <button className="icon-btn" onClick={() => set('day', addDays(day, -1))} aria-label="Previous day">
            <ChevronLeft />
          </button>
          <input
            type="date"
            className="input"
            value={day}
            max={today}
            onChange={(e) => set('day', e.target.value && e.target.value !== today ? e.target.value : null)}
            aria-label="Pick a day"
          />
          <button className="icon-btn" onClick={() => set('day', addDays(day, 1) === today ? null : addDays(day, 1))} disabled={isToday} aria-label="Next day">
            <ChevronRight />
          </button>
          {!isToday ? (
            <button className="btn ghost sm" onClick={() => set('day', null)}>
              Today
            </button>
          ) : null}
        </div>
        <span className="grow" />
        <select
          className="select"
          value={projectId ?? ''}
          onChange={(e) => set('project', e.target.value || null)}
          aria-label="Project"
        >
          <option value="">All projects</option>
          {projects.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.status === 'archived' ? ' (archived)' : ''}
            </option>
          ))}
        </select>
      </div>

      {isError ? (
        <div className="panel">
          <ErrorLine what="updates" onRetry={() => refetch()} />
        </div>
      ) : isLoading || !members.data ? (
        <div className="stack">
          {[0, 1, 2].map((i) => (
            <Skel key={i} w="100%" h={110} />
          ))}
        </div>
      ) : (
        <div className="stack">
          {posted.length === 0 ? (
            <div className="panel">
              <Empty>{isToday ? 'Nobody has posted yet today.' : `No updates on ${fmtDayLong(day)}.`}</Empty>
            </div>
          ) : (
            posted.map((m) => <PersonDay key={m.id} user={m} updates={byPerson.get(m.id)!} isMe={m.id === me.id} />)
          )}
          {!projectId && notPosted.length ? (
            <section className="panel" aria-labelledby="quiet-h">
              <div className="panel-head">
                <h2 id="quiet-h">{isToday ? "Haven't posted yet" : 'No update that day'}</h2>
                <span className="meta">{plural(notPosted.length, 'person', 'people')}</span>
              </div>
              <ul className="quiet">
                {notPosted.map((m) => (
                  <li key={m.id}>
                    <Avatar user={m} size="sm" />
                    {m.full_name}
                    {m.id === me.id ? <span className="muted"> (you)</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
      {posting ? <PostDialog day={day} onClose={() => setPosting(false)} /> : null}
    </>
  )
}

function PersonDay({ user, updates, isMe }: { user: UserPublic; updates: UpdateEntry[]; isMe: boolean }) {
  const { open } = useTaskDrawer()
  // Group this person's notes by task, in the order they were written.
  const byTask = new Map<number, UpdateEntry[]>()
  for (const u of [...updates].reverse()) byTask.set(u.task.id, [...(byTask.get(u.task.id) ?? []), u])
  return (
    <section className="panel person-day" aria-label={user.full_name}>
      <div className="pd-head">
        <Avatar user={user} />
        <div>
          <b>
            {user.full_name}
            {isMe ? <span className="muted" style={{ fontWeight: 400 }}> (you)</span> : null}
          </b>
          <span className="muted">{user.title ?? ''}</span>
        </div>
        <span className="meta">{plural(byTask.size, 'task')}</span>
      </div>
      <ul className="pd-tasks">
        {[...byTask.values()].map((items) => {
          const t = items[0].task
          return (
            <li key={t.id}>
              <div className="pd-task">
                <button className="text-btn" onClick={() => open(t.id)}>
                  {t.title}
                </button>
                <ProjectChip project={t.project} />
                <StatusPill status={t.status} />
              </div>
              <ul className="pd-notes">
                {items.map((u) => (
                  <li key={u.id}>{u.note}</li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function PostDialog({ day, onClose }: { day: string; onClose: () => void }) {
  const me = useMe()
  const { data } = useTasks({ owner_id: me.id, status: ['in_progress', 'blocked', 'todo'] })
  const [taskId, setTaskId] = useState<number | null>(null)
  const chosen = taskId ?? data?.find((t) => t.status === 'in_progress')?.id ?? data?.[0]?.id ?? null
  return (
    <Dialog title="What did you work on?" sub={day === isoDate() ? 'For today.' : `Defaults to ${fmtDayLong(day)}; change the day below.`} onClose={onClose}>
      {data && data.length === 0 ? (
        <Empty>You have no open tasks to post on. Add one first.</Empty>
      ) : (
        <div className="form">
          <label className="field">
            <span>Task</span>
            <select className="select" value={chosen ?? ''} onChange={(e) => setTaskId(Number(e.target.value))}>
              {data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                  {t.project ? ` — ${t.project.name}` : ''}
                </option>
              ))}
            </select>
          </label>
          {chosen ? <PostUpdateForm key={chosen} taskId={chosen} onDone={onClose} autoFocus /> : null}
        </div>
      )}
    </Dialog>
  )
}
