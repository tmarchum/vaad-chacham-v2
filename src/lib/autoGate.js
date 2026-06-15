// Location-based auto gate-open (Android native only).
//
// Enables a foreground service that places the direct ACTION_CALL the moment
// the phone enters the gate's radius — the same call mechanism as the manual
// "פתח שער" button, just triggered by location.
import { Capacitor, registerPlugin } from '@capacitor/core'

const AutoGate = registerPlugin('AutoGate')

export const autoGateSupported = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

// Request one Android runtime permission via cordova-plugin-android-permissions.
function requestPermission(name) {
  return new Promise((resolve) => {
    const perms = window.cordova?.plugins?.permissions
    if (!perms || !perms[name]) return resolve(false)
    perms.checkPermission(perms[name], (s) => {
      if (s?.hasPermission) return resolve(true)
      perms.requestPermission(perms[name], (r) => resolve(!!r?.hasPermission), () => resolve(false))
    }, () => resolve(false))
  })
}

// Walks the user through the permissions the background opener needs.
// Returns { fine, background } so the UI can warn if background was denied.
export async function requestAutoGatePermissions() {
  await requestPermission('CALL_PHONE')
  const fine = await requestPermission('ACCESS_FINE_LOCATION')
  // Background location must be requested after foreground is granted; on
  // Android 11+ this opens the "Allow all the time" settings screen.
  const background = fine ? await requestPermission('ACCESS_BACKGROUND_LOCATION') : false
  await requestPermission('POST_NOTIFICATIONS')
  return { fine, background }
}

export async function enableAutoGate({ lat, lng, radius = 100, number }) {
  if (!autoGateSupported()) throw new Error('auto-gate is Android-app only')
  await AutoGate.start({ lat, lng, radius, number })
}

export async function disableAutoGate() {
  if (!autoGateSupported()) return
  await AutoGate.stop()
}

export async function isAutoGateRunning() {
  if (!autoGateSupported()) return false
  try { return !!(await AutoGate.isRunning()).enabled } catch { return false }
}

export const openBatterySettings = () => autoGateSupported() && AutoGate.openBatterySettings()
export const openOverlaySettings = () => autoGateSupported() && AutoGate.openOverlaySettings()
