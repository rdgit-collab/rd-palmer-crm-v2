import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { effectivePermissionRoleId, isAdminRole } from '../lib/roles'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [permissions, setPermissions] = useState(null) // null = not loaded yet
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setPermissions(null); setAuthError(''); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    setLoading(true)
    setAuthError('')

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

    setProfile(prof)

    // Admin (role_id=1) has access to everything — no DB lookup needed
    if (isAdminRole(prof?.role_id)) {
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
