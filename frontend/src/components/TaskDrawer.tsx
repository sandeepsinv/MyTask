import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router-dom'
import { errorMessage } from '../api/client'
import {
  useAddUpdate,
  useCreateTask,
  useDeleteTask,
  useDeleteUpdate,
  useProjects,
  useTask,
  useUpdateTask,
} from '../api/hooks'
import type { ProjectRef, TaskDetail, TaskInput } from '../api/types'
import { useMe } from '../auth/AuthContext'
import { dueLabel, fmtDay, fmtDayLong, isoDate } from '../lib/format'
import { TASK_FORM_ID, TaskForm } from './TaskForm'
import { useToast } from './Toast'
import { Drawer, ErrorLine, Person, PriorityMark, ProjectChip, Progress, Skel, StatusPill } from './ui'

/** Opens task drawers from the URL: ?task=12 shows a task, ?task=new creates one (optionally in ?project=3). */
export function useTaskDrawer() {
  const [params, setParams] = useSearchParams()
  const open = (id: number | 'new', opts: { projectId?: number } = {}) =>
    setParams((p) => {
      p.set('task', String(id))
      p.delete('edit')
      if (opts.projectId) p.set('project', String(opts.projectId))
      else p.delete('project')
      return p
    })
  return { open, current: params.get('task') }
}

/** Active projects as the small refs the task form needs. */
function useProjectOptions(): ProjectRef[] {
  const { data } = useProjects('active')
  return (data ?? []).map(({ id, name, color, status }) => ({ id, name, color, status }))
}

export function TaskDrawerHost() {
  const [params, setParams] = useSearchParams()
  const value = params.get('task')
  if (!value) return null
  const close = () =>
    setParams((p) => {
      p.delete('task')
      p.delete('edit')
      p.delete('project')
      return p
    })
  if (value === 'new') {
    const projectId = Number(params.get('project')) || null
    return <NewTaskDrawer onClose={close} projectId={projectId} />
  }
  const id = Number(value)
  if (!Number.isInteger(id)) return null
  return <TaskDetailDrawer key={id} id={id} onClose={close} startEditing={params.get('edit') === '1'} />
}

function NewTaskDrawer({ onClose, projectId }: { onClose: () => void; projectId: number | null }) {
  const create = useCreateTask()
  const projects = useProjects('active')
  const options = useProjectOptions()
  const toast = useToast()
  const submit = (input: TaskInput) =>
    create.mutate(input, {
      onSuccess: () => {
        toast('Task added')
        onClose()
      },
    })
  return (
    <Drawer
      title="New task"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" type="submit" form={TASK_FORM_ID} disabled={create.isPending}>
            {create.isPending ? 'Adding…' : 'Add task'}
          </button>
        </>
      }
    >
      {projects.isLoading ? (
        <Skel w="100%" h={200} />
      ) : (
        <TaskForm
          projects={options}
          defaultProjectId={projectId}
          onSubmit={submit}
          error={create.isError ? errorMessage(create.error) : null}
        />
      )}
    </Drawer>
  )
}

function TaskDetailDrawer({ id, onClose, startEditing }: { id: number; onClose: () => void; startEditing: boolean }) {
  const me = useMe()
  const { data: task, isLoading, isError, refetch } = useTask(id)
  const options = useProjectOptions()
  const update = useUpdateTask()
  const remove = useDeleteTask()
  const toast = useToast()
  const [editing, setEditing] = useState(startEditing)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const canEdit = task != null && (task.owner_id === me.id || me.role === 'admin')

  if (editing && task && canEdit) {
    const submit = (input: TaskInput) =>
      update.mutate(
        { id, ...input },
        {
          onSuccess: () => {
            toast('Changes saved')
            setEditing(false)
          },
        },
      )
    return (
      <Drawer
        title="Edit task"
        onClose={onClose}
        footer={
          <>
            <button className="btn ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn primary" type="submit" form={TASK_FORM_ID} disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        <TaskForm task={task} projects={options} onSubmit={submit} error={update.isError ? errorMessage(update.error) : null} />
      </Drawer>
    )
  }

  const footer = canEdit ? (
    confirmDelete ? (
      <>
        <span className="muted" style={{ marginRight: 'auto', alignSelf: 'center' }}>
          Delete “{task.title}” and its updates?
        </span>
        <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
          Keep
        </button>
        <button
          className="btn danger"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(id, {
              onSuccess: () => {
                toast('Task deleted')
                onClose()
              },
            })
          }
        >
          Delete task
        </button>
      </>
    ) : (
      <>
        <button className="btn ghost danger" style={{ marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>
          <Trash2 /> Delete
        </button>
        {task.status !== 'done' ? (
          <button className="btn" onClick={() => update.mutate({ id, status: 'done' }, { onSuccess: () => toast('Marked done') })}>
            Mark done
          </button>
        ) : null}
        <button className="btn primary" onClick={() => setEditing(true)}>
          <Pencil /> Edit
        </button>
      </>
    )
  ) : undefined

  return (
    <Drawer title={task ? task.title : 'Task'} onClose={onClose} footer={footer}>
      {isLoading ? (
        <div className="stack">
          <Skel w="60%" h={20} />
          <Skel w="100%" h={120} />
        </div>
      ) : isError || !task ? (
        <ErrorLine what="this task" onRetry={() => refetch()} />
      ) : (
        <TaskDetailBody task={task} canEdit={canEdit} projects={options} />
      )}
    </Drawer>
  )
}

/** Map, move or unmap a task without opening the full edit form. */
export function ProjectPicker({ task, projects }: { task: { id: number; project: ProjectRef | null }; projects: ProjectRef[] }) {
  const update = useUpdateTask()
  const toast = useToast()
  const options =
    task.project && !projects.some((p) => p.id === task.project!.id) ? [task.project, ...projects] : projects
  return (
    <select
      className="select inline-select"
      value={task.project?.id ?? ''}
      disabled={update.isPending}
      aria-label="Project"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const value = e.target.value === '' ? null : Number(e.target.value)
        const name = options.find((p) => p.id === value)?.name
        update.mutate(
          { id: task.id, project_id: value },
          {
            onSuccess: () => toast(name ? `Moved to ${name}` : 'Removed from its project'),
            onError: (err) => toast(errorMessage(err)),
          },
        )
      }}
    >
      <option value="">No project</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  )
}

function TaskDetailBody({ task, canEdit, projects }: { task: TaskDetail; canEdit: boolean; projects: ProjectRef[] }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        <Person user={task.owner} sub={task.owner.title ?? undefined} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <PriorityMark priority={task.priority} />
          <StatusPill status={task.status} />
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="muted">Progress</span>
          <span className="num">{task.progress_pct}%</span>
        </div>
        <Progress value={task.progress_pct} accent />
      </div>

      <div className="project-row">
        <span className="muted">Project</span>
        {canEdit ? <ProjectPicker task={task} projects={projects} /> : <ProjectChip project={task.project} />}
      </div>

      <dl className="facts">
        <div>
          <dt>Due</dt>
          <dd className={task.is_overdue ? 'overdue' : ''}>
            {task.due_date ? dueLabel(task.due_date, task.status === 'done') : <span className="dash">—</span>}
          </dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{task.start_date ? fmtDay(task.start_date) : <span className="dash">—</span>}</dd>
        </div>
        <div>
          <dt>Finished</dt>
          <dd>{task.completed_at ? fmtDay(task.completed_at) : <span className="dash">—</span>}</dd>
        </div>
        <div>
          <dt>Updates</dt>
          <dd>{task.updates.length}</dd>
        </div>
      </dl>

      {task.pending_notes ? (
        <>
          <h3 className="section-title">What's pending</h3>
          <div className="note-box">{task.pending_notes}</div>
        </>
      ) : null}

      {task.description ? (
        <>
          <h3 className="section-title">Details</h3>
          <p className="prose">{task.description}</p>
        </>
      ) : null}

      {task.tags.length ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          {task.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
      ) : null}

      <h3 className="section-title">What was worked on</h3>
      {canEdit ? <PostUpdateForm taskId={task.id} /> : null}
      <UpdateTimeline task={task} canEdit={canEdit} />
    </>
  )
}

interface UpdateValues {
  date: string
  note: string
}

/** "What did you work on?" — one note for one day. */
export function PostUpdateForm({ taskId, onDone, autoFocus }: { taskId: number; onDone?: () => void; autoFocus?: boolean }) {
  const add = useAddUpdate()
  const toast = useToast()
  const today = isoDate()
  const { register, handleSubmit, reset, formState } = useForm<UpdateValues>({ defaultValues: { date: today, note: '' } })
  const submit = (v: UpdateValues) =>
    add.mutate(
      { taskId, date: v.date, note: v.note.trim() },
      {
        onSuccess: () => {
          toast(v.date === today ? 'Update posted for today' : `Update posted for ${fmtDay(v.date)}`)
          reset({ date: v.date, note: '' })
          onDone?.()
        },
      },
    )
  return (
    <form className="update-form" onSubmit={handleSubmit(submit)} noValidate>
      <label className="field">
        <span className="sr-only">What did you work on?</span>
        <textarea
          className="textarea"
          rows={2}
          autoFocus={autoFocus}
          placeholder="What did you work on? e.g. Wrote the migration script and tested it on a copy of production"
          aria-invalid={formState.errors.note ? 'true' : 'false'}
          {...register('note', { validate: (v) => v.trim().length > 0 || 'Write what you worked on' })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(submit)()
          }}
        />
      </label>
      <div className="update-form-foot">
        <label className="field">
          <span className="sr-only">Day</span>
          <input type="date" className="input" max={today} {...register('date', { required: true })} />
        </label>
        {formState.errors.note ? <span className="error">{formState.errors.note.message}</span> : <span />}
        <button className="btn primary" type="submit" disabled={add.isPending}>
          {add.isPending ? 'Posting…' : 'Post update'}
        </button>
      </div>
      {add.isError ? <p className="form-error">{errorMessage(add.error)}</p> : null}
    </form>
  )
}

function UpdateTimeline({ task, canEdit }: { task: TaskDetail; canEdit: boolean }) {
  const del = useDeleteUpdate()
  if (task.updates.length === 0) return <div className="empty">No updates on this task yet.</div>
  // Group by day, newest first (the API already orders them).
  const days: { date: string; items: TaskDetail['updates'] }[] = []
  for (const u of task.updates) {
    const last = days[days.length - 1]
    if (last && last.date === u.date) last.items.push(u)
    else days.push({ date: u.date, items: [u] })
  }
  return (
    <ol className="timeline">
      {days.map((d) => (
        <li key={d.date}>
          <time dateTime={d.date}>{fmtDayLong(d.date)}</time>
          <ul>
            {d.items.map((u) => (
              <li key={u.id}>
                <p>{u.note}</p>
                {canEdit ? (
                  <button
                    className="icon-btn"
                    aria-label={`Remove the update from ${fmtDay(u.date)}`}
                    onClick={() => del.mutate({ taskId: task.id, updateId: u.id })}
                  >
                    <Trash2 />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}
