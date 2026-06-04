import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { notifyUser } from '../../lib/notifyUser'
import { fetchAssignableUsers, fetchLegacyUsers, getLegacyUserId, getUserName as formatUserName, isUuid } from '../../lib/legacyUsers'
import { fetchAllRows } from '../../lib/fetchAllRows'
import { logActivity } from '../../lib/activityLog'
import { formatDate, formatDateTime } from '../../lib/dateFormat'
import { displayText } from '../../lib/displayText'
import salesDocumentLogo from '../../assets/sales-document-logo.png'
import SignedFileLink from '../../components/SignedFileLink'
import PaginationControls from '../../components/PaginationControls'
import { Plus, Search, Eye, Edit2, Trash2, CheckCircle, RotateCcw, ChevronLeft, ChevronRight, Download } from 'lucide-react'

const PAGE_SIZE = 30
const TASK_LIST_COLUMNS = 'id, ticket_id, servicetype, startdate, starttime, enddate, endtime, spare, description, action_taken, assigned_to, is_completed, user_id, file, created_at'
const DEFAULT_TASK_TERMS = `1. Work performed is based on information available at the time of service.
2. Parts used, findings, and service notes are recorded for internal and customer reference.
3. Any further repair, replacement, or calibration work may require separate approval.`

function LoadingHint({ text = 'Loading options...' }) {
  return (
    <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-500">
      <span className="h-3 w-3 rounded-full border-2 border-gray-300 border-t-red-600 animate-spin" />
      {text}
    </div>
  )
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

function sanitizeHtml(value = '') {
  const raw = String(value || '')
  if (!raw) return ''
  if (!/<\/?[a-z][\s\S]*>/i.test(raw)) return escapeHtml(raw).replace(/\n/g, '<br>')
  if (typeof window === 'undefined') return raw
  const doc = new DOMParser().parseFromString(raw, 'text/html')
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach(el => el.remove())
  doc.body.querySelectorAll('*').forEach(el => {
    ;[...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase()
      const val = attr.value || ''
      if (name.startsWith('on') || name === 'style' || (['href', 'src'].includes(name) && val.trim().toLowerCase().startsWith('javascript:'))) {
        el.removeAttribute(attr.name)
      }
    })
  })
  return doc.body.innerHTML
}

function isImageFile(path = '') {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(String(path).split('?')[0])
}

function taskReportHtml(task, { ticketLabel, assignedTo, createdBy, terms, fileUrl }) {
  const photoBlock = task.file
    ? isImageFile(task.file) && fileUrl
      ? `<div class="section"><h2>Uploaded Photo</h2><img class="task-photo" src="${escapeHtml(fileUrl)}" alt="Uploaded task file"></div>`
      : `<div class="section"><h2>Uploaded File</h2><div>${escapeHtml(task.file)}</div></div>`
    : ''

  return `<!doctype html>
  <html>
    <head>
      <title>Task Report</title>
      <style>
        @page { size: A4; margin: 0; }
        body { font-family: Arial, sans-serif; color: #111; margin: 0; background: #f3f4f6; font-size: 11px; }
        .sheet { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 20mm 15mm; box-sizing: border-box; }
        .top { display: grid; grid-template-columns: 1fr 1.45fr; gap: 20px; align-items: start; padding-top: 8px; margin-bottom: 20px; }
        .brand-block { text-align: left; }
        .brand-logo { display: block; width: 175px; height: auto; margin-top: 0; }
        .company { text-align: right; line-height: 1.35; font-size: 11px; }
        .company strong { font-size: 12px; }
        .doc-title { text-align: left; font-size: 20px; font-weight: 700; margin: 16px 0 8px; }
        .meta { width: 260px; }
        .meta-row { display: grid; grid-template-columns: 95px 1fr; gap: 8px; line-height: 1.35; }
        .meta-row .value { text-align: right; font-weight: 600; }
        .summary { display: grid; grid-template-columns: minmax(0, 1fr) 270px; gap: 8px 34px; margin: 18px 0; border: 1px solid #222; border-radius: 3px; padding: 12px; }
        .summary-row { display: grid; grid-template-columns: 95px 1fr; gap: 8px; line-height: 1.4; }
        .summary-row span:first-child { color: #555; font-weight: 700; }
        .section { margin-top: 14px; line-height: 1.45; break-inside: avoid; page-break-inside: avoid; }
        .section h2 { font-size: 11px; color: #111; text-transform: uppercase; margin: 0 0 6px; }
        .text-box { border: 1px solid #d4d4d4; min-height: 60px; padding: 10px; white-space: pre-wrap; overflow-wrap: anywhere; }
        .terms-box { border: 1px solid #222; min-height: 80px; padding: 10px; line-height: 1.45; }
        .task-photo { display: block; max-width: 100%; max-height: 105mm; object-fit: contain; border: 1px solid #ddd; margin-top: 8px; }
        .document-signature { display: grid; grid-template-columns: 270px 270px; gap: 48px; margin-top: 34px; break-inside: avoid; page-break-inside: avoid; }
        .signature-line { border-top: 1px dotted #111; padding-top: 10px; font-style: italic; min-height: 64px; line-height: 1.45; }
        @media print {
          body { background: #fff; }
          .sheet { width: auto; min-height: 0; margin: 0; padding: 15mm; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
        }
      </style>
    </head>
    <body>
      <div class="sheet">
        <div class="top">
          <div class="brand-block">
            <img class="brand-logo" src="${salesDocumentLogo}" alt="RD-Palmer">
            <div class="doc-title">Task Report</div>
            <div class="meta">
              <div class="meta-row"><span>Task ID:</span><span class="value">#${escapeHtml(task.id || '-')}</span></div>
              <div class="meta-row"><span>Date:</span><span class="value">${formatDate(task.startdate || task.created_at)}</span></div>
              <div class="meta-row"><span>Status:</span><span class="value">${task.is_completed == 1 ? 'Completed' : 'Open'}</span></div>
            </div>
          </div>
          <div class="company">
            <strong>RD-PALMER TECHNOLOGY (M) SDN BHD</strong> (610731 W)<br>
            63, Jalan Seri Utara 1, Kipark Sri Utara, 68100 Kuala Lumpur<br>
            Tel: +603 6250 2071 | E-mail: info@rd-palmer.com<br>
            Website: www.rd-palmer.com
          </div>
        </div>
        <div class="summary">
          <div class="summary-row"><span>Ticket:</span><span>${escapeHtml(ticketLabel || '-')}</span></div>
          <div class="summary-row"><span>Service:</span><span>${escapeHtml(task.servicetype || '-')}</span></div>
          <div class="summary-row"><span>Start:</span><span>${escapeHtml(`${formatDate(task.startdate)}${task.starttime ? ` ${task.starttime}` : ''}`)}</span></div>
          <div class="summary-row"><span>End:</span><span>${escapeHtml(`${formatDate(task.enddate)}${task.endtime ? ` ${task.endtime}` : ''}`)}</span></div>
          <div class="summary-row"><span>Spare Used:</span><span>${escapeHtml(task.spare || '-')}</span></div>
          <div class="summary-row"><span>Assigned To:</span><span>${escapeHtml(assignedTo || '-')}</span></div>
          <div class="summary-row"><span>Created By:</span><span>${escapeHtml(createdBy || '-')}</span></div>
          <div class="summary-row"><span>Created:</span><span>${escapeHtml(formatDateTime(task.created_at))}</span></div>
        </div>
        <div class="section">
          <h2>Description</h2>
          <div class="text-box">${escapeHtml(task.description || '-')}</div>
        </div>
        ${task.action_taken ? `<div class="section"><h2>Action Taken</h2><div class="text-box">${escapeHtml(task.action_taken)}</div></div>` : ''}
        ${photoBlock}
        <div class="section">
          <h2>Terms & Conditions</h2>
          <div class="terms-box">${sanitizeHtml(terms || DEFAULT_TASK_TERMS)}</div>
        </div>
        <div class="document-signature">
          <div class="signature-line">(Signature)<br>Name:<br>Position:<br>Date:</div>
          <div class="signature-line">(Co. Stamp)</div>
        </div>
      </div>
    </body>
  </html>`
}

function openPrintable(html, autoPrint = false) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  if (autoPrint) {
    win.onload = () => { win.focus(); win.print() }
  }
}

function spareLabel(spare) {
  const sku = spare.sku || spare.name || ''
  const description = stripHtml(spare.description || spare.name || '')
  if (sku && description && description !== sku) return `${sku} - ${description}`
  return sku || description || 'Unnamed item'
}

function SpareSearchSelect({ options, value, onChange, loading }) {
  const [term, setTerm] = useState('')
  const [open, setOpen] = useState(false)
  const selected = options.find(item =>
    String(item.sku || item.name || '') === String(value || '') ||
    String(item.name || '') === String(value || '')
  )
  const inputValue = open ? term : (selected ? spareLabel(selected) : value || '')
  const search = term.trim().toLowerCase()
  const filtered = search
    ? options.filter(item => [
        item.sku,
        item.name,
        stripHtml(item.description),
      ].some(part => String(part || '').toLowerCase().includes(search)))
    : options

  const choose = (item) => {
    onChange(item.sku || item.name || '')
    setTerm('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={inputValue}
        onFocus={() => { setOpen(true); setTerm('') }}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
        onChange={e => {
          setTerm(e.target.value)
          setOpen(true)
          if (!e.target.value.trim()) onChange('')
        }}
        placeholder="Search SKU or description..."
        className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
      />
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto border border-gray-200 bg-white shadow-lg">
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onChange(''); setTerm(''); setOpen(false) }}
            className="block w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
          >
            None
          </button>
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-400">
              {loading ? 'Loading spare options...' : 'No matching spare found.'}
            </div>
          ) : filtered.map(item => (
            <button
              key={item.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); choose(item) }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
            >
              <span className="block font-medium text-gray-800">{item.sku || item.name || '—'}</span>
              {(item.description || item.name) && (
                <span className="block truncate text-xs text-gray-500">{stripHtml(item.description || item.name)}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {loading && <LoadingHint text="Loading spare options..." />}
    </div>
  )
}

const emptyForm = {
  ticket_id: '',
  servicetype: '',
  startdate: '',
  starttime: '',
  enddate: '',
  endtime: '',
  spare: '',
  description: '',
  action_taken: '',
  assigned_to: '',
  file: '',
}

export default function Tasks() {
  const { user, profile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [view, setView]           = useState('list')
  const [tab, setTab]             = useState('open')
  const [scope, setScope]         = useState('all')
  const [tasks, setTasks]         = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [assignedFilter, setAssignedFilter] = useState('')
  const [serviceTypeFilter, setServiceTypeFilter] = useState('')
  const [loading, setLoading]     = useState(false)
  const [form, setForm]           = useState(emptyForm)
  const [editId, setEditId]       = useState(null)
  const [detail, setDetail]       = useState(null)
  const [deleteId, setDeleteId]   = useState(null)
  const [completeId, setCompleteId] = useState(null)
  const [reopenId, setReopenId]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [uploadFile, setUploadFile] = useState(null)

  const [tickets, setTickets]         = useState([])
  const [ticketLabels, setTicketLabels] = useState({})
  const [serviceTypes, setServiceTypes] = useState([])
  const [users, setUsers]             = useState([])
  const [allUsers, setAllUsers]       = useState([])
  const [spares, setSpares]           = useState([])
  const [dropdownLoading, setDropdownLoading] = useState(true)
  const origAssignedTo                = useRef(null)
  const ticketDataLoadedRef           = useRef(false)

  // ── Fetch list ────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('task')
      .select(TASK_LIST_COLUMNS, { count: 'estimated' })
      .eq('is_completed', tab === 'open' ? 0 : 1)
      .order('id', { ascending: false })

    const term = search.trim()
    if (term) {
      const tid = term.replace(/^TID/i, '')
      const { data: companyTickets, error: companyTicketErr } = await supabase
        .from('ticket')
        .select('id')
        .ilike('company_name', `%${term}%`)
        .limit(1000)
      let numberTickets = []
      if (/^\d+$/.test(tid)) {
        const { data: numberTicketRows, error: numberTicketErr } = await supabase
          .from('ticket')
          .select('id')
          .eq('ticket_id', parseInt(tid))
          .limit(1000)
        if (!numberTicketErr) numberTickets = numberTicketRows || []
      }
      const matchingTickets = [
        ...(!companyTicketErr ? companyTickets || [] : []),
        ...numberTickets,
      ]
      const ticketIds = [...new Set(matchingTickets.map(t => t.id))]
      if (ticketIds.length > 0) {
        q = q.in('ticket_id', ticketIds)
      } else {
        q = q.eq('id', -1)
      }
    }
    if (scope === 'mine') q = q.eq('assigned_to', getLegacyUserId(profile))
    if (assignedFilter) q = q.eq('assigned_to', parseInt(assignedFilter))
    if (serviceTypeFilter) q = q.eq('servicetype', serviceTypeFilter)
    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    const { data, count, error: err } = await q
    if (!err) {
      const pageRows = data || []
      setTasks(pageRows)
      setTotal(count || 0)
      const ticketIds = [...new Set(pageRows.map(row => row.ticket_id).filter(Boolean))]
      if (ticketIds.length) {
        const { data: ticketRows, error: ticketErr } = await supabase
          .from('ticket')
          .select('id, ticket_id, company_name')
          .in('id', ticketIds)
        if (!ticketErr) {
          setTicketLabels(Object.fromEntries((ticketRows || []).map(t => [String(t.id), t])))
        }
      } else {
        setTicketLabels({})
      }
    }
    setLoading(false)
  }, [search, page, tab, scope, profile, assignedFilter, serviceTypeFilter])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const openDetail = useCallback(async (task) => {
    setDetail(task)
    setView('detail')
    if (task.ticket_id && !ticketLabels[task.ticket_id]) {
      const { data } = await supabase
        .from('ticket')
        .select('id, ticket_id, company_name')
        .eq('id', task.ticket_id)
        .maybeSingle()
      if (data) {
        setTicketLabels(prev => ({
          ...prev,
          [data.id]: `TID${data.ticket_id}${data.company_name ? ` - ${data.company_name}` : ''}`,
        }))
      }
    }
  }, [ticketLabels])

  useEffect(() => {
    const taskId = location.state?.taskId
    if (!taskId) return
    const load = async () => {
      const { data } = await supabase
        .from('task')
        .select(TASK_LIST_COLUMNS)
        .eq('id', taskId)
        .maybeSingle()
      if (data) openDetail(data)
    }
    load()
  }, [location.state?.taskId, openDetail])

  // ── Fetch dropdowns ───────────────────────────────────────────────
  useEffect(() => {
    const run = async () => {
      setDropdownLoading(true)
      const [stR, usrR, allUsrR, catalogueR, taskSpareR] = await Promise.all([
        supabase.from('service_type').select('id, type').order('type'),
        fetchAssignableUsers(supabase),
        fetchLegacyUsers(supabase),
        fetchAllRows('goodsservices', 'id, sku, name, description', 'sku'),
        supabase.from('task').select('spare').not('spare', 'is', null).neq('spare', '').limit(1000),
      ])
      if (!stR.error)   setServiceTypes(stR.data || [])
      setUsers(usrR || [])
      setAllUsers(allUsrR || [])
      const catalogue = (catalogueR || []).map(item => ({
        id: `catalogue-${item.id}`,
        sku: item.sku || item.name || '',
        name: item.name || item.sku || '',
        description: item.description || item.name || '',
      })).filter(item => item.sku || item.name)
      const existingTaskSpares = !taskSpareR.error
        ? [...new Set((taskSpareR.data || []).map(row => row.spare).filter(Boolean))]
        : []
      const catalogueValues = new Set(catalogue.map(item => String(item.sku || item.name || '')))
      const legacyTaskSpares = existingTaskSpares
        .filter(name => !catalogueValues.has(String(name)))
        .map((name, idx) => ({ id: `task-spare-${idx}-${name}`, sku: name, name, description: 'Previously used task spare' }))
      setSpares([...catalogue, ...legacyTaskSpares])
      setDropdownLoading(false)
    }
    run().catch(() => setDropdownLoading(false))
  }, [])

  const ensureTicketData = async () => {
    if (ticketDataLoadedRef.current) return
    ticketDataLoadedRef.current = true
    setDropdownLoading(true)
    try {
      const tickR = await fetchAllRows('ticket', 'id, ticket_id, company_name, is_completed', 'id', { ascending: false })
      setTickets(tickR || [])
    } catch (err) {
      ticketDataLoadedRef.current = false
      throw err
    } finally {
      setDropdownLoading(false)
    }
  }

  // ── Open add ─────────────────────────────────────────────────────
  const openAdd = async () => {
    await ensureTicketData()
    setForm({ ...emptyForm, startdate: new Date().toISOString().split('T')[0] })
    setUploadFile(null)
    setEditId(null)
    setError('')
    setView('form')
  }

  // ── Open edit ─────────────────────────────────────────────────────
  const openEdit = async (t) => {
    await ensureTicketData()
    setForm({
      ticket_id:   String(t.ticket_id   || ''),
      servicetype: t.servicetype        || '',
      startdate:   t.startdate          || '',
      starttime:   t.starttime          || '',
      enddate:     t.enddate            || '',
      endtime:     t.endtime            || '',
      spare:       t.spare              || '',
      description: t.description        || '',
      action_taken: t.action_taken      || '',
      assigned_to: String(t.assigned_to || ''),
      file:        t.file               || '',
    })
    setUploadFile(null)
    origAssignedTo.current = t.assigned_to || ''
    setEditId(t.id)
    setError('')
    setView('form')
  }

  // ── Save ──────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    let filePath = form.file || null
    if (uploadFile) {
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      filePath = `task/${Date.now()}-${safeName}`
      const { error: uploadErr } = await supabase.storage.from('crm-uploads').upload(filePath, uploadFile, { upsert: true })
      if (uploadErr) { setError(uploadErr.message); setSaving(false); return }
    }

    const payload = {
      ticket_id:    form.ticket_id   ? parseInt(form.ticket_id)   : null,
      servicetype:  form.servicetype || null,
      startdate:    form.startdate   || null,
      starttime:    form.starttime   || null,
      enddate:      form.enddate     || null,
      endtime:      form.endtime     || null,
      spare:        form.spare       || null,
      description:  form.description,
      action_taken: form.action_taken || null,
      assigned_to:  form.assigned_to ? parseInt(form.assigned_to) : null,
      is_completed: 0,
      is_archived:  0,
      user_id:      getLegacyUserId(profile),
      file:         filePath,
    }

    if (editId) {
      const { error: err } = await supabase.from('task').update(payload).eq('id', editId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('task').insert([payload])
      if (err) { setError(err.message); setSaving(false); return }
    }
    logActivity({
      module: 'tasks',
      action: editId ? 'update' : 'create',
      recordTable: 'task',
      recordId: editId || null,
      recordLabel: form.servicetype || form.description,
      summary: `${editId ? 'Updated' : 'Created'} task${form.ticket_id ? ` for ticket #${form.ticket_id}` : ''}`,
      metadata: { ticket_id: form.ticket_id || null, assigned_to: form.assigned_to || null },
    })

    // ── Notify assigned user ──────────────────────────────────────
    const newAssignee = form.assigned_to || ''
    const oldAssignee = editId ? (origAssignedTo.current || '') : ''
    const isNewAssignment = isUuid(newAssignee) && newAssignee !== user?.id &&
      (!editId || newAssignee !== oldAssignee)

    if (isNewAssignment) {
      const tickRef = tickets.find(t => String(t.id) === String(form.ticket_id))
      await notifyUser(supabase, {
        userId: newAssignee,
        title:  'Task assigned to you',
        body:   `You have been assigned a task${tickRef ? ' for ' + tickRef.company_name : ''}`,
        link:   '/tasks',
      })
    }

    setSaving(false)
    setUploadFile(null)
    fetchTasks()
    setView('list')
  }

  const handleDetailBack = () => {
    const returnToTicketId = location.state?.returnToTicketId
    if (returnToTicketId) {
      navigate('/tickets', { state: { ticketId: returnToTicketId } })
      return
    }
    setView('list')
  }

  // ── Mark complete ─────────────────────────────────────────────────
  const markComplete = async (id) => {
    await supabase.from('task').update({ is_completed: 1 }).eq('id', id)
    logActivity({
      module: 'tasks',
      action: 'complete',
      recordTable: 'task',
      recordId: id,
      summary: `Marked task #${id} complete`,
    })
    setCompleteId(null)
    fetchTasks()
  }

  const reopenTask = async (id) => {
    await supabase.from('task').update({ is_completed: 0 }).eq('id', id)
    logActivity({
      module: 'tasks',
      action: 'reopen',
      recordTable: 'task',
      recordId: id,
      summary: `Reopened task #${id}`,
    })
    setReopenId(null)
    fetchTasks()
  }

  // ── Delete ────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    await supabase.from('task').delete().eq('id', id)
    logActivity({
      module: 'tasks',
      action: 'delete',
      recordTable: 'task',
      recordId: id,
      summary: `Deleted task #${id}`,
    })
    setDeleteId(null)
    fetchTasks()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Helpers ───────────────────────────────────────────────────────
  const formatTicketLabel = (ticket) => {
    if (!ticket || typeof ticket !== 'object') return displayText(ticket)
    const number = displayText(ticket.ticket_id ?? ticket.id, '')
    const customer = displayText(ticket.company_name, '')
    return `TID${number}${customer ? ` — ${customer}` : ''}`
  }

  const getTicketLabel = (ticketId) => {
    const t = tickets.find(t => t.id == ticketId || t.ticket_id == ticketId)
    if (t) return formatTicketLabel(t)
    const label = ticketLabels[String(ticketId)]
    if (label) return typeof label === 'object' ? formatTicketLabel(label) : displayText(label)
    return ticketId ? `TID${displayText(ticketId, '')}` : '—'
  }

  const getUserName = (id) => {
    return displayText(formatUserName(allUsers.length ? allUsers : users, id))
  }

  const formatTaskDateTime = (date, time) => {
    const cleanTime = displayText(time, '')
    return `${formatDate(date)}${cleanTime ? ` ${cleanTime}` : ''}`
  }

  const printTaskReport = async (task) => {
    const [{ data: termsRow }, fileResult] = await Promise.all([
      supabase.from('app_setting').select('value').eq('key', 'task_terms').maybeSingle(),
      task.file
        ? supabase.storage.from('crm-uploads').createSignedUrl(task.file, 60 * 10)
        : Promise.resolve({ data: null }),
    ])
    const html = taskReportHtml(task, {
      ticketLabel: getTicketLabel(task.ticket_id),
      assignedTo: getUserName(task.assigned_to),
      createdBy: getUserName(task.user_id),
      terms: termsRow?.value || DEFAULT_TASK_TERMS,
      fileUrl: fileResult?.data?.signedUrl || '',
    })
    openPrintable(html, true)
  }

  // ══════════════════════════════════════════════════════════════════
  // LIST
  // ══════════════════════════════════════════════════════════════════
  if (view === 'list') {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <button onClick={openAdd} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700">
            <Plus size={16} /> New Task
          </button>
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
            <input
              type="text"
              placeholder="Search customer or ticket number..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-red-400"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={assignedFilter}
              onChange={e => { setAssignedFilter(e.target.value); setPage(1) }}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 sm:w-48"
            >
              <option value="">All Assigned Users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
            </select>
            <select
              value={serviceTypeFilter}
              onChange={e => { setServiceTypeFilter(e.target.value); setPage(1) }}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 sm:w-48"
            >
              <option value="">All Service Types</option>
              {serviceTypes.map(s => <option key={s.id} value={s.type}>{s.type}</option>)}
            </select>
          </div>
          <div className="flex border border-gray-200 bg-white text-sm">
            {[['all', 'All Tasks'], ['mine', 'My Assigned']].map(([id, label]) => (
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

        <div className="bg-white border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Ticket</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Service Type</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Start Date</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">End Date</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Assigned To</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading...</td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">No {tab} tasks found.</td></tr>
              ) : tasks.map(t => (
                <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-red-600">{getTicketLabel(t.ticket_id)}</td>
                  <td className="px-4 py-3 text-gray-700">{displayText(t.servicetype)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatTaskDateTime(t.startdate, t.starttime)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatTaskDateTime(t.enddate, t.endtime)}</td>
                  <td className="px-4 py-3 text-gray-600">{getUserName(t.assigned_to)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openDetail(t)} className="text-gray-500 hover:text-gray-700"><Eye size={15} /></button>
                      <button onClick={() => openEdit(t)} className="text-gray-500 hover:text-gray-700"><Edit2 size={15} /></button>
                      {tab === 'open' && <button onClick={() => setCompleteId(t.id)} className="text-green-600 hover:text-green-700" title="Mark Complete"><CheckCircle size={15} /></button>}
                      {tab === 'closed' && <button onClick={() => setReopenId(t.id)} className="text-amber-600 hover:text-amber-700" title="Undo Complete / Reopen"><RotateCcw size={15} /></button>}
                      <button onClick={() => setDeleteId(t.id)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationControls page={page} totalPages={totalPages} total={total} label="task" onPageChange={setPage} />

        {completeId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white p-6 w-full max-w-sm shadow-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Mark Task as Completed?</h3>
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setCompleteId(null)} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
                <button onClick={() => markComplete(completeId)} className="px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700">Confirm</button>
              </div>
            </div>
          </div>
        )}

        {reopenId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white p-6 w-full max-w-sm shadow-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Reopen this task?</h3>
              <p className="text-sm text-gray-600 mb-4">This will undo the completion and move it back to the open list.</p>
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setReopenId(null)} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
                <button onClick={() => reopenTask(reopenId)} className="px-4 py-2 text-sm bg-amber-600 text-white hover:bg-amber-700">Reopen</button>
              </div>
            </div>
          </div>
        )}

        {deleteId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white p-6 w-full max-w-sm shadow-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Delete Task?</h3>
              <p className="text-sm text-gray-600 mb-4">This action cannot be undone.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
                <button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════
  // FORM
  // ══════════════════════════════════════════════════════════════════
  if (view === 'form') {
    return (
      <div className="p-6 max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
          <h1 className="text-2xl font-bold text-gray-900">{editId ? 'Edit Task' : 'New Task'}</h1>
        </div>
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <form onSubmit={handleSave} className="bg-white border border-gray-200 p-6 space-y-5">

          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Ticket <span className="text-red-500">*</span></label>
            <div className="col-span-2">
              <select value={form.ticket_id} onChange={e => setForm(f => ({ ...f, ticket_id: e.target.value }))} required className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                <option value="">Please Select</option>
                {tickets.filter(t => t.is_completed != 1).map(t => <option key={t.id} value={t.id}>TID{t.ticket_id} — {t.company_name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Service Type</label>
            <div className="col-span-2">
              <select value={form.servicetype} onChange={e => setForm(f => ({ ...f, servicetype: e.target.value }))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                <option value="">Please Select</option>
                {serviceTypes.map(s => <option key={s.id} value={s.type}>{s.type}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Start Date / Time</label>
            <div className="col-span-2 flex gap-3">
              <input type="date" value={form.startdate} onChange={e => setForm(f => ({ ...f, startdate: e.target.value }))} className="flex-1 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
              <input type="time" value={form.starttime} onChange={e => setForm(f => ({ ...f, starttime: e.target.value }))} className="flex-1 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">End Date / Time</label>
            <div className="col-span-2 flex gap-3">
              <input type="date" value={form.enddate} onChange={e => setForm(f => ({ ...f, enddate: e.target.value }))} className="flex-1 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
              <input type="time" value={form.endtime} onChange={e => setForm(f => ({ ...f, endtime: e.target.value }))} className="flex-1 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Spare Used</label>
            <div className="col-span-2">
              <SpareSearchSelect
                options={spares}
                value={form.spare}
                onChange={value => setForm(f => ({ ...f, spare: value }))}
                loading={dropdownLoading}
              />
            </div>
          </div>

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

          <div className="grid grid-cols-3 gap-4">
            <label className="text-sm font-medium text-gray-700 pt-2">Description <span className="text-red-500">*</span></label>
            <div className="col-span-2">
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required rows={3} placeholder="Task description..." className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <label className="text-sm font-medium text-gray-700 pt-2">Action Taken</label>
            <div className="col-span-2">
              <textarea value={form.action_taken} onChange={e => setForm(f => ({ ...f, action_taken: e.target.value }))} rows={3} placeholder="Action taken..." className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Assigned To</label>
            <div className="col-span-2">
              <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                <option value="">Please Select</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setView('list')} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-6 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">
              {saving ? 'Saving...' : editId ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════
  // DETAIL
  // ══════════════════════════════════════════════════════════════════
  if (view === 'detail' && detail) {
    return (
      <div className="p-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={handleDetailBack} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
            <h1 className="text-2xl font-bold text-gray-900">Task Detail</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => printTaskReport(detail)} className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"><Download size={14} /> Print Report</button>
            <button onClick={() => openEdit(detail)} className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"><Edit2 size={14} /> Edit</button>
            {detail.is_completed === 0 && (
              <button onClick={() => setCompleteId(detail.id)} className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 text-sm hover:bg-green-700"><CheckCircle size={14} /> Mark Complete</button>
            )}
            {detail.is_completed == 1 && (
              <button onClick={() => setReopenId(detail.id)} className="flex items-center gap-1.5 bg-amber-600 text-white px-3 py-1.5 text-sm hover:bg-amber-700"><RotateCcw size={14} /> Undo Complete</button>
            )}
          </div>
        </div>
        <div className="bg-white border border-gray-200 p-6 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <div><span className="font-medium text-gray-500">Ticket: </span><span className="text-red-600 font-semibold">{getTicketLabel(detail.ticket_id)}</span></div>
            <div><span className="font-medium text-gray-500">Service Type: </span>{displayText(detail.servicetype)}</div>
            <div><span className="font-medium text-gray-500">Start: </span>{formatTaskDateTime(detail.startdate, detail.starttime)}</div>
            <div><span className="font-medium text-gray-500">End: </span>{formatTaskDateTime(detail.enddate, detail.endtime)}</div>
            <div><span className="font-medium text-gray-500">Spare Used: </span>{displayText(detail.spare)}</div>
            <div><span className="font-medium text-gray-500">Assigned To: </span>{getUserName(detail.assigned_to)}</div>
            <div><span className="font-medium text-gray-500">Created By: </span>{getUserName(detail.user_id)}</div>
            <div><span className="font-medium text-gray-500">Date Created: </span>{formatDateTime(detail.created_at)}</div>
            <div>
              <span className="font-medium text-gray-500">Document: </span>
              {detail.file ? (
                <SignedFileLink path={detail.file} className="text-red-600 hover:underline" />
              ) : '—'}
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="font-medium text-gray-500 mb-1">Description</p>
            <p className="text-gray-800 whitespace-pre-wrap">{displayText(detail.description)}</p>
          </div>
          {displayText(detail.action_taken, '') && (
            <div className="border-t border-gray-100 pt-4">
              <p className="font-medium text-gray-500 mb-1">Action Taken</p>
              <p className="text-gray-800 whitespace-pre-wrap">{displayText(detail.action_taken)}</p>
            </div>
          )}
        </div>
        {completeId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white p-6 w-full max-w-sm shadow-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Mark Task as Completed?</h3>
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setCompleteId(null)} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
                <button onClick={async () => { await markComplete(completeId); setView('list') }} className="px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700">Confirm</button>
              </div>
            </div>
          </div>
        )}
        {reopenId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white p-6 w-full max-w-sm shadow-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Reopen this task?</h3>
              <p className="text-sm text-gray-600 mb-4">This will undo the completion and move it back to the open list.</p>
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setReopenId(null)} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
                <button onClick={async () => { await reopenTask(reopenId); setView('list') }} className="px-4 py-2 text-sm bg-amber-600 text-white hover:bg-amber-700">Reopen</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}
