import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { App } from '@capacitor/app'
import { supabase } from '@/lib/supabase'
import { registerPush } from '@/lib/push'

// Deep link the OAuth redirect comes back to inside the native app.
const NATIVE_REDIRECT = 'vaadplus://auth-callback'

const AuthContext = createContext(null)

// localStorage key per user: remembers that onboarding was completed
const ONBOARDING_KEY = (uid) => `vc_onboarding_done_${uid}`

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [onboardingChecked, setOnboardingChecked] = useState(false)

  const fetchProfile = useCallback(async (userId, userEmail) => {
    if (!userId) { setProfile(null); setOnboardingChecked(false); return }

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    let resolved = data

    // Skip auto-match for admins/committee or already-linked users
    const isPrivileged = data?.role === 'admin' || data?.role === 'committee'
    const alreadyLinked = !!data?.unit_id
    // Only trust the "done" flag when unit_id is actually persisted in the DB.
    // If the flag exists but unit_id is null (e.g. a previous attempt that failed
    // before profiles had the unit_id column), retry the auto-match.
    const doneBefore = !!localStorage.getItem(ONBOARDING_KEY(userId)) && !!data?.unit_id

    if (!isPrivileged && !alreadyLinked && !doneBefore && userEmail) {
      // Auto-link + auto-VERIFY only when the email matches a vaad-created
      // resident record (admin already vouched for them). Runs server-side
      // (SECURITY DEFINER) so it can set is_verified. Self-onboarded residents
      // with no matching record stay unverified → pending admin approval.
      const { data: matched } = await supabase.rpc('claim_verified_unit')
      if (matched) {
        const { data: refetched } = await supabase
          .from('profiles').select('*').eq('id', userId).single()
        resolved = refetched ?? resolved
        localStorage.setItem(ONBOARDING_KEY(userId), 'auto')
      }
    }

    setProfile(resolved)
    setOnboardingChecked(true)
  }, [])

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      fetchProfile(u?.id, u?.email).finally(() => setLoading(false))
      if (u?.id) registerPush(u.id)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      fetchProfile(u?.id, u?.email)
      if (u?.id) registerPush(u.id)
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  // Native app only: when Google OAuth redirects back to the app via the
  // vaadplus:// deep link, complete the PKCE exchange and close the browser.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let handle
    App.addListener('appUrlOpen', async ({ url }) => {
      if (!url || !url.includes('code=')) return
      const code = (() => {
        try { return new URL(url).searchParams.get('code') } catch { return null }
      })() || url.match(/[?&]code=([^&]+)/)?.[1]
      if (!code) return
      try {
        await supabase.auth.exchangeCodeForSession(code)
      } catch (e) {
        console.error('exchangeCodeForSession error', e)
      }
      try { await Browser.close() } catch { /* may already be closed */ }
    }).then(h => { handle = h })
    return () => { handle?.remove?.() }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const native = Capacitor.isNativePlatform()
    const { data } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: native ? NATIVE_REDIRECT : window.location.origin,
        // In the app, open the OAuth page ourselves (in an in-app browser tab)
        // so the vaadplus:// redirect lands back in the app.
        skipBrowserRedirect: native,
      },
    })
    if (native && data?.url) {
      await Browser.open({ url: data.url })
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } catch (e) {
      console.error('signOut error', e)
    }
    setUser(null)
    setProfile(null)
    // Hard-redirect to the login screen so the Google sign-in button is always
    // reachable after logout, regardless of re-render timing.
    window.location.assign('/login')
  }, [])

  const isAdmin = profile?.role === 'admin'
  const isCommittee = profile?.role === 'admin' || profile?.role === 'committee'
  const isResident = !!profile

  // True when a non-admin user is logged in but has not yet been linked to a unit
  const needsOnboarding = !loading && !!user && onboardingChecked &&
    !isCommittee && !profile?.unit_id &&
    !localStorage.getItem(ONBOARDING_KEY(user?.id))

  const updateProfile = useCallback(async (updates) => {
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select()
      .single()
    setProfile(data)
    return data
  }, [user])

  // Called by ResidentOnboarding after successful unit selection
  const completeOnboarding = useCallback(async (unitId, buildingId) => {
    if (!user) return
    await supabase
      .from('profiles')
      .update({ unit_id: unitId, building_id: buildingId, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    localStorage.setItem(ONBOARDING_KEY(user.id), 'manual')
    await fetchProfile(user.id, user.email)
  }, [user, fetchProfile])

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      isAdmin, isCommittee, isResident, needsOnboarding,
      signInWithGoogle, signOut, updateProfile, completeOnboarding,
      refetchProfile: () => fetchProfile(user?.id, user?.email)
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
