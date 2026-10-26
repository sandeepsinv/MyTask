const nf0 = new Intl.NumberFormat('en', { maximumFractionDigits: 0 })

export const fmtInt = (n: number) => nf0.format(n)

/** Local calendar date as YYYY-MM-DD (not UTC, so "today" is the user's today). */
export function isoDate(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Whole days from today to the given date (negative in the past). */
export function daysFromToday(iso: string): number {
  const today = parseDay(isoDate())
  return Math.round((parseDay(iso).getTime() - today.getTime()) / 86_400_000)
}

const shortDate = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' })
const weekday = new Intl.DateTimeFormat('en', { weekday: 'short' })

export function fmtDay(iso: string): string {
  return shortDate.format(parseDay(iso))
}

const longDay = new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short' })

/** "Today", "Yesterday", or "Mon, 20 Oct" for a calendar day. */
export function fmtDayLong(iso: string): string {
  const d = daysFromToday(iso)
  if (d === 0) return 'Today'
  if (d === -1) return 'Yesterday'
  return longDay.format(parseDay(iso))
}

/** Shift a YYYY-MM-DD day by n days. */
export function addDays(iso: string, n: number): string {
  const d = parseDay(iso)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

/** "Due today", "Due tomorrow", "Due in 4 days", "3 days overdue", "Due 12 Nov". */
export function dueLabel(iso: string | null, done = false): string {
  if (!iso) return ''
  const d = daysFromToday(iso)
  if (done) return `Due ${fmtDay(iso)}`
  if (d === 0) return 'Due today'
  if (d === 1) return 'Due tomorrow'
  if (d < 0) return d === -1 ? '1 day overdue' : `${-d} days overdue`
  if (d < 7) return `Due ${weekday.format(parseDay(iso))}`
  return `Due ${fmtDay(iso)}`
}

/** Relative wording for recency: "Today", "Yesterday", "3 days ago", or the date. */
export function fmtRelative(isoDateTime: string): string {
  // Timestamps from the API are naive UTC.
  const t = new Date(isoDateTime.endsWith('Z') ? isoDateTime : `${isoDateTime}Z`)
  const d = -daysFromToday(isoDate(t))
  if (d <= 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d} days ago`
  return shortDate.format(t)
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

export function greetingWord(d = new Date()): string {
  const h = d.getHours()
  if (h < 12) return 'Morning'
  if (h < 18) return 'Afternoon'
  return 'Evening'
}

export const plural = (n: number, one: string, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`
