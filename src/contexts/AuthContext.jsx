import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { effectivePermissionRoleId, hasAdminAccess } from '../lib/roles'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [permissions, setPermissions] = useState(null) // null = not loaded yet
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const userIdRef = useRef(null)
  const profileRef = useRef(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const nextUser = session?.user ?? null
      userIdRef.current = nextUser?.id ?? null
      setUser(nextUser)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null
      const nextUserId = nextUser?.id ?? null
      const currentUserId = userIdRef.current
      const hasLoadedProfile = Boolean(profileRef.current)

      if (event === 'TOKEN_REFRESHED') {
        userIdRef.current = nextUserId
        setUser(nextUser)
        return
      }

      if (event === 'SIGNED_IN' && nextUserId === currentUserId && hasLoadedProfile) {
        setUser(nextUser)
        return
      }

      userIdRef.current = nextUserId
      setUser(nextUser)
      if (nextUser) fetchProfile(nextUser.id)
      else {
        profileRef.current = null
        setProfile(null)
        setPermissions(null)
        setAuthError('')
        setLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    setLoading(true)
    setAuthError('')
    profileRef.current = null

    const { data: prof, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileError || !prof) {
      console.error('Unable to load user profile', profileError)
      setProfile(null)
      setPermissions({})
      setAuthError('Unable to load your user profile. Please contact an admin.')
      setLoading(false)
      return
    }

    profileRef.current = prof
    setProfile(prof)

    // Admin and Super Admin have access to everything — no DB lookup needed
    if (hasAdminAccess(prof?.role_id)) {
      setPermissions('admin')
    } else if (prof?.role_id) {
      const { data: perms, error: permissionError } = await supabase
        .from('module_permission')
        .select('module, can_access')
        .eq('role_id', effectivePermissionRoleId(prof.role_id))

      if (permissionError) {
        console.error('Unable to load module permissions', permissionError)
        setPermissions({})
        setAuthError('Unable to load module permissions. Please contact an admin.')
        setLoading(false)
        return
      }

      // Build a map: { 'customers': true, 'invoices': false, ... }
      const map = {}
      ;(perms || []).forEach(p => { map[p.module] = p.can_access })
      setPermissions(map)
    } else {
      setPermissions({})
    }

    setLoading(false)
  }

  // Returns true if the current user can access a module.
  // Admin always returns true. Non-admin checks the permissions map.
  function hasPermission(module) {
    if (permissions === 'admin') return true
    if (!permissions) return false
    return permissions[module] === true
  }

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password })
  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ user, profile, permissions, loading, authError, signIn, signOut, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
