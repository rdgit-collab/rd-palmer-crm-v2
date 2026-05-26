import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [permissions, setPermissions] = useState(null) // null = not loaded yet
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setPermissions(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data: prof } = await supabase.from('users').select('*').eq('id', userId).single()
    setProfile(prof)

    // Admin (role_id=1) has access to everything — no DB lookup needed
    if (prof?.role_id === 1) {
      setPermissions('admin')
    } else if (prof?.role_id) {
      const { data: perms } = await supabase
        .from('module_permission')
        .select('module, can_access')
        .eq('role_id', prof.role_id)
      // Build a map: { 'customers': true, 'invoices': false, ... }
      const map = {}
      ;(perms || []).forEach(p => { map[p.module] = p.can_access })
      setPermissions(map)
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
    <AuthContext.Provider value={{ user, profile, permissions, loading, signIn, signOut, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
