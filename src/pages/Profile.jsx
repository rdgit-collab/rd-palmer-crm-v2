import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { roleLabel } from '../lib/roles'
import { User, Lock } from 'lucide-react'

export default function Profile() {
  const { user, profile } = useAuth()

  // Profile form state
  const [form, setForm] = useState({
    first_name:  profile?.first_name  || '',
    last_name:   profile?.last_name   || '',
    phone:       profile?.phone       || '',
    position:    profile?.position    || '',
    department:  profile?.department  || '',
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg,    setProfileMsg]    = useState('')
  const [profileError,  setProfileError]  = useState('')

  // Password form state
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg,    setPwMsg]    = useState('')
  const [pwError,  setPwError]  = useState('')

  const currentRoleLabel = roleLabel(profile?.role_id)

  // ── Save profile ──────────────────────────────────────────────────
  const handleProfileSave = async (e) => {
    e.preventDefault()
    setProfileSaving(true)
    setProfileMsg('')
    setProfileError('')

    const { error } = await supabase.from('users').update({
      first_name:  form.first_name,
      last_name:   form.last_name,
      phone:       form.phone       || null,
      position:    form.position    || null,
      department:  form.department  || null,
    }).eq('id', user.id)

    if (error) {
      setProfileError(error.message)
    } else {
      setProfileMsg('Profile updated successfully.')
    }
    setProfileSaving(false)
  }

  // ── Change password ───────────────────────────────────────────────
  const handlePasswordSave = async (e) => {
    e.preventDefault()
    setPwSaving(true)
    setPwMsg('')
    setPwError('')

    if (pwForm.newPw.length < 8) {
      setPwError('Password must be at least 8 characters.')
      setPwSaving(false)
      return
    }
    if (pwForm.newPw !== pwForm.confirm) {
      setPwError('Passwords do not match.')
      setPwSaving(false)
      return
    }

    // Re-authenticate with current password first
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: pwForm.current,
    })
    if (signInErr) {
      setPwError('Current password is incorrect.')
      setPwSaving(false)
      return
    }

    // Update password
    const { error } = await supabase.auth.updateUser({ password: pwForm.newPw })
    if (error) {
      setPwError(error.message)
    } else {
      setPwMsg('Password changed successfully.')
      setPwForm({ current: '', newPw: '', confirm: '' })
    }
    setPwSaving(false)
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        <p className="text-sm text-gray-500 mt-1">{user?.email} · <span className="text-red-600 font-medium">{currentRoleLabel}</span></p>
      </div>

      {/* Profile Info */}
      <div className="bg-white border border-gray-200">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200 bg-gray-50">
          <User size={15} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Personal Information</h2>
        </div>
        <form onSubmit={handleProfileSave} className="p-5 space-y-4">
          {profileMsg   && <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-sm">{profileMsg}</div>}
          {profileError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{profileError}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.first_name}
                onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                required
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                type="text"
                value={form.last_name}
                onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full border border-gray-200 px-3 py-2 text-sm bg-gray-50 text-gray-400"
            />
            <p className="text-xs text-gray-400 mt-1">Email cannot be changed.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              type="text"
              value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="Phone number"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
              <input
                type="text"
                value={form.position}
                onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                placeholder="Job title"
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <input
                type="text"
                value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                placeholder="Department"
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button
              type="submit"
              disabled={profileSaving}
              className="px-6 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
            >
              {profileSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Change Password */}
      <div className="bg-white border border-gray-200">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200 bg-gray-50">
          <Lock size={15} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Change Password</h2>
        </div>
        <form onSubmit={handlePasswordSave} className="p-5 space-y-4">
          {pwMsg   && <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-sm">{pwMsg}</div>}
          {pwError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{pwError}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password <span className="text-red-500">*</span></label>
            <input
              type="password"
              value={pwForm.current}
              onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
              required
              placeholder="Enter current password"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password <span className="text-red-500">*</span></label>
            <input
              type="password"
              value={pwForm.newPw}
              onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))}
              required
              placeholder="Min 8 characters"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password <span className="text-red-500">*</span></label>
            <input
              type="password"
              value={pwForm.confirm}
              onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
              required
              placeholder="Repeat new password"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
            />
          </div>

          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button
              type="submit"
              disabled={pwSaving}
              className="px-6 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
            >
              {pwSaving ? 'Updating...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
