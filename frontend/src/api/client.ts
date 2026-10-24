import axios, { AxiosError } from 'axios'

const TOKEN_KEY = 'pulse.token'

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* storage unavailable: the session lasts until reload */
    }
  },
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  // FastAPI reads repeated keys (status=a&status=b), not axios' default status[]=a.
  paramsSerializer: { indexes: null },
})

api.interceptors.request.use((config) => {
  const token = tokenStore.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

api.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    const url = error.config?.url ?? ''
    if (error.response?.status === 401 && !url.includes('/auth/login')) onUnauthorized?.()
    return Promise.reject(error)
  },
)

/** A readable sentence from any API error. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (error instanceof AxiosError) {
    const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, '')
    if (!error.response) return 'Cannot reach the server. Is the backend running?'
  }
  return fallback
}
