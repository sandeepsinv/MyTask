import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { useAddLog, useCreateTask, useDeleteLog, useDeleteTask, useTask, useUpdateTask } from '../api/hooks'
import type { TaskDetail, TaskInput } from '../api/types'
import { useMe } from '../auth/AuthContext'
import { dueLabel, fmtDay, fmtHours, isoDate } from '../lib/format'
import { TASK_FORM_ID, TaskForm } from './TaskForm'
import { useToast } from './Toast'
import { Drawer, ErrorLine, Person, PriorityMark, Progress, Skel, StatusPill } from './ui'

/** Opens task drawers from the URL: ?task=12 shows a task, ?task=new creates one. */
export function useTaskDrawer() {
  const [params, setParams] = useSearchParams()
  const open = (id: number | 'new') =>
    setParams((p) => {
      p.set('task', String(id))
      p.delete('edit')
      return p
    })
  return { open, current: params.get('task') }
}

export function TaskDrawerHost() {
  const [params, setParams] = useSearchParams()
  const value = params.get('task')
  if (!value) return null
  const close = () =>
    setParams((p) => {
      p.delete('task')
      p.delete('edit')
      return p
    })
  if (value === 'new') return <NewTaskDrawer onClose={close} />
  const id = Number(value)
  if (!Number.isInteger(id)) return null
  return <TaskDetailDrawer key={id} id={id} onClose={close} startEditing={params.get('edit') === '1'} />
}

function NewTaskDrawer({ onClose }: { onClose: () => void }) {
  const create = useCreateTask()
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
      <TaskForm onSubmit={submit} error={create.isError ? errorMessage(create.error) : null} />
    </Drawer>
  )
}

function TaskDetailDrawer({ id, onClose, startEditing }: { id: number; onClose: () => void; startEditing: boolean }) {
  const me = useMe()
  const { data: task, isLoading, isError, refetch } = useTask(id)
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
        <TaskForm task={task} onSubmit={submit} error={update.isError ? errorMessage(update.error) : null} />
      </Drawer>
    )
  }

  const footer = canEdit ? (
    confirmDelete ? (
      <>
        <span className="muted" style={{ marginRight: 'auto', alignSelf: 'center' }}>
          Delete “{task.title}” and its logged hours?
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
        <TaskDetailBody task={task} canEdit={canEdit} />
      )}
    </Drawer>
  )
}

function TaskDetailBody({ task, canEdit }: { task: TaskDetail; canEdit: boolean }) {
  const est = task.estimated_hours
  const over = est != null && task.hours_logged > est
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

      <dl className="facts">
        <div>
          <dt>Logged</dt>
          <dd>
            {fmtHours(task.hours_logged)} h{est != null ? <span className="muted"> of {fmtHours(est)} h</span> : null}
          </dd>
        </div>
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
      </dl>
      {over ? (
        <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
          {fmtHours(task.hours_logged - (est ?? 0))} h over the estimate.
        </p>
      ) : null}

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

      <h3 className="section-title">
        Time logged <span className="muted num" style={{ fontWeight: 400 }}>{fmtHours(task.hours_logged)} h</span>
      </h3>
      {canEdit ? <LogHoursForm taskId={task.id} /> : null}
      <WorkLogList task={task} canEdit={canEdit} />
    </>
  )
}

interface LogValues {
  date: string
  hours: string
  note: string
}

export function LogHoursForm({ taskId, onDone }: { taskId: number; onDone?: () => void }) {
  const add = useAddLog()
  const toast = useToast()
  const today = isoDate()
  const { register, handleSubmit, reset, formState } = useForm<LogValues>({
    defaultValues: { date: today, hours: '', note: '' },
  })
  const submit = (v: LogValues) =>
    add.mutate(
      { taskId, date: v.date, hours: Number(v.hours), note: v.note.trim() },
      {
        onSuccess: () => {
          toast(`Logged ${fmtHours(Number(v.hours))} h`)
          reset({ date: v.date, hours: '', note: '' })
          onDone?.()
        },
      },
    )
  return (
    <form onSubmit={handleSubmit(submit)} style={{ marginBottom: 12 }} noValidate>
      <div className="log-form">
        <label className="field">
          <span className="sr-only">Date</span>
          <input type="date" className="input" max={today} {...register('date', { required: true })} />
        </label>
        <label className="field">
          <span className="sr-only">Hours</span>
          <input
            type="number"
            className="input"
            placeholder="Hours"
            step={0.25}
            min={0.25}
            max={24}
            aria-invalid={formState.errors.hours ? 'true' : 'false'}
            {...register('hours', { validate: (v) => (Number(v) > 0 && Number(v) <= 24) || 'Between 0 and 24 hours' })}
          />
        </label>
        <label className="field note">
          <span className="sr-only">Note</span>
          <input className="input" placeholder="What did you do?" {...register('note')} />
        </label>
        <button className="btn primary" type="submit" disabled={add.isPending} style={{ height: 40 }}>
          Log
        </button>
      </div>
      {formState.errors.hours ? <p className="error" style={{ color: 'var(--negative)', fontSize: 12, marginTop: 6 }}>{formState.errors.hours.message}</p> : null}
      {add.isError ? <p className="form-error" style={{ marginTop: 8 }}>{errorMessage(add.error)}</p> : null}
    </form>
  )
}

function WorkLogList({ task, canEdit }: { task: TaskDetail; canEdit: boolean }) {
  const del = useDeleteLog()
  if (task.logs.length === 0) return <div className="empty">No time logged on this task yet.</div>
  return (
    <ul className="rows">
      {task.logs.map((log) => (
        <li key={log.id} className="row" style={{ minHeight: 44 }}>
          <span className="num muted" style={{ width: 56, flex: 'none' }}>
            {fmtDay(log.date)}
          </span>
          <span className="grow" style={{ minWidth: 0 }}>
            {log.note ? log.note : <span className="dash">—</span>}
          </span>
          <span className="end">{fmtHours(log.hours)} h</span>
          {canEdit ? (
            <button
              className="icon-btn"
              aria-label={`Remove ${fmtHours(log.hours)} h on ${fmtDay(log.date)}`}
              onClick={() => del.mutate({ taskId: task.id, logId: log.id })}
            >
              <Trash2 />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
