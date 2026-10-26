import { Plus, Search } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMyStats, useProjects, useTasks, useUpdateTask } from '../api/hooks'
import type { Task, TaskStatus } from '../api/types'
import { useMe } from '../auth/AuthContext'
import { ProjectPicker, useTaskDrawer } from '../components/TaskDrawer'
import { useToast } from '../components/Toast'
import { ErrorLine, PriorityMark, ProjectChip, Progress, Skel, STATUSES, STATUS_LABEL, StatusPill } from '../components/ui'
import { dueLabel, fmtDayLong, fmtInt, plural } from '../lib/format'

const DONE_SHOWN = 8

export default function MyWork() {
  const me = useMe()
  const [params, setParams] = useSearchParams()
  // ?project=none shows tasks without a project, in the list view so they can be mapped in place.
  const projectParam = params.get('project') ?? ''
  const unmapped = projectParam === 'none'
  const projectId = unmapped ? undefined : Number(projectParam) || undefined
  const [view, setView] = useState<'board' | 'list'>(unmapped ? 'list' : 'board')
  const [q, setQ] = useState('')
  const { data, isLoading, isError, refetch } = useTasks({ owner_id: me.id, q, project_id: projectId, unmapped })
  const { data: stats } = useMyStats()
  const projects = useProjects('active')
  const { open } = useTaskDrawer()

  const open_ = data?.filter((t) => t.status !== 'done').length ?? 0
  const setProject = (value: string) => {
    setParams((p) => {
      if (value) p.set('project', value)
      else p.delete('project')
      return p
    })
    if (value === 'none') setView('list')
  }

  return (
    <>
      <div className="title-row">
        <div>
          <h1>My work</h1>
          <p className="sub">
            {data && stats
              ? `${plural(open_, 'open task')} · updates on ${plural(stats.update_days_this_week, 'day')} this week` +
                (stats.unmapped_tasks && !unmapped ? ` · ${fmtInt(stats.unmapped_tasks)} without a project` : '')
              : ' '}
          </p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => open('new', { projectId })}>
            <Plus /> New task
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Search aria-hidden="true" />
          <input className="input" placeholder="Search your tasks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your tasks" />
        </div>
        <select className="select" value={projectParam} onChange={(e) => setProject(e.target.value)} aria-label="Project">
          <option value="">All projects</option>
          <option value="none">No project</option>
          {projects.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
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
        <Board tasks={data} filtered={q !== '' || projectParam !== ''} />
      ) : (
        <TaskTable tasks={data} mappable />
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
      <div className="cproj">
        <ProjectChip project={task.project} plain />
      </div>
      {task.pending_notes && task.status !== 'done' ? <div className="pending">{task.pending_notes}</div> : null}
      <div className="cm">
        <PriorityMark priority={task.priority} />
        <span className="sp" />
        {task.due_date && task.status !== 'done' ? <span className={task.is_overdue ? 'overdue' : ''}>{dueLabel(task.due_date)}</span> : null}
        <span>{task.last_update ? fmtDayLong(task.last_update.date) : 'No updates'}</span>
      </div>
      {task.status !== 'done' && task.status !== 'todo' ? <Progress value={task.progress_pct} accent /> : null}
    </button>
  )
}

/** A task list. With `mappable`, tasks the viewer may edit get an inline project picker. */
export function TaskTable({ tasks, showOwner, mappable }: { tasks: Task[]; showOwner?: boolean; mappable?: boolean }) {
  const { open } = useTaskDrawer()
  const me = useMe()
  const projects = useProjects('active')
  const options = (projects.data ?? []).map(({ id, name, color, status }) => ({ id, name, color, status }))
  if (tasks.length === 0)
    return (
      <div className="panel">
        <div className="empty">No tasks match.</div>
      </div>
    )
  return (
    <div className="panel">
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Task</th>
              {showOwner ? <th>Owner</th> : null}
              <th>Project</th>
              <th>Status</th>
              <th className="hide-phone">Priority</th>
              <th className="hide-phone">Due</th>
              <th className="num hide-phone">Progress</th>
              <th className="hide-phone">Last update</th>
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
                <td onClick={(e) => mappable && e.stopPropagation()}>
                  {mappable && (t.owner_id === me.id || me.role === 'admin') ? (
                    <ProjectPicker task={t} projects={options} />
                  ) : (
                    <ProjectChip project={t.project} />
                  )}
                </td>
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
                <td className="hide-phone muted" style={{ whiteSpace: 'nowrap' }}>
                  {t.last_update ? fmtDayLong(t.last_update.date) : <span className="dash">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
