import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
const KEY = 'pulse.theme'

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export function isDark(theme: Theme): boolean {
  if (theme !== 'system') return theme === 'dark'
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read)
  useEffect(() => {
    applyTheme(theme)
    try {
      if (theme === 'system') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, theme)
    } catch {
      /* not persisted */
    }
  }, [theme])
  const toggle = () => setTheme(isDark(theme) ? 'light' : 'dark')
  return { theme, toggle, dark: isDark(theme) }
}
