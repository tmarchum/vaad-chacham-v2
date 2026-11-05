import { createContext, useContext } from 'react'

// Context + hook live apart from the provider component so the provider file
// exports only components (Fast Refresh requires that).
export const ConfirmContext = createContext(null)

/**
 * Promise-based confirmation, so a caller reads like window.confirm without
 * being window.confirm:
 *
 *   if (!await confirm({ title: '…', description: '…' })) return
 *
 * Returns false when there is no provider above, so a missing provider
 * cancels the action rather than silently performing it.
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  return ctx?.confirm || (async () => false)
}
