import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, Search, Eye, Edit2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 15

function statusColor(s) {
  if (!s) return 'bg-gray-100 text-gray-600'
  const l = s.toLowerCase()
  if (l === 'pass' || l === 'passed') return 'bg-green-100 text-green-700'
  if (l === 'fail' || l === 'failed') return 'bg-red-100 text-red-700'
  if (l === 'pending')                return 'bg-yellow-100 text-yellow-700'
  return 'bg-gray-100 text-gray-600'
}

const emptyForm = {
  ticket_id: '', certificate_number: '', serial_number: '',
  snumber: '', conduct_by: '', status: '', remark: '',
}

export default function Calibration() {
  const { user } = useAuth()
  const [view, setView]         = useState('list')
  const [rows, setRows]         = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [editId, setEditId]     = useState(null)
  const [detail, setDetail]     = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [tickets, setTickets]   = useState([])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('calibration').select('*', { count: 'exact' }).order('id', { ascending: false })
    if (search) q = q.or(`certificate_number.ilike.%${search}%,serial_number.ilike.%${search}%,conduct_by.ilike.%${search}%`)
    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    const { data, count, error: err } = await q
    if (!err) { setRows(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, page])

  useEffect(() => { fetchRows() }, [fetchRows])

  useEffect(() => {
    supabase.from('ticket').select('id, ticket_id, company_name').order('id', { ascending: false })
      .then(({ data }) => setTickets(data || []))
  }, [])

  const getTicketLabel = (tid) => {
    const t = tickets.find(t => t.id == tid)
    return t ? `TID${t.ticket_id} — ${t.company_name || ''}` : tid ? `#${tid}` : '—'
  }

  const openAdd = () => { setForm(emptyForm); setEditId(null); setError(''); setView('form') }
  const openEdit = (r) => {
    setForm({
      ticket_id: String(r.ticket_id || ''), certificate_number: r.certificate_number || '',
      serial_number: r.serial_number || '', snumber: r.snumber || '',
      conduct_by: r.conduct_by || '', status: r.status || '', remark: r.remark || '',
    })
    setEditId(r.id); setError(''); setView('form')
  }

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    const payload = {
      ticket_id: form.ticket_id ? parseInt(form.ticket_id) : null,
      certificate_number: form.certificate_number || null,
      serial_number: form.serial_number || null,
      snumber: form.snumber || null,
      conduct_by: form.conduct_by || null,
      status: form.status || null,
      remark: form.remark || null,
      user_id: user?.id,
    }
    const { error: err } = editId
      ? await supabase.from('calibration').update(payload).eq('id', editId)
      : await supabase.from('calibration').insert([payload])
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); fetchRows(); setView('list')
  }

  const handleDelete = async (id) => {
    await supabase.from('calibration').delete().eq('id', id)
    setDeleteId(null); fetchRows()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (view === 'list') return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Calibration</h1>
        <button onClick={openAdd} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700"><Plus size={16} /> New Calibration</button>
      </div>
      <div className="relative max-w-sm mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search certificate or serial number..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-red-400" />
      </div>
      <div className="bg-white border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Certificate No.</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Ticket</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Serial No.</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Conducted By</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={6} className="text-center py-12 text-gray-400">No calibration records found.</td></tr>
            : rows.map(r => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold text-red-600">{r.certificate_number || '—'}</td>
                <td className="px-4 py-3 text-gray-700">{getTicketLabel(r.ticket_id)}</td>
                <td className="px-4 py-3 text-gray-600">{r.serial_number || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{r.conduct_by || '—'}</td>
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${statusColor(r.status)}`}>{r.status || '—'}</span></td>
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
          <span>{total} record{total !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="p-1 disabled:opacity-40"><ChevronLeft size={16}/></button>
            <span>Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="p-1 disabled:opacity-40"><ChevronRight size={16}/></button>
          </div>
        </div>
      )}
      {deleteId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"><div className="bg-white p-6 w-full max-w-sm shadow-lg"><h3 className="font-semibold mb-2">Delete Calibration Record?</h3><div className="flex justify-end gap-3 mt-4"><button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-gray-200">Cancel</button><button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm bg-red-600 text-white">Delete</button></div></div></div>}
    </div>
  )

  if (view === 'form') return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
        <h1 className="text-2xl font-bold text-gray-900">{editId ? 'Edit Calibration' : 'New Calibration'}</h1>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      <form onSubmit={handleSave} className="bg-white border border-gray-200 p-6 space-y-5">
        {[
          ['Certificate Number *', <input type="text" value={form.certificate_number} onChange={e => setForm(f => ({...f, certificate_number: e.target.value}))} required placeholder="CERT-001" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />],
          ['Ticket', <select value={form.ticket_id} onChange={e => setForm(f => ({...f, ticket_id: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"><option value="">Please Select</option>{tickets.map(t => <option key={t.id} value={t.id}>TID{t.ticket_id} — {t.company_name}</option>)}</select>],
          ['Serial Number', <input type="text" value={form.serial_number} onChange={e => setForm(f => ({...f, serial_number: e.target.value}))} placeholder="S/N" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />],
          ['Std. Number (Snumber)', <input type="text" value={form.snumber} onChange={e => setForm(f => ({...f, snumber: e.target.value}))} placeholder="Standard reference" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />],
          ['Conducted By', <input type="text" value={form.conduct_by} onChange={e => setForm(f => ({...f, conduct_by: e.target.value}))} placeholder="Technician / lab name" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />],
          ['Status', <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"><option value="">Please Select</option><option>Pending</option><option>Pass</option><option>Fail</option></select>],
        ].map(([label, el], i) => (
          <div key={i} className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">{label}</label>
            <div className="col-span-2">{el}</div>
          </div>
        ))}
        <div className="grid grid-cols-3 gap-4">
          <label className="text-sm font-medium text-gray-700 pt-2">Remark</label>
          <div className="col-span-2"><textarea value={form.remark} onChange={e => setForm(f => ({...f, remark: e.target.value}))} rows={3} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" /></div>
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
          <h1 className="text-2xl font-bold text-gray-900">Calibration — {detail.certificate_number}</h1>
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusColor(detail.status)}`}>{detail.status || '—'}</span>
        </div>
        <button onClick={() => openEdit(detail)} className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"><Edit2 size={14}/> Edit</button>
      </div>
      <div className="bg-white border border-gray-200 p-6 text-sm space-y-3">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <div><span className="font-medium text-gray-500">Certificate No.: </span><span className="font-semibold text-red-600">{detail.certificate_number}</span></div>
          <div><span className="font-medium text-gray-500">Ticket: </span>{getTicketLabel(detail.ticket_id)}</div>
          <div><span className="font-medium text-gray-500">Serial Number: </span>{detail.serial_number || '—'}</div>
          <div><span className="font-medium text-gray-500">Std. Number: </span>{detail.snumber || '—'}</div>
          <div><span className="font-medium text-gray-500">Conducted By: </span>{detail.conduct_by || '—'}</div>
          <div><span className="font-medium text-gray-500">Status: </span><span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${statusColor(detail.status)}`}>{detail.status || '—'}</span></div>
        </div>
        {detail.remark && <div className="border-t border-gray-100 pt-4"><p className="font-medium text-gray-500 mb-1">Remark</p><p className="whitespace-pre-wrap">{detail.remark}</p></div>}
      </div>
    </div>
  )

  return null
}
