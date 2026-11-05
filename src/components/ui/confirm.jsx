import { useCallback, useMemo, useRef, useState } from 'react'
import { AlertDialog } from './alert-dialog'
import { ConfirmContext } from '@/lib/confirm'

// window.confirm renders browser chrome that ignores the app's RTL direction,
// typography and theme, and it blocks the whole page — which also means
// nothing driving the app from outside (a test, an automation) can ever get
// past it. This keeps the wording and the control flow and renders the app's
// own dialog instead. See useConfirm in @/lib/confirm for the caller side.

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const resolver = useRef(null)

  const confirm = useCallback((opts) => {
    const o = typeof opts === 'string' ? { description: opts } : (opts || {})
    return new Promise((resolve) => {
      resolver.current = resolve
      setState({ title: 'אישור פעולה', confirmText: 'אישור', cancelText: 'ביטול', ...o })
    })
  }, [])

  // Exactly one settle per prompt: AlertDialog closes itself after onConfirm,
  // so settle on confirm and treat any other close as a cancel.
  const settle = (value) => {
    const r = resolver.current
    resolver.current = null
    setState(null)
    r?.(value)
  }

  const value = useMemo(() => ({ confirm }), [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <AlertDialog
        open={!!state}
        onOpenChange={(open) => { if (!open) settle(false) }}
        title={state?.title}
        description={state?.description}
        confirmText={state?.confirmText}
        cancelText={state?.cancelText}
        onConfirm={() => settle(true)}
      />
    </ConfirmContext.Provider>
  )
}
