import { Clock, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeaderboard, useOverview, useTasks } from '../api/hooks'
import type { MemberSnapshot, TeamOverview } from '../api/types'
import { useMe } from '../auth/AuthContext'
import { BarChart } from '../components/BarChart'
import { LogHoursForm, useTaskDrawer } from '../components/TaskDrawer'
import { AchievementIcon, Avatar, Dialog, Empty, ErrorLine, Progress, Skel, StatusPill } from '../components/ui'
import { daysFromToday, dueLabel, firstName, fmtHours, fmtInt, fmtRelative, greetingWord, isoDate, plural } from '../lib/format'

const WEEK_HOURS = 40

/** One sentence of today's state, built from the data. */
function finding(ov: TeamOverview, meId: number): string {
  const blocked = ov.status_counts.blocked
  const parts: string[] = []
  if (blocked) parts.push(`${plural(blocked, 'task')} ${blocked === 1 ? 'is' : 'are'} blocked`)
  if (ov.overdue) parts.push(`${fmtInt(ov.overdue)} overdue`)
  if (parts.length) return parts.join(', ') + '.'
  const working = ov.members.filter((m) => m.current_task && m.user.id !== meId).length
  if (working) return `${plural(working, 'teammate')} on something, nothing stuck.`
  return 'Nothing is stuck.'
}

export default function Home() {
  const me = useMe()
  const { data: ov, isLoading, isError, refetch } = useOverview()
  const { open } = useTaskDrawer()
  const [logging, setLogging] = useState(false)

  return (
    <>
      <div className="title-row">
        <div>
          <h1 className="greeting">
            {greetingWord()}, {firstName(me.full_name)}.{' '}
            {ov ? <em>{finding(ov, me.id)}</em> : null}
          </h1>
          <p className="sub">
            {new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())} · week{' '}
            {weekNumber()}
          </p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setLogging(true)}>
            <Clock /> Log hours
          </button>
          <button className="btn primary" onClick={() => open('new')}>
            <Plus /> New task
          </button>
        </div>
      </div>

      {isError ? (
        <div className="panel">
          <ErrorLine what="the team overview" onRetry={() => refetch()} />
        </div>
      ) : (
        <div className="grid">
          <div className="span-12">
            <Kpis ov={ov} loading={isLoading} />
          </div>
          <section className="panel span-9" aria-labelledby="floor-h">
            <div className="panel-head">
              <h2 id="floor-h">On the floor</h2>
              <span className="meta">Current task · hours this week of {WEEK_HOURS} h</span>
            </div>
            <Floor members={ov?.members} loading={isLoading} meId={me.id} />
          </section>
          <Standings meId={me.id} />
          <section className="panel white span-6" aria-labelledby="hours-h">
            <div className="panel-head">
              <h2 id="hours-h">Team hours, last 14 days</h2>
              <span className="meta">This week in colour</span>
            </div>
            {ov ? <DailyHours ov={ov} /> : <Skel w="100%" h={200} />}
          </section>
          <section className="panel span-6" aria-labelledby="ach-h">
            <div className="panel-head">
              <h2 id="ach-h">Recently earned</h2>
              <Link to="/achievements" className="link">
                All achievements
              </Link>
            </div>
            <Feed ov={ov} />
          </section>
          <section className="panel span-12" aria-labelledby="mine-h">
            <div className="panel-head">
              <h2 id="mine-h">Your open tasks</h2>
              <Link to="/my-work" className="link">
                Open board
              </Link>
            </div>
            <MyOpenTasks />
          </section>
        </div>
      )}
      {logging ? <QuickLog onClose={() => setLogging(false)} /> : null}
    </>
  )
}

function weekNumber(d = new Date()): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

function mondayIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return isoDate(d)
}

function sameDaysLastWeek(ov: TeamOverview): number {
  const start = new Date(`${mondayIso()}T00:00:00`)
  start.setDate(start.getDate() - 7)
  const end = new Date()
  end.setDate(end.getDate() - 7)
  const from = isoDate(start)
  const to = isoDate(end)
  return ov.daily_hours.filter((d) => d.date >= from && d.date <= to).reduce((sum, d) => sum + d.hours, 0)
}

function Kpis({ ov, loading }: { ov?: TeamOverview; loading: boolean }) {
  const v = (n: number | undefined, unit?: string) =>
    loading || n == null ? (
      <Skel w={64} h={30} />
    ) : (
      <>
        {unit === 'h' ? fmtHours(n) : fmtInt(n)}
        {unit ? <span className="unit">{unit}</span> : null}
      </>
    )
  // Compare with the same days of last week (Mon..today-7), not all of last week.
  const lastWeekToDate = ov ? sameDaysLastWeek(ov) : 0
  const diff = ov ? Math.round((ov.hours_this_week - lastWeekToDate) * 10) / 10 : 0
  return (
    <div className="kpis">
      <div className="kpi">
        <div className="kpi-label">Hours logged this week</div>
        <div className="kpi-value num">{v(ov?.hours_this_week, 'h')}</div>
        <div className="kpi-note num">
          {ov ? (
            lastWeekToDate === 0 ? (
              <>0 h by this point last week</>
            ) : (
              <>
                {diff > 0 ? '+' : diff < 0 ? '−' : '±'}
                {fmtHours(Math.abs(diff))} h vs this point last week
              </>
            )
          ) : (
            ' '
          )}
        </div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Finished this week</div>
        <div className="kpi-value num">{v(ov?.completed_this_week)}</div>
        <div className="kpi-note">{ov ? `${fmtInt(ov.status_counts.done)} done in total` : ' '}</div>
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
    </div>
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
  if (members.length <= 1 && members[0]?.user.id === meId && !members[0]?.current_task)
    return <Empty>No one else is on the team yet. An admin can add people under Members.</Empty>

  // People who are on something first, then by hours this week.
  const sorted = [...members].sort(
    (a, b) => Number(!!b.current_task) - Number(!!a.current_task) || b.hours_this_week - a.hours_this_week,
  )
  return (
    <ul className="floor">
      {sorted.map((m) => {
        const t = m.current_task
        return (
          <li className="lane" key={m.user.id}>
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
              {t ? (
                <>
                  <div className="t">
                    <a href={`?task=${t.id}`} onClick={(e) => (e.preventDefault(), open(t.id))}>
                      {t.title}
                    </a>
                  </div>
                  <div className="s">
                    <Progress value={t.progress_pct} accent />
                    <span className="num">{t.progress_pct}%</span>
                    {t.due_date ? <span className={t.is_overdue ? 'overdue' : ''}>{dueLabel(t.due_date)}</span> : null}
                  </div>
                </>
              ) : (
                <span className="idle">Nothing in progress</span>
              )}
            </div>
            <div className="week">
              <span className="h num">
                {fmtHours(m.hours_this_week)}
                <span className="unit">h</span>
              </span>
              <Progress value={(m.hours_this_week / WEEK_HOURS) * 100} />
            </div>
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

function DailyHours({ ov }: { ov: TeamOverview }) {
  const weekStart = useMemo(mondayIso, [])
  const labels = ov.daily_hours.map((d) => {
    const days = daysFromToday(d.date)
    if (days === 0) return 'Today'
    const dt = new Date(`${d.date}T00:00:00`)
    return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(dt)
  })
  const highlight = ov.daily_hours.map((d, i) => (d.date >= weekStart ? i : -1)).filter((i) => i >= 0)
  return (
    <BarChart
      labels={labels}
      values={ov.daily_hours.map((d) => d.hours)}
      highlight={highlight}
      height={236}
      format={(v) => `${fmtHours(v)} h`}
      label="Hours logged by the team per day over the last 14 days"
    />
  )
}

function Feed({ ov }: { ov?: TeamOverview }) {
  if (!ov) return <Skel w="100%" h={200} />
  const items = ov.recent_achievements.slice(0, 5)
  if (items.length === 0)
    return <Empty>No achievements earned yet. Finishing a first task earns “First Steps”.</Empty>
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
        Nothing open. <button className="link" style={{ background: 'none', borderTop: 0, borderLeft: 0, borderRight: 0, padding: 0 }} onClick={() => open('new')}>Add what you're working on</button>
      </Empty>
    )
  const order = { blocked: 0, in_progress: 1, todo: 2, done: 3 }
  const rows = [...data].sort((a, b) => order[a.status] - order[b.status]).slice(0, 6)
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Task</th>
            <th>Status</th>
            <th className="hide-phone">Due</th>
            <th className="num hide-phone">Progress</th>
            <th className="num">Logged</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="clickable" onClick={() => open(t.id)}>
              <td className="title-cell">
                <b>{t.title}</b>
                {t.pending_notes ? <span>Pending: {t.pending_notes.split('\n')[0]}</span> : null}
              </td>
              <td>
                <StatusPill status={t.status} />
              </td>
              <td className={`hide-phone ${t.is_overdue ? 'overdue' : ''}`}>{t.due_date ? dueLabel(t.due_date) : <span className="dash">—</span>}</td>
              <td className="num hide-phone">{t.progress_pct}%</td>
              <td className="num">{fmtHours(t.hours_logged)} h</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > rows.length ? (
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Showing {rows.length} of {data.length}.
        </p>
      ) : null}
    </div>
  )
}

function QuickLog({ onClose }: { onClose: () => void }) {
  const me = useMe()
  const { data } = useTasks({ owner_id: me.id, status: ['in_progress', 'blocked', 'todo'] })
  const [taskId, setTaskId] = useState<number | null>(null)
  const chosen = taskId ?? data?.find((t) => t.status === 'in_progress')?.id ?? data?.[0]?.id ?? null
  return (
    <Dialog title="Log hours" sub="Add time to one of your open tasks." onClose={onClose}>
      {data && data.length === 0 ? (
        <Empty>You have no open tasks to log against. Add one first.</Empty>
      ) : (
        <div className="form">
          <label className="field">
            <span>Task</span>
            <select className="select" value={chosen ?? ''} onChange={(e) => setTaskId(Number(e.target.value))}>
              {data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          {chosen ? <LogHoursForm key={chosen} taskId={chosen} onDone={onClose} /> : null}
        </div>
      )}
    </Dialog>
  )
}
