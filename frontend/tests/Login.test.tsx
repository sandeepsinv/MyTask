import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { RequireAuth } from '../src/auth/AuthContext'
import Login from '../src/pages/Login'
import { VALID } from './server'
import { renderApp, Route } from './utils'

const routes = (
  <>
    <Route path="/login" element={<Login />} />
    <Route
      path="/"
      element={
        <RequireAuth>
          <h1>Signed in home</h1>
        </RequireAuth>
      }
    />
  </>
)

describe('Login', () => {
  it('asks for both fields before submitting', async () => {
    renderApp(routes, { path: '/login' })
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter your username')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
  })

  it('shows the server error for wrong credentials', async () => {
    renderApp(routes, { path: '/login' })
    await userEvent.type(screen.getByLabelText('Username'), 'sara.haddad')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect username or password')
    expect(screen.getByTestId('location')).toHaveTextContent('/login')
  })

  it('signs in, stores the token and goes home', async () => {
    renderApp(routes, { path: '/login' })
    await userEvent.type(screen.getByLabelText('Username'), VALID.username)
    await userEvent.type(screen.getByLabelText('Password'), VALID.password)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Signed in home' })).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem('pulse.token')).toBe('test-token'))
  })

  it('can reveal the password', async () => {
    renderApp(routes, { path: '/login' })
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')
  })
})
