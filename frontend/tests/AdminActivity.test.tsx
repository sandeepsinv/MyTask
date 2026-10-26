import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { ActivityEntry, ActivityPerson } from '../src/api/types'
import { RequireAdmin, RequireAuth } from '../src/auth/AuthContext'
import AdminActivity from '../src/pages/AdminActivity'
import { sara, server } from './server'
import { renderApp, Route } from './utils'

const now = new Date().toISOString().replace('Z', '')

const entries: ActivityEntry[] = [
  {
    id: 3,
    user: sara,
    action: 'task.updated',
    entity_type: 'task',
    entity_id: 7,
    summary: 'Edited "Invoices": status, priority',
    details: { changes: { status: ['todo', 'blocked'], priority: ['high', 'critical'] } },
    ip: '10.0.0.4',
    created_at: now,
  },
  {
    id: 2,
    user: null,
    action: 'auth.login_failed',
    entity_type: 'user',
    entity_id: null,
    summary: 'Failed sign-in as "mallory"',
    details: { username: 'mallory' },
    ip: '203.0.113.9',
    created_at: now,
  },
]

const people: ActivityPerson[] = [
  { user: sara, actions_30d: 12, last_activity: now, last_sign_in: now, failed_sign_ins_30d: 1 },
]

const routes = (
  <Route
    path="/admin/activity"
    element={
      <RequireAuth>
        <RequireAdmin>
          <AdminActivity />
        </RequireAdmin>
      </RequireAuth>
    }
  />
)

describe('Activity log', () => {
  it('lists who did what, with the changes behind each entry, and filters by person', async () => {
    const requested: (string | null)[] = []
    server.use(
      http.get('*/api/admin/activity/people', () => HttpResponse.json(people)),
      http.get('*/api/admin/activity', ({ request }) => {
        requested.push(new URL(request.url).searchParams.get('user_id'))
        return HttpResponse.json({ items: entries, next_before: null })
      }),
    )
    renderApp(routes, { path: '/admin/activity', token: 'admin-token' })

    const log = await screen.findByRole('region', { name: 'Activity' })
    expect(await within(log).findByText('edited "Invoices": status, priority')).toBeInTheDocument()
    expect(within(log).getByText('Unknown account')).toBeInTheDocument()
    expect(within(log).getByText('failed sign-in as "mallory"')).toBeInTheDocument()

    await userEvent.click(within(log).getAllByRole('button', { name: /Details/ })[0])
    expect(within(log).getByText('Up next')).toBeInTheDocument()
    expect(within(log).getByText('Blocked')).toBeInTheDocument()
    expect(within(log).getByText('10.0.0.4')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('cell', { name: /Sara Haddad/ }))
    expect(await screen.findByText(/Everything Sara Haddad did/)).toBeInTheDocument()
    expect(requested).toContain(String(sara.id))
  })

  it('is not available to members', async () => {
    renderApp(
      <>
        {routes}
        <Route path="/" element={<h1>Home page</h1>} />
      </>,
      { path: '/admin/activity', token: 'test-token' },
    )
    expect(await screen.findByRole('heading', { name: 'Home page' })).toBeInTheDocument()
  })
})
