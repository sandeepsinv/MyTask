import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { LeaderboardEntry, UserOut } from '../src/api/types'

export const sara: UserOut = {
  id: 2,
  username: 'sara.haddad',
  full_name: 'Sara Haddad',
  title: 'Product lead',
  avatar_color: '#2563eb',
  role: 'member',
  is_active: true,
  email: 'sara@example.com',
  created_at: '2026-10-01T09:00:00',
}

export const admin: UserOut = { ...sara, id: 1, username: 'admin', full_name: 'Administrator', role: 'admin', title: null }

const omar = { ...sara, id: 3, username: 'omar.farouk', full_name: 'Omar Farouk', avatar_color: '#c2410c' }
const lina = { ...sara, id: 4, username: 'lina.chen', full_name: 'Lina Chen', avatar_color: '#a16207' }

const breakdown = (tasks: number, updates: number) => ({ tasks, on_time: 0, updates, streak: 0, achievements: 0 })

export const leaderboard: LeaderboardEntry[] = [
  { rank: 1, user: omar, score: 60, tasks_completed: 2, update_days: 8, streak: 4, achievements: 3, breakdown: breakdown(20, 40) },
  { rank: 2, user: sara, score: 34, tasks_completed: 1, update_days: 5, streak: 2, achievements: 1, breakdown: breakdown(10, 24) },
  { rank: 3, user: lina, score: 0, tasks_completed: 0, update_days: 0, streak: 0, achievements: 0, breakdown: breakdown(0, 0) },
]

export const VALID = { username: 'sara.haddad', password: 'demo1234' }
export const TOKEN = 'test-token'

export const handlers = [
  http.post('*/api/auth/login', async ({ request }) => {
    const form = new URLSearchParams(await request.text())
    if (form.get('username') === VALID.username && form.get('password') === VALID.password)
      return HttpResponse.json({ access_token: TOKEN, token_type: 'bearer' })
    return HttpResponse.json({ detail: 'Incorrect username or password' }, { status: 401 })
  }),
  http.get('*/api/auth/me', ({ request }) => {
    const auth = request.headers.get('Authorization')
    if (auth === `Bearer ${TOKEN}`) return HttpResponse.json(sara)
    if (auth === 'Bearer admin-token') return HttpResponse.json(admin)
    return HttpResponse.json({ detail: 'Invalid or expired session' }, { status: 401 })
  }),
  http.get('*/api/leaderboard', () => HttpResponse.json(leaderboard)),
]

export const server = setupServer(...handlers)
