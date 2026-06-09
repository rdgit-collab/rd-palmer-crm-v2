import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAssignableUsers, fetchLegacyUsers, getLegacyUserId, getUserName as formatUserName } from '../../lib/legacyUsers'
import { fetchAllRows } from '../../lib/fetchAllRows'
import { logActivity } from '../../lib/activityLog'
import { formatDate } from '../../lib/dateFormat'
import { searchSerialNumberOptions } from '../../lib/serialNumberSearch'
import SignedFileLink from '../../components/SignedFileLink'
import PaginationControls from '../../components/PaginationControls'
import salesDocumentLogo from '../../assets/sales-document-logo.png'
import radiodetectionLogo from '../../assets/radiodetection-logo.svg'
import { Plus, Search, Eye, Edit2, Trash2, X, Printer } from 'lucide-react'

const PAGE_SIZE = 30

const SEARCH_FIELDS = [
  { value: 'certificate_number', label: 'Certificate No.', placeholder: 'Search certificate number...' },
  { value: 'serial_number', label: 'Serial No.', placeholder: 'Search serial number...' },
  { value: 'ticket', label: 'Ticket', placeholder: 'Search ticket number...' },
]

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

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

function pad(value, length) {
  return String(value).padStart(length, '0')
}

function certificateDatePrefix(date = new Date()) {
  return `${String(date.getFullYear()).slice(-2)}${pad(date.getMonth() + 1, 2)}${pad(date.getDate(), 2)}`
}

function termTitle(value = '') {
  const firstLine = String(value || '').split(/\r?\n/).find(line => line.trim())
  const text = (firstLine || value || '').trim()
  return text.length > 55 ? `${text.slice(0, 55)}...` : text
}

function termPreview(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function stripHtml(value = '') {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function TermsSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const selected = options.find(option => String(option.id) === String(value))

  useEffect(() => {
    function onDocClick(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="w-full border border-gray-200 px-3 py-2 text-left text-sm focus:outline-none focus:border-red-400"
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected ? termTitle(selected.name) : 'Select T&C'}
        </span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto border border-gray-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false) }}
            className="block w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
          >
            Select T&C
          </button>
          {options.map(option => {
            const preview = termPreview(option.name)
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => { onChange(String(option.id)); setOpen(false) }}
                className="block w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
              >
                <span className="block text-sm font-medium text-gray-800">{termTitle(option.name)}</span>
                {preview && <span className="block truncate text-xs text-gray-400">{preview}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Calibration() {
  const { profile } = useAuth()
  const [view, setView]             = useState('list')
  const [rows, setRows]             = useState([])
  const [page, setPage]             = useState(1)
  const [search, setSearch]         = useState('')
  const [draftSearch, setDraftSearch] = useState('')
  const [searchField, setSearchField] = useState('certificate_number')
  const [draftSearchField, setDraftSearchField] = useState('certificate_number')
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
  const [serialLoading, setSerialLoading] = useState(false)
  const [ticketSerialOptions, setTicketSerialOptions] = useState([])
  const [ticketSerialLoading, setTicketSerialLoading] = useState(false)
  const [checklistOptions, setChecklistOptions] = useState([])
  const [termOptions, setTermOptions] = useState([])
  const [checklistRows, setChecklistRows] = useState([])
  const [detailChecklist, setDetailChecklist] = useState([])
  const [uploadFile, setUploadFile] = useState(null)
  const serialSearchId = useRef(0)

  const fetchRows = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAllRows('calibration', '*', 'id', { ascending: false })
      setRows(data || [])
    } catch {
      setRows([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchRows() }, [fetchRows])

  useEffect(() => {
    const run = async () => {
      const [tickR, activeUsers, legacyUsers, checklistR, termsR] = await Promise.all([
        fetchAllRows('ticket', 'id, ticket_id, company_name', 'id', { ascending: false }),
        fetchAssignableUsers(supabase),
        fetchLegacyUsers(supabase),
        supabase.from('checklist').select('id, name').order('name').limit(500),
        supabase.from('termcondition').select('id, name').order('id').limit(200),
      ])
      setTickets(tickR || [])
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

  const ticketInfoById = useMemo(() => {
    const map = new Map()
    tickets.forEach(t => {
      map.set(String(t.id), {
        number: Number(t.ticket_id) || 0,
        label: `TID${t.ticket_id} - ${t.company_name || ''}`,
      })
    })
    return map
  }, [tickets])

  const getUserName = (id) => {
    const name = formatUserName(allUsers.length ? allUsers : users, id)
    return name === '-' || name === '—' ? (id || '-') : name
  }

  const getTermName = (id) => termOptions.find(t => String(t.id) === String(id))?.name || '-'

  const generateCertificateNumber = async () => {
    const { data, error: err } = await supabase
      .from('calibration')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
    if (err) throw err
    const nextId = Number(data?.[0]?.id || 0) + 1
    return `${certificateDatePrefix()}-${pad(nextId, 5)}`
  }

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    const sorted = [...rows].sort((a, b) => {
      const aTicket = ticketInfoById.get(String(a.ticket_id))?.number || Number(a.ticket_id) || 0
      const bTicket = ticketInfoById.get(String(b.ticket_id))?.number || Number(b.ticket_id) || 0
      if (aTicket !== bTicket) return bTicket - aTicket
      return Number(b.id || 0) - Number(a.id || 0)
    })
    if (!term) return sorted
    return sorted.filter(r => {
      if (searchField === 'certificate_number') {
        return String(r.certificate_number || '').toLowerCase().includes(term)
      }
      if (searchField === 'serial_number') {
        return String(r.serial_number || '').toLowerCase().includes(term)
      }
      const ticket = ticketInfoById.get(String(r.ticket_id))
      const ticketNumber = ticket?.number ? `tid${ticket.number}` : ''
      const rawTicketNumber = ticket?.number ? String(ticket.number) : ''
      const ticketLabel = ticket?.label || r.ticket_id
      return [ticketNumber, rawTicketNumber, ticketLabel]
        .some(value => String(value || '').toLowerCase().includes(term))
    })
  }, [rows, search, searchField, ticketInfoById])

  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredRows.slice(start, start + PAGE_SIZE)
  }, [filteredRows, page])

  const presetChecklistRows = () => (
    checklistOptions.length
      ? checklistOptions.map(item => ({ name: item.name, passfail: '1' }))
      : [{ name: '', passfail: '1' }]
  )

  const loadSerialOptions = async (term = '') => {
    const requestId = serialSearchId.current + 1
    serialSearchId.current = requestId
    setSerialLoading(true)
    const searchTerm = term.trim()
    try {
      const data = searchTerm ? await searchSerialNumberOptions(searchTerm, 50) : []
      if (serialSearchId.current !== requestId) return
      setSerialOptions(data || [])
    } finally {
      if (serialSearchId.current === requestId) setSerialLoading(false)
    }
  }

  const loadTicketSerialOptions = async (ticketId, selectedSerial = '', autoFillSingle = false) => {
    if (!ticketId) {
      setTicketSerialOptions([])
      return []
    }
    setTicketSerialLoading(true)
    try {
      const { data, error: err } = await supabase
        .from('ticket_product')
        .select('id, sku, item_description, serial_number')
        .eq('ticket_id', ticketId)
        .order('id')
      if (err) throw err

      const options = (data || [])
        .filter(item => String(item.serial_number || '').trim())
        .map(item => ({
          id: item.id,
          serial_number: String(item.serial_number || '').trim(),
          sku: item.sku || '',
          item_description: stripHtml(item.item_description || ''),
        }))

      const cleanSelected = String(selectedSerial || '').trim()
      const hasSelected = cleanSelected && options.some(item => item.serial_number === cleanSelected)
      const nextOptions = hasSelected || !cleanSelected
        ? options
        : [
            ...options,
            {
              id: `current-${cleanSelected}`,
              serial_number: cleanSelected,
              sku: '',
              item_description: 'Current saved serial',
            },
          ]

      setTicketSerialOptions(nextOptions)
      if (autoFillSingle) {
        setForm(f => ({
          ...f,
          serial_number: nextOptions.length === 1 ? nextOptions[0].serial_number : '',
        }))
      }
      return nextOptions
    } catch {
      const cleanSelected = String(selectedSerial || '').trim()
      const fallback = cleanSelected
        ? [{ id: `current-${cleanSelected}`, serial_number: cleanSelected, sku: '', item_description: 'Current saved serial' }]
        : []
      setTicketSerialOptions(fallback)
      return fallback
    } finally {
      setTicketSerialLoading(false)
    }
  }

  const handleTicketChange = async (ticketId) => {
    setForm(f => ({ ...f, ticket_id: ticketId, serial_number: '' }))
    setSerialOptions([])
    await loadTicketSerialOptions(ticketId, '', true)
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

  const openAdd = async () => {
    setForm({ ...emptyForm, certificate_number: 'Generating...' })
    setChecklistRows(presetChecklistRows())
    setUploadFile(null)
    setEditId(null)
    setError('')
    setView('form')
    setTicketSerialOptions([])
    loadSerialOptions()
    try {
      const certificateNumber = await generateCertificateNumber()
      setForm(f => ({ ...f, certificate_number: certificateNumber }))
    } catch (err) {
      setForm(emptyForm)
      setError(err.message || 'Unable to generate certificate number.')
    }
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
    loadTicketSerialOptions(r.ticket_id, r.serial_number || '')
    if (!r.ticket_id) loadSerialOptions(r.serial_number || '')
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
    let certificateNumber = form.certificate_number.trim()
    if (editId && !/^\d{6}-\d{5}$/.test(certificateNumber)) {
      setError('Certificate number must follow YYMMDD-##### format, for example 260608-00345.')
      setSaving(false)
      return
    }

    let filePath = form.file || null
    if (uploadFile) {
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      filePath = `calibration/${Date.now()}-${safeName}`
      const { error: uploadErr } = await supabase.storage.from('crm-uploads').upload(filePath, uploadFile, { upsert: true })
      if (uploadErr) { setError(uploadErr.message); setSaving(false); return }
    }

    const payload = {
      ticket_id: form.ticket_id || null,
      certificate_number: editId ? certificateNumber : null,
      serial_number: form.serial_number || null,
      snumber: form.snumber || null,
      conduct_by: form.conduct_by || null,
      status: form.status || null,
      remark: form.remark || null,
      termid: form.termid ? parseInt(form.termid) : null,
      file: filePath,
      user_id: getLegacyUserId(profile),
      updated_at: new Date().toISOString(),
    }
    if (!editId) payload.created_at = new Date().toISOString()

    const result = editId
      ? await supabase.from('calibration').update(payload).eq('id', editId).select('id').single()
      : await supabase.from('calibration').insert([payload]).select('id').single()
    if (result.error) { setError(result.error.message); setSaving(false); return }

    if (!editId) {
      certificateNumber = `${certificateDatePrefix()}-${pad(result.data.id, 5)}`
      const { error: certificateErr } = await supabase
        .from('calibration')
        .update({ certificate_number: certificateNumber, updated_at: new Date().toISOString() })
        .eq('id', result.data.id)
      if (certificateErr) { setError(certificateErr.message); setSaving(false); return }
    }

    const checklistResult = await saveChecklist(result.data.id)
    if (checklistResult?.error) { setError(checklistResult.error.message); setSaving(false); return }
    logActivity({
      module: 'calibration',
      action: editId ? 'update' : 'create',
      recordTable: 'calibration',
      recordId: result.data.id,
      recordLabel: certificateNumber,
      summary: `${editId ? 'Updated' : 'Created'} calibration ${certificateNumber}`,
      metadata: { ticket_id: form.ticket_id || null, status: form.status || null },
    })

    setSaving(false)
    setUploadFile(null)
    fetchRows()
    setView('list')
  }

  const handleDelete = async (id) => {
    await supabase.from('calibration_checklist').delete().eq('cid', id)
    await supabase.from('calibration').delete().eq('id', id)
    logActivity({
      module: 'calibration',
      action: 'delete',
      recordTable: 'calibration',
      recordId: id,
      summary: `Deleted calibration #${id}`,
    })
    setDeleteId(null)
    fetchRows()
  }

  const totalRows = filteredRows.length
  const totalPages = Math.ceil(totalRows / PAGE_SIZE)
  const activeSearchField = SEARCH_FIELDS.find(field => field.value === draftSearchField) || SEARCH_FIELDS[0]

  const applySearch = (e) => {
    e.preventDefault()
    setSearchField(draftSearchField)
    setSearch(draftSearch.trim())
    setPage(1)
  }

  const clearSearch = () => {
    setDraftSearch('')
    setSearch('')
    setPage(1)
  }

  const calibrationReportHtml = () => {
    const checklistRowsHtml = detailChecklist.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.name || '-')}</td>
        <td>${escapeHtml(checklistResult(item.passfail))}</td>
      </tr>
    `).join('')
    const terms = getTermName(detail.termid)

    return `<!doctype html>
    <html>
      <head>
        <title>${escapeHtml(detail.certificate_number || 'Calibration Report')}</title>
        <style>
          @page { size: A4; margin: 0; }
          body { font-family: Arial, sans-serif; color: #111; margin: 0; background: #f3f4f6; font-size: 11px; }
          .sheet { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 20mm 15mm; box-sizing: border-box; }
          .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding-top: 8px; margin-bottom: 24px; }
          .brand-logo { display: block; height: 36px; width: auto; object-fit: contain; margin: 0; }
          .radiodetection-logo { display: block; height: 36px; width: auto; max-width: 330px; object-fit: contain; margin: 0; }
          .doc-title { text-align: right; font-size: 20px; font-weight: 700; margin: 8px 0 16px; text-transform: uppercase; }
          .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 28px; margin-bottom: 18px; }
          .meta-row { display: grid; grid-template-columns: 105px 1fr; gap: 8px; line-height: 1.45; }
          .meta-row span:first-child { color: #555; font-weight: 700; }
          .value { font-weight: 600; overflow-wrap: anywhere; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid #222; }
          th, td { padding: 8px; text-align: left; vertical-align: top; border-bottom: 1px solid #e5e5e5; }
          th { background: #d4d4d4; color: #111; font-weight: 700; }
          td:first-child, th:first-child { width: 36px; text-align: center; }
          td:last-child, th:last-child { width: 90px; }
          tr:last-child td { border-bottom: 0; }
          .section { margin-top: 18px; line-height: 1.45; break-inside: avoid; page-break-inside: avoid; }
          .section h2 { font-size: 11px; color: #111; text-transform: uppercase; margin: 0 0 6px; }
          .pre { white-space: pre-wrap; overflow-wrap: anywhere; }
          @media print {
            body { background: #fff; }
            .sheet { width: auto; min-height: 0; margin: 0; padding: 15mm; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="top">
            <img class="brand-logo" src="${salesDocumentLogo}" alt="RD-Palmer">
            <img class="radiodetection-logo" src="${radiodetectionLogo}" alt="Radiodetection">
          </div>
          <div class="doc-title">Calibration Report</div>
          <div class="meta">
            <div class="meta-row"><span>Certificate No.:</span><span class="value">${escapeHtml(detail.certificate_number || '-')}</span></div>
            <div class="meta-row"><span>Date:</span><span class="value">${formatDate(detail.created_at, '-')}</span></div>
            <div class="meta-row"><span>Ticket:</span><span class="value">${escapeHtml(getTicketLabel(detail.ticket_id))}</span></div>
            <div class="meta-row"><span>Status:</span><span class="value">${escapeHtml(detail.status || '-')}</span></div>
            <div class="meta-row"><span>Serial Number:</span><span class="value">${escapeHtml(detail.serial_number || '-')}</span></div>
            <div class="meta-row"><span>Std. Number:</span><span class="value">${escapeHtml(detail.snumber || '-')}</span></div>
            <div class="meta-row"><span>Conducted By:</span><span class="value">${escapeHtml(getUserName(detail.conduct_by))}</span></div>
          </div>
          <div class="section">
            <h2>Checklist</h2>
            <table>
              <thead><tr><th>#</th><th>Checklist</th><th>Result</th></tr></thead>
              <tbody>${checklistRowsHtml || '<tr><td colspan="3" style="text-align:center;color:#777;">No checklist rows.</td></tr>'}</tbody>
            </table>
          </div>
          ${terms && terms !== '-' ? `<div class="section"><h2>Terms & Conditions</h2><div class="pre">${escapeHtml(terms)}</div></div>` : ''}
          ${detail.remark ? `<div class="section"><h2>Remark</h2><div class="pre">${escapeHtml(detail.remark)}</div></div>` : ''}
        </div>
      </body>
    </html>`
  }

  const printCalibrationReport = () => {
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(calibrationReportHtml())
    win.document.close()
    win.onload = () => { win.focus(); win.print() }
  }

  if (view === 'list') return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Calibration</h1>
        <button onClick={openAdd} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700"><Plus size={16} /> New Calibration</button>
      </div>
      <form onSubmit={applySearch} className="flex flex-col sm:flex-row gap-3 mb-4">
        <select
          value={draftSearchField}
          onChange={e => setDraftSearchField(e.target.value)}
          className="w-full sm:w-48 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
        >
          {SEARCH_FIELDS.map(field => <option key={field.value} value={field.value}>{field.label}</option>)}
        </select>
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={activeSearchField.placeholder}
            value={draftSearch}
            onChange={e => setDraftSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-red-400"
          />
        </div>
        <button type="submit" disabled={loading} className="px-4 py-2 bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60">Search</button>
        {search && <button type="button" onClick={clearSearch} className="px-4 py-2 border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Clear</button>}
      </form>
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
            : pagedRows.length === 0 ? <tr><td colSpan={6} className="text-center py-12 text-gray-400">No calibration records found.</td></tr>
            : pagedRows.map(r => (
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
      <PaginationControls page={page} totalPages={totalPages} total={totalRows} label="record" onPageChange={setPage} />
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
            <input
              type="text"
              value={form.certificate_number}
              onChange={e => setForm(f => ({...f, certificate_number: e.target.value}))}
              required
              readOnly={!editId}
              placeholder="YYMMDD-#####"
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 read-only:bg-gray-50 read-only:text-gray-600"
            />
            <p className="mt-1 text-xs text-gray-400">Format: YYMMDD-#####</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ticket</label>
            <select value={form.ticket_id} onChange={e => handleTicketChange(e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {tickets.map(t => <option key={t.id} value={t.id}>TID{t.ticket_id} - {t.company_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number</label>
            {ticketSerialOptions.length > 0 ? (
              <select
                value={form.serial_number}
                onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))}
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
              >
                <option value="">Please Select</option>
                {ticketSerialOptions.map(item => (
                  <option key={item.id} value={item.serial_number}>
                    {[item.serial_number, item.sku, item.item_description].filter(Boolean).join(' - ')}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input type="text" list="calibration-serial-options" value={form.serial_number}
                  onFocus={e => { e.target.select(); loadSerialOptions(form.serial_number) }}
                  onChange={e => { setForm(f => ({...f, serial_number: e.target.value})); loadSerialOptions(e.target.value) }}
                  placeholder="Search serial number" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                <datalist id="calibration-serial-options">
                  {serialOptions.map(item => <option key={item.id} value={item.serial_number}>{[item.sku, item.customername].filter(Boolean).join(' - ')}</option>)}
                </datalist>
              </>
            )}
            {(ticketSerialLoading || serialLoading) && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-500">
                <span className="h-3 w-3 rounded-full border-2 border-gray-300 border-t-red-600 animate-spin" />
                {ticketSerialLoading ? 'Loading ticket serial numbers...' : 'Searching serial numbers...'}
              </div>
            )}
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
            <TermsSelect value={form.termid} options={termOptions} onChange={termid => setForm(f => ({ ...f, termid }))} />
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
        <div className="flex items-center gap-2">
          <button onClick={printCalibrationReport} className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"><Printer size={14}/> Print Report</button>
          <button onClick={() => openEdit(detail)} className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"><Edit2 size={14}/> Edit</button>
        </div>
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
