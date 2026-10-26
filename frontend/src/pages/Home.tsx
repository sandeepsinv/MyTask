import { FolderInput, NotebookPen, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeaderboard, useMyStats, useOverview, useProjects, useTasks } from '../api/hooks'
import type { MemberSnapshot, TeamOverview } from '../api/types'
import { useMe } from '../auth/AuthContext'
import { ProjectCard, ProjectDialog } from '../components/Projects'
import { PostUpdateForm, useTaskDrawer } from '../components/TaskDrawer'
import { AchievementIcon, Avatar, Dialog, Empty, ErrorLine, ProjectChip, Skel, StatusPill } from '../components/ui'
import { dueLabel, firstName, fmtDayLong, fmtInt, fmtRelative, greetingWord, plural } from '../lib/format'

/** One sentence of today's state, built from the data. */
function finding(ov: TeamOverview): string {
  const blocked = ov.status_counts.blocked
  const posted = `${fmtInt(ov.people_updated_today)} of ${fmtInt(ov.people)} posted today`
  if (blocked) return `${posted}, ${plural(blocked, 'task')} blocked.`
  return `${posted}.`
}

export default function Home() {
  const me = useMe()
  const { data: ov, isLoading, isError, refetch } = useOverview()
  const { data: mine } = useMyStats()
  const { open } = useTaskDrawer()
  const [posting, setPosting] = useState(false)

  return (
    <>
      <div className="title-row">
        <div>
          <h1 className="greeting">
            {greetingWord()}, {firstName(me.full_name)}. {ov ? <em>{finding(ov)}</em> : null}
          </h1>
          <p className="sub">
            {new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
            {mine ? (mine.updated_today ? ' · you posted today' : " · you haven't posted today") : ''}
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => open('new')}>
            <Plus /> New task
          </button>
          <button className="btn primary" onClick={() => setPosting(true)}>
            <NotebookPen /> Post today's update
          </button>
        </div>
      </div>

      {isError ? (
        <div className="panel">
          <ErrorLine what="the team overview" onRetry={() => refetch()} />
        </div>
      ) : (
        <div className="grid">
          {mine && mine.unmapped_tasks > 0 ? (
            <div className="notice span-12" role="status">
              <FolderInput aria-hidden="true" />
              <span className="grow">
                {mine.unmapped_tasks === 1 ? 'One of your open tasks has' : `${fmtInt(mine.unmapped_tasks)} of your open tasks have`} no
                project yet.
              </span>
              <Link className="link" to="/my-work?project=none">
                Map {mine.unmapped_tasks === 1 ? 'it' : 'them'}
              </Link>
            </div>
          ) : null}
          <div className="span-12">
            <Kpis ov={ov} loading={isLoading} />
          </div>
          <ProjectsPanel />
          <section className="panel span-9" aria-labelledby="floor-h">
            <div className="panel-head">
              <h2 id="floor-h">What everyone's on</h2>
              <Link to="/daily" className="link">
                Today's updates
              </Link>
            </div>
            <Floor members={ov?.members} loading={isLoading} meId={me.id} />
          </section>
          <Standings meId={me.id} />
          <section className="panel span-7" aria-labelledby="mine-h">
            <div className="panel-head">
              <h2 id="mine-h">Your open tasks</h2>
              <Link to="/my-work" className="link">
                Open board
              </Link>
            </div>
            <MyOpenTasks />
          </section>
          <section className="panel span-5" aria-labelledby="ach-h">
            <div className="panel-head">
              <h2 id="ach-h">Recently earned</h2>
              <Link to="/achievements" className="link">
                All achievements
              </Link>
            </div>
            <Feed ov={ov} />
          </section>
        </div>
      )}
      {posting ? <QuickUpdate onClose={() => setPosting(false)} /> : null}
    </>
  )
}

function Kpis({ ov, loading }: { ov?: TeamOverview; loading: boolean }) {
  const v = (n: number | undefined) => (loading || n == null ? <Skel w={56} h={30} /> : fmtInt(n))
  return (
    <div className="kpis">
      <div className="kpi">
        <div className="kpi-label">Posted an update today</div>
        <div className="kpi-value num">
          {v(ov?.people_updated_today)}
          {ov ? <span className="unit">of {fmtInt(ov.people)}</span> : null}
        </div>
        <div className="kpi-note">{ov ? plural(ov.updates_today, 'update') + ' so far' : ' '}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">In progress</div>
        <div className="kpi-value num">{v(ov?.status_counts.in_progress)}</div>
        <div className="kpi-note">{ov ? `${fmtInt(ov.status_counts.todo)} up next` : ' '}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Blocked</div>
        <div className="kpi-value num">{v(ov?.status_counts.blocked)}</div>
        <div className="kpi-note">
          {ov ? ov.overdue ? <span className="bad">{plural(ov.overdue, 'task')} overdue</span> : 'Nothing overdue' : ' '}
        </div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Finished this week</div>
        <div className="kpi-value num">{v(ov?.completed_this_week)}</div>
        <div className="kpi-note">{ov ? `${fmtInt(ov.status_counts.done)} done in total` : ' '}</div>
      </div>
    </div>
  )
}

function ProjectsPanel() {
  const { data, isLoading, isError, refetch } = useProjects('active')
  const [creating, setCreating] = useState(false)
  const shown = data?.slice(0, 6) ?? []
  return (
    <section className="panel span-12" aria-labelledby="projects-h">
      <div className="panel-head">
        <h2 id="projects-h">Projects</h2>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <button className="link" style={{ background: 'none', borderTop: 0, borderLeft: 0, borderRight: 0, padding: 0 }} onClick={() => setCreating(true)}>
            New project
          </button>
          <Link to="/projects" className="link">
            {data && data.length > shown.length ? `All ${fmtInt(data.length)} projects` : 'All projects'}
          </Link>
        </div>
      </div>
      {isError ? (
        <ErrorLine what="projects" onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="project-grid">
          {[0, 1, 2].map((i) => (
            <Skel key={i} w="100%" h={220} />
          ))}
        </div>
      ) : data.length === 0 ? (
        <Empty>
          No projects yet.{' '}
          <button className="link" style={{ background: 'none', borderTop: 0, borderLeft: 0, borderRight: 0, padding: 0 }} onClick={() => setCreating(true)}>
            Create the first one
          </button>{' '}
          and map tasks to it.
        </Empty>
      ) : (
        <div className="project-grid">
          {shown.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      )}
      {creating ? <ProjectDialog onClose={() => setCreating(false)} /> : null}
    </section>
  )
}

function Floor({ members, loading, meId }: { members?: MemberSnapshot[]; loading: boolean; meId: number }) {
  const { open } = useTaskDrawer()
  if (loading || !members)
    return (
      <div className="floor">
        {[0, 1, 2, 3].map((i) => (
          <div className="lane" key={i}>
            <Skel w={140} h={32} />
            <Skel w="70%" />
            <Skel w={120} />
          </div>
        ))}
      </div>
    )
  if (members.length <= 1 && !members[0]?.current_task)
    return <Empty>No one else is on the team yet. An admin can add people under Members.</Empty>

  // Who posted today first, then whoever is on something.
  const sorted = [...members].sort(
    (a, b) =>
      Number(b.updated_today) - Number(a.updated_today) ||
      Number(!!b.current_task) - Number(!!a.current_task) ||
      (b.latest_update?.date ?? '').localeCompare(a.latest_update?.date ?? ''),
  )
  return (
    <ul className="floor">
      {sorted.map((m) => {
        const t = m.current_task
        const u = m.latest_update
        return (
          <li className="lane lane-updates" key={m.user.id}>
            <span className="person">
              <Avatar user={m.user} />
              <span style={{ minWidth: 0 }}>
                <span className="name" style={{ display: 'block' }}>
                  {m.user.full_name}
                  {m.user.id === meId ? <span className="muted" style={{ fontWeight: 400 }}> (you)</span> : null}
                </span>
                <span className="role" style={{ display: 'block' }}>
                  {plural(m.open_tasks, 'open task')}
                  {m.blocked_tasks ? <span className="overdue"> · {fmtInt(m.blocked_tasks)} blocked</span> : null}
                </span>
              </span>
            </span>
            <div className="doing">
              {u ? (
                <p className="said">{u.note}</p>
              ) : (
                <p className="idle">No updates yet</p>
              )}
              <div className="s">
                {t ? (
                  <>
                    <a href={`?task=${t.id}`} onClick={(e) => (e.preventDefault(), open(t.id))}>
                      {t.title}
                    </a>
                    <ProjectChip project={t.project} />
                    {t.due_date ? <span className={t.is_overdue ? 'overdue' : ''}>{dueLabel(t.due_date)}</span> : null}
                  </>
                ) : (
                  <span>Nothing in progress</span>
                )}
              </div>
            </div>
            <div className={`when ${m.updated_today ? 'today' : ''}`}>{u ? fmtDayLong(u.date) : '—'}</div>
          </li>
        )
      })}
    </ul>
  )
}

function Standings({ meId }: { meId: number }) {
  const { data, isLoading, isError, refetch } = useLeaderboard('week')
  const rows = data?.slice(0, 8) ?? []
  const mine = data?.find((r) => r.user.id === meId)
  return (
    <section className="panel span-3 fill" aria-labelledby="stand-h">
      <div className="panel-head">
        <h2 id="stand-h">This week's standings</h2>
      </div>
      {isError ? (
        <ErrorLine what="standings" onRetry={() => refetch()} />
      ) : isLoading ? (
        <Skel w="100%" h={200} />
      ) : rows.length === 0 ? (
        <Empty>No scores yet.</Empty>
      ) : (
        <ol className="rows spread">
          {rows.map((r) => (
            <li key={r.user.id} className="row" style={{ minHeight: 44, gap: 10 }}>
              <span className={`rank num ${r.rank === 1 ? 'first' : ''}`}>{r.rank}</span>
              <Avatar user={r.user} size="sm" />
              <span className="grow line1" style={{ fontWeight: r.user.id === meId ? 600 : 500 }}>
                {firstName(r.user.full_name)}
              </span>
              <span className="end num">{fmtInt(r.score)}</span>
            </li>
          ))}
        </ol>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {mine && mine.rank > 8 ? `You're #${mine.rank} with ${fmtInt(mine.score)} pts` : 'Points this week'}
        </span>
        <Link to="/leaderboard" className="link">
          Full board
        </Link>
      </div>
    </section>
  )
}

function Feed({ ov }: { ov?: TeamOverview }) {
  if (!ov) return <Skel w="100%" h={200} />
  const items = ov.recent_achievements.slice(0, 5)
  if (items.length === 0) return <Empty>No achievements earned yet. Finishing a first task earns “First Steps”.</Empty>
  return (
    <ul>
      {items.map((a) => (
        <li key={`${a.user.id}-${a.achievement.key}`} className={`feed-item tier-${a.achievement.tier}`}>
          <span className="fi">
            <AchievementIcon name={a.achievement.icon} />
          </span>
          <span className="ft">
            <b style={{ fontWeight: 500 }}>{firstName(a.user.full_name)}</b> <span>earned</span>{' '}
            <b style={{ fontWeight: 500 }}>{a.achievement.name}</b>
            <span className="num"> · +{a.achievement.points}</span>
          </span>
          <time dateTime={a.awarded_at}>{fmtRelative(a.awarded_at)}</time>
        </li>
      ))}
    </ul>
  )
}

function MyOpenTasks() {
  const me = useMe()
  const { open } = useTaskDrawer()
  const { data, isLoading, isError, refetch } = useTasks({ owner_id: me.id, status: ['in_progress', 'blocked', 'todo'] })
  if (isError) return <ErrorLine what="your tasks" onRetry={() => refetch()} />
  if (isLoading || !data) return <Skel w="100%" h={120} />
  if (data.length === 0)
    return (
      <Empty>
        Nothing open.{' '}
        <button className="link" style={{ background: 'none', borderTop: 0, borderLeft: 0, borderRight: 0, padding: 0 }} onClick={() => open('new')}>
          Add what you're working on
        </button>
      </Empty>
    )
  const order = { blocked: 0, in_progress: 1, todo: 2, done: 3 }
  const rows = [...data].sort((a, b) => order[a.status] - order[b.status]).slice(0, 5)
  return (
    <ul className="rows">
      {rows.map((t) => (
        <li key={t.id} className="row clickable-row" onClick={() => open(t.id)}>
          <div className="grow">
            <div className="line1">{t.title}</div>
            <div className="line2" style={{ display: 'flex', gap: 12 }}>
              <ProjectChip project={t.project} />
              <span>{t.last_update ? `Last update ${fmtDayLong(t.last_update.date).toLowerCase()}` : 'No updates yet'}</span>
            </div>
          </div>
          <StatusPill status={t.status} />
        </li>
      ))}
      {data.length > rows.length ? (
        <li className="muted" style={{ fontSize: 12, paddingTop: 10 }}>
          and {fmtInt(data.length - rows.length)} more on your board
        </li>
      ) : null}
    </ul>
  )
}

function QuickUpdate({ onClose }: { onClose: () => void }) {
  const me = useMe()
  const { data } = useTasks({ owner_id: me.id, status: ['in_progress', 'blocked', 'todo'] })
  const [taskId, setTaskId] = useState<number | null>(null)
  const chosen = taskId ?? data?.find((t) => t.status === 'in_progress')?.id ?? data?.[0]?.id ?? null
  return (
    <Dialog title="What did you work on?" sub="Post a note on one of your open tasks." onClose={onClose}>
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
