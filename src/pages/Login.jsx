import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import loginLogo from '../assets/login-company-logo.png'

const REMEMBER_EMAIL_KEY = 'rdp_crm_remembered_email'

export default function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBER_EMAIL_KEY) || '')
  const [password, setPassword] = useState('')
  const [rememberEmail, setRememberEmail] = useState(() => Boolean(localStorage.getItem(REMEMBER_EMAIL_KEY)))
  const [resetMode, setResetMode] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const { signIn, user } = useAuth()

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    const cleanEmail = email.trim()
    const { error } = await signIn(cleanEmail, password)
    if (error) {
      setError(error.message)
    } else if (rememberEmail) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, cleanEmail)
    } else {
      localStorage.removeItem(REMEMBER_EMAIL_KEY)
    }
    setLoading(false)
  }

  async function handlePasswordReset(e) {
    e.preventDefault()
    setError('')
    setMessage('')

    const cleanEmail = email.trim()
    if (!cleanEmail) {
      setError('Enter your email address first.')
      return
    }

    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage('If this email has an active CRM account, a password reset link has been sent.')
    }
    setResetLoading(false)
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={loginLogo} alt="RD-Palmer" className="mx-auto mb-4 h-16 w-auto object-contain" />
          <h1 className="text-2xl font-bold text-[#111111]">CRM SYSTEM</h1>
          <p className="text-gray-400 text-sm mt-1">Sign in to continue</p>
        </div>
        <div className="border border-[#E0E0E0] rounded-xl p-6">
          <form onSubmit={resetMode ? handlePasswordReset : handleSubmit} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded text-sm">{error}</div>}
            {message && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">{message}</div>}
            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-1.5 uppercase tracking-wide">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full border border-[#E0E0E0] rounded-lg px-3 py-2.5 text-sm text-[#111111] focus:outline-none focus:border-[#CC0000] transition-colors"
                placeholder="you@rd-palmer.com" />
            </div>
            {!resetMode && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[#111111] mb-1.5 uppercase tracking-wide">Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                    className="w-full border border-[#E0E0E0] rounded-lg px-3 py-2.5 text-sm text-[#111111] focus:outline-none focus:border-[#CC0000] transition-colors"
                    placeholder="••••••••" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={rememberEmail}
                      onChange={e => {
                        setRememberEmail(e.target.checked)
                        if (!e.target.checked) localStorage.removeItem(REMEMBER_EMAIL_KEY)
                      }}
                      className="h-4 w-4 rounded border-gray-300 accent-[#CC0000]"
                    />
                    Remember email
                  </label>
                  <button
                    type="button"
                    onClick={() => { setResetMode(true); setError(''); setMessage('') }}
                    className="text-xs font-medium text-[#CC0000] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              </>
            )}
            <button type="submit" disabled={loading || resetLoading}
              className="w-full bg-[#CC0000] hover:bg-[#AA0000] text-white py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-60 mt-2">
              {resetMode
                ? (resetLoading ? 'Sending reset link...' : 'Send Reset Link')
                : (loading ? 'Signing in...' : 'Sign In')}
            </button>
            {resetMode && (
              <button
                type="button"
                onClick={() => { setResetMode(false); setError(''); setMessage('') }}
                className="w-full border border-gray-200 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Back to Sign In
              </button>
            )}
          </form>
        </div>
        <p className="text-center text-gray-300 text-xs mt-6">RD-Palmer Technology (M) Sdn Bhd © 2026</p>
      </div>
    </div>
  )
}
