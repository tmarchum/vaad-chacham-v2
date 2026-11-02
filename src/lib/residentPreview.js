// Admin "view as resident" toggle — persisted so a reload keeps the preview.
export const RESIDENT_PREVIEW_KEY = 'vc_resident_preview'

export function isResidentPreviewOn() {
  try { return localStorage.getItem(RESIDENT_PREVIEW_KEY) === '1' } catch { return false }
}

export function enterResidentPreview() {
  try { localStorage.setItem(RESIDENT_PREVIEW_KEY, '1') } catch { /* */ }
  window.location.assign('/')
}

export function exitResidentPreview() {
  try { localStorage.removeItem(RESIDENT_PREVIEW_KEY) } catch { /* */ }
  window.location.assign('/')
}
