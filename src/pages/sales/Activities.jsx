import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, Search, Eye, Edit2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 15

// These are loaded from DB — kept as fallbacks for badge colours only
const PRIORITY_COLORS = { High: 'bg-red-100 text-red-700', Medium: 'bg-yellow-100 text-yellow-700', Low: 'bg-green-100 text-green-700' }
const STATUS_COLORS   = { Completed: 'bg-green-100 text-green-700', 'In Progress': 'bg-blue-100 text-blue-700', Cancelled: 'bg-gray-100 text-gray-500' }

function priorityColor(p) {
  if (p === 'High')   return 'bg-red-100 text-red-700'
  if (p === 'Medium') return 'bg-yellow-100 text-yellow-700'
  if (p === 'Low')    return 'bg-green-100 text-green-700'
  return 'bg-gray-100 text-gray-600'
}
function statusColor(s) {
  if (s === 'Completed')  return 'bg-green-100 text-green-700'
  if (s === 'In Progress') return 'bg-blue-100 text-blue-700'
  if (s === 'Cancelled')  return 'bg-gray-100 text-gray-500'
  return 'bg-yellow-100 text-yellow-700'
}
function typeColor(t) {
  const map = { Call: 'bg-blue-100 text-blue-700', Meeting: 'bg-purple-100 text-purple-700',
    'Follow-Up': 'bg-orange-100 text-orange-700', Email: 'bg-cyan-100 text-cyan-700',
    Visit: 'bg-indigo-100 text-indigo-700' }
  return map[t] || 'bg-gray-100 text-gray-600'
}

const emptyForm = {
  type: '', priority: '', status: '',
  date: new Date().toISOString().split('T')[0], time: '',
  description: '', lead_id: '', company_id: '', assigned_to: '',
}

export default function Activities() {
  const { user } = useAuth()
  const [view, setView]         = useState('list')
  const [rows, setRows]         = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [typeFilter, setTF]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [editId, setEditId]     = useState(null)
  const [detail, setDetail]     = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const [leads, setLeads]           = useState([])
  const [customers, setCustomers]   = useState([])
  const [users, setUsers]           = useState([])
  const [activityTypes, setActivityTypes] = useState([])
  const [priorities, setPriorities] = useState([])
  const [activityStatuses, setActivityStatuses] = useState([])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('activity').select('*', { count: 'exact' }).order('date', { ascending: false }).order('id', { ascending: false })
    if (search)     q = q.or(`description.ilike.%${search}%,type.ilike.%${search}%`)
    if (typeFilter) q = q.eq('type', typeFilter)
    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    const { data, count, error: err } = await q
    if (!err) { setRows(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, typeFilter, page])

  useEffect(() => { fetchRows() }, [fetchRows])

  useEffect(() => {
    const run = async () => {
      const [leadR, custR, usrR, atR, prioR, statusR] = await Promise.all([
        supabase.from('sales_lead').select('id, company_name, first_name, last_name').order('company_name'),
        supabase.from('customer').select('id, company_name').order('company_name'),
        supabase.from('users').select('id, first_name, last_name').eq('status', 'Active').order('first_name'),
        supabase.from('activity_type').select('id, type').order('type'),
        supabase.from('priority').select('id, name').order('name'),
        supabase.from('activity_status').select('id, name').order('name'),
      ])
      if (!leadR.error)   setLeads(leadR.data || [])
      if (!custR.error)   setCustomers(custR.data || [])
      if (!usrR.error)    setUsers(usrR.data || [])
      if (!atR.error)     setActivityTypes(atR.data || [])
      if (!prioR.error)   setPriorities(prioR.data || [])
      if (!statusR.error) setActivityStatuses(statusR.data || [])
    }
    run()
  }, [])

  const getCompanyName = (companyId) => {
    const c = customers.find(c => String(c.id) === String(companyId))
    return c?.company_name || companyId || '—'
  }
  const getUserName = (id) => {
    const u = users.find(u => u.id == id)
    return u ? `${u.first_name} ${u.last_name}` : '—'
  }

  const openAdd = () => { setForm({ ...emptyForm, date: new Date().toISOString().split('T')[0] }); setEditId(null); setError(''); setView('form') }
  const openEdit = (r) => {
    setForm({
      type: r.type || '', priority: r.priority || '', status: r.status || '',
      date: r.date || '', time: r.time || '', description: r.description || '',
      lead_id: String(r.lead_id || ''), company_id: String(r.company_id || ''),
      assigned_to: String(r.assigned_to || ''),
    })
    setEditId(r.id); setError(''); setView('form')
  }

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    const payload = {
      type: form.type, priority: form.priority, status: form.status,
      date: form.date || null, time: form.time || null, description: form.description,
      lead_id: form.lead_id   ? parseInt(form.lead_id)   : null,
      company_id: form.company_id || null,
      assigned_to: form.assigned_to || null,
      user_id: user?.id,
    }
    const { error: err } = editId
      ? await supabase.from('activity').update(payload).eq('id', editId)
      : await supabase.from('activity').insert([payload])
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); fetchRows(); setView('list')
  }

  const handleDelete = async (id) => {
    await supabase.from('activity').delete().eq('id', id)
    setDeleteId(null); fetchRows()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (view === 'list') return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Activities</h1>
        <button onClick={openAdd} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700"><Plus size={16} /> New Activity</button>
      </div>
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search activities..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-red-400" />
        </div>
        <select value={typeFilter} onChange={e => { setTF(e.target.value); setPage(1) }} className="border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
          <option value="">All Types</option>
          {activityTypes.map(t => <option key={t.id} value={t.type}>{t.type}</option>)}
        </select>
      </div>
      <div className="bg-white border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Type</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Date</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Company</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Priority</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Assigned To</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">No activities found.</td></tr>
            : rows.map(r => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${typeColor(r.type)}`}>{r.type}</span></td>
                <td className="px-4 py-3 text-gray-600">{r.date || '—'} {r.time ? `${r.time}` : ''}</td>
                <td className="px-4 py-3 text-gray-700 font-medium">{getCompanyName(r.company_id)}</td>
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${priorityColor(r.priority)}`}>{r.priority || '—'}</span></td>
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${statusColor(r.status)}`}>{r.status || '—'}</span></td>
                <td className="px-4 py-3 text-gray-600">{getUserName(r.assigned_to)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => { setDetail(r); setView('detail') }} className="text-gray-500 hover:text-gray-700"><Eye size={15} /></button>
                    <button onClick={() => openEdit(r)} className="text-gray-500 hover:text-gray-700"><Edit2 size={15} /></button>
                    <button onClick={() => setDeleteId(r.id)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>{total} activit{total !== 1 ? 'ies' : 'y'}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="p-1 disabled:opacity-40"><ChevronLeft size={16}/></button>
            <span>Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="p-1 disabled:opacity-40"><ChevronRight size={16}/></button>
          </div>
        </div>
      )}
      {deleteId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"><div className="bg-white p-6 w-full max-w-sm shadow-lg"><h3 className="font-semibold mb-2">Delete Activity?</h3><div className="flex justify-end gap-3 mt-4"><button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-gray-200">Cancel</button><button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm bg-red-600 text-white">Delete</button></div></div></div>}
    </div>
  )

  if (view === 'form') return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
        <h1 className="text-2xl font-bold text-gray-900">{editId ? 'Edit Activity' : 'New Activity'}</h1>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      <form onSubmit={handleSave} className="bg-white border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Activity Type <span className="text-red-500">*</span></label>
          <div className="col-span-2">
            <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))} required className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {activityTypes.map(t => <option key={t.id} value={t.type}>{t.type}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Date & Time</label>
          <div className="col-span-2 flex gap-3">
            <input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} className="flex-1 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
            <input type="time" value={form.time} onChange={e => setForm(f => ({...f, time: e.target.value}))} className="w-32 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Customer</label>
          <div className="col-span-2">
            <select value={form.company_id} onChange={e => setForm(f => ({...f, company_id: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Lead</label>
          <div className="col-span-2">
            <select value={form.lead_id} onChange={e => setForm(f => ({...f, lead_id: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.company_name || `${l.first_name} ${l.last_name}`}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Priority</label>
          <div className="col-span-2">
            <select value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {priorities.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Status</label>
          <div className="col-span-2">
            <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {activityStatuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Assigned To</label>
          <div className="col-span-2">
            <select value={form.assigned_to} onChange={e => setForm(f => ({...f, assigned_to: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <label className="text-sm font-medium text-gray-700 pt-2">Description <span className="text-red-500">*</span></label>
          <div className="col-span-2">
            <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} required rows={4} placeholder="Activity notes..." className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={() => setView('list')} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="px-6 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">{saving ? 'Saving...' : editId ? 'Update' : 'Save'}</button>
        </div>
      </form>
    </div>
  )

  if (view === 'detail' && detail) return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
          <h1 className="text-2xl font-bold text-gray-900">Activity Detail</h1>
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${typeColor(detail.type)}`}>{detail.type}</span>
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusColor(detail.status)}`}>{detail.status}</span>
        </div>
        <button onClick={() => openEdit(detail)} className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"><Edit2 size={14}/> Edit</button>
      </div>
      <div className="bg-white border border-gray-200 p-6 text-sm space-y-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <div><span className="font-medium text-gray-500">Type: </span><span className={`inline-block px-2 py-0.5 text-xs rounded ${typeColor(detail.type)}`}>{detail.type}</span></div>
          <div><span className="font-medium text-gray-500">Date: </span>{detail.date || '—'} {detail.time || ''}</div>
          <div><span className="font-medium text-gray-500">Company: </span>{getCompanyName(detail.company_id)}</div>
          <div><span className="font-medium text-gray-500">Priority: </span><span className={`inline-block px-2 py-0.5 text-xs rounded ${priorityColor(detail.priority)}`}>{detail.priority}</span></div>
          <div><span className="font-medium text-gray-500">Status: </span><span className={`inline-block px-2 py-0.5 text-xs rounded ${statusColor(detail.status)}`}>{detail.status}</span></div>
          <div><span className="font-medium text-gray-500">Assigned To: </span>{getUserName(detail.assigned_to)}</div>
        </div>
        <div className="border-t border-gray-100 pt-4">
          <p className="font-medium text-gray-500 mb-1">Description</p>
          <p className="whitespace-pre-wrap text-gray-800">{detail.description || '—'}</p>
        </div>
      </div>
    </div>
  )

  return null
}
