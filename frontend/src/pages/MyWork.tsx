import { Plus, Search } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { useMyStats, useTasks, useUpdateTask } from '../api/hooks'
import type { Task, TaskStatus } from '../api/types'
import { useMe } from '../auth/AuthContext'
import { useTaskDrawer } from '../components/TaskDrawer'
import { useToast } from '../components/Toast'
import { ErrorLine, PriorityMark, Progress, Skel, STATUSES, STATUS_LABEL, StatusPill } from '../components/ui'
import { dueLabel, fmtHours, fmtInt, plural } from '../lib/format'

const DONE_SHOWN = 8

export default function MyWork() {
  const me = useMe()
  const [view, setView] = useState<'board' | 'list'>('board')
  const [q, setQ] = useState('')
  const { data, isLoading, isError, refetch } = useTasks({ owner_id: me.id, q })
  const { data: stats } = useMyStats()
  const { open } = useTaskDrawer()

  const open_ = data?.filter((t) => t.status !== 'done').length ?? 0
  const hours = stats?.hours_this_week ?? 0

  return (
    <>
      <div className="title-row">
        <div>
          <h1>My work</h1>
          <p className="sub">
            {data ? `${plural(open_, 'open task')} · ${fmtHours(hours)} h logged this week` : ' '}
          </p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => open('new')}>
            <Plus /> New task
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Search aria-hidden="true" />
          <input className="input" placeholder="Search your tasks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your tasks" />
        </div>
        <span className="grow" />
        <div className="segmented" role="group" aria-label="View">
          <button aria-pressed={view === 'board'} onClick={() => setView('board')}>
            Board
          </button>
          <button aria-pressed={view === 'list'} onClick={() => setView('list')}>
            List
          </button>
        </div>
      </div>

      {isError ? (
        <div className="panel">
          <ErrorLine what="your tasks" onRetry={() => refetch()} />
        </div>
      ) : isLoading || !data ? (
        <div className="board">
          {STATUSES.map((s) => (
            <div className="col" key={s}>
              <div className="col-head">{STATUS_LABEL[s]}</div>
              <Skel w="100%" h={96} />
            </div>
          ))}
        </div>
      ) : view === 'board' ? (
        <Board tasks={data} filtered={q !== ''} />
      ) : (
        <TaskTable tasks={data} />
      )}
    </>
  )
}

function Board({ tasks, filtered }: { tasks: Task[]; filtered: boolean }) {
  const update = useUpdateTask()
  const toast = useToast()
  const [over, setOver] = useState<TaskStatus | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  const drop = (status: TaskStatus) => (e: DragEvent) => {
    e.preventDefault()
    setOver(null)
    const id = Number(e.dataTransfer.getData('text/plain'))
    const task = tasks.find((t) => t.id === id)
    if (!task || task.status === status) return
    update.mutate({ id, status }, { onSuccess: () => toast(`Moved to ${STATUS_LABEL[status]}`) })
  }

  return (
    <div className="board">
      {STATUSES.map((status) => {
        const all = tasks.filter((t) => t.status === status)
        const shown = status === 'done' ? all.slice(0, DONE_SHOWN) : all
        return (
          <section
            key={status}
            className={`col ${over === status ? 'drop' : ''}`}
            aria-label={STATUS_LABEL[status]}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(status)
            }}
            onDragLeave={() => setOver((o) => (o === status ? null : o))}
            onDrop={drop(status)}
          >
            <div className="col-head">
              <StatusPill status={status} />
              <span className="n">{fmtInt(all.length)}</span>
            </div>
            <div className="col-body">
              {shown.map((t) => (
                <TaskCard key={t.id} task={t} dragging={dragging === t.id} onDrag={setDragging} />
              ))}
              {all.length === 0 ? (
                <div className="col-empty">{filtered ? 'No matches' : status === 'blocked' ? 'Nothing blocked' : 'Drop a task here'}</div>
              ) : null}
              {all.length > shown.length ? (
                <p className="muted" style={{ fontSize: 12, padding: '4px 6px' }}>
                  {fmtInt(all.length - shown.length)} more in the list view
                </p>
              ) : null}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function TaskCard({ task, dragging, onDrag }: { task: Task; dragging: boolean; onDrag: (id: number | null) => void }) {
  const { open } = useTaskDrawer()
  return (
    <button
      className={`card ${dragging ? 'dragging' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(task.id))
        e.dataTransfer.effectAllowed = 'move'
        onDrag(task.id)
      }}
      onDragEnd={() => onDrag(null)}
      onClick={() => open(task.id)}
    >
      <div className="ct">{task.title}</div>
      {task.pending_notes && task.status !== 'done' ? <div className="pending">{task.pending_notes}</div> : null}
      <div className="cm">
        <PriorityMark priority={task.priority} />
        <span className="sp" />
        {task.due_date && task.status !== 'done' ? <span className={task.is_overdue ? 'overdue' : ''}>{dueLabel(task.due_date)}</span> : null}
        <span className="num">{fmtHours(task.hours_logged)} h</span>
      </div>
      {task.status !== 'done' && task.status !== 'todo' ? <Progress value={task.progress_pct} accent /> : null}
    </button>
  )
}

export function TaskTable({ tasks, showOwner }: { tasks: Task[]; showOwner?: boolean }) {
  const { open } = useTaskDrawer()
  if (tasks.length === 0) return <div className="panel"><div className="empty">No tasks match.</div></div>
  return (
    <div className="panel">
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Task</th>
              {showOwner ? <th>Owner</th> : null}
              <th>Status</th>
              <th className="hide-phone">Priority</th>
              <th className="hide-phone">Due</th>
              <th className="num hide-phone">Progress</th>
              <th className="num">Logged</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="clickable" onClick={() => open(t.id)}>
                <td className="title-cell">
                  <b>{t.title}</b>
                  {t.pending_notes && t.status !== 'done' ? <span>Pending: {t.pending_notes.split('\n')[0]}</span> : null}
                </td>
                {showOwner ? <td style={{ whiteSpace: 'nowrap' }}>{t.owner.full_name}</td> : null}
                <td>
                  <StatusPill status={t.status} />
                </td>
                <td className="hide-phone">
                  <PriorityMark priority={t.priority} />
                </td>
                <td className={`hide-phone ${t.is_overdue ? 'overdue' : ''}`} style={{ whiteSpace: 'nowrap' }}>
                  {t.due_date ? dueLabel(t.due_date, t.status === 'done') : <span className="dash">—</span>}
                </td>
                <td className="num hide-phone">{t.progress_pct}%</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  {fmtHours(t.hours_logged)} h
                  {t.estimated_hours != null ? <span className="muted"> / {fmtHours(t.estimated_hours)}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
