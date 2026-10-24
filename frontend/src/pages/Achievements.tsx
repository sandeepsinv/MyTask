import { useState } from 'react'
import { useAchievementCatalog, useAchievements, useEarnedMatrix, useMembers } from '../api/hooks'
import type { AchievementStatus } from '../api/types'
import { useMe } from '../auth/AuthContext'
import { AchievementIcon, Avatar, ErrorLine, Progress, Skel } from '../components/ui'
import { fmtHours, fmtInt, fmtRelative } from '../lib/format'

const TIER_LABEL = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' } as const

export default function Achievements() {
  const me = useMe()
  const [userId, setUserId] = useState(me.id)
  const members = useMembers()
  const { data, isLoading, isError, refetch } = useAchievements(userId)
  const person = members.data?.find((m) => m.id === userId)
  const isMe = userId === me.id

  const unlocked = data?.filter((a) => a.unlocked) ?? []
  const points = unlocked.reduce((s, a) => s + a.points, 0)
  const total = data?.reduce((s, a) => s + a.points, 0) ?? 0

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Achievements</h1>
          <p className="sub">
            {data
              ? `${isMe ? 'You have' : `${person?.full_name ?? 'They'} ${person ? 'has' : 'have'}`} ${fmtInt(unlocked.length)} of ${fmtInt(data.length)}, worth ${fmtInt(points)} of ${fmtInt(total)} points.`
              : ' '}
          </p>
        </div>
        <div className="actions">
          <select
            className="select"
            style={{ height: 38, borderRadius: 999, borderColor: 'var(--control)', width: 'auto', paddingRight: 32 }}
            value={userId}
            onChange={(e) => setUserId(Number(e.target.value))}
            aria-label="Whose achievements"
          >
            {members.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === me.id ? `${m.full_name} (you)` : m.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isError ? (
        <div className="panel">
          <ErrorLine what="achievements" onRetry={() => refetch()} />
        </div>
      ) : isLoading || !data ? (
        <div className="badges">
          {Array.from({ length: 8 }, (_, i) => (
            <div className="badge" key={i}>
              <Skel w={44} h={44} />
              <Skel w="60%" />
              <Skel w="100%" h={36} />
            </div>
          ))}
        </div>
      ) : (
        <div className="badges">
          {data.map((a) => (
            <Badge key={a.key} a={a} />
          ))}
        </div>
      )}
      <TeamMatrix selected={userId} onSelect={setUserId} />
    </>
  )
}

/** Who holds what: one row per person, one column per achievement, so gaps across the team show at a glance. */
function TeamMatrix({ selected, onSelect }: { selected: number; onSelect: (id: number) => void }) {
  const catalog = useAchievementCatalog()
  const earned = useEarnedMatrix()
  if (earned.isError) return null
  const defs = catalog.data ?? []
  const rows = [...(earned.data ?? [])].sort((a, b) => b.keys.length - a.keys.length)
  return (
    <section className="panel" style={{ marginTop: 'var(--gap)' }} aria-labelledby="matrix-h">
      <div className="panel-head">
        <h2 id="matrix-h">Across the team</h2>
        <span className="meta">Pick a row to see that person's progress above</span>
      </div>
      {!earned.data || !catalog.data ? (
        <Skel w="100%" h={200} />
      ) : (
        <div className="table-wrap">
          <table className="data matrix">
            <thead>
              <tr>
                <th>Person</th>
                {defs.map((d) => (
                  <th key={d.key} className={`tier-${d.tier}`} title={`${d.name}: ${d.description}`}>
                    <span className="mh-icon">
                      <AchievementIcon name={d.icon} />
                    </span>
                    <span className="sr-only">{d.name}</span>
                  </th>
                ))}
                <th className="num">Earned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user.id} className={`clickable ${r.user.id === selected ? 'me-row' : ''}`} onClick={() => onSelect(r.user.id)}>
                  <td>
                    <span className="person">
                      <Avatar user={r.user} size="sm" />
                      <span className="name">{r.user.full_name}</span>
                    </span>
                  </td>
                  {defs.map((d) => {
                    const has = r.keys.includes(d.key)
                    return (
                      <td key={d.key} className={`cell tier-${d.tier}`} aria-label={`${d.name}: ${has ? 'earned' : 'not yet'}`}>
                        <i className={has ? 'on' : ''} />
                      </td>
                    )
                  })}
                  <td className="num">
                    {fmtInt(r.keys.length)}
                    <span className="muted"> / {fmtInt(defs.length)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function progressLabel(a: AchievementStatus): string {
  const value = a.progress * a.target
  const unit = a.key === 'marathon' || a.key === 'centurion' ? ' h' : a.key === 'on_fire' ? ' d' : a.key === 'early_bird' ? ' d early' : ''
  const f = unit.includes('h') ? fmtHours : fmtInt
  return `${f(Math.floor(value * 10) / 10)} / ${f(a.target)}${unit}`
}

function Badge({ a }: { a: AchievementStatus }) {
  return (
    <article className={`badge tier-${a.tier} ${a.unlocked ? 'unlocked' : ''}`} aria-label={`${a.name}, ${a.unlocked ? 'unlocked' : 'locked'}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="bi">
          <AchievementIcon name={a.icon} />
        </span>
        <span className="muted num" style={{ fontSize: 12 }}>
          {TIER_LABEL[a.tier]} · +{a.points}
        </span>
      </div>
      <div>
        <div className="bn">{a.name}</div>
        <p className="bd">{a.description}</p>
      </div>
      <div className="bf">
        {a.unlocked ? (
          <span>Earned {a.awarded_at ? fmtRelative(a.awarded_at).toLowerCase() : ''}</span>
        ) : (
          <>
            <Progress value={a.progress * 100} accent />
            <span className="num">{progressLabel(a)}</span>
          </>
        )}
      </div>
    </article>
  )
}
