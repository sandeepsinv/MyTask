import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RequireAdmin, RequireAuth } from '../src/auth/AuthContext'
import { TOKEN } from './server'
import { renderApp, Route } from './utils'

const routes = (
  <>
    <Route path="/login" element={<h1>Login page</h1>} />
    <Route
      path="/"
      element={
        <RequireAuth>
          <h1>Home page</h1>
        </RequireAuth>
      }
    />
    <Route
      path="/admin/members"
      element={
        <RequireAuth>
          <RequireAdmin>
            <h1>Members page</h1>
          </RequireAdmin>
        </RequireAuth>
      }
    />
  </>
)

describe('route guards', () => {
  it('sends signed-out visitors to the login page', async () => {
    renderApp(routes, { path: '/' })
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
  })

  it('drops an expired token and sends the visitor to login', async () => {
    renderApp(routes, { path: '/', token: 'expired' })
    expect(await screen.findByRole('heading', { name: 'Login page' })).toBeInTheDocument()
    expect(localStorage.getItem('pulse.token')).toBeNull()
  })

  it('lets a signed-in member in', async () => {
    renderApp(routes, { path: '/', token: TOKEN })
    expect(await screen.findByRole('heading', { name: 'Home page' })).toBeInTheDocument()
  })

  it('keeps members out of admin pages', async () => {
    renderApp(routes, { path: '/admin/members', token: TOKEN })
    expect(await screen.findByRole('heading', { name: 'Home page' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Members page' })).not.toBeInTheDocument()
  })

  it('lets admins into admin pages', async () => {
    renderApp(routes, { path: '/admin/members', token: 'admin-token' })
    expect(await screen.findByRole('heading', { name: 'Members page' })).toBeInTheDocument()
  })
})
