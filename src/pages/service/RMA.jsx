import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { getLegacyUserId } from '../../lib/legacyUsers'
import PaginationControls from '../../components/PaginationControls'
import { Plus, Search, Eye, Edit2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 30

const emptyForm = {
  ticket_id: '', rma_number: '', vendor: '', date_sent: '',
  mode: '', traking_number_out: '', date_return: '',
  traking_number_in: '', remark: '',
}

export default function RMA() {
  const { profile } = useAuth()
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
  const [vendors, setVendors]   = useState([])
  const [modes, setModes]       = useState([])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('rma').select('*', { count: 'exact' }).order('id', { ascending: false })
    if (search) {
      const term = search.trim()
      const tid = term.replace(/^TID/i, '')
      const ticketFilters = [`company_name.ilike.%${term}%`]
      if (/^\d+$/.test(tid)) ticketFilters.push(`ticket_id.eq.${parseInt(tid)}`)
      const { data: matchedTickets } = await supabase
        .from('ticket')
        .select('id')
        .or(ticketFilters.join(','))
        .limit(500)
      const ticketIds = (matchedTickets || []).map(t => t.id)
      const filters = [`rma_number.ilike.%${term}%`, `vendor.ilike.%${term}%`]
      if (ticketIds.length > 0) filters.push(`ticket_id.in.(${ticketIds.join(',')})`)
      q = q.or(filters.join(','))
    }
    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    const { data, count, error: err } = await q
    if (!err) { setRows(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, page])

  useEffect(() => { fetchRows() }, [fetchRows])

  useEffect(() => {
    const run = async () => {
      const [tickR, venR, modeR] = await Promise.all([
        supabase.from('ticket').select('id, ticket_id, company_name').order('id', { ascending: false }),
        supabase.from('vendor').select('id, name').order('name'),
        supabase.from('mode').select('id, name').order('name'),
      ])
      if (!tickR.error) setTickets(tickR.data || [])
      if (!venR.error)  setVendors(venR.data || [])
      if (!modeR.error) setModes(modeR.data || [])
    }
    run()
  }, [])

  const getTicketLabel = (tid) => {
    const t = tickets.find(t => t.id == tid)
    return t ? `TID${t.ticket_id} — ${t.company_name || ''}` : tid ? `#${tid}` : '—'
  }
  const getVendorName = (vendor) => {
    const found = vendors.find(v => String(v.id) === String(vendor) || v.name === vendor)
    return found?.name || vendor || '—'
  }

  const openAdd = () => { setForm(emptyForm); setEditId(null); setError(''); setView('form') }
  const openEdit = (r) => {
    setForm({
      ticket_id: String(r.ticket_id || ''), rma_number: r.rma_number || '',
      vendor: r.vendor || '', date_sent: r.date_sent || '', mode: r.mode || '',
      traking_number_out: r.traking_number_out || '', date_return: r.date_return || '',
      traking_number_in: r.traking_number_in || '', remark: r.remark || '',
    })
    setEditId(r.id); setError(''); setView('form')
  }

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    const payload = {
      ticket_id: form.ticket_id ? parseInt(form.ticket_id) : null,
      rma_number: form.rma_number, vendor: form.vendor || null,
      date_sent: form.date_sent || null, mode: form.mode || null,
      traking_number_out: form.traking_number_out || null,
      date_return: form.date_return || null,
      traking_number_in: form.traking_number_in || null,
      remark: form.remark || null, user_id: getLegacyUserId(profile),
    }
    const { error: err } = editId
      ? await supabase.from('rma').update(payload).eq('id', editId)
      : await supabase.from('rma').insert([payload])
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); fetchRows(); setView('list')
  }

  const handleDelete = async (id) => {
    await supabase.from('rma').delete().eq('id', id)
    setDeleteId(null); fetchRows()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (view === 'list') return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">RMA</h1>
        <button onClick={openAdd} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700"><Plus size={16} /> New RMA</button>
      </div>
      <div className="relative max-w-sm mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search RMA, vendor, ticket number or company..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-red-400" />
      </div>
      <div className="bg-white border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">RMA Number</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Ticket</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Vendor</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Date Sent</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Mode</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Date Return</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">No RMA records found.</td></tr>
            : rows.map(r => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold text-red-600">{r.rma_number || '—'}</td>
                <td className="px-4 py-3 text-gray-700">{getTicketLabel(r.ticket_id)}</td>
                <td className="px-4 py-3 text-gray-700">{getVendorName(r.vendor)}</td>
                <td className="px-4 py-3 text-gray-600">{r.date_sent || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{r.mode || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{r.date_return || '—'}</td>
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
      <PaginationControls page={page} totalPages={totalPages} total={total} label="record" onPageChange={setPage} />
      {deleteId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"><div className="bg-white p-6 w-full max-w-sm shadow-lg"><h3 className="font-semibold mb-2">Delete RMA?</h3><p className="text-sm text-gray-600 mb-4">This cannot be undone.</p><div className="flex justify-end gap-3"><button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-gray-200">Cancel</button><button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm bg-red-600 text-white">Delete</button></div></div></div>}
    </div>
  )

  if (view === 'form') return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
        <h1 className="text-2xl font-bold text-gray-900">{editId ? 'Edit RMA' : 'New RMA'}</h1>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      <form onSubmit={handleSave} className="bg-white border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">RMA Number <span className="text-red-500">*</span></label>
          <div className="col-span-2"><input type="text" value={form.rma_number} onChange={e => setForm(f => ({...f, rma_number: e.target.value}))} required placeholder="RMA-001" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Ticket</label>
          <div className="col-span-2"><select value={form.ticket_id} onChange={e => setForm(f => ({...f, ticket_id: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"><option value="">Please Select</option>{tickets.map(t => <option key={t.id} value={t.id}>TID{t.ticket_id} — {t.company_name}</option>)}</select></div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Vendor</label>
          <div className="col-span-2">
            <select value={form.vendor} onChange={e => setForm(f => ({...f, vendor: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Date Sent</label>
          <div className="col-span-2"><input type="date" value={form.date_sent} onChange={e => setForm(f => ({...f, date_sent: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Mode</label>
          <div className="col-span-2">
            <select value={form.mode} onChange={e => setForm(f => ({...f, mode: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {modes.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Tracking No. (Out)</label>
          <div className="col-span-2"><input type="text" value={form.traking_number_out} onChange={e => setForm(f => ({...f, traking_number_out: e.target.value}))} placeholder="Outbound tracking" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Date Return</label>
          <div className="col-span-2"><input type="date" value={form.date_return} onChange={e => setForm(f => ({...f, date_return: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Tracking No. (In)</label>
          <div className="col-span-2"><input type="text" value={form.traking_number_in} onChange={e => setForm(f => ({...f, traking_number_in: e.target.value}))} placeholder="Return tracking" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" /></div>
        </div>
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
          <h1 className="text-2xl font-bold text-gray-900">RMA — {detail.rma_number}</h1>
        </div>
        <button onClick={() => openEdit(detail)} className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"><Edit2 size={14}/> Edit</button>
      </div>
      <div className="bg-white border border-gray-200 p-6 text-sm space-y-3">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <div><span className="font-medium text-gray-500">RMA Number: </span><span className="font-semibold text-red-600">{detail.rma_number}</span></div>
          <div><span className="font-medium text-gray-500">Ticket: </span>{getTicketLabel(detail.ticket_id)}</div>
          <div><span className="font-medium text-gray-500">Vendor: </span>{getVendorName(detail.vendor)}</div>
          <div><span className="font-medium text-gray-500">Mode: </span>{detail.mode || '—'}</div>
          <div><span className="font-medium text-gray-500">Date Sent: </span>{detail.date_sent || '—'}</div>
          <div><span className="font-medium text-gray-500">Tracking Out: </span>{detail.traking_number_out || '—'}</div>
          <div><span className="font-medium text-gray-500">Date Return: </span>{detail.date_return || '—'}</div>
          <div><span className="font-medium text-gray-500">Tracking In: </span>{detail.traking_number_in || '—'}</div>
        </div>
        {detail.remark && <div className="border-t border-gray-100 pt-4"><p className="font-medium text-gray-500 mb-1">Remark</p><p className="whitespace-pre-wrap">{detail.remark}</p></div>}
      </div>
    </div>
  )

  return null
}
