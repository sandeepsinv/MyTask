import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { errorMessage } from '../api/client'
import { useChangePassword, useMyStats } from '../api/hooks'
import { useMe } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import { Avatar, Skel } from '../components/ui'
import { fmtHours, fmtInt } from '../lib/format'

interface PwValues {
  current_password: string
  new_password: string
  confirm: string
}

export default function Profile() {
  const me = useMe()
  const { data: stats } = useMyStats()
  const change = useChangePassword()
  const toast = useToast()
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors },
  } = useForm<PwValues>({ defaultValues: { current_password: '', new_password: '', confirm: '' } })

  const submit = (v: PwValues) =>
    change.mutate(
      { current_password: v.current_password, new_password: v.new_password },
      {
        onSuccess: () => {
          toast('Password changed')
          reset()
        },
      },
    )

  const stat = (label: string, value: ReactNode) => (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value num">{stats ? value : <Skel w={56} h={30} />}</div>
    </div>
  )

  return (
    <>
      <div className="title-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar user={me} size="lg" />
          <div>
            <h1>{me.full_name}</h1>
            <p className="sub" style={{ marginTop: 0 }}>
              @{me.username} · {me.role === 'admin' ? 'Admin' : me.title || 'Member'}
            </p>
          </div>
        </div>
      </div>

      <div className="kpis" style={{ marginBottom: 40 }}>
        {stat('All-time score', <>{fmtInt(stats?.score ?? 0)} <span className="unit">#{stats?.rank}</span></>)}
        {stat('Tasks finished', fmtInt(stats?.tasks_completed ?? 0))}
        {stat('This week', <>{fmtHours(stats?.hours_this_week ?? 0)}<span className="unit">h</span></>)}
        {stat('Current streak', <>{fmtInt(stats?.streak ?? 0)}<span className="unit">{stats?.streak === 1 ? 'day' : 'days'}</span></>)}
      </div>

      <section className="settings-section">
        <div>
          <h2>Account</h2>
          <p>Your name, username and role are managed by your workspace admin.</p>
        </div>
        <div className="panel">
          <dl className="facts" style={{ background: 'transparent', padding: 0 }}>
            <div>
              <dt>Username</dt>
              <dd>{me.username}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{me.role === 'admin' ? 'Admin' : 'Member'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{me.email ?? <span className="dash">—</span>}</dd>
            </div>
            <div>
              <dt>Title</dt>
              <dd>{me.title ?? <span className="dash">—</span>}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="settings-section">
        <div>
          <h2>Password</h2>
          <p>At least 6 characters. You'll stay signed in on this device.</p>
        </div>
        <form className="panel form" onSubmit={handleSubmit(submit)} noValidate>
          {change.isError ? <div className="form-error" role="alert">{errorMessage(change.error)}</div> : null}
          <label className="field">
            <span>Current password</span>
            <input type="password" className="input" autoComplete="current-password" {...register('current_password', { required: 'Enter your current password' })} />
            {errors.current_password ? <span className="error">{errors.current_password.message}</span> : null}
          </label>
          <div className="form-row">
            <label className="field">
              <span>New password</span>
              <input
                type="password"
                className="input"
                autoComplete="new-password"
                {...register('new_password', { minLength: { value: 6, message: 'At least 6 characters' }, required: 'Enter a new password' })}
              />
              {errors.new_password ? <span className="error">{errors.new_password.message}</span> : null}
            </label>
            <label className="field">
              <span>Repeat new password</span>
              <input
                type="password"
                className="input"
                autoComplete="new-password"
                {...register('confirm', { validate: (v) => v === getValues('new_password') || "The passwords don't match" })}
              />
              {errors.confirm ? <span className="error">{errors.confirm.message}</span> : null}
            </label>
          </div>
          <div>
            <button className="btn primary" type="submit" disabled={change.isPending}>
              {change.isPending ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </form>
      </section>
    </>
  )
}
