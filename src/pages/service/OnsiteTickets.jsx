import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAssignableUsers, getLegacyUserId, getUserName as formatUserName } from '../../lib/legacyUsers'
import { fetchAllRows } from '../../lib/fetchAllRows'
import { logActivity } from '../../lib/activityLog'
import { formatDate } from '../../lib/dateFormat'
import SignedFileLink from '../../components/SignedFileLink'
import PaginationControls from '../../components/PaginationControls'
import { Plus, Search, Eye, Edit2, Trash2, CheckCircle, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 30

const splitCsv = (value) => String(value || '').split(',').map(v => v.trim()).filter(Boolean)

function LoadingHint({ text = 'Loading options...' }) {
  return (
    <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-500">
      <span className="h-3 w-3 rounded-full border-2 border-gray-300 border-t-red-600 animate-spin" />
      {text}
    </div>
  )
}

function DetailField({ label, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="font-medium text-gray-500">{label}</div>
      <div className="mt-1 whitespace-pre-wrap break-words text-gray-900">{children || '—'}</div>
    </div>
  )
}

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
  file: '',
}

function SpareChecklist({ options, value, onChange }) {
  const [term, setTerm] = useState('')
  const selected = splitCsv(value)
  const selectedSet = new Set(selected)
  const filtered = options.filter(spare => spare.name.toLowerCase().includes(term.trim().toLowerCase()))

  const toggle = (name) => {
    const next = selectedSet.has(name)
      ? selected.filter(item => item !== name)
      : [...selected, name]
    onChange(next.join(','))
  }

  return (
    <div className="border border-gray-200 bg-white">
      <div className="relative border-b border-gray-100">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={term}
          onChange={e => setTerm(e.target.value)}
          placeholder="Search spare parts..."
          className="w-full pl-8 pr-3 py-2 text-sm focus:outline-none"
        />
      </div>
      <div className="max-h-48 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-3 text-sm text-gray-400">No spare parts found.</p>
        ) : filtered.map(spare => (
          <label key={spare.id} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedSet.has(spare.name)}
              onChange={() => toggle(spare.name)}
              className="h-4 w-4 accent-red-600"
            />
            <span className="text-gray-700">{spare.name}</span>
          </label>
        ))}
      </div>
      <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
        {selected.length ? `${selected.length} selected: ${selected.join(', ')}` : 'No spare parts selected'}
      </div>
    </div>
  )
}

export default function OnsiteTickets() {
  const { profile } = useAuth()
  const [view, setView]           = useState('list')
  const [tab, setTab]             = useState('open')
  const [scope, setScope]         = useState('all')
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
  const [reopenId, setReopenId]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [tickets, setTickets]     = useState([])
  const [users, setUsers]         = useState([])
  const [productOptions, setProductOptions] = useState([])
  const [productLoading, setProductLoading] = useState(false)
  const [serialOptions, setSerialOptions] = useState([])
  const [serialLoading, setSerialLoading] = useState(false)
  const [spares, setSpares]       = useState([])
  const [dropdownLoading, setDropdownLoading] = useState(true)
  const [uploadFile, setUploadFile] = useState(null)
  const serialSearchId = useRef(0)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('onsiteticket').select('*', { count: 'exact' })
      .eq('is_completed', tab === 'open' ? 0 : 1).order('id', { ascending: false })
    if (search) q = q.or(`product.ilike.%${search}%,location.ilike.%${search}%`)
    if (scope === 'mine') q = q.eq('assigned_to', getLegacyUserId(profile))
    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    const { data, count, error: err } = await q
    if (!err) { setRows(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, page, tab, scope, profile])

  useEffect(() => { fetchRows() }, [fetchRows])

  useEffect(() => {
    const run = async () => {
      setDropdownLoading(true)
      const [tickR, usrR, spareR] = await Promise.all([
        fetchAllRows('ticket', 'id, ticket_id, company_name, description, assigned_to', 'id', { ascending: false, eq: { is_completed: 0 } }),
        fetchAssignableUsers(supabase),
        fetchAllRows('goodsservices', 'id, name', 'name'),
      ])
      setTickets(tickR || [])
      setUsers(usrR || [])
      setSpares(spareR || [])
      setDropdownLoading(false)
    }
    run().catch(() => setDropdownLoading(false))
  }, [])

  const getTicketLabel = (tid) => {
    const t = tickets.find(t => t.id == tid)
    return t ? `TID${t.ticket_id} — ${t.company_name || ''}` : tid ? `#${tid}` : '—'
  }
  const getUserName = (id) => {
    return formatUserName(users, id)
  }

  const productValues = (value) => splitCsv(value)

  const stripHtml = (value = '') => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  const loadTicketProducts = async (ticketId, selectedProducts = []) => {
    if (!ticketId) { setProductOptions([]); return }
    setProductLoading(true)
    try {
      const [{ data: products }, { data: ticket }] = await Promise.all([
        supabase.from('ticket_product').select('id, sku, item_description, serial_number').eq('ticket_id', ticketId).order('id'),
        supabase.from('ticket').select('description, assigned_to').eq('id', ticketId).maybeSingle(),
      ])
      const options = products || []
      const missingSelected = selectedProducts
        .filter(sku => sku && !options.some(item => item.sku === sku))
        .map((sku, idx) => ({ id: `selected-${idx}-${sku}`, sku, item_description: '', serial_number: '' }))
      setProductOptions([...options, ...missingSelected])
      setForm(f => ({
        ...f,
        issue_description: f.issue_description || ticket?.description || '',
        assigned_to: f.assigned_to || (ticket?.assigned_to ? String(ticket.assigned_to) : ''),
      }))
    } finally {
      setProductLoading(false)
    }
  }

  const loadSerialOptions = async (term = '') => {
    const requestId = serialSearchId.current + 1
    serialSearchId.current = requestId
    setSerialLoading(true)
    const searchTerm = term.trim()
    try {
      let q = supabase
        .from('serialnumber')
        .select('id, serial_number, sku, customername')
        .order('serial_number')
        .limit(200)
      if (searchTerm) q = q.or(`serial_number.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%`)
      const { data, error: err } = await q
      if (serialSearchId.current !== requestId) return
      if (!err) setSerialOptions(data || [])
    } finally {
      if (serialSearchId.current === requestId) setSerialLoading(false)
    }
  }

  const openAdd = () => {
    setForm({ ...emptyForm, date: new Date().toISOString().split('T')[0] })
    setProductOptions([])
    setSerialOptions([])
    setProductLoading(false)
    setSerialLoading(false)
    setUploadFile(null)
    setEditId(null)
    setError('')
    setView('form')
  }
  const openEdit = async (r) => {
    setForm({
      ticket_id: String(r.ticket_id || ''), product: r.product || '',
      issue_description: r.issue_description || '', serial_number: r.serial_number || '',
      location: r.location || '', vandor_order_ref: r.vandor_order_ref || '',
      spare: r.spare || '', remark: r.remark || '',
      assigned_to: String(r.assigned_to || ''), status: r.status || 'Open',
      workdone: r.workdone || '', date: r.date || '', file: r.file || '',
    })
    setUploadFile(null)
    await loadTicketProducts(r.ticket_id, productValues(r.product))
    loadSerialOptions(r.serial_number || '')
    setEditId(r.id); setError(''); setView('form')
  }

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    let filePath = form.file || null
    if (uploadFile) {
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      filePath = `onsite/${Date.now()}-${safeName}`
      const { error: uploadErr } = await supabase.storage.from('crm-uploads').upload(filePath, uploadFile, { upsert: true })
      if (uploadErr) { setError(uploadErr.message); setSaving(false); return }
    }
    const payload = {
      ticket_id: form.ticket_id ? parseInt(form.ticket_id) : null,
      product: form.product, issue_description: form.issue_description || null,
      serial_number: form.serial_number || null, location: form.location || null,
      vandor_order_ref: form.vandor_order_ref || null, spare: form.spare || null,
      remark: form.remark || null,
      assigned_to: form.assigned_to ? parseInt(form.assigned_to) : null,
      status: form.status, is_completed: form.status === 'Completed' ? 1 : 0,
      workdone: form.workdone || null, date: form.date || null, user_id: getLegacyUserId(profile),
      file: filePath,
    }
    const { error: err } = editId
      ? await supabase.from('onsiteticket').update(payload).eq('id', editId)
      : await supabase.from('onsiteticket').insert([payload])
    if (err) { setError(err.message); setSaving(false); return }
    logActivity({
      module: 'onsite-tickets',
      action: editId ? 'update' : 'create',
      recordTable: 'onsiteticket',
      recordId: editId || null,
      recordLabel: form.product || form.issue_description,
      summary: `${editId ? 'Updated' : 'Created'} onsite ticket${form.ticket_id ? ` for ticket #${form.ticket_id}` : ''}`,
      metadata: { ticket_id: form.ticket_id || null, assigned_to: form.assigned_to || null },
    })
    setSaving(false); setUploadFile(null); fetchRows(); setView('list')
  }

  const markComplete = async (id) => {
    await supabase.from('onsiteticket').update({ is_completed: 1, status: 'Completed' }).eq('id', id)
    logActivity({
      module: 'onsite-tickets',
      action: 'complete',
      recordTable: 'onsiteticket',
      recordId: id,
      summary: `Marked onsite ticket #${id} complete`,
    })
    setCompleteId(null); fetchRows()
  }
  const reopenRow = async (id) => {
    await supabase.from('onsiteticket').update({ is_completed: 0, status: 'Open' }).eq('id', id)
    logActivity({
      module: 'onsite-tickets',
      action: 'reopen',
      recordTable: 'onsiteticket',
      recordId: id,
      summary: `Reopened onsite ticket #${id}`,
    })
    setReopenId(null); fetchRows()
  }
  const handleDelete = async (id) => {
    await supabase.from('onsiteticket').delete().eq('id', id)
    logActivity({
      module: 'onsite-tickets',
      action: 'delete',
      recordTable: 'onsiteticket',
      recordId: id,
      summary: `Deleted onsite ticket #${id}`,
    })
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
      <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search issues or location..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-red-400" />
        </div>
        <div className="flex border border-gray-200 bg-white text-sm">
          {[['all', 'All Onsite'], ['mine', 'My Assigned']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setScope(id); setPage(1) }}
              className={`px-4 py-2 ${scope === id ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Ticket</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Date</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Issues</th>
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
                <td className="px-4 py-3 text-gray-600">{formatDate(r.date)}</td>
                <td className="px-4 py-3 text-gray-800 max-w-xs truncate">{r.issue_description || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{r.location || '—'}</td>
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${statusColor(r.status)}`}>{r.status || 'Open'}</span></td>
                <td className="px-4 py-3 text-gray-600">{getUserName(r.assigned_to)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => { setDetail(r); setView('detail') }} className="text-gray-500 hover:text-gray-700"><Eye size={15} /></button>
                    <button onClick={() => openEdit(r)} className="text-gray-500 hover:text-gray-700"><Edit2 size={15} /></button>
                    {tab === 'open' && <button onClick={() => setCompleteId(r.id)} className="text-green-600 hover:text-green-700" title="Mark Complete"><CheckCircle size={15} /></button>}
                    {tab === 'closed' && <button onClick={() => setReopenId(r.id)} className="text-amber-600 hover:text-amber-700" title="Undo Complete / Reopen"><RotateCcw size={15} /></button>}
                    <button onClick={() => setDeleteId(r.id)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationControls page={page} totalPages={totalPages} total={total} label="record" onPageChange={setPage} />
      {completeId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"><div className="bg-white p-6 w-full max-w-sm shadow-lg"><h3 className="font-semibold text-gray-900 mb-2">Mark as Completed?</h3><div className="flex justify-end gap-3 mt-4"><button onClick={() => setCompleteId(null)} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button><button onClick={() => markComplete(completeId)} className="px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700">Confirm</button></div></div></div>}
      {reopenId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"><div className="bg-white p-6 w-full max-w-sm shadow-lg"><h3 className="font-semibold text-gray-900 mb-2">Reopen this onsite ticket?</h3><p className="text-sm text-gray-600 mb-4">This will undo the completion and move it back to the open list.</p><div className="flex justify-end gap-3 mt-4"><button onClick={() => setReopenId(null)} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button><button onClick={() => reopenRow(reopenId)} className="px-4 py-2 text-sm bg-amber-600 text-white hover:bg-amber-700">Reopen</button></div></div></div>}
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
          ['Ticket *', <select value={form.ticket_id} onChange={async e => {
            const ticketId = e.target.value
            setForm(f => ({...f, ticket_id: ticketId, product: ''}))
            await loadTicketProducts(ticketId)
          }} required className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"><option value="">Please Select</option>{tickets.map(t => <option key={t.id} value={t.id}>TID{t.ticket_id} — {t.company_name}</option>)}</select>],
          ['Product Description *', <div>
            <select multiple value={productValues(form.product)} onChange={e => {
              const selected = Array.from(e.target.selectedOptions).map(option => option.value)
              const selectedProducts = productOptions.filter(option => selected.includes(option.sku))
              const serials = selectedProducts.map(option => option.serial_number).filter(Boolean)
              setForm(f => ({...f, product: selected.join(','), serial_number: serials.join(',') || f.serial_number}))
            }} required className="w-full min-h-28 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"><option value="" disabled>Please Select</option>{productOptions.map(p => <option key={p.id} value={p.sku}>{p.sku}{p.item_description ? ` - ${stripHtml(p.item_description)}` : ''}{p.serial_number ? ` (${p.serial_number})` : ''}</option>)}</select>
            {productLoading && <LoadingHint text="Loading ticket products..." />}
          </div>],
          ['Serial Number', <div>
            <input
              type="text"
              list="onsite-serial-options"
              value={form.serial_number}
              onFocus={e => { e.target.select(); loadSerialOptions(form.serial_number) }}
              onChange={e => { setForm(f => ({...f, serial_number: e.target.value})); loadSerialOptions(e.target.value) }}
              placeholder="Search serial number"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
            />
            <datalist id="onsite-serial-options">
              {serialOptions.map(s => (
                <option
                  key={s.id}
                  value={s.serial_number}
                  label={`${s.sku || ''}${s.customername ? ` - ${s.customername}` : ''}`}
                />
              ))}
            </datalist>
            {serialLoading && <LoadingHint text="Searching serial numbers..." />}
          </div>],
          ['Location', <input type="text" value={form.location} onChange={e => setForm(f => ({...f, location: e.target.value}))} placeholder="Site location" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />],
          ['Vendor Order Ref', <input type="text" value={form.vandor_order_ref} onChange={e => setForm(f => ({...f, vandor_order_ref: e.target.value}))} placeholder="Vendor reference" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />],
          ['Spare Used', <div><SpareChecklist options={spares} value={form.spare} onChange={value => setForm(f => ({...f, spare: value}))} />{dropdownLoading && <LoadingHint text="Loading catalogue..." />}</div>],
        ].map(([label, el], i) => (
          <div key={i} className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">{label}</label>
            <div className="col-span-2">{el}</div>
          </div>
        ))}
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Document</label>
          <div className="col-span-2">
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              onChange={e => setUploadFile(e.target.files?.[0] || null)}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
            />
            {form.file && !uploadFile && (
              <SignedFileLink path={form.file} label="Current document" className="mt-2 text-xs text-red-600 hover:underline" />
            )}
            {uploadFile && <p className="mt-2 text-xs text-gray-500">{uploadFile.name}</p>}
          </div>
        </div>
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
          {detail.is_completed == 1 && <button onClick={() => setReopenId(detail.id)} className="flex items-center gap-1.5 bg-amber-600 text-white px-3 py-1.5 text-sm hover:bg-amber-700"><RotateCcw size={14}/> Undo Complete</button>}
        </div>
      </div>
      <div className="bg-white border border-gray-200 p-6 space-y-4 text-sm">
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
          <DetailField label="Ticket"><span className="text-red-600 font-semibold">{getTicketLabel(detail.ticket_id)}</span></DetailField>
          <DetailField label="Date">{formatDate(detail.date)}</DetailField>
          <DetailField label="Product" className="md:col-span-2">{detail.product || '—'}</DetailField>
          <DetailField label="Serial Number" className="md:col-span-2">{detail.serial_number || '—'}</DetailField>
          <DetailField label="Location">{detail.location || '—'}</DetailField>
          <DetailField label="Vendor Ref">{detail.vandor_order_ref || '—'}</DetailField>
          <DetailField label="Spare" className="md:col-span-2">{detail.spare || '—'}</DetailField>
          <DetailField label="Assigned To">{getUserName(detail.assigned_to)}</DetailField>
          <div>
            <span className="font-medium text-gray-500">Document: </span>
            {detail.file ? (
              <SignedFileLink path={detail.file} className="text-red-600 hover:underline" />
            ) : '—'}
          </div>
        </div>
        {detail.issue_description && <div className="border-t border-gray-100 pt-4"><p className="font-medium text-gray-500 mb-1">Issue Description</p><p className="whitespace-pre-wrap">{detail.issue_description}</p></div>}
        {detail.workdone && <div className="border-t border-gray-100 pt-4"><p className="font-medium text-gray-500 mb-1">Work Done</p><p className="whitespace-pre-wrap">{detail.workdone}</p></div>}
        {detail.remark && <div className="border-t border-gray-100 pt-4"><p className="font-medium text-gray-500 mb-1">Remark</p><p className="whitespace-pre-wrap">{detail.remark}</p></div>}
      </div>
      {completeId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"><div className="bg-white p-6 w-full max-w-sm shadow-lg"><h3 className="font-semibold mb-2">Mark as Completed?</h3><div className="flex justify-end gap-3 mt-4"><button onClick={() => setCompleteId(null)} className="px-4 py-2 text-sm border border-gray-200">Cancel</button><button onClick={async () => { await markComplete(completeId); setView('list') }} className="px-4 py-2 text-sm bg-green-600 text-white">Confirm</button></div></div></div>}
      {reopenId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"><div className="bg-white p-6 w-full max-w-sm shadow-lg"><h3 className="font-semibold mb-2">Reopen this onsite ticket?</h3><p className="text-sm text-gray-600 mb-4">This will undo the completion and move it back to the open list.</p><div className="flex justify-end gap-3 mt-4"><button onClick={() => setReopenId(null)} className="px-4 py-2 text-sm border border-gray-200">Cancel</button><button onClick={async () => { await reopenRow(reopenId); setView('list') }} className="px-4 py-2 text-sm bg-amber-600 text-white">Reopen</button></div></div></div>}
    </div>
  )

  return null
}
