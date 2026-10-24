import { Check } from 'lucide-react'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

const ToastContext = createContext<(message: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMessage(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), 3200)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      {message ? (
        <div className="toast" role="status">
          <Check aria-hidden="true" />
          {message}
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
