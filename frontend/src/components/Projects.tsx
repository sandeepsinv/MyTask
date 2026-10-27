import type { CSSProperties } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { useCreateProject, useUpdateProject } from '../api/hooks'
import type { ProjectSummary, UpdateEntry } from '../api/types'
import { fmtDayLong, fmtInt, plural } from '../lib/format'
import { useTaskDrawer } from './TaskDrawer'
import { useToast } from './Toast'
import { Avatar, Dialog, ProjectChip } from './ui'

/** Project colours: shades of the two brand colours (navy #282B66, orange #E96831). Keep in sync with backend app/brand.py. */
export const PROJECT_COLORS = ['#282b66', '#e96831', '#4f5394', '#b44515', '#7a7db3', '#f2925f', '#14163f', '#5b5d73']

/** One line of "who worked on what": person, note, task (opens the drawer), project and day. */
export function UpdateLine({ u, showProject = true, showDay = true }: { u: UpdateEntry; showProject?: boolean; showDay?: boolean }) {
  const { open } = useTaskDrawer()
  return (
    <li className="update-line">
      <Avatar user={u.user} size="sm" />
      <div className="ul-body">
        <p>
          <b>{u.user.full_name.split(' ')[0]}</b> {u.note}
        </p>
        <div className="ul-meta">
          <a
            href={`?task=${u.task.id}`}
            onClick={(e) => {
              e.preventDefault()
              open(u.task.id)
            }}
          >
            {u.task.title}
          </a>
          {showProject ? <ProjectChip project={u.task.project} /> : null}
        </div>
      </div>
      {showDay ? <time dateTime={u.date}>{fmtDayLong(u.date)}</time> : null}
    </li>
  )
}

export function ProjectCard({ p }: { p: ProjectSummary }) {
  const open = p.total_tasks - p.counts.done
  const donePct = p.total_tasks ? (p.counts.done / p.total_tasks) * 100 : 0
  return (
    <article className="project-card">
      <header>
        <Link to={`/projects/${p.id}`} className="pc-name">
          <i className="pcolor" style={{ '--pc': p.color } as CSSProperties} aria-hidden="true" />
          {p.name}
        </Link>
        {p.last_activity ? <span className="pc-when">{fmtDayLong(p.last_activity)}</span> : null}
      </header>

      <div className="pc-stats">
        <span>
          <b className="num">{fmtInt(open)}</b> open
        </span>
        {p.counts.blocked ? (
          <span className="overdue">
            <b className="num">{fmtInt(p.counts.blocked)}</b> blocked
          </span>
        ) : null}
        <span>
          <b className="num">{fmtInt(p.counts.done)}</b> of {fmtInt(p.total_tasks)} done
        </span>
      </div>
      <div className="track pc-track" aria-label={`${Math.round(donePct)}% of tasks done`}>
        {donePct > 0 ? <i className="pcolor" style={{ width: `${donePct}%`, '--pc': p.color } as CSSProperties} /> : null}
      </div>

      {p.members.length && !p.last_activity ? (
        <p className="muted pc-empty">Nobody has posted an update here yet. Open a task to post what you worked on.</p>
      ) : p.members.length ? (
        <ul className="pc-updates">
          {p.members.slice(0, 3).map((m) => (
            <li key={m.user.id}>
              <Avatar user={m.user} size="sm" />
              <span className="pcu-text">
                <b>{m.user.full_name.split(' ')[0]}</b>{' '}
                {m.last_update ? m.last_update.note : <span className="muted">no updates yet</span>}
              </span>
              {m.last_update ? <time dateTime={m.last_update.date}>{fmtDayLong(m.last_update.date)}</time> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted pc-empty">No tasks yet. Map a task to this project to get started.</p>
      )}

      <footer>
        <span className="avatars" aria-label={plural(p.members.length, 'person', 'people')}>
          {p.members.slice(0, 6).map((m) => (
            <Avatar key={m.user.id} user={m.user} size="sm" />
          ))}
          {p.members.length > 6 ? <span className="more">+{p.members.length - 6}</span> : null}
          <span className="more">{p.members.length ? plural(p.members.length, 'person', 'people') : 'No one yet'}</span>
        </span>
        <Link to={`/projects/${p.id}`} className="link">
          Open
        </Link>
      </footer>
    </article>
  )
}

interface ProjectValues {
  name: string
  description: string
  color: string
}

export function ProjectDialog({ project, onClose, onSaved }: { project?: ProjectSummary; onClose: () => void; onSaved?: (p: ProjectSummary) => void }) {
  const create = useCreateProject()
  const update = useUpdateProject()
  const toast = useToast()
  const mutation = project ? update : create
  const { register, handleSubmit, watch, setValue, formState } = useForm<ProjectValues>({
    defaultValues: {
      name: project?.name ?? '',
      description: project?.description ?? '',
      color: project?.color ?? PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
    },
  })
  const color = watch('color')
  const submit = (v: ProjectValues) => {
    const body = { name: v.name.trim(), description: v.description.trim(), color: v.color }
    const done = (p: ProjectSummary) => {
      toast(project ? 'Project saved' : `${p.name} created`)
      onSaved?.(p)
      onClose()
    }
    if (project) update.mutate({ id: project.id, ...body }, { onSuccess: done })
    else create.mutate(body, { onSuccess: done })
  }
  return (
    <Dialog
      title={project ? 'Edit project' : 'New project'}
      sub={project ? undefined : 'Anyone can map their tasks to it once it exists.'}
      onClose={onClose}
    >
      <form className="form" onSubmit={handleSubmit(submit)} noValidate>
        {mutation.isError ? <div className="form-error" role="alert">{errorMessage(mutation.error)}</div> : null}
        <label className="field">
          <span>Name</span>
          <input
            className="input"
            autoFocus
            placeholder="Billing v2"
            aria-invalid={formState.errors.name ? 'true' : 'false'}
            {...register('name', {
              validate: (v) => v.trim().length > 0 || 'Give the project a name',
              maxLength: { value: 120, message: 'Keep it under 120 characters' },
            })}
          />
          {formState.errors.name ? <span className="error">{formState.errors.name.message}</span> : null}
        </label>
        <label className="field">
          <span>
            Description <span className="hint">optional</span>
          </span>
          <textarea className="textarea" placeholder="What this project is for" {...register('description')} />
        </label>
        <div className="field">
          <span>Colour</span>
          <div className="swatches" role="radiogroup" aria-label="Colour">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                style={{ background: c }}
                onClick={() => setValue('color', c)}
              />
            ))}
          </div>
        </div>
        <div className="dfoot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={mutation.isPending}>
            {project ? 'Save' : 'Create project'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
