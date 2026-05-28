import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { notifyUser } from '../../lib/notifyUser'
import { fetchAssignableUsers, fetchLegacyUsers, getLegacyUserId, getUserName as formatUserName, isUuid } from '../../lib/legacyUsers'
import { Plus, Search, Eye, Edit2, Trash2, CheckCircle, X, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 50

const splitCsv = (value) => String(value || '').split(',').map(v => v.trim()).filter(Boolean)

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

function fmtDateTime(value) {
  return value ? new Date(value).toLocaleString('en-GB') : '—'
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

const emptyProduct = { sku: '', item_description: '', serial_number: '', remark: '' }

export default function Tickets() {
  const { user, profile } = useAuth()
  const [view, setView]             = useState('list')
  const [tab, setTab]               = useState('open')
  const [tickets, setTickets]       = useState([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [search, setSearch]         = useState('')
  const [priorityFilter, setPF]     = useState('')
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
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  // Dropdown data
  const [categories, setCategories] = useState([])
  const [customers, setCustomers]   = useState([])
  const [contacts, setContacts]     = useState([])
  const [users, setUsers]           = useState([])
  const [allUsers, setAllUsers]     = useState([])
  const [skuList, setSkuList]       = useState([])
  const [serialOptions, setSerialOptions] = useState({})
  const [priorities, setPriorities] = useState([])
  const [serviceTypes, setServiceTypes] = useState([])
  const [spares, setSpares] = useState([])
  const [vendors, setVendors] = useState([])
  const [modes, setModes] = useState([])

  // Products rows in form
  const [products, setProducts] = useState([{ ...emptyProduct }])

  // Track original assigned_to to detect changes during edit
  const origAssignedTo = useRef(null)

  // ── Fetch list ────────────────────────────────────────────────────
  const fetchTickets = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('ticket')
      .select('*', { count: 'exact' })
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
    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    const { data, count, error: err } = await q
    if (!err) { setTickets(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, priorityFilter, page, tab])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  // ── Fetch dropdowns ───────────────────────────────────────────────
  useEffect(() => {
    const run = async () => {
      const [catR, custR, usrR, allUsrR, skuR, prioR, svcR, spareR, vendorR, modeR] = await Promise.all([
        supabase.from('category').select('id, name').order('name'),
        supabase.from('customer').select('id, company_name').order('company_name'),
        fetchAssignableUsers(supabase),
        fetchLegacyUsers(supabase),
        supabase.from('goodsservices').select('id, sku, description').order('sku'),
        supabase.from('priority').select('id, name').order('name'),
        supabase.from('service_type').select('id, type').order('type'),
        supabase.from('spare').select('id, name').order('name'),
        supabase.from('vendor').select('id, name').order('name'),
        supabase.from('mode').select('id, name').order('name'),
      ])
      if (!catR.error)  setCategories(catR.data  || [])
      if (!custR.error) setCustomers(custR.data  || [])
      setUsers(usrR || [])
      setAllUsers(allUsrR || [])
      if (!skuR.error)  setSkuList(skuR.data     || [])
      if (!prioR.error) setPriorities(prioR.data || [])
      if (!svcR.error) setServiceTypes(svcR.data || [])
      if (!spareR.error) setSpares(spareR.data || [])
      if (!vendorR.error) setVendors(vendorR.data || [])
      if (!modeR.error) setModes(modeR.data || [])
    }
    run()
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────
  const getNextTID = async () => {
    const { data } = await supabase.from('ticket').select('id').order('id', { ascending: false }).limit(1)
    const lastId = data?.[0]?.id ?? 0
    return { display: `TID${100 + lastId + 1}`, num: 100 + lastId + 1 }
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
    setProducts(
      prods && prods.length > 0
        ? prods.map(p => ({
            sku:              p.sku              || '',
            item_description: p.item_description || '',
            serial_number:    p.serial_number    || '',
            remark:           p.remark           || '',
          }))
        : [{ ...emptyProduct }]
    )
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
    setDetailProds(prodR.data || [])
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

    // ── Notify assigned user ──────────────────────────────────────
    const newAssignee = form.assigned_to || ''
    const oldAssignee = editId ? (origAssignedTo.current || '') : ''
    const isNewAssignment = isUuid(newAssignee) && newAssignee !== user?.id &&
      (!editId || newAssignee !== oldAssignee)

    if (isNewAssignment) {
      await notifyUser(supabase, {
        userId: newAssignee,
        title:  'Ticket assigned to you',
        body:   `You have been assigned ${form.ticket_number}${form.company_name ? ' — ' + form.company_name : ''}`,
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
    setCompleteId(null)
    fetchTickets()
  }

  // ── Delete ────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    await supabase.from('ticket_product').delete().eq('ticket_id', id)
    await supabase.from('ticket').delete().eq('id', id)
    setDeleteId(null)
    fetchTickets()
  }

  // ── Product row helpers ───────────────────────────────────────────
  const updateProd = (idx, field, val) =>
    setProducts(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p))
  const applySkuToProd = (idx, sku) => {
    const item = skuList.find(s => s.sku === sku)
    setProducts(prev => prev.map((p, i) => i === idx ? {
      ...p,
      sku,
      item_description: stripHtml(item?.description || '') || p.item_description || '',
    } : p))
  }
  const applySerialToProd = (idx, serialNumber) => {
    const serial = (serialOptions[idx] || []).find(s => s.serial_number === serialNumber)
    const item = serial?.sku ? skuList.find(s => s.sku === serial.sku) : null
    setProducts(prev => prev.map((p, i) => i === idx ? {
      ...p,
      serial_number: serialNumber,
      sku: serial?.sku || p.sku,
      item_description: stripHtml(item?.description || '') || p.item_description || '',
    } : p))
  }
  const loadSerialOptions = async (idx, term = '') => {
    let q = supabase
      .from('serialnumber')
      .select('id, serial_number, sku, customername')
      .order('serial_number')
      .limit(200)
    if (term) q = q.ilike('serial_number', `%${term}%`)
    const { data, error: err } = await q
    if (!err) setSerialOptions(prev => ({ ...prev, [idx]: data || [] }))
  }

  const openQuickAction = (type) => {
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

    await openDetail(detail)
    setQuickSaving(false)
    closeQuickAction()
  }
  const addProdRow    = () => setProducts(prev => [...prev, { ...emptyProduct }])
  const removeProdRow = (idx) => setProducts(prev => prev.filter((_, i) => i !== idx))

  const totalPages = Math.ceil(total / PAGE_SIZE)

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

        {/* Search + Priority Filter */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
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
            value={priorityFilter}
            onChange={e => { setPF(e.target.value); setPage(1) }}
            className="border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
          >
            <option value="">All Priorities</option>
            {priorities.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
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
                    <td className="px-4 py-3 text-gray-600">{t.date || '—'}</td>
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
                    <td className="px-4 py-3 text-gray-600">{t.due_date || '—'}</td>
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
            <span>{total} ticket{total !== 1 ? 's' : ''}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 disabled:opacity-40 hover:text-gray-900">
                <ChevronLeft size={16} />
              </button>
              <span>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 disabled:opacity-40 hover:text-gray-900">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

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
              <select
                value={form.company_id}
                onChange={async e => {
                  const cid  = e.target.value
                  const cname = customers.find(c => String(c.id) === cid)?.company_name || ''
                  setForm(f => ({ ...f, company_id: cid, company_name: cname, contact_person: '' }))
                  await loadContacts(cid)
                }}
                required
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
              >
                <option value="">Please select a customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-3 py-2 font-medium text-gray-700 w-44">SKU</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Item Description</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700 w-36">Serial Number</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Remarks</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((prod, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="px-3 py-2">
                        <select
                          value={prod.sku}
                          onChange={e => applySkuToProd(idx, e.target.value)}
                          className="w-full border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:border-red-400"
                        >
                          <option value="">Select SKU</option>
                          {skuList.map(s => <option key={s.id} value={s.sku}>{s.sku}</option>)}
                        </select>
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
                          list={`ticket-serial-${idx}`}
                          type="text"
                          value={prod.serial_number}
                          onFocus={e => {
                            e.target.select()
                            loadSerialOptions(idx, '')
                          }}
                          onChange={e => {
                            applySerialToProd(idx, e.target.value)
                            loadSerialOptions(idx, e.target.value)
                          }}
                          placeholder="S/N"
                          className="w-full border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:border-red-400"
                        />
                        <datalist id={`ticket-serial-${idx}`}>
                          {(serialOptions[idx] || []).map(s => (
                            <option key={s.id} value={s.serial_number}>
                              {s.sku}{s.customername ? ` - ${s.customername}` : ''}
                            </option>
                          ))}
                        </datalist>
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
      ...detailTasks.map(task => ({ type: 'Task', label: task.servicetype || 'Task', date: timelineDate(task), owner: task.assigned_to, status: workStatus(task), text: task.action_taken || task.description })),
      ...detailOnsites.map(onsite => ({ type: 'Onsite', label: onsite.product || onsite.issue_description || 'Onsite ticket', date: timelineDate(onsite), owner: onsite.assigned_to, status: workStatus(onsite), text: onsite.workdone || onsite.issue_description || onsite.remark })),
      ...detailRmas.map(rma => ({ type: 'RMA', label: rma.rma_number || 'RMA', date: rma.date_sent || rma.created_at, owner: null, status: rma.date_return ? 'Returned' : 'Sent', text: [rma.vendor, rma.remark].filter(Boolean).join(' - ') })),
      ...detailRemarks.map(remark => ({ type: 'Remark', label: 'Remark', date: remark.created_at, owner: remark.user_id, status: '', text: remark.remark })),
    ]
      .filter(item => item.date || item.text || item.label)
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))

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
                    <select value={quickForm.spare || ''} onChange={e => setQuick('spare', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                      <option value="">None</option>
                      {spares.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
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
                      {detailProds.map(p => <option key={p.id} value={p.sku}>{p.sku}{p.serial_number ? ` (${p.serial_number})` : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Serial Number</label>
                    <input value={quickForm.serial_number || ''} onChange={e => setQuick('serial_number', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
                    <input value={quickForm.location || ''} onChange={e => setQuick('location', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Spare Used</label>
                    <SpareChecklist options={spares} value={quickForm.spare || ''} onChange={value => setQuick('spare', value)} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Issue Description</label>
                    <textarea rows={3} value={quickForm.issue_description || ''} onChange={e => setQuick('issue_description', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
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
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tracking No. Out</label>
                    <input value={quickForm.traking_number_out || ''} onChange={e => setQuick('traking_number_out', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Date Return</label>
                    <input type="date" value={quickForm.date_return || ''} onChange={e => setQuick('date_return', e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
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
              {detail.date || '—'}
            </div>
            <div>
              <span className="font-medium text-gray-500">Created By: </span>
              {formatUserName(allUsers.length ? allUsers : users, detail.user_id)}
            </div>
            <div>
              <span className="font-medium text-gray-500">Date Created: </span>
              {fmtDateTime(detail.created_at)}
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
              {detail.due_date || '—'}
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
                {timelineItems.map((item, idx) => (
                  <div key={`${item.type}-${idx}`} className="border border-gray-200 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase">{item.type}</span>
                      <span className="text-sm font-medium text-gray-900">{item.label}</span>
                      {item.status && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusColor(item.status)}`}>{item.status}</span>
                      )}
                      <span className="ml-auto text-xs text-gray-400">{fmtDateTime(item.date)}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {item.owner ? `Owner: ${formatUserName(allUsers.length ? allUsers : users, item.owner)}` : 'Owner: —'}
                    </div>
                    {item.text && <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{stripHtml(item.text)}</p>}
                  </div>
                ))}
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
                    <th className="text-left px-3 py-2 font-medium text-gray-700">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {detailProds.map(p => (
                    <tr key={p.id} className="border-b border-gray-100">
                      <td className="px-3 py-2 font-medium">{p.sku || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{stripHtml(p.item_description || '') || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{p.serial_number || '—'}</td>
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
                      <td className="px-3 py-2 text-gray-600">{[task.startdate, task.starttime].filter(Boolean).join(' ') || '—'}</td>
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
                      <td className="px-3 py-2 text-gray-600">{onsite.date || '—'}</td>
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
                      <td className="px-3 py-2 text-gray-600">{rma.date_sent || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{rma.date_return || '—'}</td>
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
                    <div className="text-xs text-gray-400 mb-1">{remark.created_at || '—'}</div>
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
      </div>
    )
  }

  return null
}
