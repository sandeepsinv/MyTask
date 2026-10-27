import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { BrandMark } from '../components/AppShell'

interface Values {
  username: string
  password: string
}

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: { username: '', password: '' } })

  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (user) return <Navigate to={from} replace />

  const submit = async (v: Values) => {
    setError(null)
    try {
      await login(v.username.trim(), v.password)
      navigate(from, { replace: true })
    } catch (e) {
      setError(errorMessage(e, 'Could not sign in.'))
    }
  }

  return (
    <div className="login">
      <aside className="login-side">
        <div className="brand" style={{ padding: 0 }}>
          <BrandMark />
          <span className="brand-name">PSITasky</span>
        </div>
        <p className="quote">
          Who's on what, and what's <em>stuck</em>.
        </p>
        <p className="fine">
          Accounts are created by your workspace admin. If you've forgotten your password, ask them to reset it.
        </p>
      </aside>
      <main className="login-main">
        <form className="login-card form" onSubmit={handleSubmit(submit)} noValidate>
          <div>
            <h1>Sign in</h1>
            <p className="sub">Use the username and password your admin gave you.</p>
          </div>
          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}
          <label className="field">
            <span>Username</span>
            <input
              className="input"
              autoComplete="username"
              autoFocus
              aria-invalid={errors.username ? 'true' : 'false'}
              {...register('username', { validate: (v) => v.trim().length > 0 || 'Enter your username' })}
            />
            {errors.username ? <span className="error">{errors.username.message}</span> : null}
          </label>
          <label className="field">
            <span>Password</span>
            <span className="pw">
              <input
                className="input"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                aria-invalid={errors.password ? 'true' : 'false'}
                {...register('password', { required: 'Enter your password' })}
              />
              <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                {show ? <EyeOff /> : <Eye />}
              </button>
            </span>
            {errors.password ? <span className="error">{errors.password.message}</span> : null}
          </label>
          <button className="btn primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  )
}
