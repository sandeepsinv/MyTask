import { useEffect, useRef } from 'react'
import '../lib/charts.js'

interface ChartsApi {
  bars: (
    el: HTMLElement,
    opts: {
      labels: string[]
      values: number[]
      height?: number
      highlight?: number | number[] | null
      format?: (v: number) => string
      tickFormat?: (v: number) => string
      reference?: { value: number; label: string }
    },
  ) => void
}

declare global {
  interface Window {
    Charts?: ChartsApi
  }
}

/** Columns drawn by the taste-skill chart helper: square bars, quiet grid, one hue on the highlighted bars. */
export function BarChart({
  labels,
  values,
  highlight,
  height = 200,
  format,
  label,
}: {
  labels: string[]
  values: number[]
  highlight?: number[]
  height?: number
  format?: (v: number) => string
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const key = JSON.stringify([labels, values, highlight])

  useEffect(() => {
    const el = ref.current
    if (!el || !window.Charts) return
    el.innerHTML = ''
    window.Charts.bars(el, { labels, values, highlight: highlight ?? null, height, format })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, height])

  return <div ref={ref} className="chart" style={{ minHeight: height }} role="img" aria-label={label} />
}
