import { KeyRound, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { errorMessage } from '../api/client'
import { useAdminUsers, useCreateUser, useResetPassword, useUpdateUser, type NewUser } from '../api/hooks'
import type { UserOut } from '../api/types'
import { useMe } from '../auth/AuthContext'
import { useToast } from '../components/Toast'
import { Dialog, ErrorLine, Person, Skel } from '../components/ui'
import { fmtInt, fmtRelative } from '../lib/format'

export default function AdminMembers() {
  const me = useMe()
  const { data, isLoading, isError, refetch } = useAdminUsers()
  const [creating, setCreating] = useState(false)
  const [resetting, setResetting] = useState<UserOut | null>(null)
  const update = useUpdateUser()
  const toast = useToast()

  const active = data?.filter((u) => u.is_active).length ?? 0

  return (
    <>
      <div className="title-row">
        <div>
          <h1>Members</h1>
          <p className="sub">
            {data ? `${fmtInt(active)} active${data.length > active ? `, ${fmtInt(data.length - active)} deactivated` : ''}. Only people you add here can sign in.` : ' '}
          </p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setCreating(true)}>
            <UserPlus /> Add member
          </button>
        </div>
      </div>

      <section className="panel">
        {isError ? (
          <ErrorLine what="members" onRetry={() => refetch()} />
        ) : isLoading || !data ? (
          <Skel w="100%" h={240} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Username</th>
                  <th className="hide-phone">Email</th>
                  <th>Role</th>
                  <th className="hide-phone">Added</th>
                  <th className="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.6 }}>
                    <td>
                      <Person user={u} sub={u.is_active ? (u.title ?? undefined) : 'Deactivated'} />
                    </td>
                    <td>{u.username}</td>
                    <td className="hide-phone">{u.email ?? <span className="dash">—</span>}</td>
                    <td>
                      <select
                        className="select"
                        style={{ height: 30, width: 'auto', borderRadius: 999, paddingRight: 28 }}
                        value={u.role}
                        disabled={u.id === me.id || update.isPending}
                        title={u.id === me.id ? "You can't change your own role" : undefined}
                        aria-label={`Role for ${u.full_name}`}
                        onChange={(e) =>
                          update.mutate(
                            { id: u.id, role: e.target.value as UserOut['role'] },
                            { onSuccess: () => toast('Role updated'), onError: (err) => toast(errorMessage(err)) },
                          )
                        }
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="hide-phone muted">{fmtRelative(u.created_at)}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn ghost sm" onClick={() => setResetting(u)}>
                        <KeyRound /> Reset password
                      </button>
                      {u.id !== me.id ? (
                        <button
                          className={`btn ghost sm ${u.is_active ? 'danger' : ''}`}
                          onClick={() =>
                            update.mutate(
                              { id: u.id, is_active: !u.is_active },
                              {
                                onSuccess: () => toast(u.is_active ? `${u.full_name} deactivated` : `${u.full_name} reactivated`),
                                onError: (err) => toast(errorMessage(err)),
                              },
                            )
                          }
                        >
                          {u.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating ? <CreateMember onClose={() => setCreating(false)} /> : null}
      {resetting ? <ResetPassword user={resetting} onClose={() => setResetting(null)} /> : null}
    </>
  )
}

interface CreateValues {
  full_name: string
  username: string
  email: string
  title: string
  password: string
  role: 'member' | 'admin'
}

function suggestPassword(): string {
  const words = ['river', 'maple', 'copper', 'harbor', 'lantern', 'orbit', 'meadow', 'summit', 'cedar', 'violet']
  const pick = () => words[Math.floor(Math.random() * words.length)]
  return `${pick()}-${pick()}-${Math.floor(10 + Math.random() * 90)}`
}

function CreateMember({ onClose }: { onClose: () => void }) {
  const create = useCreateUser()
  const toast = useToast()
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, dirtyFields },
  } = useForm<CreateValues>({
    defaultValues: { full_name: '', username: '', email: '', title: '', password: suggestPassword(), role: 'member' },
  })

  const submit = (v: CreateValues) => {
    const body: NewUser = {
      full_name: v.full_name.trim(),
      username: v.username.trim().toLowerCase(),
      email: v.email.trim() || null,
      title: v.title.trim() || null,
      password: v.password,
      role: v.role,
    }
    create.mutate(body, {
      onSuccess: (u) => {
        toast(`${u.full_name} can now sign in as ${u.username}`)
        onClose()
      },
    })
  }

  return (
    <Dialog title="Add member" sub="Share the username and temporary password with them. They can change it from their profile." onClose={onClose}>
      <form className="form" onSubmit={handleSubmit(submit)} noValidate>
        {create.isError ? <div className="form-error" role="alert">{errorMessage(create.error)}</div> : null}
        <label className="field">
          <span>Full name</span>
          <input
            className="input"
            autoFocus
            aria-invalid={errors.full_name ? 'true' : 'false'}
            {...register('full_name', {
              validate: (v) => v.trim().length > 0 || 'Enter their name',
              onChange: (e) => {
                if (!dirtyFields.username) {
                  const handle = String(e.target.value).trim().toLowerCase().split(/\s+/).join('.').replace(/[^a-z0-9_.-]/g, '')
                  setValue('username', handle)
                }
              },
            })}
          />
          {errors.full_name ? <span className="error">{errors.full_name.message}</span> : null}
        </label>
        <div className="form-row">
          <label className="field">
            <span>Username</span>
            <input
              className="input"
              aria-invalid={errors.username ? 'true' : 'false'}
              {...register('username', {
                required: 'Choose a username',
                minLength: { value: 3, message: 'At least 3 characters' },
                pattern: { value: /^[a-zA-Z0-9_.-]+$/, message: 'Letters, numbers, dots, dashes, underscores' },
              })}
            />
            {errors.username ? <span className="error">{errors.username.message}</span> : null}
          </label>
          <label className="field">
            <span>Role</span>
            <select className="select" {...register('role')}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
        </div>
        <div className="form-row">
          <label className="field">
            <span>
              Email <span className="hint">optional</span>
            </span>
            <input
              className="input"
              type="email"
              aria-invalid={errors.email ? 'true' : 'false'}
              {...register('email', { pattern: { value: /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Not an email address' } })}
            />
            {errors.email ? <span className="error">{errors.email.message}</span> : null}
          </label>
          <label className="field">
            <span>
              Title <span className="hint">optional</span>
            </span>
            <input className="input" placeholder="Backend engineer" {...register('title')} />
          </label>
        </div>
        <label className="field">
          <span>Temporary password</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              aria-invalid={errors.password ? 'true' : 'false'}
              {...register('password', { minLength: { value: 6, message: 'At least 6 characters' } })}
            />
            <button type="button" className="btn" onClick={() => setValue('password', suggestPassword())}>
              New
            </button>
          </span>
          {errors.password ? <span className="error">{errors.password.message}</span> : null}
        </label>
        <div className="dfoot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={create.isPending}>
            {create.isPending ? 'Adding…' : `Add ${getValues('full_name').trim().split(' ')[0] || 'member'}`}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function ResetPassword({ user, onClose }: { user: UserOut; onClose: () => void }) {
  const reset = useResetPassword()
  const toast = useToast()
  const { register, handleSubmit, formState } = useForm<{ new_password: string }>({ defaultValues: { new_password: suggestPassword() } })
  return (
    <Dialog title={`Reset ${user.full_name}'s password`} sub="Their current password stops working right away." onClose={onClose}>
      <form
        className="form"
        noValidate
        onSubmit={handleSubmit((v) =>
          reset.mutate(
            { id: user.id, new_password: v.new_password },
            {
              onSuccess: () => {
                toast(`Password reset for ${user.username}`)
                onClose()
              },
            },
          ),
        )}
      >
        {reset.isError ? <div className="form-error">{errorMessage(reset.error)}</div> : null}
        <label className="field">
          <span>New password</span>
          <input className="input" {...register('new_password', { minLength: { value: 6, message: 'At least 6 characters' } })} />
          {formState.errors.new_password ? <span className="error">{formState.errors.new_password.message}</span> : null}
        </label>
        <div className="dfoot">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={reset.isPending}>
            Reset password
          </button>
        </div>
      </form>
    </Dialog>
  )
}
