import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { RequireAuth } from '../src/auth/AuthContext'
import Leaderboard from '../src/pages/Leaderboard'
import { leaderboard, server, TOKEN } from './server'
import { renderApp, Route } from './utils'

const routes = (
  <Route
    path="/leaderboard"
    element={
      <RequireAuth>
        <Leaderboard />
      </RequireAuth>
    }
  />
)

describe('Leaderboard', () => {
  it('ranks people and tells me how far behind the leader I am', async () => {
    renderApp(routes, { path: '/leaderboard', token: TOKEN })
    expect(await screen.findByText("You're #2 with 34 points, 26 behind Omar.")).toBeInTheDocument()

    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['1', '2', '3'])
    expect(within(rows[0]).getByText('Omar Farouk')).toBeInTheDocument()
    expect(within(rows[1]).getByText('You')).toBeInTheDocument()
    expect(within(rows[2]).getByText('No points yet')).toBeInTheDocument()
  })

  it('asks the API for the chosen period', async () => {
    const periods: string[] = []
    server.use(
      http.get('*/api/leaderboard', ({ request }) => {
        periods.push(new URL(request.url).searchParams.get('period') ?? '')
        return HttpResponse.json(leaderboard)
      }),
    )
    renderApp(routes, { path: '/leaderboard', token: TOKEN })
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'All time' }))
    expect(screen.getByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'true')
    await screen.findByRole('table')
    expect(periods).toEqual(['week', 'all'])
  })

  it('shows an error with a retry when the board fails to load', async () => {
    server.use(http.get('*/api/leaderboard', () => HttpResponse.json({ detail: 'boom' }, { status: 500 })))
    renderApp(routes, { path: '/leaderboard', token: TOKEN })
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the leaderboard.")
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
