import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useProjects, useTasks } from '../api/hooks'
import type { ProjectRef } from '../api/types'
import { useMe } from '../auth/AuthContext'
import { ProjectCard, ProjectDialog } from '../components/Projects'
import { ProjectPicker, useTaskDrawer } from '../components/TaskDrawer'
import { Avatar, Empty, ErrorLine, Skel, StatusPill } from '../components/ui'
import { fmtInt, plural } from '../lib/format'

export default function Projects() {
  const [state, setState] = useState<'active' | 'archived'>('active')
  const { data, isLoading, isError, refetch } = useProjects(state)
  const [creating, setCreating] = useState(false)

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Projects</h1>
          <p className="sub">{data ? `${plural(data.length, `${state} project`)}, most recently active first` : ' '}</p>
        </div>
        <div className="actions">
          <div className="segmented" role="group" aria-label="Show">
            <button aria-pressed={state === 'active'} onClick={() => setState('active')}>
              Active
            </button>
            <button aria-pressed={state === 'archived'} onClick={() => setState('archived')}>
              Archived
            </button>
          </div>
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Plus /> New project
          </button>
        </div>
      </div>

      {isError ? (
        <div className="panel">
          <ErrorLine what="projects" onRetry={() => refetch()} />
        </div>
      ) : isLoading || !data ? (
        <div className="project-grid">
          {[0, 1, 2].map((i) => (
            <Skel key={i} w="100%" h={240} />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="panel">
          <Empty>{state === 'active' ? 'No active projects. Create one and map tasks to it.' : 'No archived projects.'}</Empty>
        </div>
      ) : (
        <div className="project-grid">
          {data.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      )}

      {state === 'active' && data ? <Unmapped projects={data.map(({ id, name, color, status }) => ({ id, name, color, status }))} /> : null}
      {creating ? <ProjectDialog onClose={() => setCreating(false)} /> : null}
    </>
  )
}

/** Open tasks across the team that have no project yet; owners can map them right here. */
function Unmapped({ projects }: { projects: ProjectRef[] }) {
  const me = useMe()
  const { open } = useTaskDrawer()
  const { data } = useTasks({ unmapped: true, status: ['todo', 'in_progress', 'blocked'] })
  if (!data || data.length === 0) return null
  const rows = [...data].sort((a, b) => Number(b.owner_id === me.id) - Number(a.owner_id === me.id))
  return (
    <section className="panel" style={{ marginTop: 'var(--gap)' }} aria-labelledby="unmapped-h">
      <div className="panel-head">
        <h2 id="unmapped-h">Tasks without a project</h2>
        <span className="meta">{fmtInt(data.length)} open · owners can map them here</span>
      </div>
      <ul className="rows">
        {rows.map((t) => {
          const canEdit = t.owner_id === me.id || me.role === 'admin'
          return (
            <li key={t.id} className="row">
              <Avatar user={t.owner} size="sm" />
              <button className="grow line1 text-btn" onClick={() => open(t.id)}>
                {t.title}
              </button>
              <StatusPill status={t.status} />
              {canEdit ? <ProjectPicker task={t} projects={projects} /> : <span className="muted" style={{ fontSize: 12 }}>{t.owner.full_name}</span>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
