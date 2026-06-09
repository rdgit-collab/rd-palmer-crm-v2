import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import loginLogo from '../assets/login-company-logo.png'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, user } = useAuth()

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError(error.message)
    setLoading(false)
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
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded text-sm">{error}</div>}
            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-1.5 uppercase tracking-wide">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full border border-[#E0E0E0] rounded-lg px-3 py-2.5 text-sm text-[#111111] focus:outline-none focus:border-[#CC0000] transition-colors"
                placeholder="you@rd-palmer.com" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-1.5 uppercase tracking-wide">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                className="w-full border border-[#E0E0E0] rounded-lg px-3 py-2.5 text-sm text-[#111111] focus:outline-none focus:border-[#CC0000] transition-colors"
                placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-[#CC0000] hover:bg-[#AA0000] text-white py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-60 mt-2">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
        <p className="text-center text-gray-300 text-xs mt-6">RD-Palmer Technology (M) Sdn Bhd © 2026</p>
      </div>
    </div>
  )
}
