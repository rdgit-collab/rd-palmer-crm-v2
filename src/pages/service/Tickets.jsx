import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { notifyUser } from '../../lib/notifyUser'
import { getLegacyUserId, getUserName as formatUserName } from '../../lib/legacyUsers'
import { fetchAllRows } from '../../lib/fetchAllRows'
import SearchSelect from '../../components/SearchSelect'
import { logActivity } from '../../lib/activityLog'
import { formatDate, formatDateTime } from '../../lib/dateFormat'
import { displayText } from '../../lib/displayText'
import { searchSerialNumberOptions } from '../../lib/serialNumberSearch'
import salesDocumentLogo from '../../assets/sales-document-logo.png'
import {
  useAssignableUsers,
  useCategories,
  useLegacyUsers,
  useModes,
  usePriorities,
  useServiceTypes,
  useSpares,
  useVendors,
} from '../../hooks/useLookups'
import PaginationControls from '../../components/PaginationControls'
import { Plus, Search, Eye, Edit2, Trash2, CheckCircle, RotateCcw, X, ChevronLeft, ChevronRight, Download } from 'lucide-react'

const PAGE_SIZE = 30
const TICKET_LIST_COLUMNS = 'id, ticket_id, date, warranty, category, company_id, company_name, contact_person, description, priority, due_date, status, is_completed, assigned_to, remark, user_id, created_at, serial_number'
const TICKET_STATUSES = ['Open', 'Pending', 'Completed']
const TICKET_STATUS_FILTERS = [...TICKET_STATUSES, 'Overdue']
const SERIAL_SEARCH_TIMEOUT_MS = 6000
const DEFAULT_TICKET_REPORT_TERMS = `1. Work performed is based on information available at the time of service.
2. Parts used, findings, and service notes are recorded for internal and customer reference.
3. Any further repair, replacement, or calibration work may require separate approval.`

const splitCsv = (value) => String(value || '').split(',').map(v => v.trim()).filter(Boolean)
const stripHtml = (value = '') => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

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

function LoadingHint({ text = 'Loading options...' }) {
  return (
    <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-500">
      <span className="h-3 w-3 rounded-full border-2 border-gray-300 border-t-red-600 animate-spin" />
      {text}
    </div>
  )
}

function monthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthOptions(count = 12) {
  const now = new Date()
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1)
    return {
      value: monthValue(date),
      label: date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    }
  })
}

function dateOnly(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monthRange(value) {
  const [year, month] = String(value || monthValue()).split('-').map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)
  return {
    start: dateOnly(start),
    end: dateOnly(end),
  }
}

function SpareChecklist({ options, value, onChange }) {
  const [term, setTerm] = useState('')
  const selected = splitCsv(value)
  const selectedSet = new Set(selected)
  const searchTerm = term.trim().toLowerCase()
  const filtered = options.filter(spare =>
    spare.name.toLowerCase().includes(searchTerm) ||
    String(spare.description || '').toLowerCase().includes(searchTerm)
  )

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
            <span className="min-w-0">
              <span className="block text-gray-700">{spare.name}</span>
              {spare.description && <span className="block truncate text-xs text-gray-400">{spare.description}</span>}
            </span>
          </label>
        ))}
      </div>
      <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
        {selected.length ? `${selected.length} selected: ${selected.join(', ')}` : 'No spare parts selected'}
      </div>
    </div>
  )
}

function spareLabel(spare) {
  const sku = spare.sku || spare.name || ''
  const description = String(spare.description || spare.name || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
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
        String(item.description || '').replace(/<[^>]*>/g, ' '),
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
                <span className="block truncate text-xs text-gray-500">{String(item.description || item.name).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {loading && <LoadingHint text="Loading spare options..." />}
    </div>
  )
}

function priorityColor(priority) {
  switch (priority) {
    case 'High':   return 'bg-red-100 text-red-700'
    case 'Medium': return 'bg-yellow-100 text-yellow-700'
    case 'Low':    return 'bg-green-100 text-green-700'
    default:       return 'bg-gray-100 text-gray-600'
  }
}

function statusColor(status) {
  switch (status) {
    case 'Open':      return 'bg-blue-100 text-blue-700'
    case 'Completed': return 'bg-green-100 text-green-700'
    case 'Pending':   return 'bg-yellow-100 text-yellow-700'
    default:          return 'bg-gray-100 text-gray-600'
  }
}

function workStatus(item) {
  return item?.is_completed == 1 || item?.status === 'Completed' ? 'Completed' : (item?.status || 'Open')
}

function workDone(item) {
  return workStatus(item) === 'Completed'
}

function timelineDate(item) {
  return item?.created_at || item?.date || item?.startdate || item?.date_sent || ''
}

function openPrintable(html, autoPrint = false) {
  const win = window.open('', '_blank')
  if (!win) {
    alert('Please allow popups for this site to open the service report.')
    return
  }
  win.document.write(html)
  win.document.close()
  if (autoPrint) {
    win.onload = () => { win.focus(); win.print() }
  }
}

function ticketReportHtml(ticket, {
  assignedTo,
  categoryName,
  contact,
  contactName,
  createdBy,
  products,
  progress,
  terms,
  timelineItems,
  users,
}) {
  const productRows = products.length
    ? products.map(product => `
      <tr>
        <td>${escapeHtml(product.serial_number || '-')}</td>
        <td>${escapeHtml(formatDate(product.serial_date || product.date))}</td>
        <td>${escapeHtml(product.warranty_period || '-')}</td>
        <td>${escapeHtml(stripHtml(product.item_description || '') || '-')}</td>
        <td>${escapeHtml(product.sku || '-')}</td>
        <td>${escapeHtml(product.remark || '-')}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="6" class="empty">No products recorded.</td></tr>'

  const timelineRows = timelineItems.length
    ? timelineItems.map(item => `
      <div class="timeline-item">
        <div class="timeline-head">
          <span class="timeline-type">${escapeHtml(displayText(item.type))}</span>
          <strong>${escapeHtml(displayText(item.label))}</strong>
          ${item.status ? `<span class="badge">${escapeHtml(displayText(item.status))}</span>` : ''}
          <span class="timeline-date">${escapeHtml(formatDateTime(item.date))}</span>
        </div>
        <div class="timeline-meta">Owner: ${escapeHtml(item.owner ? formatUserName(users, item.owner) : '-')}</div>
        ${item.spare ? `<div class="timeline-meta">Spare Used: ${escapeHtml(displayText(item.spare))}</div>` : ''}
        ${item.text ? `<div class="timeline-text">${escapeHtml(stripHtml(displayText(item.text, '')))}</div>` : ''}
      </div>
    `).join('')
    : '<div class="empty-block">No progress updates recorded.</div>'

  return `<!doctype html>
  <html>
    <head>
      <title>Service Report - TID${escapeHtml(ticket.ticket_id || '-')}</title>
      <style>
        @page { size: A4; margin: 0; }
        body { font-family: Arial, sans-serif; color: #111; margin: 0; background: #f3f4f6; font-size: 11px; }
        .sheet { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 20mm 15mm; box-sizing: border-box; }
        .top { display: grid; grid-template-columns: 1fr 1.45fr; gap: 20px; align-items: start; padding-top: 8px; margin-bottom: 20px; }
        .brand-logo { display: block; width: 175px; height: auto; margin-top: 0; }
        .company { text-align: right; line-height: 1.35; font-size: 11px; }
        .company strong { font-size: 12px; }
        .doc-title { text-align: left; font-size: 26px; font-weight: 700; margin: 16px 0 8px; }
        .meta { width: 240px; }
        .meta-row { display: grid; grid-template-columns: 76px 1fr; gap: 8px; line-height: 1.35; }
        .meta-row .value { text-align: left; font-weight: 600; }
        .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 28px; margin: 18px 0; border: 1px solid #222; border-radius: 3px; padding: 12px; }
        .summary-row { display: grid; grid-template-columns: 105px 1fr; gap: 8px; line-height: 1.4; }
        .summary-row span:first-child { color: #555; font-weight: 700; }
        .section { margin-top: 14px; line-height: 1.45; break-inside: avoid; page-break-inside: avoid; }
        .section h2 { font-size: 11px; color: #111; text-transform: uppercase; margin: 0 0 6px; }
        .text-box { border: 1px solid #d4d4d4; min-height: 60px; padding: 10px; white-space: pre-wrap; overflow-wrap: anywhere; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #d4d4d4; padding: 7px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
        th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; }
        .timeline-item { border: 1px solid #d4d4d4; padding: 9px; margin-bottom: 8px; break-inside: avoid; page-break-inside: avoid; }
        .timeline-head { display: grid; grid-template-columns: 62px 1fr auto auto; gap: 8px; align-items: center; }
        .timeline-type { color: #555; font-size: 10px; font-weight: 700; text-transform: uppercase; }
        .timeline-date { color: #555; font-size: 10px; white-space: nowrap; }
        .timeline-meta { color: #555; font-size: 10px; margin-top: 4px; }
        .timeline-text { margin-top: 7px; white-space: pre-wrap; overflow-wrap: anywhere; }
        .badge { border: 1px solid #d4d4d4; padding: 2px 6px; font-size: 10px; border-radius: 999px; white-space: nowrap; }
        .terms-box { border: 1px solid #222; min-height: 80px; padding: 10px; line-height: 1.45; }
        .document-signature { display: grid; grid-template-columns: 270px 270px; gap: 48px; margin-top: 34px; break-inside: avoid; page-break-inside: avoid; }
        .signature-line { border-top: 1px dotted #111; padding-top: 10px; font-style: italic; min-height: 64px; line-height: 1.45; }
        .empty, .empty-block { color: #777; font-style: italic; }
        @media print {
          body { background: #fff; }
          .sheet { width: auto; min-height: 0; margin: 0; padding: 15mm; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
        }
      </style>
    </head>
    <body>
      <div class="sheet">
        <div class="top">
          <div>
            <img class="brand-logo" src="${salesDocumentLogo}" alt="RD-Palmer">
            <div class="doc-title">Service Report</div>
            <div class="meta">
              <div class="meta-row"><span>Ticket:</span><span class="value">TID${escapeHtml(ticket.ticket_id || '-')}</span></div>
              <div class="meta-row"><span>Date:</span><span class="value">${escapeHtml(formatDate(ticket.date))}</span></div>
              <div class="meta-row"><span>Status:</span><span class="value">${escapeHtml(ticket.status || '-')}</span></div>
            </div>
          </div>
          <div class="company">
            <strong>RD-PALMER TECHNOLOGY (M) SDN BHD</strong> (200301008311)<br>
            63, Jalan Seri Utara 1, Kipark Sri Utara, 68100 Kuala Lumpur<br>
            Tel: +603 6250 2071 | E-mail: info@rd-palmer.com<br>
            Website: www.rd-palmer.com
          </div>
        </div>

        <div class="summary">
          <div class="summary-row"><span>Company:</span><span>${escapeHtml(ticket.company_name || '-')}</span></div>
          <div class="summary-row"><span>Assigned To:</span><span>${escapeHtml(assignedTo || '-')}</span></div>
          <div class="summary-row"><span>Contact:</span><span>${escapeHtml(contactName || '-')}</span></div>
          <div class="summary-row"><span>Priority:</span><span>${escapeHtml(ticket.priority || '-')}</span></div>
          <div class="summary-row"><span>Mobile:</span><span>${escapeHtml(contact?.mobile_number || '-')}</span></div>
          <div class="summary-row"><span>Due Date:</span><span>${escapeHtml(formatDate(ticket.due_date))}</span></div>
          <div class="summary-row"><span>Email:</span><span>${escapeHtml(contact?.email || '-')}</span></div>
          <div class="summary-row"><span>Category:</span><span>${escapeHtml(categoryName || '-')}</span></div>
          <div class="summary-row"><span>Created By:</span><span>${escapeHtml(createdBy || '-')}</span></div>
          <div class="summary-row"><span>Progress:</span><span>${escapeHtml(`${progress}%`)}</span></div>
          <div class="summary-row"><span>Created:</span><span>${escapeHtml(formatDateTime(ticket.created_at))}</span></div>
          <div class="summary-row"><span>Warranty:</span><span>${ticket.warranty == 1 ? 'Yes' : 'No'}</span></div>
        </div>

        <div class="section">
          <h2>Ticket Description</h2>
          <div class="text-box">${escapeHtml(ticket.description || '-')}</div>
        </div>

        ${ticket.remark ? `<div class="section"><h2>Ticket Remarks</h2><div class="text-box">${escapeHtml(ticket.remark)}</div></div>` : ''}

        <div class="section">
          <h2>Product Item List</h2>
          <table>
            <thead>
              <tr>
                <th>Serial No.</th>
                <th>Date</th>
                <th>Warranty</th>
                <th>Item Description</th>
                <th>SKU</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>${productRows}</tbody>
          </table>
        </div>

        <div class="section">
          <h2>Progress Timeline</h2>
          ${timelineRows}
        </div>

        <div class="section">
          <h2>Terms & Conditions</h2>
          <div class="terms-box">${sanitizeHtml(terms || DEFAULT_TICKET_REPORT_TERMS)}</div>
        </div>
        <div class="document-signature">
          <div class="signature-line">(Signature)<br>Name:<br>Position:<br>Date:</div>
          <div class="signature-line">(Co. Stamp)</div>
        </div>
      </div>
    </body>
  </html>`
}

const emptyForm = {
  ticket_number: '',
  date: new Date().toISOString().split('T')[0],
  warranty: '0',
  category: '',
  company_id: '',
  company_name: '',
  contact_person: '',
  description: '',
  priority: '',
  due_date: '',
  status: 'Open',
  assigned_to: '',
  remark: '',
}

const emptyProduct = { sku: '', item_description: '', serial_number: '', serial_date: '', warranty_period: '', remark: '' }

export default function Tickets() {
  const { profile } = useAuth()
  const location = useLocation()
  const [view, setView]             = useState('list')
  const [tab, setTab]               = useState('open')
  const [tickets, setTickets]       = useState([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [search, setSearch]         = useState('')
  const [priorityFilter, setPF]     = useState('')
  const [assignedFilter, setAssignedFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading]       = useState(false)
  const [form, setForm]             = useState(emptyForm)
  const [editId, setEditId]         = useState(null)
  const [detail, setDetail]         = useState(null)
  const [detailProds, setDetailProds] = useState([])
  const [detailContact, setDetailContact] = useState(null)
  const [detailTasks, setDetailTasks] = useState([])
  const [detailOnsites, setDetailOnsites] = useState([])
  const [detailRmas, setDetailRmas] = useState([])
  const [detailRemarks, setDetailRemarks] = useState([])
  const [quickAction, setQuickAction] = useState(null)
  const [quickForm, setQuickForm] = useState({})
  const [quickSaving, setQuickSaving] = useState(false)
  const [quickError, setQuickError] = useState('')
  const [deleteId, setDeleteId]     = useState(null)
  const [completeId, setCompleteId] = useState(null)
  const [reopenId, setReopenId]     = useState(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  // Dropdown data
  const [categories, setCategories] = useState([])
  const [contacts, setContacts]     = useState([])
  const [users, setUsers]           = useState([])
  const [allUsers, setAllUsers]     = useState([])
  const [skuList, setSkuList]       = useState([])
  const [serialOptions, setSerialOptions] = useState({})
  const [serialLoading, setSerialLoading] = useState({})
  const [quickSerialOptions, setQuickSerialOptions] = useState([])
  const [quickSerialLoading, setQuickSerialLoading] = useState(false)
  const [dropdownLoading, setDropdownLoading] = useState(true)
  const [priorities, setPriorities] = useState([])
  const [serviceTypes, setServiceTypes] = useState([])
  const [spares, setSpares] = useState([])
  const [vendors, setVendors] = useState([])
  const [modes, setModes] = useState([])
  const categoriesQuery = useCategories()
  const assignableUsersQuery = useAssignableUsers()
  const legacyUsersQuery = useLegacyUsers()
  const prioritiesQuery = usePriorities()
  const serviceTypesQuery = useServiceTypes()
  const sparesQuery = useSpares()
  const vendorsQuery = useVendors()
  const modesQuery = useModes()

  // Products rows in form
  const [products, setProducts] = useState([{ ...emptyProduct }])

  // Track original assigned_to to detect changes during edit
  const origAssignedTo = useRef(null)
  const serialSearchIds = useRef({})
  const serialSearchTimers = useRef({})
  const quickSerialSearchId = useRef(0)
  const formDataLoadedRef = useRef(false)
  const ticketMonths = useMemo(() => monthOptions(18), [])

  // ── Fetch list ────────────────────────────────────────────────────
  const fetchTickets = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('ticket')
      .select(TICKET_LIST_COLUMNS, { count: 'estimated' })
      .eq('is_completed', tab === 'open' ? 0 : 1)
      .order('id', { ascending: false })

    if (search) {
      const term = search.trim()
      const tid = term.replace(/^TID/i, '')
      const filters = [`company_name.ilike.%${term}%`, `priority.ilike.%${term}%`]
      if (/^\d+$/.test(tid)) filters.push(`ticket_id.eq.${parseInt(tid)}`)
      q = q.or(filters.join(','))
    }
    if (priorityFilter) q = q.eq('priority', priorityFilter)
    if (assignedFilter) q = q.eq('assigned_to', parseInt(assignedFilter))
    if (statusFilter === 'Overdue') {
      q = q.lt('due_date', new Date().toISOString().split('T')[0])
    } else if (statusFilter) {
      q = q.eq('status', statusFilter)
    }
    if (monthFilter) {
      const range = monthRange(monthFilter)
      q = q.gte('date', range.start).lt('date', range.end)
    }
    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    const { data, count, error: err } = await q
    if (!err) { setTickets(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, priorityFilter, assignedFilter, monthFilter, statusFilter, page, tab])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  useEffect(() => {
    const ticketId = location.state?.ticketId
    if (!ticketId) return
    const load = async () => {
      const { data } = await supabase.from('ticket').select('*').eq('id', ticketId).maybeSingle()
      if (data) openDetail(data)
    }
    load()
  }, [location.state])

  useEffect(() => { setCategories(categoriesQuery.data || []) }, [categoriesQuery.data])
  useEffect(() => { setUsers(assignableUsersQuery.data || []) }, [assignableUsersQuery.data])
  useEffect(() => { setAllUsers(legacyUsersQuery.data || []) }, [legacyUsersQuery.data])
  useEffect(() => { setPriorities(prioritiesQuery.data || []) }, [prioritiesQuery.data])
  useEffect(() => { setServiceTypes(serviceTypesQuery.data || []) }, [serviceTypesQuery.data])
  useEffect(() => { setSpares(sparesQuery.data || []) }, [sparesQuery.data])
  useEffect(() => { setVendors(vendorsQuery.data || []) }, [vendorsQuery.data])
  useEffect(() => { setModes(modesQuery.data || []) }, [modesQuery.data])
  useEffect(() => {
    setDropdownLoading([
      categoriesQuery,
      assignableUsersQuery,
      legacyUsersQuery,
      prioritiesQuery,
      serviceTypesQuery,
      sparesQuery,
      vendorsQuery,
      modesQuery,
    ].some(query => query.isLoading))
  }, [
    categoriesQuery.isLoading,
    assignableUsersQuery.isLoading,
    legacyUsersQuery.isLoading,
    prioritiesQuery.isLoading,
    serviceTypesQuery.isLoading,
    sparesQuery.isLoading,
    vendorsQuery.isLoading,
    modesQuery.isLoading,
  ])

  // ── Helpers ───────────────────────────────────────────────────────
  const ensureFormData = async () => {
    if (formDataLoadedRef.current) return
    formDataLoadedRef.current = true
    setDropdownLoading(true)
    try {
      // Customers are no longer pulled whole here — the company picker below uses
      // <SearchSelect>, which queries on demand. Only the catalogue (goodsservices)
      // is loaded, and only when the ticket form is opened.
      const skuR = await fetchAllRows('goodsservices', 'id, sku, name, description', 'sku')
      setSkuList(skuR || [])
    } catch (err) {
      formDataLoadedRef.current = false
      throw err
    } finally {
      setDropdownLoading(false)
    }
  }

  const getNextTID = async () => {
    const { data } = await supabase.from('ticket').select('ticket_id').order('ticket_id', { ascending: false }).limit(1)
    const lastTicketId = data?.[0]?.ticket_id ?? 100
    return { display: `TID${lastTicketId + 1}`, num: lastTicketId + 1 }
  }

  const enrichProductSerialMeta = async (rows = []) => {
    const serials = [...new Set(rows.map(row => row.serial_number).filter(Boolean))]
    if (serials.length === 0) return rows
    const { data } = await supabase
      .from('serialnumber')
      .select('serial_number, sku, date, warranty_period')
      .in('serial_number', serials)
      .limit(1000)
    const meta = new Map()
    ;(data || []).forEach(row => {
      meta.set(`${row.serial_number}||${row.sku || ''}`, row)
      if (!meta.has(row.serial_number)) meta.set(row.serial_number, row)
    })
    return rows.map(row => {
      const serial = meta.get(`${row.serial_number}||${row.sku || ''}`) || meta.get(row.serial_number)
      return {
        ...row,
        serial_date: serial?.date || row.serial_date || '',
        warranty_period: serial?.warranty_period || row.warranty_period || '',
      }
    })
  }

  const loadContacts = async (companyId) => {
    if (!companyId) { setContacts([]); return }
    const { data } = await supabase
      .from('contact')
      .select('id, first_name, last_name')
      .eq('company_id', companyId)
      .order('first_name')
    setContacts(data || [])
  }

  const getContactName = (contact) =>
    contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || '—' : '—'

  const stripHtml = (value = '') => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  // ── Open add form ─────────────────────────────────────────────────
  const openAdd = async () => {
    await ensureFormData()
    const { display } = await getNextTID()
    setForm({ ...emptyForm, ticket_number: display, date: new Date().toISOString().split('T')[0] })
    setProducts([{ ...emptyProduct }])
    setContacts([])
    setEditId(null)
    setError('')
    setView('form')
  }

  // ── Open edit form ────────────────────────────────────────────────
  const openEdit = async (t) => {
    await ensureFormData()
    if (t.company_id) await loadContacts(t.company_id)
    const { data: prods } = await supabase.from('ticket_product').select('*').eq('ticket_id', t.id)
    setForm({
      ticket_number:  `TID${t.ticket_id}`,
      date:           t.date          || '',
      warranty:       String(t.warranty ?? '0'),
      category:       String(t.category || ''),
      company_id:     String(t.company_id    || ''),
      company_name:   t.company_name         || '',
      contact_person: String(t.contact_person || ''),
      description:    t.description          || '',
      priority:       t.priority             || '',
      due_date:       t.due_date             || '',
      status:         t.status               || 'Open',
      assigned_to:    String(t.assigned_to   || ''),
      remark:         t.remark               || '',
    })
    const productRows = prods && prods.length > 0
      ? await enrichProductSerialMeta(prods.map(p => ({
            sku:              p.sku              || '',
            item_description: p.item_description || '',
            serial_number:    p.serial_number    || '',
            serial_date:      '',
            warranty_period:  '',
            remark:           p.remark           || '',
          })))
      : [{ ...emptyProduct }]
    setProducts(productRows)
    origAssignedTo.current = String(t.assigned_to || '')
    setEditId(t.id)
    setError('')
    setView('form')
  }

  // ── Open detail ───────────────────────────────────────────────────
  const openDetail = async (t) => {
    const [prodR, contactR, taskR, onsiteR, rmaR, remarkR] = await Promise.all([
      supabase.from('ticket_product').select('*').eq('ticket_id', t.id).order('id'),
      t.contact_person ? supabase.from('contact').select('*').eq('id', t.contact_person).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('task').select('*').eq('ticket_id', t.id).order('id', { ascending: false }),
      supabase.from('onsiteticket').select('*').eq('ticket_id', t.id).order('id', { ascending: false }),
      supabase.from('rma').select('*').eq('ticket_id', t.id).order('id', { ascending: false }),
      supabase.from('ticket_remark').select('*').eq('ticket_id', t.id).order('id', { ascending: false }),
    ])
    setDetail(t)
    setDetailProds(await enrichProductSerialMeta(prodR.data || []))
    setDetailContact(contactR.data || null)
    setDetailTasks(taskR.data || [])
    setDetailOnsites(onsiteR.data || [])
    setDetailRmas(rmaR.data || [])
    setDetailRemarks(remarkR.data || [])
    setView('detail')
  }

  // ── Save ──────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      date:           form.date,
      warranty:       parseInt(form.warranty),
      category:       form.category   ? parseInt(form.category)   : null,
      company_id:     form.company_id ? parseInt(form.company_id) : null,
      company_name:   form.company_name,
      contact_person: form.contact_person ? parseInt(form.contact_person) : null,
      description:    form.description,
      priority:       form.priority,
      due_date:       form.due_date   || null,
      status:         form.status,
      is_completed:   form.status === 'Completed' ? 1 : 0,
      assigned_to:    form.assigned_to ? parseInt(form.assigned_to) : null,
      remark:         form.remark,
      user_id:        getLegacyUserId(profile),
    }

    let ticketId = editId

    if (editId) {
      const { error: err } = await supabase.from('ticket').update(payload).eq('id', editId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { display: _, num } = await getNextTID()
      payload.ticket_id = num
      const { data: ins, error: err } = await supabase.from('ticket').insert([payload]).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      ticketId = ins.id
    }

    // Save products — delete existing then re-insert
    await supabase.from('ticket_product').delete().eq('ticket_id', ticketId)
    const validProds = products.filter(p => p.sku)
    if (validProds.length > 0) {
      await supabase.from('ticket_product').insert(
        validProds.map(p => ({
          user_id:          getLegacyUserId(profile),
          ticket_id:        ticketId,
          sku:              p.sku,
          item_description: p.item_description,
          serial_number:    p.serial_number,
          remark:           p.remark,
        }))
      )
    }
    logActivity({
      module: 'tickets',
      action: editId ? 'update' : 'create',
      recordTable: 'ticket',
      recordId: ticketId,
      recordLabel: form.ticket_number,
      summary: `${editId ? 'Updated' : 'Created'} ${form.ticket_number}${form.company_name ? ` for ${form.company_name}` : ''}`,
      metadata: { assigned_to: form.assigned_to || null, product_count: validProds.length },
    })

    // ── Notify assigned user ──────────────────────────────────────
    const newAssignee = form.assigned_to || ''
    const oldAssignee = editId ? String(origAssignedTo.current || '') : ''
    const currentLegacyUserId = getLegacyUserId(profile)
    const isNewAssignment = newAssignee && String(newAssignee) !== '0' &&
      String(newAssignee) !== String(currentLegacyUserId || '') &&
      (!editId || String(newAssignee) !== oldAssignee)

    if (isNewAssignment) {
      await notifyUser(supabase, {
        userId: parseInt(newAssignee),
        actorUserId: currentLegacyUserId,
        title:  'Ticket assigned to you',
        reference: form.ticket_number || `Ticket #${ticketId}`,
        companyName: form.company_name || '',
        body:   `You have been assigned ${form.ticket_number}${form.company_name ? ' for ' + form.company_name : ''}.`,
        details: [
          ['Ticket', form.ticket_number || `#${ticketId}`],
          ['Company', form.company_name || ''],
          ['Issue', form.description || ''],
          ['Due Date', form.due_date || ''],
          ['Priority', form.priority || ''],
          ['Assigned By', formatUserName(users, currentLegacyUserId)],
        ],
        link:   '/tickets',
      })
    }

    setSaving(false)
    fetchTickets()
    setView('list')
  }

  // ── Mark complete ─────────────────────────────────────────────────
  const markComplete = async (id) => {
    await supabase.from('ticket').update({ is_completed: 1, status: 'Completed' }).eq('id', id)
    logActivity({
      module: 'tickets',
      action: 'complete',
      recordTable: 'ticket',
      recordId: id,
      summary: `Marked ticket #${id} complete`,
    })
    setCompleteId(null)
    fetchTickets()
  }

  // ── Undo complete (reopen) ────────────────────────────────────────
  const reopenTicket = async (id) => {
    await supabase.from('ticket').update({ is_completed: 0, status: 'Open' }).eq('id', id)
    logActivity({
      module: 'tickets',
      action: 'reopen',
      recordTable: 'ticket',
      recordId: id,
      summary: `Reopened ticket #${id}`,
    })
    setReopenId(null)
    fetchTickets()
  }

  // ── Delete ────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    await supabase.from('ticket_product').delete().eq('ticket_id', id)
    await supabase.from('ticket').delete().eq('id', id)
    logActivity({
      module: 'tickets',
      action: 'delete',
      recordTable: 'ticket',
      recordId: id,
      summary: `Deleted ticket #${id}`,
    })
    setDeleteId(null)
    fetchTickets()
  }

  // ── Product row helpers ───────────────────────────────────────────
  const updateProd = (idx, field, val) =>
    setProducts(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p))
  const updateProductSerialInput = (idx, val) =>
    setProducts(prev => prev.map((p, i) => i === idx ? {
      ...p,
      serial_number: val,
      serial_date: '',
      warranty_period: '',
    } : p))
  const applySkuToProd = (idx, sku) => {
    const item = skuList.find(s => s.sku === sku)
    setProducts(prev => prev.map((p, i) => i === idx ? {
      ...p,
      sku,
      item_description: stripHtml(item?.description || item?.name || '') || p.item_description || '',
    } : p))
  }
  const applySerialOptionToProd = (idx, serialId) => {
    const serial = (serialOptions[idx] || []).find(s => String(s.id) === String(serialId))
    if (!serial) return
    const item = serial?.sku ? skuList.find(s => s.sku === serial.sku) : null
    setProducts(prev => prev.map((p, i) => i === idx ? {
      ...p,
      serial_number: serial.serial_number || '',
      sku: serial.sku || p.sku,
      item_description: stripHtml(item?.description || item?.name || '') || p.item_description || '',
      serial_date: serial.date || '',
      warranty_period: serial.warranty_period || '',
    } : p))
    clearTimeout(serialSearchTimers.current[idx])
    setSerialOptions(prev => ({ ...prev, [idx]: [] }))
    setSerialLoading(prev => ({ ...prev, [idx]: false }))
  }
  const fetchSerialMatches = async (term, limit = 50) => {
    const searchTerm = term.trim()
    if (!searchTerm) return []
    let timer
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve([]), SERIAL_SEARCH_TIMEOUT_MS)
    })
    try {
      return await Promise.race([searchSerialNumberOptions(searchTerm, limit), timeout])
    } finally {
      clearTimeout(timer)
    }
  }
  const loadSerialOptions = async (idx, term = '') => {
    const searchTerm = term.trim()
    if (searchTerm.length < 2) {
      serialSearchIds.current[idx] = (serialSearchIds.current[idx] || 0) + 1
      setSerialOptions(prev => ({ ...prev, [idx]: [] }))
      setSerialLoading(prev => ({ ...prev, [idx]: false }))
      return
    }
    const requestId = (serialSearchIds.current[idx] || 0) + 1
    serialSearchIds.current[idx] = requestId
    setSerialLoading(prev => ({ ...prev, [idx]: true }))
    setSerialOptions(prev => ({ ...prev, [idx]: [] }))
    try {
      const data = await fetchSerialMatches(searchTerm, 50)
      if (serialSearchIds.current[idx] !== requestId) return
      setSerialOptions(prev => ({ ...prev, [idx]: data }))
    } finally {
      if (serialSearchIds.current[idx] === requestId) {
        setSerialLoading(prev => ({ ...prev, [idx]: false }))
      }
    }
  }
  const scheduleSerialOptions = (idx, term = '') => {
    clearTimeout(serialSearchTimers.current[idx])
    const searchTerm = term.trim()
    if (searchTerm.length < 2) {
      loadSerialOptions(idx, searchTerm)
      return
    }
    serialSearchTimers.current[idx] = setTimeout(() => loadSerialOptions(idx, searchTerm), 250)
  }

  const loadQuickSerialOptions = async (term = '') => {
    const requestId = quickSerialSearchId.current + 1
    quickSerialSearchId.current = requestId
    setQuickSerialLoading(true)
    const searchTerm = term.trim()
    try {
      const data = searchTerm
        ? await fetchSerialMatches(searchTerm, 100)
        : []
      if (quickSerialSearchId.current !== requestId) return
      setQuickSerialOptions(data)
    } finally {
      if (quickSerialSearchId.current === requestId) setQuickSerialLoading(false)
    }
  }

  const openQuickAction = async (type) => {
    if (type === 'task' || type === 'onsite') await ensureFormData()
    const today = new Date().toISOString().split('T')[0]
    const defaults = {
      task: {
        servicetype: '',
        startdate: today,
        starttime: '',
        enddate: '',
        endtime: '',
        spare: '',
        description: '',
        action_taken: '',
        assigned_to: detail?.assigned_to ? String(detail.assigned_to) : '',
      },
      onsite: {
        date: today,
        product: '',
        serial_number: '',
        location: '',
        vandor_order_ref: '',
        spare: '',
        issue_description: detail?.description || '',
        workdone: '',
        remark: '',
        assigned_to: detail?.assigned_to ? String(detail.assigned_to) : '',
        status: 'Open',
      },
      rma: {
        rma_number: '',
        vendor: '',
        date_sent: today,
        mode: '',
        traking_number_out: '',
        date_return: '',
        traking_number_in: '',
        remark: '',
      },
      remark: { remark: '' },
    }
    if (type === 'onsite') loadQuickSerialOptions()
    setQuickAction(type)
    setQuickForm(defaults[type] || {})
    setQuickError('')
  }

  const closeQuickAction = () => {
    setQuickAction(null)
    setQuickForm({})
    setQuickError('')
  }

  const setQuick = (field, value) => setQuickForm(prev => ({ ...prev, [field]: value }))

  const saveQuickAction = async (e) => {
    e.preventDefault()
    if (!detail?.id || !quickAction) return
    setQuickSaving(true)
    setQuickError('')

    let table = ''
    let payload = {}
    if (quickAction === 'task') {
      table = 'task'
      payload = {
        ticket_id: detail.id,
        servicetype: quickForm.servicetype || null,
        startdate: quickForm.startdate || null,
        starttime: quickForm.starttime || null,
        enddate: quickForm.enddate || null,
        endtime: quickForm.endtime || null,
        spare: quickForm.spare || null,
        description: quickForm.description || '',
        action_taken: quickForm.action_taken || null,
        assigned_to: quickForm.assigned_to ? parseInt(quickForm.assigned_to) : null,
        is_completed: 0,
        is_archived: 0,
        user_id: getLegacyUserId(profile),
      }
    } else if (quickAction === 'onsite') {
      table = 'onsiteticket'
      payload = {
        ticket_id: detail.id,
        product: quickForm.product || null,
        serial_number: quickForm.serial_number || null,
        location: quickForm.location || null,
        vandor_order_ref: quickForm.vandor_order_ref || null,
        spare: quickForm.spare || null,
        issue_description: quickForm.issue_description || null,
        workdone: quickForm.workdone || null,
        remark: quickForm.remark || null,
        assigned_to: quickForm.assigned_to ? parseInt(quickForm.assigned_to) : null,
        status: quickForm.status || 'Open',
        is_completed: quickForm.status === 'Completed' ? 1 : 0,
        date: quickForm.date || null,
        user_id: getLegacyUserId(profile),
      }
    } else if (quickAction === 'rma') {
      table = 'rma'
      payload = {
        ticket_id: detail.id,
        rma_number: quickForm.rma_number || '',
        vendor: quickForm.vendor || null,
        date_sent: quickForm.date_sent || null,
        mode: quickForm.mode || null,
        traking_number_out: quickForm.traking_number_out || null,
        date_return: quickForm.date_return || null,
        traking_number_in: quickForm.traking_number_in || null,
        remark: quickForm.remark || null,
        user_id: getLegacyUserId(profile),
      }
    } else if (quickAction === 'remark') {
      table = 'ticket_remark'
      payload = {
        ticket_id: detail.id,
        remark: quickForm.remark || '',
        user_id: getLegacyUserId(profile),
      }
    }

    const { error: err } = await supabase.from(table).insert([payload])
    if (err) {
      setQuickError(err.message)
      setQuickSaving(false)
      return
    }
    logActivity({
      module: quickAction === 'onsite' ? 'onsite-tickets' : quickAction === 'rma' ? 'rma' : quickAction === 'remark' ? 'ticket-remarks' : 'tasks',
      action: 'create',
      recordTable: table,
      recordLabel: quickAction === 'rma' ? quickForm.rma_number : `TID${detail.ticket_id}`,
      summary: `Added ${quickAction === 'rma' ? 'RMA' : quickAction === 'onsite' ? 'onsite ticket' : quickAction === 'remark' ? 'remark' : 'task'} to TID${detail.ticket_id}`,
      metadata: { ticket_id: detail.id, ticket_number: detail.ticket_id },
    })

    if ((quickAction === 'task' || quickAction === 'onsite') && payload.assigned_to) {
      const currentLegacyUserId = getLegacyUserId(profile)
      if (String(payload.assigned_to) !== String(currentLegacyUserId || '')) {
        await notifyUser(supabase, {
          userId: payload.assigned_to,
          actorUserId: currentLegacyUserId,
          title: quickAction === 'task' ? 'Task assigned to you' : 'Onsite ticket assigned to you',
          reference: quickAction === 'task' ? `Task for TID${detail.ticket_id}` : `Onsite for TID${detail.ticket_id}`,
          companyName: detail.company_name || '',
          body: `You have been assigned ${quickAction === 'task' ? 'a task' : 'an onsite ticket'} for TID${detail.ticket_id}${detail.company_name ? ' - ' + detail.company_name : ''}.`,
          details: quickAction === 'task'
            ? [
                ['Ticket', `TID${detail.ticket_id}`],
                ['Company', detail.company_name || ''],
                ['Issue', detail.description || ''],
                ['Service Type', quickForm.servicetype || ''],
                ['Description', quickForm.description || ''],
                ['Spare Used', quickForm.spare || 'NIL'],
                ['Due/End Date', quickForm.enddate || ''],
                ['Assigned By', formatUserName(users, currentLegacyUserId)],
              ]
            : [
                ['Ticket', `TID${detail.ticket_id}`],
                ['Company', detail.company_name || ''],
                ['Issue', quickForm.issue_description || detail.description || ''],
                ['Product', quickForm.product || ''],
                ['Serial Number', quickForm.serial_number || ''],
                ['Location', quickForm.location || ''],
                ['Assigned By', formatUserName(users, currentLegacyUserId)],
              ],
          link: quickAction === 'task' ? '/tasks' : '/onsite-tickets',
        })
      }
    }

    await openDetail(detail)
    setQuickSaving(false)
    closeQuickAction()
  }
  const addProdRow    = () => setProducts(prev => [...prev, { ...emptyProduct }])
  const removeProdRow = (idx) => setProducts(prev => prev.filter((_, i) => i !== idx))

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const catalogueSpareOptions = skuList.map(item => ({
    id: item.id,
    name: item.sku,
    description: stripHtml(item.description || ''),
  }))

  // ══════════════════════════════════════════════════════════════════
  // LIST VIEW
  // ══════════════════════════════════════════════════════════════════
  if (view === 'list') {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700"
          >
            <Plus size={16} /> New Ticket
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

        {/* Search + Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-64 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search company name or TID..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-red-400"
            />
          </div>
          <select
            value={assignedFilter}
            onChange={e => { setAssignedFilter(e.target.value); setPage(1) }}
            className="border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
          >
            <option value="">All Assigned</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
          </select>
          <select
            value={monthFilter}
            onChange={e => { setMonthFilter(e.target.value); setPage(1) }}
            className="border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
          >
            <option value="">All Months</option>
            {ticketMonths.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select
            value={priorityFilter}
            onChange={e => { setPF(e.target.value); setPage(1) }}
            className="border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
          >
            <option value="">All Priorities</option>
            {priorities.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value)
              if (e.target.value === 'Overdue') setTab('open')
              setPage(1)
            }}
            className="border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
          >
            <option value="">All Status</option>
            {TICKET_STATUS_FILTERS.map(status => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>

        <div className="bg-white border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Ticket ID</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Company</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Priority</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Due Date</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Assigned To</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">Loading...</td></tr>
              ) : tickets.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">No {tab} tickets found.</td></tr>
              ) : tickets.map(t => {
                const today = new Date().toISOString().split('T')[0]
                const isOverdue = t.due_date && t.due_date < today
                return (
                  <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-red-600">TID{t.ticket_id}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(t.date)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{t.company_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${priorityColor(t.priority)}`}>
                        {t.priority || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${statusColor(t.status)}`}>
                        {t.status || 'Open'}
                      </span>
                      {isOverdue && (
                        <span className="ml-1 inline-block px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700">
                          Overdue
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(t.due_date)}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatUserName(users, t.assigned_to)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openDetail(t)} className="text-gray-500 hover:text-gray-700" title="View">
                          <Eye size={15} />
                        </button>
                        <button onClick={() => openEdit(t)} className="text-gray-500 hover:text-gray-700" title="Edit">
                          <Edit2 size={15} />
                        </button>
                        {tab === 'open' && (
                          <button onClick={() => setCompleteId(t.id)} className="text-green-600 hover:text-green-700" title="Mark Complete">
                            <CheckCircle size={15} />
                          </button>
                        )}
                        {tab === 'closed' && (
                          <button onClick={() => setReopenId(t.id)} className="text-amber-600 hover:text-amber-700" title="Undo Complete / Reopen">
                            <RotateCcw size={15} />
                          </button>
                        )}
                        <button onClick={() => setDeleteId(t.id)} className="text-red-500 hover:text-red-700" title="Delete">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <PaginationControls page={page} totalPages={totalPages} total={total} label="ticket" onPageChange={setPage} />

        {/* Mark Complete Modal */}
        {completeId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white p-6 w-full max-w-sm shadow-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Mark as Completed?</h3>
              <p className="text-sm text-gray-600 mb-4">This will close the ticket and move it to the completed list.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setCompleteId(null)} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
                <button onClick={() => markComplete(completeId)} className="px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700">Confirm</button>
              </div>
            </div>
          </div>
        )}

        {/* Reopen Modal */}
        {reopenId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white p-6 w-full max-w-sm shadow-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Reopen this ticket?</h3>
              <p className="text-sm text-gray-600 mb-4">This will undo the completion and move it back to the open list.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setReopenId(null)} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
                <button onClick={() => reopenTicket(reopenId)} className="px-4 py-2 text-sm bg-amber-600 text-white hover:bg-amber-700">Reopen</button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Modal */}
        {deleteId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white p-6 w-full max-w-sm shadow-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Delete Ticket?</h3>
              <p className="text-sm text-gray-600 mb-4">This cannot be undone. Associated products will also be removed.</p>
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
  // FORM VIEW
  // ══════════════════════════════════════════════════════════════════
  if (view === 'form') {
    return (
      <div className="p-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
          <h1 className="text-2xl font-bold text-gray-900">{editId ? 'Edit Ticket' : 'New Ticket'}</h1>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}

        <form onSubmit={handleSave} className="bg-white border border-gray-200 p-6 space-y-5">

          {/* Ticket ID */}
          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Ticket ID</label>
            <div className="col-span-2">
              <input
                type="text"
                value={form.ticket_number}
                readOnly
                className="w-full border border-gray-200 px-3 py-2 text-sm bg-gray-50 font-semibold text-red-600"
              />
            </div>
          </div>

          {/* Date */}
          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Creation Date <span className="text-red-500">*</span></label>
            <div className="col-span-2">
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                required
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
              />
            </div>
          </div>

          {/* Warranty + Category on one row */}
          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Warranty</label>
            <div className="col-span-2 flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio" name="warranty" value="1"
                  checked={form.warranty === '1'}
                  onChange={e => setForm(f => ({ ...f, warranty: e.target.value }))}
                  className="accent-red-600"
                /> Yes
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio" name="warranty" value="0"
                  checked={form.warranty === '0'}
                  onChange={e => setForm(f => ({ ...f, warranty: e.target.value }))}
                  className="accent-red-600"
                /> No
              </label>
              <div className="ml-4 flex items-center gap-3 flex-1">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Category <span className="text-red-500">*</span></label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  required
                  className="flex-1 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
                >
                  <option value="">Please Select</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Company */}
          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Company Name <span className="text-red-500">*</span></label>
            <div className="col-span-2">
              <SearchSelect
                table="customer"
                searchColumn="company_name"
                value={form.company_id}
                displayLabel={form.company_name}
                required
                placeholder="Search customer…"
                onSelect={async (id, row) => {
                  const cid = id ? String(id) : ''
                  setForm(f => ({ ...f, company_id: cid, company_name: row?.company_name || '', contact_person: '' }))
                  if (cid) await loadContacts(cid)
                  else setContacts([])
                }}
              />
            </div>
          </div>

          {/* Contact Person */}
          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Contact Person</label>
            <div className="col-span-2">
              <select
                value={form.contact_person}
                onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
              >
                <option value="">Please Select</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Products Table */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Products / Items</h3>
            <div className="border border-gray-200 overflow-x-auto">
              <table className="w-full min-w-[980px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[150px]" />
                  <col className="w-[110px]" />
                  <col className="w-[80px]" />
                  <col />
                  <col className="w-[155px]" />
                  <col className="w-[130px]" />
                  <col className="w-[38px]" />
                </colgroup>
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Serial Number</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Date</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Warranty</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Item Description</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">SKU</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Remarks</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((prod, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={prod.serial_number}
                          onFocus={e => {
                            e.target.select()
                          }}
                          onChange={e => {
                            updateProductSerialInput(idx, e.target.value)
                            scheduleSerialOptions(idx, e.target.value)
                          }}
                          placeholder="Search serial number"
                          className="w-full border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:border-red-400"
                        />
                        {(serialOptions[idx] || []).length > 0 && (
                          <select
                            value=""
                            onChange={e => applySerialOptionToProd(idx, e.target.value)}
                            className="mt-1 w-full border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:border-red-400"
                          >
                            <option value="">Select matching serial...</option>
                            {(serialOptions[idx] || []).map(s => (
                              <option key={s.id} value={s.id}>
                                {s.serial_number}{s.sku ? ` - ${s.sku}` : ''}{s.customername ? ` - ${s.customername}` : ''}
                              </option>
                            ))}
                          </select>
                        )}
                        {serialLoading[idx] && <LoadingHint text="Searching serial numbers..." />}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {formatDate(prod.serial_date)}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">
                        {prod.warranty_period || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={prod.item_description}
                          onChange={e => updateProd(idx, 'item_description', e.target.value)}
                          placeholder="Description"
                          className="w-full border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:border-red-400"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          list={`ticket-sku-${idx}`}
                          type="text"
                          value={prod.sku}
                          onFocus={e => e.target.select()}
                          onChange={e => applySkuToProd(idx, e.target.value)}
                          placeholder="Search SKU"
                          className="w-full border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:border-red-400"
                        />
                        <datalist id={`ticket-sku-${idx}`}>
                          {skuList.map(s => (
                            <option
                              key={s.id}
                              value={s.sku}
                              label={stripHtml(s.description || '')}
                            />
                          ))}
                        </datalist>
                        {dropdownLoading && <LoadingHint text="Loading catalogue..." />}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={prod.remark}
                          onChange={e => updateProd(idx, 'remark', e.target.value)}
                          placeholder="Remark"
                          className="w-full border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:border-red-400"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {products.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeProdRow(idx)}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={addProdRow}
              className="mt-2 flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
            >
              <Plus size={14} /> Add Product
            </button>
          </div>

          {/* Issue Description */}
          <div className="grid grid-cols-3 gap-4">
            <label className="text-sm font-medium text-gray-700 pt-2">Issue Description <span className="text-red-500">*</span></label>
            <div className="col-span-2">
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                required
                rows={4}
                placeholder="Describe the issue..."
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none"
              />
            </div>
          </div>

          {/* Priority */}
          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Priority <span className="text-red-500">*</span></label>
            <div className="col-span-2">
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                required
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
              >
                <option value="">Please Select</option>
                {priorities.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {/* Due Date */}
          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Due Date</label>
            <div className="col-span-2">
              <input
                type="date"
                value={form.due_date}
                onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
              />
            </div>
          </div>

          {/* Status */}
          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Status <span className="text-red-500">*</span></label>
            <div className="col-span-2">
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                required
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
              >
                <option value="Open">Open</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Assigned To */}
          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Assigned To</label>
            <div className="col-span-2">
              <select
                value={form.assigned_to}
                onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
              >
                <option value="">Please Select</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Remark */}
          <div className="grid grid-cols-3 gap-4">
            <label className="text-sm font-medium text-gray-700 pt-2">Remark</label>
            <div className="col-span-2">
              <textarea
                value={form.remark}
                onChange={e => setForm(f => ({ ...f, remark: e.target.value }))}
                rows={3}
                placeholder="Additional remarks..."
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setView('list')}
              className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
            >
              {saving ? 'Saving...' : editId ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════
  // DETAIL VIEW
  // ══════════════════════════════════════════════════════════════════
  if (view === 'detail' && detail) {
    const category     = categories.find(c => c.id == detail.category)
    const today        = new Date().toISOString().split('T')[0]
    const isOverdue    = detail.due_date && detail.due_date < today
    const taskDone     = detailTasks.filter(workDone).length
    const onsiteDone   = detailOnsites.filter(workDone).length
    const taskOpen     = detailTasks.length - taskDone
    const onsiteOpen   = detailOnsites.length - onsiteDone
    const workTotal    = detailTasks.length + detailOnsites.length
    const workDoneTotal = taskDone + onsiteDone
    const progress     = workTotal > 0 ? Math.round((workDoneTotal / workTotal) * 100) : (detail.is_completed == 1 ? 100 : 0)
    const readyToClose = workTotal > 0 && workDoneTotal === workTotal && detail.is_completed == 0
    const timelineItems = [
      { type: 'Ticket', label: `Ticket ${detail.status || 'Open'}`, date: detail.created_at || detail.date, owner: detail.assigned_to, text: detail.description },
      ...detailTasks.map(task => ({ type: 'Task', id: task.id, label: task.servicetype || 'Task', date: timelineDate(task), owner: task.assigned_to, status: workStatus(task), spare: task.spare, text: task.action_taken || task.description, to: '/tasks', state: { taskId: task.id, returnToTicketId: detail.id } })),
      ...detailOnsites.map(onsite => ({ type: 'Onsite', label: onsite.product || onsite.issue_description || 'Onsite ticket', date: timelineDate(onsite), owner: onsite.assigned_to, status: workStatus(onsite), text: onsite.workdone || onsite.issue_description || onsite.remark })),
      ...detailRmas.map(rma => ({ type: 'RMA', label: rma.rma_number || 'RMA', date: rma.date_sent || rma.created_at, owner: null, status: rma.date_return ? 'Returned' : 'Sent', text: [rma.vendor, rma.remark].filter(Boolean).join(' - ') })),
      ...detailRemarks.map(remark => ({ type: 'Remark', label: 'Remark', date: remark.created_at, owner: remark.user_id, status: '', text: remark.remark })),
    ]
      .filter(item => item.date || item.text || item.label)
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    const reportUsers = allUsers.length ? allUsers : users
    const downloadTicketReport = () => {
      try {
        openPrintable(ticketReportHtml(detail, {
          assignedTo: formatUserName(reportUsers, detail.assigned_to),
          categoryName: category?.name || detail.category || '',
          contact: detailContact,
          contactName: getContactName(detailContact),
          createdBy: formatUserName(reportUsers, detail.user_id),
          products: detailProds,
          progress,
          terms: DEFAULT_TICKET_REPORT_TERMS,
          timelineItems,
          users: reportUsers,
        }), true)
      } catch (err) {
        alert(`Unable to generate service report: ${err?.message || err}`)
      }
    }

    return (
      <div className="p-6 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
            <h1 className="text-2xl font-bold text-gray-900">TID{detail.ticket_id}</h1>
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${priorityColor(detail.priority)}`}>
              {detail.priority}
            </span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusColor(detail.status)}`}>
              {detail.status}
            </span>
            {isOverdue && (
              <span className="px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700">Overdue</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={downloadTicketReport}
              className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              <Download size={14} /> Service Report
            </button>
            <button
              onClick={() => openEdit(detail)}
              className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              <Edit2 size={14} /> Edit
            </button>
            {detail.is_completed === 0 && (
              <button
                onClick={() => setCompleteId(detail.id)}
                className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 text-sm hover:bg-green-700"
              >
                <CheckCircle size={14} /> Mark Complete
              </button>
            )}
            {detail.is_completed == 1 && (
              <button
                onClick={() => setReopenId(detail.id)}
                className="flex items-center gap-1.5 bg-amber-600 text-white px-3 py-1.5 text-sm hover:bg-amber-700"
              >
                <RotateCcw size={14} /> Undo Complete
              </button>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ticket Workspace</p>
              <p className="mt-1 text-sm text-gray-500">Create linked work records without leaving this ticket.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => openQuickAction('task')} className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"><Plus size={14} /> Task</button>
              <button type="button" onClick={() => openQuickAction('onsite')} className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"><Plus size={14} /> Onsite</button>
              <button type="button" onClick={() => openQuickAction('rma')} className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"><Plus size={14} /> RMA</button>
              <button type="button" onClick={() => openQuickAction('remark')} className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"><Plus size={14} /> Remark</button>
            </div>
          </div>

          {quickAction && (
            <form onSubmit={saveQuickAction} className="border border-red-100 bg-red-50/30 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  Add {quickAction === 'rma' ? 'RMA' : quickAction === 'onsite' ? 'Onsite Ticket' : quickAction === 'remark' ? 'Remark' : 'Task'} to TID{detail.ticket_id}
                </h3>
                <button type="button" onClick={closeQuickAction} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
              </div>
              {quickError && <div className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{quickError}</div>}

              {quickAction === 'task' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Service Type</label>
                    <select value={quickForm.servicetype || ''} onChange={e => setQuick('servicetype', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                      <option value="">Please Select</option>
                      {serviceTypes.map(s => <option key={s.id} value={s.type}>{s.type}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Assigned To</label>
                    <select value={quickForm.assigned_to || ''} onChange={e => setQuick('assigned_to', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                      <option value="">Please Select</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Start Date / Time</label>
                    <div className="flex gap-2">
                      <input type="date" value={quickForm.startdate || ''} onChange={e => setQuick('startdate', e.target.value)} className="flex-1 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                      <input type="time" value={quickForm.starttime || ''} onChange={e => setQuick('starttime', e.target.value)} className="w-28 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">End Date / Time</label>
                    <div className="flex gap-2">
                      <input type="date" value={quickForm.enddate || ''} onChange={e => setQuick('enddate', e.target.value)} className="flex-1 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                      <input type="time" value={quickForm.endtime || ''} onChange={e => setQuick('endtime', e.target.value)} className="w-28 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Spare Used</label>
                    <SpareSearchSelect
                      options={catalogueSpareOptions}
                      value={quickForm.spare || ''}
                      onChange={value => setQuick('spare', value)}
                      loading={dropdownLoading}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description *</label>
                    <textarea required rows={3} value={quickForm.description || ''} onChange={e => setQuick('description', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Action Taken</label>
                    <textarea rows={2} value={quickForm.action_taken || ''} onChange={e => setQuick('action_taken', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
                  </div>
                </div>
              )}

              {quickAction === 'onsite' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                    <input type="date" value={quickForm.date || ''} onChange={e => setQuick('date', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Assigned To</label>
                    <select value={quickForm.assigned_to || ''} onChange={e => setQuick('assigned_to', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                      <option value="">Please Select</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Product</label>
                    <select value={quickForm.product || ''} onChange={e => {
                      const product = detailProds.find(p => p.sku === e.target.value)
                      setQuickForm(prev => ({ ...prev, product: e.target.value, serial_number: product?.serial_number || prev.serial_number || '' }))
                    }} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                      <option value="">Please Select</option>
                      {detailProds.map(p => <option key={p.id} value={p.sku}>{p.sku}{p.item_description ? ` - ${stripHtml(p.item_description)}` : ''}{p.serial_number ? ` (${p.serial_number})` : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Serial Number</label>
                    <input
                      list="ticket-onsite-serial-options"
                      value={quickForm.serial_number || ''}
                      onFocus={e => { e.target.select(); loadQuickSerialOptions(quickForm.serial_number || '') }}
                      onChange={e => { setQuick('serial_number', e.target.value); loadQuickSerialOptions(e.target.value) }}
                      placeholder="Search serial number"
                      className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
                    />
                    <datalist id="ticket-onsite-serial-options">
                      {quickSerialOptions.map(s => (
                        <option
                          key={s.id}
                          value={s.serial_number}
                          label={`${s.sku || ''}${s.customername ? ` - ${s.customername}` : ''}`}
                        />
                      ))}
                    </datalist>
                    {quickSerialLoading && <LoadingHint text="Searching serial numbers..." />}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
                    <input value={quickForm.location || ''} onChange={e => setQuick('location', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Vendor Order Ref</label>
                    <input value={quickForm.vandor_order_ref || ''} onChange={e => setQuick('vandor_order_ref', e.target.value)} placeholder="Vendor reference" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Spare Used</label>
                    <SpareChecklist options={catalogueSpareOptions} value={quickForm.spare || ''} onChange={value => setQuick('spare', value)} />
                    {dropdownLoading && <LoadingHint text="Loading catalogue..." />}
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Issue Description</label>
                    <textarea rows={3} value={quickForm.issue_description || ''} onChange={e => setQuick('issue_description', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Work Done</label>
                    <textarea rows={2} value={quickForm.workdone || ''} onChange={e => setQuick('workdone', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Remark</label>
                    <textarea rows={2} value={quickForm.remark || ''} onChange={e => setQuick('remark', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
                  </div>
                </div>
              )}

              {quickAction === 'rma' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">RMA Number *</label>
                    <input required value={quickForm.rma_number || ''} onChange={e => setQuick('rma_number', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
                    <select value={quickForm.vendor || ''} onChange={e => setQuick('vendor', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                      <option value="">Please Select</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    {dropdownLoading && <LoadingHint text="Loading vendors..." />}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Date Sent</label>
                    <input type="date" value={quickForm.date_sent || ''} onChange={e => setQuick('date_sent', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Mode</label>
                    <select value={quickForm.mode || ''} onChange={e => setQuick('mode', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                      <option value="">Please Select</option>
                      {modes.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                    </select>
                    {dropdownLoading && <LoadingHint text="Loading modes..." />}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tracking No. Out</label>
                    <input value={quickForm.traking_number_out || ''} onChange={e => setQuick('traking_number_out', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Date Return</label>
                    <input type="date" value={quickForm.date_return || ''} onChange={e => setQuick('date_return', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tracking No. In</label>
                    <input value={quickForm.traking_number_in || ''} onChange={e => setQuick('traking_number_in', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Remark</label>
                    <textarea rows={2} value={quickForm.remark || ''} onChange={e => setQuick('remark', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
                  </div>
                </div>
              )}

              {quickAction === 'remark' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Remark *</label>
                  <textarea required rows={3} value={quickForm.remark || ''} onChange={e => setQuick('remark', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-red-100 pt-3">
                <button type="button" onClick={closeQuickAction} className="px-4 py-2 text-sm border border-gray-200 bg-white hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={quickSaving} className="px-5 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">
                  {quickSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Progress</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{progress}%</p>
              <div className="mt-3 h-2 bg-gray-100 rounded overflow-hidden">
                <div className="h-full bg-red-600" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tasks</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">{taskDone}/{detailTasks.length} done</p>
              <p className="mt-1 text-xs text-gray-500">{taskOpen} open</p>
            </div>
            <div className="border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Onsite</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">{onsiteDone}/{detailOnsites.length} done</p>
              <p className="mt-1 text-xs text-gray-500">{onsiteOpen} open</p>
            </div>
            <div className="border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Close Check</p>
              <p className={`mt-2 text-sm font-semibold ${readyToClose ? 'text-green-700' : 'text-gray-900'}`}>
                {detail.is_completed == 1 ? 'Ticket closed' : readyToClose ? 'Ready to close' : `${workTotal - workDoneTotal} work item${workTotal - workDoneTotal !== 1 ? 's' : ''} open`}
              </p>
              <p className="mt-1 text-xs text-gray-500">Based on linked tasks and onsite tickets.</p>
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div>
              <span className="font-medium text-gray-500">Ticket ID: </span>
              <span className="text-red-600 font-semibold">TID{detail.ticket_id}</span>
            </div>
            <div>
              <span className="font-medium text-gray-500">Date: </span>
              {formatDate(detail.date)}
            </div>
            <div>
              <span className="font-medium text-gray-500">Created By: </span>
              {formatUserName(allUsers.length ? allUsers : users, detail.user_id)}
            </div>
            <div>
              <span className="font-medium text-gray-500">Date Created: </span>
              {formatDateTime(detail.created_at)}
            </div>
            <div>
              <span className="font-medium text-gray-500">Company: </span>
              <span className="font-medium">{detail.company_name || '—'}</span>
            </div>
            <div>
              <span className="font-medium text-gray-500">Contact Person: </span>
              {getContactName(detailContact)}
            </div>
            <div>
              <span className="font-medium text-gray-500">Contact Number: </span>
              {detailContact?.mobile_number || '—'}
            </div>
            <div>
              <span className="font-medium text-gray-500">Contact Email: </span>
              {detailContact?.email || '—'}
            </div>
            <div>
              <span className="font-medium text-gray-500">Category: </span>
              {category?.name || detail.category || '—'}
            </div>
            <div>
              <span className="font-medium text-gray-500">Priority: </span>
              <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${priorityColor(detail.priority)}`}>
                {detail.priority || '—'}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-500">Status: </span>
              <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${statusColor(detail.status)}`}>
                {detail.status || '—'}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-500">Due Date: </span>
              {formatDate(detail.due_date)}
            </div>
            <div>
              <span className="font-medium text-gray-500">Warranty: </span>
              {detail.warranty == 1 ? 'Yes' : 'No'}
            </div>
            <div>
              <span className="font-medium text-gray-500">Assigned To: </span>
              {formatUserName(users, detail.assigned_to)}
            </div>
            <div>
              <span className="font-medium text-gray-500">Serial Number: </span>
              {detail.serial_number || '—'}
            </div>
          </div>

          {/* Description */}
          <div className="border-t border-gray-100 pt-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Issue Description</p>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{detail.description || '—'}</p>
          </div>

          {/* Remark */}
          {detail.remark && (
            <div className="border-t border-gray-100 pt-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Remarks</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{detail.remark}</p>
            </div>
          )}

          <div className="border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Progress Timeline</p>
              <span className="text-xs text-gray-400">{timelineItems.length} update{timelineItems.length !== 1 ? 's' : ''}</span>
            </div>
            {timelineItems.length === 0 ? (
              <p className="text-sm text-gray-400">No progress updates yet.</p>
            ) : (
              <div className="space-y-3">
                {timelineItems.map((item, idx) => {
                  const content = (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-gray-500 uppercase">{displayText(item.type)}</span>
                        <span className="text-sm font-medium text-gray-900">{displayText(item.label)}</span>
                        {item.to && <span className="text-xs text-red-600">View</span>}
                        {item.status && (
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusColor(displayText(item.status, ''))}`}>{displayText(item.status)}</span>
                        )}
                        <span className="ml-auto text-xs text-gray-400">{formatDateTime(item.date)}</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {item.owner ? `Owner: ${formatUserName(allUsers.length ? allUsers : users, item.owner)}` : 'Owner: —'}
                      </div>
                      {item.spare && (
                        <div className="mt-1 text-xs text-gray-500">
                          Spare Used: {displayText(item.spare)}
                        </div>
                      )}
                      {item.text && <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{stripHtml(displayText(item.text, ''))}</p>}
                    </>
                  )
                  return (
                    item.to ? (
                      <Link
                        key={`${item.type}-${item.id || idx}`}
                        to={item.to}
                        state={item.state}
                        className="block border border-gray-200 px-3 py-2 hover:border-red-200 hover:bg-red-50/30"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div key={`${item.type}-${item.id || idx}`} className="border border-gray-200 px-3 py-2">
                        {content}
                      </div>
                    )
                )})}
              </div>
            )}
          </div>

          {/* Products */}
          {detailProds.length > 0 && (
            <div className="border-t border-gray-100 pt-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Products / Items</p>
              <table className="w-full text-sm border border-gray-200">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 font-medium text-gray-700">SKU</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Description</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Serial Number</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Date</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Warranty</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {detailProds.map(p => (
                    <tr key={p.id} className="border-b border-gray-100">
                      <td className="px-3 py-2 font-medium">{p.sku || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{stripHtml(p.item_description || '') || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{p.serial_number || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{formatDate(p.serial_date || p.date)}</td>
                      <td className="px-3 py-2 text-gray-600">{p.warranty_period || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{p.remark || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tasks */}
          <div className="border-t border-gray-100 pt-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tasks</p>
            {detailTasks.length === 0 ? (
              <p className="text-sm text-gray-400">No tasks for this ticket.</p>
            ) : (
              <table className="w-full text-sm border border-gray-200">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Service Type</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Start</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Assigned To</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Status</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {detailTasks.map(task => (
                    <tr key={task.id} className="border-b border-gray-100">
                      <td className="px-3 py-2 font-medium">{task.servicetype || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{`${formatDate(task.startdate)}${task.starttime ? ` ${task.starttime}` : ''}`}</td>
                      <td className="px-3 py-2 text-gray-600">{formatUserName(users, task.assigned_to)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${statusColor(workStatus(task))}`}>
                          {workStatus(task)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{task.description || task.action_taken || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Onsite Tickets */}
          <div className="border-t border-gray-100 pt-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Onsite Tickets</p>
            {detailOnsites.length === 0 ? (
              <p className="text-sm text-gray-400">No onsite tickets for this ticket.</p>
            ) : (
              <table className="w-full text-sm border border-gray-200">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Date</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Product</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Serial Number</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Assigned To</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detailOnsites.map(onsite => (
                    <tr key={onsite.id} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-600">{formatDate(onsite.date)}</td>
                      <td className="px-3 py-2 font-medium">{onsite.product || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{onsite.serial_number || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{formatUserName(users, onsite.assigned_to)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${statusColor(workStatus(onsite))}`}>
                          {workStatus(onsite)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* RMA */}
          <div className="border-t border-gray-100 pt-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">RMA</p>
            {detailRmas.length === 0 ? (
              <p className="text-sm text-gray-400">No RMA records for this ticket.</p>
            ) : (
              <table className="w-full text-sm border border-gray-200">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 font-medium text-gray-700">RMA Number</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Vendor</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Date Sent</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Date Return</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRmas.map(rma => (
                    <tr key={rma.id} className="border-b border-gray-100">
                      <td className="px-3 py-2 font-medium">{rma.rma_number || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{rma.vendor || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{formatDate(rma.date_sent)}</td>
                      <td className="px-3 py-2 text-gray-600">{formatDate(rma.date_return)}</td>
                      <td className="px-3 py-2 text-gray-600">{rma.remark || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Ticket Remarks */}
          <div className="border-t border-gray-100 pt-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Ticket Remarks</p>
            {detailRemarks.length === 0 ? (
              <p className="text-sm text-gray-400">No additional remarks for this ticket.</p>
            ) : (
              <div className="space-y-3">
                {detailRemarks.map(remark => (
                  <div key={remark.id} className="border border-gray-200 px-3 py-2 text-sm">
                    <div className="text-xs text-gray-400 mb-1">{formatDateTime(remark.created_at)}</div>
                    <div className="text-gray-700 whitespace-pre-wrap">{remark.remark || '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Mark Complete Modal */}
        {completeId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white p-6 w-full max-w-sm shadow-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Mark as Completed?</h3>
              <p className="text-sm text-gray-600 mb-4">This will close the ticket.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setCompleteId(null)} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
                <button
                  onClick={async () => { await markComplete(completeId); setView('list') }}
                  className="px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reopen Modal */}
        {reopenId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white p-6 w-full max-w-sm shadow-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Reopen this ticket?</h3>
              <p className="text-sm text-gray-600 mb-4">This will undo the completion and move it back to the open list.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setReopenId(null)} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
                <button
                  onClick={async () => { await reopenTicket(reopenId); setView('list') }}
                  className="px-4 py-2 text-sm bg-amber-600 text-white hover:bg-amber-700"
                >
                  Reopen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}
