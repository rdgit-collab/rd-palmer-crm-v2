import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAssignableUsers, getLegacyUserId, getUserName as formatUserName } from '../../lib/legacyUsers'
import { Plus, Search, Eye, Edit2, Trash2, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 15

function statusColor(s) {
  if (!s) return 'bg-gray-100 text-gray-600'
  const l = s.toLowerCase()
  if (l === 'open')      return 'bg-blue-100 text-blue-700'
  if (l === 'completed') return 'bg-green-100 text-green-700'
  if (l === 'pending')   return 'bg-yellow-100 text-yellow-700'
  return 'bg-gray-100 text-gray-600'
}

const emptyForm = {
  ticket_id: '', product: '', issue_description: '', serial_number: '',
  location: '', vandor_order_ref: '', spare: '', remark: '',
  assigned_to: '', status: 'Open', workdone: '',
  date: new Date().toISOString().split('T')[0],
}

export default function OnsiteTickets() {
  const { profile } = useAuth()
  const [view, setView]           = useState('list')
  const [tab, setTab]             = useState('open')
  const [rows, setRows]           = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(false)
  const [form, setForm]           = useState(emptyForm)
  const [editId, setEditId]       = useState(null)
  const [detail, setDetail]       = useState(null)
  const [deleteId, setDeleteId]   = useState(null)
  const [completeId, setCompleteId] = useState(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [tickets, setTickets]     = useState([])
  const [users, setUsers]         = useState([])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('onsiteticket').select('*', { count: 'exact' })
      .eq('is_completed', tab === 'open' ? 0 : 1).order('id', { ascending: false })
    if (search) q = q.or(`product.ilike.%${search}%,location.ilike.%${search}%`)
    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    const { data, count, error: err } = await q
    if (!err) { setRows(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, page, tab])

  useEffect(() => { fetchRows() }, [fetchRows])

  useEffect(() => {
    const run = async () => {
      const [tickR, usrR] = await Promise.all([
        supabase.from('ticket').select('id, ticket_id, company_name').eq('is_completed', 0).order('id', { ascending: false }),
        fetchAssignableUsers(supabase),
      ])
      if (!tickR.error) setTickets(tickR.data || [])
      setUsers(usrR || [])
    }
    run()
  }, [])

  const getTicketLabel = (tid) => {
    const t = tickets.find(t => t.id == tid)
    return t ? `TID${t.ticket_id} — ${t.company_name || ''}` : tid ? `#${tid}` : '—'
  }
  const getUserName = (id) => {
    return formatUserName(users, id)
  }

  const openAdd = () => { setForm({ ...emptyForm, date: new Date().toISOString().split('T')[0] }); setEditId(null); setError(''); setView('form') }
  const openEdit = (r) => {
    setForm({
      ticket_id: String(r.ticket_id || ''), product: r.product || '',
      issue_description: r.issue_description || '', serial_number: r.serial_number || '',
      location: r.location || '', vandor_order_ref: r.vandor_order_ref || '',
      spare: r.spare || '', remark: r.remark || '',
      assigned_to: String(r.assigned_to || ''), status: r.status || 'Open',
      workdone: r.workdone || '', date: r.date || '',
    })
    setEditId(r.id); setError(''); setView('form')
  }

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    const payload = {
      ticket_id: form.ticket_id ? parseInt(form.ticket_id) : null,
      product: form.product, issue_description: form.issue_description || null,
      serial_number: form.serial_number || null, location: form.location || null,
      vandor_order_ref: form.vandor_order_ref || null, spare: form.spare || null,
      remark: form.remark || null,
      assigned_to: form.assigned_to ? parseInt(form.assigned_to) : null,
      status: form.status, is_completed: form.status === 'Completed' ? 1 : 0,
      workdone: form.workdone || null, date: form.date || null, user_id: getLegacyUserId(profile),
    }
    const { error: err } = editId
      ? await supabase.from('onsiteticket').update(payload).eq('id', editId)
      : await supabase.from('onsiteticket').insert([payload])
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); fetchRows(); setView('list')
  }

  const markComplete = async (id) => {
    await supabase.from('onsiteticket').update({ is_completed: 1, status: 'Completed' }).eq('id', id)
    setCompleteId(null); fetchRows()
  }
  const handleDelete = async (id) => {
    await supabase.from('onsiteticket').delete().eq('id', id)
    setDeleteId(null); fetchRows()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (view === 'list') return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">On-Site Service Tickets</h1>
        <button onClick={openAdd} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700"><Plus size={16} /> New Onsite Ticket</button>
      </div>
      {/* Open / Closed tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {[['open', 'Open'], ['closed', 'Closed']].map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setPage(1) }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >{label}</button>
        ))}
      </div>
      <div className="relative flex-1 max-w-sm mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search product or location..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-red-400" />
      </div>
      <div className="bg-white border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Ticket</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Date</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Product</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Location</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Assigned To</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">No {tab} onsite tickets.</td></tr>
            : rows.map(r => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-red-600">{getTicketLabel(r.ticket_id)}</td>
                <td className="px-4 py-3 text-gray-600">{r.date || '—'}</td>
                <td className="px-4 py-3 text-gray-800">{r.product || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{r.location || '—'}</td>
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${statusColor(r.status)}`}>{r.status || 'Open'}</span></td>
                <td className="px-4 py-3 text-gray-600">{getUserName(r.assigned_to)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => { setDetail(r); setView('detail') }} className="text-gray-500 hover:text-gray-700"><Eye size={15} /></button>
                    <button onClick={() => openEdit(r)} className="text-gray-500 hover:text-gray-700"><Edit2 size={15} /></button>
                    {tab === 'open' && <button onClick={() => setCompleteId(r.id)} className="text-green-600 hover:text-green-700"><CheckCircle size={15} /></button>}
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
          <span>{total} record{total !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="p-1 disabled:opacity-40"><ChevronLeft size={16}/></button>
            <span>Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="p-1 disabled:opacity-40"><ChevronRight size={16}/></button>
          </div>
        </div>
      )}
      {completeId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"><div className="bg-white p-6 w-full max-w-sm shadow-lg"><h3 className="font-semibold text-gray-900 mb-2">Mark as Completed?</h3><div className="flex justify-end gap-3 mt-4"><button onClick={() => setCompleteId(null)} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button><button onClick={() => markComplete(completeId)} className="px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700">Confirm</button></div></div></div>}
      {deleteId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"><div className="bg-white p-6 w-full max-w-sm shadow-lg"><h3 className="font-semibold text-gray-900 mb-2">Delete Onsite Ticket?</h3><div className="flex justify-end gap-3 mt-4"><button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button><button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700">Delete</button></div></div></div>}
    </div>
  )

  if (view === 'form') return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
        <h1 className="text-2xl font-bold text-gray-900">{editId ? 'Edit Onsite Ticket' : 'New Onsite Ticket'}</h1>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      <form onSubmit={handleSave} className="bg-white border border-gray-200 p-6 space-y-5">
        {[
          ['Date', <input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />],
          ['Ticket *', <select value={form.ticket_id} onChange={e => setForm(f => ({...f, ticket_id: e.target.value}))} required className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"><option value="">Please Select</option>{tickets.map(t => <option key={t.id} value={t.id}>TID{t.ticket_id} — {t.company_name}</option>)}</select>],
          ['Product *', <input type="text" value={form.product} onChange={e => setForm(f => ({...f, product: e.target.value}))} required placeholder="Product name" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />],
          ['Serial Number', <input type="text" value={form.serial_number} onChange={e => setForm(f => ({...f, serial_number: e.target.value}))} placeholder="S/N" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />],
          ['Location', <input type="text" value={form.location} onChange={e => setForm(f => ({...f, location: e.target.value}))} placeholder="Site location" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />],
          ['Vendor Order Ref', <input type="text" value={form.vandor_order_ref} onChange={e => setForm(f => ({...f, vandor_order_ref: e.target.value}))} placeholder="Vendor reference" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />],
          ['Spare Used', <input type="text" value={form.spare} onChange={e => setForm(f => ({...f, spare: e.target.value}))} placeholder="Spare part" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />],
        ].map(([label, el], i) => (
          <div key={i} className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">{label}</label>
            <div className="col-span-2">{el}</div>
          </div>
        ))}
        {[
          ['Issue Description', 'issue_description', 'Describe the issue...'],
          ['Work Done', 'workdone', 'Work performed...'],
          ['Remark', 'remark', 'Remarks...'],
        ].map(([label, field, ph]) => (
          <div key={field} className="grid grid-cols-3 gap-4">
            <label className="text-sm font-medium text-gray-700 pt-2">{label}</label>
            <div className="col-span-2">
              <textarea value={form[field]} onChange={e => setForm(f => ({...f, [field]: e.target.value}))} rows={3} placeholder={ph}
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
            </div>
          </div>
        ))}
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Status *</label>
          <div className="col-span-2">
            <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))} required className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option>Open</option><option>Pending</option><option>Completed</option>
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
          <h1 className="text-2xl font-bold text-gray-900">Onsite Ticket Detail</h1>
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusColor(detail.status)}`}>{detail.status}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openEdit(detail)} className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"><Edit2 size={14}/> Edit</button>
          {detail.is_completed === 0 && <button onClick={() => setCompleteId(detail.id)} className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 text-sm hover:bg-green-700"><CheckCircle size={14}/> Mark Complete</button>}
        </div>
      </div>
      <div className="bg-white border border-gray-200 p-6 space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <div><span className="font-medium text-gray-500">Ticket: </span><span className="text-red-600 font-semibold">{getTicketLabel(detail.ticket_id)}</span></div>
          <div><span className="font-medium text-gray-500">Date: </span>{detail.date || '—'}</div>
          <div><span className="font-medium text-gray-500">Product: </span>{detail.product || '—'}</div>
          <div><span className="font-medium text-gray-500">Serial Number: </span>{detail.serial_number || '—'}</div>
          <div><span className="font-medium text-gray-500">Location: </span>{detail.location || '—'}</div>
          <div><span className="font-medium text-gray-500">Vendor Ref: </span>{detail.vandor_order_ref || '—'}</div>
          <div><span className="font-medium text-gray-500">Spare: </span>{detail.spare || '—'}</div>
          <div><span className="font-medium text-gray-500">Assigned To: </span>{getUserName(detail.assigned_to)}</div>
        </div>
        {detail.issue_description && <div className="border-t border-gray-100 pt-4"><p className="font-medium text-gray-500 mb-1">Issue Description</p><p className="whitespace-pre-wrap">{detail.issue_description}</p></div>}
        {detail.workdone && <div className="border-t border-gray-100 pt-4"><p className="font-medium text-gray-500 mb-1">Work Done</p><p className="whitespace-pre-wrap">{detail.workdone}</p></div>}
        {detail.remark && <div className="border-t border-gray-100 pt-4"><p className="font-medium text-gray-500 mb-1">Remark</p><p className="whitespace-pre-wrap">{detail.remark}</p></div>}
      </div>
      {completeId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"><div className="bg-white p-6 w-full max-w-sm shadow-lg"><h3 className="font-semibold mb-2">Mark as Completed?</h3><div className="flex justify-end gap-3 mt-4"><button onClick={() => setCompleteId(null)} className="px-4 py-2 text-sm border border-gray-200">Cancel</button><button onClick={async () => { await markComplete(completeId); setView('list') }} className="px-4 py-2 text-sm bg-green-600 text-white">Confirm</button></div></div></div>}
    </div>
  )

  return null
}
