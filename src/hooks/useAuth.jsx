import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

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
    const doneBefore = !!localStorage.getItem(ONBOARDING_KEY(userId))

    if (!isPrivileged && !alreadyLinked && !doneBefore && userEmail) {
      // Try to auto-match by email in unit_residents
      const { data: resident } = await supabase
        .from('unit_residents')
        .select('unit_id, building_id')
        .eq('email', userEmail)
        .limit(1)
        .maybeSingle()

      if (resident?.unit_id) {
        // Auto-link: update profiles row
        const { data: updated } = await supabase
          .from('profiles')
          .update({ unit_id: resident.unit_id, building_id: resident.building_id })
          .eq('id', userId)
          .select()
          .single()
        resolved = updated ?? { ...data, unit_id: resident.unit_id, building_id: resident.building_id }
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
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      fetchProfile(u?.id, u?.email)
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      }
    })
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
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
