import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import loginLogo from '../assets/login-company-logo.png'

export default function ResetPassword() {
  const { user, loading, signOut } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password: form.password })
    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    setMessage('Password updated. Please sign in with your new password.')
    setForm({ password: '', confirm: '' })
    await signOut().catch(() => undefined)
    window.setTimeout(() => navigate('/login', { replace: true }), 1200)
    setSaving(false)
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={loginLogo} alt="RD-Palmer" className="mx-auto mb-4 h-16 w-auto object-contain" />
          <h1 className="text-2xl font-bold text-[#111111]">Reset Password</h1>
          <p className="text-gray-400 text-sm mt-1">Create a new CRM password</p>
        </div>
        <div className="border border-[#E0E0E0] rounded-xl p-6">
          {loading ? (
            <div className="py-6 text-center text-sm text-gray-400">Checking reset link...</div>
          ) : !user ? (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded text-sm">
                This reset link is expired or invalid. Please request a new password reset link.
              </div>
              <Link to="/login" className="block w-full bg-[#CC0000] hover:bg-[#AA0000] text-center text-white py-2.5 rounded-lg font-semibold text-sm transition-colors">
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded text-sm">{error}</div>}
              {message && <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">{message}</div>}
              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1.5 uppercase tracking-wide">New Password</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                  minLength={8}
                  className="w-full border border-[#E0E0E0] rounded-lg px-3 py-2.5 text-sm text-[#111111] focus:outline-none focus:border-[#CC0000] transition-colors"
                  placeholder="Minimum 8 characters"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1.5 uppercase tracking-wide">Confirm Password</label>
                <input
                  type="password"
                  value={form.confirm}
                  onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                  required
                  minLength={8}
                  className="w-full border border-[#E0E0E0] rounded-lg px-3 py-2.5 text-sm text-[#111111] focus:outline-none focus:border-[#CC0000] transition-colors"
                  placeholder="Re-enter password"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-[#CC0000] hover:bg-[#AA0000] text-white py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-60 mt-2"
              >
                {saving ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
        <p className="text-center text-gray-300 text-xs mt-6">RD-Palmer Technology (M) Sdn Bhd © 2026</p>
      </div>
    </div>
  )
}
