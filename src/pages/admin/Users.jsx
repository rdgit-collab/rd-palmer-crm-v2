import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  ROLE_ADMIN,
  ROLE_SALES,
  ROLE_SERVICE,
  ROLE_SALES_MANAGER,
  ROLE_SUPER_ADMIN,
  isSuperAdminRole,
  roleColor,
  roleLabel,
} from '../../lib/roles'
import PaginationControls from '../../components/PaginationControls'
import { Plus, Search, Edit2, UserX, UserCheck, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 15

const ROLES = [
  { id: ROLE_ADMIN, label: 'Admin' },
  { id: ROLE_SALES, label: 'Sales' },
  { id: ROLE_SERVICE, label: 'Service' },
  { id: ROLE_SALES_MANAGER, label: 'Sales Manager' },
  { id: ROLE_SUPER_ADMIN, label: 'Super Admin' },
]

const emptyForm = {
  first_name: '', last_name: '', email: '', password: '',
  role_id: '2', position: '', department: '', phone: '',
}

export default function Users() {
  const { user: currentUser, profile } = useAuth()
  const [view, setView]             = useState('list')
  const [rows, setRows]             = useState([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(false)
  const [form, setForm]             = useState(emptyForm)
  const [editId, setEditId]         = useState(null)
  const [confirmToggle, setConfirmToggle] = useState(null) // { id, name, activate }
  const [toggling, setToggling]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const canManageSuperAdmin = isSuperAdminRole(profile?.role_id)
  const availableRoles = canManageSuperAdmin
    ? ROLES
    : ROLES.filter(role => role.id !== ROLE_SUPER_ADMIN)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('users')
      .select('id, first_name, last_name, email, role_id, position, department, phone, status, created_at', { count: 'exact' })
      .order('first_name')
    if (search) q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`)
    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    const { data, count, error: err } = await q
    if (!err) { setRows(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, page])

  useEffect(() => { fetchRows() }, [fetchRows])

  const openAdd = () => { setForm(emptyForm); setEditId(null); setError(''); setView('form') }
  const openEdit = (r) => {
    if (isSuperAdminRole(r.role_id) && !canManageSuperAdmin) {
      setError('Only a Super Admin can edit a Super Admin account.')
      return
    }
    setForm({
      first_name: r.first_name || '', last_name: r.last_name || '',
      email: r.email || '', password: '',
      role_id: String(r.role_id || '2'), position: r.position || '',
      department: r.department || '', phone: r.phone || '',
    })
    setEditId(r.id); setError(''); setView('form')
  }

  // ── Deactivate / Reactivate ─────────────────────────────────────────────────
  const handleToggleActive = async () => {
    if (!confirmToggle) return
    if (isSuperAdminRole(confirmToggle.role_id) && !canManageSuperAdmin) {
      setError('Only a Super Admin can change a Super Admin account status.')
      setConfirmToggle(null)
      return
    }
    setToggling(true)
    const { id, activate } = confirmToggle

    // 1. Ban / unban in Supabase Auth (blocks actual login)
    await supabase.rpc('toggle_user_active', { p_user_id: id, p_active: activate })

    // 2. Update status label in our users table
    await supabase.from('users').update({ status: activate ? 'Active' : 'Inactive' }).eq('id', id)

    setToggling(false)
    setConfirmToggle(null)
    fetchRows()
  }

  // ── Save (create / edit) ────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true); setError('')

    if (editId) {
      if (isSuperAdminRole(form.role_id) && !canManageSuperAdmin) {
        setError('Only a Super Admin can assign the Super Admin role.')
        setSaving(false)
        return
      }
      const payload = {
        first_name: form.first_name, last_name: form.last_name,
        role_id: parseInt(form.role_id), position: form.position || null,
        department: form.department || null, phone: form.phone || null,
      }
      const { error: err } = await supabase.from('users').update(payload).eq('id', editId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      if (isSuperAdminRole(form.role_id) && !canManageSuperAdmin) {
        setError('Only a Super Admin can create a Super Admin account.')
        setSaving(false)
        return
      }
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            first_name: form.first_name,
            last_name: form.last_name,
            role_id: form.role_id,
            position: form.position,
            department: form.department,
            phone: form.phone,
          },
        },
      })
      if (authErr) { setError(authErr.message); setSaving(false); return }
      if (authData?.user?.id) {
        await supabase.from('users').update({
          first_name: form.first_name, last_name: form.last_name,
          role_id: parseInt(form.role_id), position: form.position || null,
          department: form.department || null, phone: form.phone || null,
          status: 'Active',
        }).eq('id', authData.user.id)
      }
    }

    setSaving(false); fetchRows(); setView('list')
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── List View ────────────────────────────────────────────────────────────────
  if (view === 'list') return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <button onClick={openAdd} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700">
          <Plus size={16} /> Add User
        </button>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

      <div className="relative max-w-sm mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search by name or email..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-red-400" />
      </div>

      <div className="bg-white border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Email</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Role</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Department</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading...</td></tr>
              : rows.length === 0
              ? <tr><td colSpan={6} className="text-center py-12 text-gray-400">No users found.</td></tr>
              : rows.map(r => {
                  const isActive = r.status !== 'Inactive'
                  const isMe = r.id === currentUser?.id
                  const isProtectedSuperAdmin = isSuperAdminRole(r.role_id) && !canManageSuperAdmin
                  return (
                    <tr key={r.id} className={`border-b border-gray-100 ${isActive ? 'hover:bg-gray-50' : 'bg-gray-50 opacity-60'}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {r.first_name} {r.last_name}
                        {isMe && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.email}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${roleColor(r.role_id)}`}>
                          {roleLabel(r.role_id)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.department || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 text-xs rounded font-medium ${
                          isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
                        }`}>
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(r)} title={isProtectedSuperAdmin ? 'Only Super Admin can edit this account' : 'Edit'}
                            disabled={isProtectedSuperAdmin}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed">
                            <Edit2 size={15} />
                          </button>
                          {!isMe && !isProtectedSuperAdmin && (
                            isActive ? (
                              <button
                                onClick={() => setConfirmToggle({ id: r.id, role_id: r.role_id, name: `${r.first_name} ${r.last_name}`, activate: false })}
                                title="Deactivate account"
                                className="text-gray-400 hover:text-red-600">
                                <UserX size={15} />
                              </button>
                            ) : (
                              <button
                                onClick={() => setConfirmToggle({ id: r.id, role_id: r.role_id, name: `${r.first_name} ${r.last_name}`, activate: true })}
                                title="Reactivate account"
                                className="text-gray-400 hover:text-green-600">
                                <UserCheck size={15} />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
            }
          </tbody>
        </table>
      </div>

      <PaginationControls page={page} totalPages={totalPages} total={total} label="user" onPageChange={setPage} />

      {/* Deactivate / Reactivate confirmation modal */}
      {confirmToggle && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 w-full max-w-sm shadow-lg rounded">
            <div className="flex items-center gap-3 mb-3">
              {confirmToggle.activate
                ? <UserCheck size={20} className="text-green-600 flex-shrink-0" />
                : <UserX size={20} className="text-red-600 flex-shrink-0" />
              }
              <h3 className="font-semibold text-gray-900">
                {confirmToggle.activate ? 'Reactivate Account?' : 'Deactivate Account?'}
              </h3>
            </div>
            {confirmToggle.activate ? (
              <p className="text-sm text-gray-600 mb-4">
                <strong>{confirmToggle.name}</strong> will be able to log in again and will appear in assignment dropdowns.
              </p>
            ) : (
              <p className="text-sm text-gray-600 mb-4">
                <strong>{confirmToggle.name}</strong> will be immediately blocked from logging in.
                All their past records (tickets, tasks, quotations) are kept intact.
                You can reactivate the account at any time.
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmToggle(null)} disabled={toggling}
                className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleToggleActive} disabled={toggling}
                className={`px-4 py-2 text-sm text-white disabled:opacity-50 ${
                  confirmToggle.activate ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                }`}>
                {toggling ? 'Please wait…' : confirmToggle.activate ? 'Reactivate' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // ── Form View (Add / Edit) ──────────────────────────────────────────────────
  if (view === 'form') return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
        <h1 className="text-2xl font-bold text-gray-900">{editId ? 'Edit User' : 'Add User'}</h1>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      <form onSubmit={handleSave} className="bg-white border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.first_name} onChange={e => setForm(f => ({...f, first_name: e.target.value}))} required
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
            <input type="text" value={form.last_name} onChange={e => setForm(f => ({...f, last_name: e.target.value}))}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Email <span className="text-red-500">*</span></label>
          <div className="col-span-2">
            <input type="email" value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))} required disabled={!!editId}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 disabled:bg-gray-50 disabled:text-gray-400" />
            {editId && <p className="text-xs text-gray-400 mt-1">Email cannot be changed after creation.</p>}
          </div>
        </div>
        {!editId && (
          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Password <span className="text-red-500">*</span></label>
            <div className="col-span-2">
              <input type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))}
                required placeholder="Min 8 characters"
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
              <p className="text-xs text-gray-400 mt-1">Stored in Supabase Auth only. Users can change it from their profile.</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Role <span className="text-red-500">*</span></label>
          <div className="col-span-2">
            <select value={form.role_id} onChange={e => setForm(f => ({...f, role_id: e.target.value}))}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              {availableRoles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Position</label>
          <div className="col-span-2">
            <input type="text" value={form.position} onChange={e => setForm(f => ({...f, position: e.target.value}))} placeholder="Job title"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Department</label>
          <div className="col-span-2">
            <input type="text" value={form.department} onChange={e => setForm(f => ({...f, department: e.target.value}))} placeholder="Department"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Phone</label>
          <div className="col-span-2">
            <input type="text" value={form.phone} onChange={e => setForm(f => ({...f, phone: e.target.value}))} placeholder="Phone number"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={() => setView('list')} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="px-6 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">
            {saving ? 'Saving...' : editId ? 'Update' : 'Create User'}
          </button>
        </div>
      </form>
    </div>
  )

  return null
}
