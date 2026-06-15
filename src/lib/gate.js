// Open a building gate by placing a phone call to the controller's number.
//
// The gate controller opens for any *authorized* caller-ID — and the resident's
// own number is already on that whitelist (that's what `parking_gate_phones`
// represents). So we just need the phone to call the gate number.
//
//  • Native Android app (Capacitor): place the call directly via ACTION_CALL
//    (cordova-plugin-call-number, which requests CALL_PHONE itself) — the gate
//    opens with NO dialer screen, from the resident's own already-trusted
//    number, free.
//  • Web / iOS: fall back to a `tel:` link (opens the dialer; one extra tap).
import { Capacitor } from '@capacitor/core'

const digits = (s) => String(s || '').replace(/[^\d+]/g, '')

function getCallNumberPlugin() {
  return window.plugins?.CallNumber || window.cordova?.plugins?.CallNumber || null
}

function directCall(number) {
  return new Promise((resolve, reject) => {
    const cn = getCallNumberPlugin()
    if (!cn) return reject(new Error('CallNumber plugin not found on window.plugins'))
    // bypassAppChooser = true → ACTION_CALL (direct, no dialer). The plugin
    // requests the CALL_PHONE runtime permission itself before dialing.
    cn.callNumber(() => resolve(true), (err) => reject(new Error('callNumber failed: ' + JSON.stringify(err))), number, true)
  })
}

// Returns a diagnostics object: { mode: 'direct'|'dialer', platform, native,
// pluginFound, error }. 'direct' = call placed with no dialer; 'dialer' =
// fell back to the dialer (web/iOS, plugin missing, or permission denied).
export async function openGate(rawNumber) {
  const number = digits(rawNumber)
  if (!number) throw new Error('missing gate number')

  const diag = {
    mode: 'dialer',
    platform: Capacitor.getPlatform(),
    native: Capacitor.isNativePlatform(),
    pluginFound: false,
    error: null,
  }

  if (diag.native && diag.platform === 'android') {
    diag.pluginFound = !!getCallNumberPlugin()
    if (diag.pluginFound) {
      try {
        await directCall(number)
        diag.mode = 'direct'
        return diag
      } catch (e) {
        diag.error = String(e?.message || e)
      }
    } else {
      diag.error = 'plugin-not-found'
    }
  }

  // Web / iOS / fallback: open the dialer pre-filled.
  window.location.href = `tel:${number}`
  return diag
}
