import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from '../src/auth/AuthContext'
import { ToastProvider } from '../src/components/Toast'

export function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

/** Renders `routes` inside the app's providers at `path`, optionally already signed in with `token`. */
export function renderApp(routes: ReactElement, { path = '/', token }: { path?: string; token?: string } = {}) {
  if (token) localStorage.setItem('pulse.token', token)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <ToastProvider>
            <Routes>{routes}</Routes>
            <LocationProbe />
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

export { Route }
