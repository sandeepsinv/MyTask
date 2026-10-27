import { Flame } from 'lucide-react'
import { useState } from 'react'
import { useLeaderboard } from '../api/hooks'
import type { LeaderboardEntry, Period, ScoreBreakdown } from '../api/types'
import { useMe } from '../auth/AuthContext'
import { Avatar, Empty, ErrorLine, Person, Skel } from '../components/ui'
import { firstName, fmtInt, plural } from '../lib/format'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'All time' },
]

// One hue at four intensities plus ink: the parts of one score, not separate subjects.
const PARTS: { key: keyof ScoreBreakdown; label: string; color: string }[] = [
  { key: 'tasks', label: 'Tasks', color: 'var(--accent)' },
  { key: 'on_time', label: 'On time', color: 'color-mix(in srgb, var(--accent) 65%, var(--ground))' },
  { key: 'updates', label: 'Daily updates', color: 'color-mix(in srgb, var(--accent) 40%, var(--ground))' },
  { key: 'streak', label: 'Streak', color: 'color-mix(in srgb, var(--accent) 22%, var(--ground))' },
  { key: 'achievements', label: 'Achievements', color: 'var(--brand-orange)' },
]

export default function Leaderboard() {
  const me = useMe()
  const [period, setPeriod] = useState<Period>('week')
  const { data, isLoading, isError, refetch } = useLeaderboard(period)
  const mine = data?.find((r) => r.user.id === me.id)
  const leader = data?.[0]
  const parts = period === 'all' ? PARTS : PARTS.filter((p) => p.key !== 'achievements')

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Leaderboard</h1>
          <p className="sub">
            {mine && leader
              ? mine.rank === 1
                ? `You lead ${PERIODS.find((p) => p.id === period)!.label.toLowerCase()} with ${fmtInt(mine.score)} points.`
                : `You're #${mine.rank} with ${fmtInt(mine.score)} points, ${fmtInt(leader.score - mine.score)} behind ${firstName(leader.user.full_name)}.`
              : ' '}
          </p>
        </div>
        <div className="actions">
          <div className="segmented" role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <button key={p.id} aria-pressed={period === p.id} onClick={() => setPeriod(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isError ? (
        <div className="panel">
          <ErrorLine what="the leaderboard" onRetry={() => refetch()} />
        </div>
      ) : isLoading || !data ? (
        <div className="panel">
          <Skel w="100%" h={240} />
        </div>
      ) : data.length === 0 ? (
        <div className="panel">
          <Empty>No one is on the board yet.</Empty>
        </div>
      ) : (
        <>
          <Podium rows={data.slice(0, 3)} />
          <section className="panel" aria-label="Rankings">
            <div className="panel-head">
              <h2>Rankings</h2>
              <div className="legend" aria-label="Score parts">
                {parts.map((p) => (
                  <span key={p.key}>
                    <i style={{ background: p.color }} />
                    {p.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Person</th>
                    <th className="hide-phone" style={{ width: '28%' }}>
                      Where the points came from
                    </th>
                    <th className="num">Score</th>
                    <th className="num hide-phone">Done</th>
                    <th className="num hide-phone">Days posted</th>
                    <th className="num hide-phone">Streak</th>
                    <th className="num hide-phone">Badges</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.user.id} className={r.user.id === me.id ? 'me-row' : ''}>
                      <td className={`rank num ${r.rank === 1 ? 'first' : ''}`}>{r.rank}</td>
                      <td>
                        <Person user={r.user} sub={r.user.id === me.id ? 'You' : (r.user.title ?? undefined)} />
                      </td>
                      <td className="hide-phone">
                        <ScoreBar row={r} max={data[0].score} parts={parts} />
                      </td>
                      <td className="num" style={{ fontSize: 16 }}>
                        {fmtInt(r.score)}
                      </td>
                      <td className="num hide-phone">{fmtInt(r.tasks_completed)}</td>
                      <td className="num hide-phone">{fmtInt(r.update_days)}</td>
                      <td className="num hide-phone">
                        {r.streak ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {r.streak >= 3 ? <Flame size={13} aria-hidden="true" style={{ color: 'var(--warning)' }} /> : null}
                            {fmtInt(r.streak)} d
                          </span>
                        ) : (
                          <span className="dash">0 d</span>
                        )}
                      </td>
                      <td className="num hide-phone">{fmtInt(r.achievements)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <HowScoring />
        </>
      )}
    </>
  )
}

function Podium({ rows }: { rows: LeaderboardEntry[] }) {
  return (
    <div className="podium">
      {[0, 1, 2].map((i) => {
        const r = rows[i]
        if (!r)
          return (
            <div className="place" key={i}>
              <span className="pos">{i + 1}</span>
              <span className="muted">Open spot</span>
            </div>
          )
        return (
          <div className={`place p${r.rank}`} key={r.user.id}>
            <span className="pos num">{r.rank}</span>
            <Avatar user={r.user} size="lg" />
            <span style={{ minWidth: 0 }}>
              <span className="name" style={{ display: 'block', fontWeight: 500 }}>
                {r.user.full_name}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                {fmtInt(r.tasks_completed)} done · {plural(r.update_days, 'day')} posted
              </span>
            </span>
            <span className="pscore">
              <b>{fmtInt(r.score)}</b>
              <span>points</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ScoreBar({ row, max, parts }: { row: LeaderboardEntry; max: number; parts: typeof PARTS }) {
  if (row.score === 0) return <span className="dash">No points yet</span>
  const width = max > 0 ? (row.score / max) * 100 : 0
  const title = parts.map((p) => `${p.label} ${row.breakdown[p.key]}`).join(' · ')
  return (
    <div className="scorebar" style={{ marginLeft: 0, background: 'transparent' }} title={title} aria-label={title}>
      <div style={{ display: 'flex', gap: 2, width: `${width}%` }}>
        {parts.map((p) =>
          row.breakdown[p.key] > 0 ? (
            <i key={p.key} style={{ background: p.color, flexGrow: row.breakdown[p.key], borderRadius: 2 }} />
          ) : null,
        )}
      </div>
    </div>
  )
}

function HowScoring() {
  return (
    <section className="panel" style={{ marginTop: 'var(--gap)' }} aria-label="How points work">
      <div className="panel-head">
        <h2>How points work</h2>
      </div>
      <div className="score-rules">
        {[
          ['Finishing a task', '5 low · 10 medium · 20 high · 35 critical'],
          ['On or before the due date', '+5 per task'],
          ['A day with an update', '3 per day'],
          ['Daily streak', '3 per day in a row, up to 30'],
          ['Achievements', 'their points, on the all-time board'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 500 }}>{k}</span>
            <span className="muted">{v}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
