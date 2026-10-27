import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { useDeleteProject, useProject, useUpdateProject } from '../api/hooks'
import type { ProjectDetail as Project, Task, TaskStatus } from '../api/types'
import { useMe } from '../auth/AuthContext'
import { ProjectDialog, UpdateLine } from '../components/Projects'
import { useTaskDrawer } from '../components/TaskDrawer'
import { useToast } from '../components/Toast'
import { Dialog, Empty, ErrorLine, Person, PriorityMark, Skel, StatusPill } from '../components/ui'
import { dueLabel, fmtDayLong, fmtInt, plural } from '../lib/format'

const ORDER: TaskStatus[] = ['blocked', 'in_progress', 'todo', 'done']

export default function ProjectDetail() {
  const { id } = useParams()
  const projectId = Number(id)
  const me = useMe()
  const { data: p, isLoading, isError, refetch } = useProject(projectId)
  const { open } = useTaskDrawer()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const update = useUpdateProject()
  const toast = useToast()

  if (isError)
    return (
      <div className="panel">
        <ErrorLine what="this project" onRetry={() => refetch()} />
      </div>
    )
  if (isLoading || !p) return <Skel w="100%" h={400} />

  const canEdit = p.created_by.id === me.id || me.role === 'admin'
  const archived = p.status === 'archived'
  const open_ = p.total_tasks - p.counts.done

  return (
    <>
      <p className="crumbs">
        <Link to="/projects">Projects</Link> /
      </p>
      <div className="title-row">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="title-swatch pcolor" style={{ '--pc': p.color } as CSSProperties} aria-hidden="true" />
            {p.name}
            {archived ? <span className="pill">Archived</span> : null}
          </h1>
          <p className="sub">
            {p.description || `Started by ${p.created_by.full_name}`}
            {p.last_activity ? ` · last update ${fmtDayLong(p.last_activity).toLowerCase()}` : ''}
          </p>
        </div>
        <div className="actions">
          {canEdit ? (
            <>
              <button className="btn ghost" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </button>
              <button
                className="btn ghost"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate(
                    { id: p.id, status: archived ? 'active' : 'archived' },
                    { onSuccess: () => toast(archived ? 'Project restored' : 'Project archived') },
                  )
                }
              >
                {archived ? <ArchiveRestore /> : <Archive />} {archived ? 'Restore' : 'Archive'}
              </button>
            </>
          ) : null}
          {!archived ? (
            <button className="btn primary" onClick={() => open('new', { projectId: p.id })}>
              <Plus /> New task here
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid">
        <div className="kpis span-12">
          <div className="kpi">
            <div className="kpi-label">Open tasks</div>
            <div className="kpi-value num">{fmtInt(open_)}</div>
            <div className="kpi-note">{p.overdue ? <span className="bad">{plural(p.overdue, 'task')} overdue</span> : 'Nothing overdue'}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">In progress</div>
            <div className="kpi-value num">{fmtInt(p.counts.in_progress)}</div>
            <div className="kpi-note">{fmtInt(p.counts.todo)} up next</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Blocked</div>
            <div className="kpi-value num">{fmtInt(p.counts.blocked)}</div>
            <div className="kpi-note">&nbsp;</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Done</div>
            <div className="kpi-value num">
              {fmtInt(p.counts.done)}
              <span className="unit">of {fmtInt(p.total_tasks)}</span>
            </div>
            <div className="kpi-note">&nbsp;</div>
          </div>
        </div>

        <section className="panel span-8" aria-labelledby="updates-h">
          <div className="panel-head">
            <h2 id="updates-h">What the team worked on</h2>
            <Link to={`/daily?project=${p.id}`} className="link">
              By day
            </Link>
          </div>
          {p.recent_updates.length === 0 ? (
            <Empty>No updates yet. Updates posted on this project's tasks show up here.</Empty>
          ) : (
            <ul className="update-list">
              {p.recent_updates.map((u) => (
                <UpdateLine key={u.id} u={u} showProject={false} />
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-4" aria-labelledby="people-h">
          <div className="panel-head">
            <h2 id="people-h">People</h2>
            <span className="meta">{plural(p.members.length, 'person', 'people')}</span>
          </div>
          {p.members.length === 0 ? (
            <Empty>Nobody has a task here yet.</Empty>
          ) : (
            <ul className="rows">
              {p.members.map((m) => (
                <li key={m.user.id} className="row" style={{ alignItems: 'flex-start' }}>
                  <Person
                    user={m.user}
                    sub={`${plural(m.open_tasks, 'open task')}${m.last_update ? ` · ${fmtDayLong(m.last_update.date).toLowerCase()}` : ''}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel span-12" aria-labelledby="tasks-h">
          <div className="panel-head">
            <h2 id="tasks-h">Tasks</h2>
            <span className="meta">{plural(p.total_tasks, 'task')}</span>
          </div>
          <ProjectTasks tasks={p.tasks} />
        </section>

        {canEdit ? (
          <section className="panel span-12 danger-zone" aria-labelledby="danger-h">
            <div>
              <h2 id="danger-h">Delete this project</h2>
              <p className="muted">Its {plural(p.total_tasks, 'task')} and their updates are kept and become unmapped.</p>
            </div>
            <button className="btn danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete project
            </button>
          </section>
        ) : null}
      </div>

      {editing ? <ProjectDialog project={p} onClose={() => setEditing(false)} /> : null}
      {confirmDelete ? <ConfirmDelete project={p} onClose={() => setConfirmDelete(false)} /> : null}
    </>
  )
}

function ProjectTasks({ tasks }: { tasks: Task[] }) {
  const { open } = useTaskDrawer()
  if (tasks.length === 0) return <Empty>No tasks yet. Add one here, or map an existing task from its drawer.</Empty>
  const sorted = [...tasks].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Task</th>
            <th>Owner</th>
            <th>Status</th>
            <th className="hide-phone">Priority</th>
            <th className="hide-phone">Due</th>
            <th className="hide-phone">Last update</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={t.id} className="clickable" onClick={() => open(t.id)}>
              <td className="title-cell">
                <b>{t.title}</b>
                {t.pending_notes && t.status !== 'done' ? <span>Pending: {t.pending_notes.split('\n')[0]}</span> : null}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{t.owner.full_name}</td>
              <td>
                <StatusPill status={t.status} />
              </td>
              <td className="hide-phone">
                <PriorityMark priority={t.priority} />
              </td>
              <td className={`hide-phone ${t.is_overdue ? 'overdue' : ''}`} style={{ whiteSpace: 'nowrap' }}>
                {t.due_date ? dueLabel(t.due_date, t.status === 'done') : <span className="dash">—</span>}
              </td>
              <td className="hide-phone muted" style={{ whiteSpace: 'nowrap' }}>
                {t.last_update ? fmtDayLong(t.last_update.date) : <span className="dash">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ConfirmDelete({ project, onClose }: { project: Project; onClose: () => void }) {
  const del = useDeleteProject()
  const navigate = useNavigate()
  const toast = useToast()
  return (
    <Dialog
      title={`Delete ${project.name}?`}
      sub={`Its ${plural(project.total_tasks, 'task')} stay and become unmapped. This can't be undone.`}
      onClose={onClose}
    >
      {del.isError ? <div className="form-error">{errorMessage(del.error)}</div> : null}
      <div className="dfoot">
        <button className="btn ghost" onClick={onClose}>
          Keep it
        </button>
        <button
          className="btn danger"
          disabled={del.isPending}
          onClick={() =>
            del.mutate(project.id, {
              onSuccess: () => {
                toast(`${project.name} deleted`)
                navigate('/projects')
              },
            })
          }
        >
          Delete project
        </button>
      </div>
    </Dialog>
  )
}


