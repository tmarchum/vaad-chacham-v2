// Open a building gate by placing a phone call to the controller's number.
//
// The gate controller opens for any *authorized* caller-ID — and the resident's
// own number is already on that whitelist (that's what `parking_gate_phones`
// represents). So we just need the phone to call the gate number.
//
//  • Native Android app (Capacitor): place the call directly via ACTION_CALL
//    (CALL_PHONE permission) — the gate opens with NO dialer screen, exactly
//    like OpenGate, but from the resident's own already-trusted number and
//    completely free (no server, no telephony provider).
//  • Web / iOS: fall back to a `tel:` link (opens the dialer; one extra tap).
import { Capacitor } from '@capacitor/core'

const digits = (s) => String(s || '').replace(/[^\d+]/g, '')

function requestCallPermission() {
  return new Promise((resolve) => {
    const perms = window.cordova?.plugins?.permissions
    if (!perms) return resolve(false)
    const CALL = perms.CALL_PHONE
    perms.checkPermission(CALL, (status) => {
      if (status?.hasPermission) return resolve(true)
      perms.requestPermission(
        CALL,
        (res) => resolve(!!res?.hasPermission),
        () => resolve(false),
      )
    }, () => resolve(false))
  })
}

function directCall(number) {
  return new Promise((resolve, reject) => {
    // The cordova-plugin-call-number API is exposed at window.plugins.CallNumber.
    const cn = window.plugins?.CallNumber || window.cordova?.plugins?.CallNumber
    if (!cn) return reject(new Error('CallNumber unavailable'))
    // bypassAppChooser = true → ACTION_CALL (direct, no dialer)
    cn.callNumber(() => resolve(true), (err) => reject(err), number, true)
  })
}

// Returns 'direct' if the call was placed without a dialer, or 'dialer' if it
// fell back to opening the dialer (web/iOS or permission denied).
export async function openGate(rawNumber) {
  const number = digits(rawNumber)
  if (!number) throw new Error('missing gate number')

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    const granted = await requestCallPermission()
    if (granted) {
      try {
        await directCall(number)
        return 'direct'
      } catch {
        /* fall through to dialer */
      }
    }
  }

  // Web / iOS / fallback: open the dialer pre-filled.
  window.location.href = `tel:${number}`
  return 'dialer'
}
