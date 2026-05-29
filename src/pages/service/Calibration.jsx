import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAssignableUsers, fetchLegacyUsers, getLegacyUserId, getUserName as formatUserName } from '../../lib/legacyUsers'
import SignedFileLink from '../../components/SignedFileLink'
import PaginationControls from '../../components/PaginationControls'
import { Plus, Search, Eye, Edit2, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react'

const PAGE_SIZE = 30

function statusColor(s) {
  if (!s) return 'bg-gray-100 text-gray-600'
  const l = s.toLowerCase()
  if (l === 'pass' || l === 'passed') return 'bg-green-100 text-green-700'
  if (l === 'fail' || l === 'failed') return 'bg-red-100 text-red-700'
  if (l === 'pending') return 'bg-yellow-100 text-yellow-700'
  return 'bg-gray-100 text-gray-600'
}

const emptyForm = {
  ticket_id: '', certificate_number: '', serial_number: '',
  snumber: '', conduct_by: '', status: '', remark: '',
  termid: '', file: '',
}

function checklistResult(value) {
  return Number(value) === 1 ? 'Pass' : 'Fail'
}

export default function Calibration() {
  const { profile } = useAuth()
  const [view, setView]             = useState('list')
  const [rows, setRows]             = useState([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(false)
  const [form, setForm]             = useState(emptyForm)
  const [editId, setEditId]         = useState(null)
  const [detail, setDetail]         = useState(null)
  const [deleteId, setDeleteId]     = useState(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')
  const [tickets, setTickets]       = useState([])
  const [users, setUsers]           = useState([])
  const [allUsers, setAllUsers]     = useState([])
  const [serialOptions, setSerialOptions] = useState([])
  const [checklistOptions, setChecklistOptions] = useState([])
  const [termOptions, setTermOptions] = useState([])
  const [checklistRows, setChecklistRows] = useState([])
  const [detailChecklist, setDetailChecklist] = useState([])
  const [uploadFile, setUploadFile] = useState(null)

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
    const run = async () => {
      const [tickR, activeUsers, legacyUsers, checklistR, termsR] = await Promise.all([
        supabase.from('ticket').select('id, ticket_id, company_name').order('id', { ascending: false }).limit(2000),
        fetchAssignableUsers(supabase),
        fetchLegacyUsers(supabase),
        supabase.from('checklist').select('id, name').order('name').limit(500),
        supabase.from('termcondition').select('id, name').order('id').limit(200),
      ])
      if (!tickR.error) setTickets(tickR.data || [])
      setUsers(activeUsers || [])
      setAllUsers(legacyUsers || [])
      if (!checklistR.error) setChecklistOptions(checklistR.data || [])
      if (!termsR.error) setTermOptions(termsR.data || [])
    }
    run()
  }, [])

  const getTicketLabel = (tid) => {
    const t = tickets.find(t => String(t.id) === String(tid))
    return t ? `TID${t.ticket_id} - ${t.company_name || ''}` : tid ? `#${tid}` : '-'
  }

  const getUserName = (id) => {
    const name = formatUserName(allUsers.length ? allUsers : users, id)
    return name === '-' || name === '—' ? (id || '-') : name
  }

  const getTermName = (id) => termOptions.find(t => String(t.id) === String(id))?.name || '-'

  const presetChecklistRows = () => (
    checklistOptions.length
      ? checklistOptions.map(item => ({ name: item.name, passfail: '1' }))
      : [{ name: '', passfail: '1' }]
  )

  const loadSerialOptions = async (term = '') => {
    let q = supabase.from('serialnumber')
      .select('id, serial_number, sku, customername')
      .not('serial_number', 'is', null)
      .order('serial_number')
      .limit(200)
    if (term.trim()) q = q.ilike('serial_number', `%${term.trim()}%`)
    const { data, error: err } = await q
    if (!err) setSerialOptions(data || [])
  }

  const loadChecklistForCalibration = async (id) => {
    if (!id) return presetChecklistRows()
    const { data, error: err } = await supabase
      .from('calibration_checklist')
      .select('id, name, passfail')
      .eq('cid', id)
      .order('id')
    if (err || !data?.length) return presetChecklistRows()
    return data.map(item => ({
      name: item.name || '',
      passfail: Number(item.passfail) === 1 ? '1' : '0',
    }))
  }

  const openAdd = () => {
    setForm(emptyForm)
    setChecklistRows(presetChecklistRows())
    setUploadFile(null)
    setEditId(null)
    setError('')
    setView('form')
    loadSerialOptions()
  }

  const openEdit = async (r) => {
    setForm({
      ticket_id: String(r.ticket_id || ''), certificate_number: r.certificate_number || '',
      serial_number: r.serial_number || '', snumber: r.snumber || '',
      conduct_by: String(r.conduct_by || ''), status: r.status || '', remark: r.remark || '',
      termid: String(r.termid || ''), file: r.file || '',
    })
    setChecklistRows(await loadChecklistForCalibration(r.id))
    setUploadFile(null)
    setEditId(r.id)
    setError('')
    setView('form')
    loadSerialOptions(r.serial_number || '')
  }

  const openDetail = async (r) => {
    setDetail(r)
    setDetailChecklist(await loadChecklistForCalibration(r.id))
    setView('detail')
  }

  const updateChecklistRow = (index, patch) => {
    setChecklistRows(items => items.map((item, i) => i === index ? { ...item, ...patch } : item))
  }

  const addChecklistRow = () => {
    setChecklistRows(items => [...items, { name: '', passfail: '1' }])
  }

  const removeChecklistRow = (index) => {
    setChecklistRows(items => items.filter((_, i) => i !== index))
  }

  const saveChecklist = async (calibrationId) => {
    await supabase.from('calibration_checklist').delete().eq('cid', calibrationId)
    const payload = checklistRows
      .filter(item => item.name)
      .map(item => ({
        cid: calibrationId,
        name: item.name,
        passfail: Number(item.passfail),
      }))
    if (!payload.length) return null
    return supabase.from('calibration_checklist').insert(payload)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    let filePath = form.file || null
    if (uploadFile) {
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      filePath = `calibration/${Date.now()}-${safeName}`
      const { error: uploadErr } = await supabase.storage.from('crm-uploads').upload(filePath, uploadFile, { upsert: true })
      if (uploadErr) { setError(uploadErr.message); setSaving(false); return }
    }

    const payload = {
      ticket_id: form.ticket_id || null,
      certificate_number: form.certificate_number || null,
      serial_number: form.serial_number || null,
      snumber: form.snumber || null,
      conduct_by: form.conduct_by || null,
      status: form.status || null,
      remark: form.remark || null,
      termid: form.termid ? parseInt(form.termid) : null,
      file: filePath,
      user_id: getLegacyUserId(profile),
    }

    const result = editId
      ? await supabase.from('calibration').update(payload).eq('id', editId).select('id').single()
      : await supabase.from('calibration').insert([payload]).select('id').single()
    if (result.error) { setError(result.error.message); setSaving(false); return }

    const checklistResult = await saveChecklist(result.data.id)
    if (checklistResult?.error) { setError(checklistResult.error.message); setSaving(false); return }

    setSaving(false)
    setUploadFile(null)
    fetchRows()
    setView('list')
  }

  const handleDelete = async (id) => {
    await supabase.from('calibration_checklist').delete().eq('cid', id)
    await supabase.from('calibration').delete().eq('id', id)
    setDeleteId(null)
    fetchRows()
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
                <td className="px-4 py-3 font-semibold text-red-600">{r.certificate_number || '-'}</td>
                <td className="px-4 py-3 text-gray-700">{getTicketLabel(r.ticket_id)}</td>
                <td className="px-4 py-3 text-gray-600">{r.serial_number || '-'}</td>
                <td className="px-4 py-3 text-gray-600">{getUserName(r.conduct_by)}</td>
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${statusColor(r.status)}`}>{r.status || '-'}</span></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {r.file && <SignedFileLink path={r.file} label="" className="text-gray-500 hover:text-red-600" />}
                    <button onClick={() => openDetail(r)} className="text-gray-500 hover:text-gray-700"><Eye size={15} /></button>
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
      {deleteId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"><div className="bg-white p-6 w-full max-w-sm shadow-lg"><h3 className="font-semibold mb-2">Delete Calibration Record?</h3><div className="flex justify-end gap-3 mt-4"><button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-gray-200">Cancel</button><button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm bg-red-600 text-white">Delete</button></div></div></div>}
    </div>
  )

  if (view === 'form') return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
        <h1 className="text-2xl font-bold text-gray-900">{editId ? 'Edit Calibration' : 'New Calibration'}</h1>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      <form onSubmit={handleSave} className="bg-white border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Certificate Number *</label>
            <input type="text" value={form.certificate_number} onChange={e => setForm(f => ({...f, certificate_number: e.target.value}))} required placeholder="CERT-001" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ticket</label>
            <select value={form.ticket_id} onChange={e => setForm(f => ({...f, ticket_id: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {tickets.map(t => <option key={t.id} value={t.id}>TID{t.ticket_id} - {t.company_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
            <input type="text" list="calibration-serial-options" value={form.serial_number}
              onFocus={e => { e.target.select(); loadSerialOptions(form.serial_number) }}
              onChange={e => { setForm(f => ({...f, serial_number: e.target.value})); loadSerialOptions(e.target.value) }}
              placeholder="Search serial number" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
            <datalist id="calibration-serial-options">
              {serialOptions.map(item => <option key={item.id} value={item.serial_number}>{[item.sku, item.customername].filter(Boolean).join(' - ')}</option>)}
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Std. Number</label>
            <input type="text" value={form.snumber} onChange={e => setForm(f => ({...f, snumber: e.target.value}))} placeholder="Standard reference" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Conducted By</label>
            <select value={form.conduct_by} onChange={e => setForm(f => ({...f, conduct_by: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {users.map(u => <option key={u.id} value={u.id}>{`${u.first_name} ${u.last_name}`.trim()}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              <option>Pending</option>
              <option>Pass</option>
              <option>Fail</option>
            </select>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800">Checklist</h2>
            <button type="button" onClick={addChecklistRow} className="flex items-center gap-1.5 text-xs border border-gray-200 px-2.5 py-1.5 hover:bg-gray-50"><Plus size={13} /> Add Checklist</button>
          </div>
          <div className="border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Checklist</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700 w-36">Result</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {checklistRows.map((item, index) => (
                  <tr key={`${index}-${item.name}`} className="border-b border-gray-100">
                    <td className="px-3 py-2">
                      <select value={item.name} onChange={e => updateChecklistRow(index, { name: e.target.value })} className="w-full border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:border-red-400">
                        <option value="">Please Select</option>
                        {checklistOptions.map(option => <option key={option.id} value={option.name}>{option.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select value={item.passfail} onChange={e => updateChecklistRow(index, { passfail: e.target.value })} className="w-full border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:border-red-400">
                        <option value="1">Pass</option>
                        <option value="0">Fail</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => removeChecklistRow(index)} className="text-gray-400 hover:text-red-600"><X size={15} /></button>
                    </td>
                  </tr>
                ))}
                {checklistRows.length === 0 && <tr><td colSpan={3} className="text-center py-6 text-gray-400">No checklist rows.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Remark</label>
          <textarea value={form.remark} onChange={e => setForm(f => ({...f, remark: e.target.value}))} rows={3} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Terms & Conditions</label>
            <select value={form.termid} onChange={e => setForm(f => ({...f, termid: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Select T&C</option>
              {termOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Certificate / Document</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" onChange={e => setUploadFile(e.target.files?.[0] || null)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
            {form.file && !uploadFile && <SignedFileLink path={form.file} label="Existing document" className="mt-2 text-xs text-red-600 font-semibold hover:underline" />}
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
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
          <h1 className="text-2xl font-bold text-gray-900">Calibration - {detail.certificate_number}</h1>
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusColor(detail.status)}`}>{detail.status || '-'}</span>
        </div>
        <button onClick={() => openEdit(detail)} className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"><Edit2 size={14}/> Edit</button>
      </div>
      <div className="bg-white border border-gray-200 p-6 text-sm space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          <div><span className="font-medium text-gray-500">Certificate No.: </span><span className="font-semibold text-red-600">{detail.certificate_number}</span></div>
          <div><span className="font-medium text-gray-500">Ticket: </span>{getTicketLabel(detail.ticket_id)}</div>
          <div><span className="font-medium text-gray-500">Serial Number: </span>{detail.serial_number || '-'}</div>
          <div><span className="font-medium text-gray-500">Std. Number: </span>{detail.snumber || '-'}</div>
          <div><span className="font-medium text-gray-500">Conducted By: </span>{getUserName(detail.conduct_by)}</div>
          <div><span className="font-medium text-gray-500">Status: </span><span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${statusColor(detail.status)}`}>{detail.status || '-'}</span></div>
          <div><span className="font-medium text-gray-500">Certificate / Document: </span>{detail.file ? <SignedFileLink path={detail.file} label="Open file" className="text-red-600 font-semibold hover:underline" /> : '-'}</div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="font-medium text-gray-500 mb-2">Checklist</p>
          <div className="border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Checklist</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700 w-28">Result</th>
                </tr>
              </thead>
              <tbody>
                {detailChecklist.length ? detailChecklist.map((item, index) => (
                  <tr key={`${index}-${item.name}`} className="border-b border-gray-100">
                    <td className="px-3 py-2 text-gray-700">{item.name || '-'}</td>
                    <td className="px-3 py-2 text-gray-700">{checklistResult(item.passfail)}</td>
                  </tr>
                )) : <tr><td colSpan={2} className="text-center py-6 text-gray-400">No checklist rows.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="font-medium text-gray-500 mb-1">Terms & Conditions</p>
          <p className="whitespace-pre-wrap text-gray-700">{getTermName(detail.termid)}</p>
        </div>
        {detail.remark && <div className="border-t border-gray-100 pt-4"><p className="font-medium text-gray-500 mb-1">Remark</p><p className="whitespace-pre-wrap">{detail.remark}</p></div>}
      </div>
    </div>
  )

  return null
}
