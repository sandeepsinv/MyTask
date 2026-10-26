import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { UpdateEntry, UserPublic } from '../src/api/types'
import { RequireAuth } from '../src/auth/AuthContext'
import { isoDate } from '../src/lib/format'
import Daily from '../src/pages/Daily'
import { sara, server, TOKEN } from './server'
import { renderApp, Route } from './utils'

const omar: UserPublic = { ...sara, id: 3, username: 'omar.farouk', full_name: 'Omar Farouk' }
const lina: UserPublic = { ...sara, id: 4, username: 'lina.chen', full_name: 'Lina Chen' }
const billing = { id: 1, name: 'Billing v2', color: '#2563eb', status: 'active' as const }

const update = (id: number, user: UserPublic, task: { id: number; title: string }, note: string): UpdateEntry => ({
  id,
  date: isoDate(),
  note,
  created_at: `${isoDate()}T10:00:00`,
  user,
  task: { ...task, status: 'in_progress', project: task.id === 10 ? billing : null },
})

describe('Daily updates', () => {
  it("shows what each person worked on today, grouped by task, and who hasn't posted", async () => {
    let asked: string | null = null
    server.use(
      http.get('*/api/users', () => HttpResponse.json([sara, omar, lina])),
      http.get('*/api/projects', () => HttpResponse.json([])),
      http.get('*/api/updates', ({ request }) => {
        asked = new URL(request.url).searchParams.get('on')
        return HttpResponse.json([
          update(2, omar, { id: 10, title: 'Migrate invoices' }, 'Raised the webhook issue'),
          update(1, omar, { id: 10, title: 'Migrate invoices' }, 'Dry run on a copy of production'),
          update(3, sara, { id: 11, title: 'Roadmap review' }, 'Built the pricing slide'),
        ])
      }),
    )
    renderApp(
      <Route
        path="/daily"
        element={
          <RequireAuth>
            <Daily />
          </RequireAuth>
        }
      />,
      { path: '/daily', token: TOKEN },
    )

    const omarCard = await screen.findByRole('region', { name: 'Omar Farouk' })
    expect(asked).toBe(isoDate())
    expect(within(omarCard).getAllByRole('button', { name: 'Migrate invoices' })).toHaveLength(1)
    const notes = within(omarCard).getAllByRole('listitem').map((li) => li.textContent)
    // Oldest first within the day.
    expect(notes.indexOf('Dry run on a copy of production')).toBeLessThan(notes.indexOf('Raised the webhook issue'))
    expect(within(omarCard).getByText('Billing v2')).toBeInTheDocument()

    expect(screen.getByRole('region', { name: 'Sara Haddad' })).toHaveTextContent('Built the pricing slide')
    expect(screen.getByText('2 of 3 people posted today')).toBeInTheDocument()
    const quiet = screen.getByRole('region', { name: "Haven't posted yet" })
    expect(quiet).toHaveTextContent('Lina Chen')
  })
})
