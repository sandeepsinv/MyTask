import { useForm } from 'react-hook-form'
import type { ProjectRef, Task, TaskInput } from '../api/types'
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from './ui'

interface FormValues {
  title: string
  description: string
  status: TaskInput['status']
  priority: TaskInput['priority']
  project_id: string
  start_date: string
  due_date: string
  progress_pct: number
  pending_notes: string
  tags: string
}

export function toFormValues(task?: Task | null, defaultProjectId?: number | null): FormValues {
  const projectId = task ? task.project_id : defaultProjectId
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? 'todo',
    priority: task?.priority ?? 'medium',
    project_id: projectId != null ? String(projectId) : '',
    start_date: task?.start_date ?? '',
    due_date: task?.due_date ?? '',
    progress_pct: task?.progress_pct ?? 0,
    pending_notes: task?.pending_notes ?? '',
    tags: task?.tags.join(', ') ?? '',
  }
}

export function toInput(v: FormValues): TaskInput {
  return {
    title: v.title.trim(),
    description: v.description.trim(),
    status: v.status,
    priority: v.priority,
    project_id: v.project_id === '' ? null : Number(v.project_id),
    start_date: v.start_date || null,
    due_date: v.due_date || null,
    progress_pct: Number(v.progress_pct),
    pending_notes: v.pending_notes.trim(),
    tags: v.tags
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean),
  }
}

export const TASK_FORM_ID = 'task-form'

/** The fields of a task. The submit button lives in the drawer footer and targets this form by id. */
export function TaskForm({
  task,
  projects,
  defaultProjectId,
  onSubmit,
  error,
}: {
  task?: Task | null
  /** Active projects to choose from. */
  projects: ProjectRef[]
  defaultProjectId?: number | null
  onSubmit: (input: TaskInput) => void
  error?: string | null
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setValue,
  } = useForm<FormValues>({ defaultValues: toFormValues(task, defaultProjectId) })

  register('progress_pct')
  const progress = watch('progress_pct')
  const start = watch('start_date')

  const options =
    task?.project && !projects.some((p) => p.id === task.project!.id) ? [task.project, ...projects] : projects

  return (
    <form id={TASK_FORM_ID} className="form" onSubmit={handleSubmit((v) => onSubmit(toInput(v)))} noValidate>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <label className="field">
        <span>What are you working on?</span>
        <input
          className="input"
          autoFocus
          placeholder="Migrate invoices to the new API"
          aria-invalid={errors.title ? 'true' : 'false'}
          {...register('title', {
            validate: (v) => v.trim().length > 0 || 'Give the task a title',
            maxLength: { value: 200, message: 'Keep the title under 200 characters' },
          })}
        />
        {errors.title ? <span className="error">{errors.title.message}</span> : null}
      </label>

      <label className="field">
        <span>Project</span>
        <select className="select" {...register('project_id')}>
          <option value="">No project</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.status === 'archived' ? ' (archived)' : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="form-row">
        <label className="field">
          <span>Status</span>
          <select className="select" {...register('status')}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Priority</span>
          <select className="select" {...register('priority')}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-row">
        <label className="field">
          <span>Start date</span>
          <input type="date" className="input" {...register('start_date')} />
        </label>
        <label className="field">
          <span>Due date</span>
          <input
            type="date"
            className="input"
            aria-invalid={errors.due_date ? 'true' : 'false'}
            {...register('due_date', {
              validate: (v) => !v || !start || v >= start || 'Due date is before the start date',
            })}
          />
          {errors.due_date ? <span className="error">{errors.due_date.message}</span> : null}
        </label>
      </div>

      <label className="field">
        <span>
          Progress <span className="hint num">{progress}%</span>
        </span>
        {/* Controlled so an untouched slider submits its real value, not the browser's midpoint. */}
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          style={{ height: 32, accentColor: 'var(--accent)' }}
          value={progress}
          onChange={(e) => setValue('progress_pct', Number(e.target.value), { shouldDirty: true })}
          aria-label="Progress"
        />
      </label>

      <label className="field">
        <span>Details</span>
        <textarea className="textarea" placeholder="Context, links, acceptance criteria" {...register('description')} />
      </label>

      <label className="field">
        <span>
          What's pending <span className="hint">— what's left, or what you're waiting on</span>
        </span>
        <textarea className="textarea" placeholder="Waiting on the finance team's sign-off" {...register('pending_notes')} />
      </label>

      <label className="field">
        <span>
          Tags <span className="hint">comma separated</span>
        </span>
        <input className="input" placeholder="billing, backend" {...register('tags')} />
      </label>
    </form>
  )
}
