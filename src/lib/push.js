// Push-notification token registration (native app only).
//
// Requests permission, registers with the OS push service, and stores the
// device token in `push_tokens` so the server can later send notifications.
// No-ops on web and degrades gracefully if Firebase isn't configured yet
// (so it never breaks the app or the Android build).
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/lib/supabase'

// Track WHO we registered for — a logout/login as another user must re-upsert
// the token under the new user, not leave it pointing at the first one.
let startedForUser = null

export async function registerPush(userId) {
  if (!userId || startedForUser === userId || !Capacitor.isNativePlatform()) return
  startedForUser = userId

  let PushNotifications
  try {
    ({ PushNotifications } = await import('@capacitor/push-notifications'))
  } catch {
    return // plugin not available
  }

  try {
    // Drop listeners from a previous user's registration so the token can't
    // be upserted under the old user_id.
    await PushNotifications.removeAllListeners()
    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') return

    await PushNotifications.addListener('registration', async (token) => {
      try {
        await supabase.from('push_tokens').upsert(
          {
            user_id: userId,
            token: token.value,
            platform: Capacitor.getPlatform(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'token' },
        )
      } catch (e) {
        console.warn('push token save failed', e)
      }
    })
    await PushNotifications.addListener('registrationError', (e) =>
      console.warn('push registration error', e),
    )

    await PushNotifications.register()
  } catch (e) {
    // e.g. Firebase (google-services.json) not configured yet — safe to ignore.
    console.warn('push setup skipped:', e?.message || e)
  }
}
