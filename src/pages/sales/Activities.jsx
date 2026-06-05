import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAssignableUsers, fetchLegacyUsers, getLegacyUserId, getUserName as formatUserName } from '../../lib/legacyUsers'
import { fetchAllRows } from '../../lib/fetchAllRows'
import { hasAdminAccess, isSalesManagerRole, isSalesRole } from '../../lib/roles'
import { isClosedStageName, isTerminalActivityStatus } from '../../lib/activityStatus'
import { logActivity } from '../../lib/activityLog'
import { notifyUser } from '../../lib/notifyUser'
import { applyTokenIlike } from '../../lib/searchUtils'
import PaginationControls from '../../components/PaginationControls'
import { Plus, Search, Eye, Edit2, Trash2, ChevronLeft, ChevronRight, CalendarClock, ArrowLeft, Save, X } from 'lucide-react'

const PAGE_SIZE = 30
const ACTIVITY_COLUMNS = 'id, type, priority, status, date, time, description, lead_id, company_id, assigned_to, user_id, created_at, updated_at'

const emptyForm = {
  type: '', priority: '', status: '',
  date: new Date().toISOString().split('T')[0], time: '',
  description: '', lead_id: '', company_id: '', assigned_to: '',
  lead_stage: '', followup_date: '', followup_time: '', followup_type: '',
  source_activity_id: '',
}

const TABS = [
  { id: 'open', label: 'Open Follow Ups' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'completed', label: 'Completed' },
]

function fmt(d) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'
}

function todayString(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().split('T')[0]
}

function priorityColor(p = '') {
  const n = String(p || '').toLowerCase()
  if (n.includes('high')) return 'bg-red-100 text-red-700'
  if (n.includes('medium')) return 'bg-yellow-100 text-yellow-700'
  if (n.includes('low')) return 'bg-green-100 text-green-700'
  return 'bg-gray-100 text-gray-600'
}

function statusColor(s = '') {
  const n = String(s || '').toLowerCase()
  if (n.includes('complete')) return 'bg-green-100 text-green-700'
  if (n.includes('cancel')) return 'bg-gray-100 text-gray-500'
  if (n.includes('progress')) return 'bg-blue-100 text-blue-700'
  return 'bg-yellow-100 text-yellow-700'
}

function typeColor(t = '') {
  const n = String(t || '').toLowerCase()
  if (n.includes('call')) return 'bg-blue-100 text-blue-700'
  if (n.includes('meeting')) return 'bg-purple-100 text-purple-700'
  if (n.includes('follow')) return 'bg-orange-100 text-orange-700'
  if (n.includes('email')) return 'bg-cyan-100 text-cyan-700'
  if (n.includes('visit')) return 'bg-indigo-100 text-indigo-700'
  if (n.includes('quote')) return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-600'
}

export default function Activities() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isSalesRestricted = isSalesRole(profile?.role_id)
  const isSalesManager = isSalesManagerRole(profile?.role_id)
  const canDeleteActivities = hasAdminAccess(profile?.role_id)
  const currentLegacyUserId = getLegacyUserId(profile)
  const visibleTabs = useMemo(() => (
    isSalesManager ? [...TABS, { id: 'all', label: 'All Activity' }] : TABS
  ), [isSalesManager])
  const [view, setView]         = useState('list')
  const [rows, setRows]         = useState([])
  const [rawActivities, setRawActivities] = useState([])
  const [page, setPage]         = useState(1)
  const [total, setTotal]       = useState(0)
  const [tabCounts, setTabCounts] = useState({})
  const [search, setSearch]     = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [typeFilter, setTF]     = useState('')
  const [assignedFilter, setAssignedFilter] = useState('')
  const [tab, setTab]           = useState('open')
  const [loading, setLoading]   = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [editId, setEditId]     = useState(null)
  const [editOriginalAssignee, setEditOriginalAssignee] = useState('')
  const [detail, setDetail]     = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const [leads, setLeads]           = useState([])
  const [customers, setCustomers]   = useState([])
  const [users, setUsers]           = useState([])
  const [assignableUsers, setAssignableUsers] = useState([])
  const [activityTypes, setActivityTypes] = useState([])
  const [priorities, setPriorities] = useState([])
  const [activityStatuses, setActivityStatuses] = useState([])
  const [stages, setStages] = useState([])
  const [stageCloseBlockers, setStageCloseBlockers] = useState([])
  const leadsLoadedRef = useRef(false)
  const lookupsLoadedRef = useRef(false)

  const leadsById = useMemo(() => Object.fromEntries(leads.map(l => [String(l.id), l])), [leads])
  const customersById = useMemo(() => Object.fromEntries(customers.map(c => [String(c.id), c])), [customers])

  const shouldRestrictToOwnActivities = useCallback((tabId) => (
    isSalesRestricted && (!isSalesManager || tabId !== 'all')
  ), [isSalesRestricted, isSalesManager])

  const applyOwnershipFilter = useCallback((query, ownedLeadIds = []) => {
    const ownershipFilters = [
      `assigned_to.eq.${currentLegacyUserId}`,
      `user_id.eq.${currentLegacyUserId}`,
    ]
    if (ownedLeadIds.length) ownershipFilters.push(`lead_id.in.(${ownedLeadIds.join(',')})`)
    return query.or(ownershipFilters.join(','))
  }, [currentLegacyUserId])

  const applyActivityTabFilter = useCallback((query, tabId) => {
    const terminalOr = 'status.ilike.%complete%,status.ilike.%cancel%,status.ilike.%close%'
    const excludeTerminal = (base) => base.or('status.is.null,and(status.not.ilike.%complete%,status.not.ilike.%cancel%,status.not.ilike.%close%)')
    if (tabId === 'completed') return query.or(terminalOr)
    if (tabId === 'open') return excludeTerminal(query)
    if (tabId === 'today') return excludeTerminal(query.eq('date', todayString()))
    if (tabId === 'tomorrow') return excludeTerminal(query.eq('date', todayString(1)))
    if (tabId === 'overdue') return excludeTerminal(query.lt('date', todayString()))
    if (tabId === 'upcoming') return excludeTerminal(query.gt('date', todayString(1)))
    return query
  }, [])

  const applyActivityFilters = useCallback((query, { tabId, ownedLeadIds = [], searchLeadIds = [], searchCustomerIds = [], text = '' }) => {
    let nextQuery = query
    if (shouldRestrictToOwnActivities(tabId)) nextQuery = applyOwnershipFilter(nextQuery, ownedLeadIds)
    nextQuery = applyActivityTabFilter(nextQuery, tabId)
    if (typeFilter) nextQuery = nextQuery.eq('type', typeFilter)
    if (assignedFilter) nextQuery = nextQuery.eq('assigned_to', assignedFilter)

    if (text) {
      const searchFilters = [
        `type.ilike.%${text}%`,
        `status.ilike.%${text}%`,
        `priority.ilike.%${text}%`,
        `description.ilike.%${text}%`,
      ]
      if (searchLeadIds.length) searchFilters.push(`lead_id.in.(${searchLeadIds.join(',')})`)
      if (searchCustomerIds.length) searchFilters.push(`company_id.in.(${searchCustomerIds.join(',')})`)
      nextQuery = nextQuery.or(searchFilters.join(','))
    }

    return nextQuery
  }, [applyActivityTabFilter, applyOwnershipFilter, assignedFilter, shouldRestrictToOwnActivities, typeFilter])

  const enrichActivity = useCallback((activity) => {
    const lead = activity.lead_id ? leadsById[String(activity.lead_id)] : null
    const customer = activity.company_id ? customersById[String(activity.company_id)] : null
    return {
      ...activity,
      lead,
      customer,
      companyName: lead?.company_name || customer?.company_name || activity.company_id || '-',
      assignedTo: activity.assigned_to || lead?.assigned_to || '',
    }
  }, [leadsById, customersById])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    if (!lookupsLoadedRef.current) {
      const [activeUsers, legacyUsers, atR, prioR, statusR, stageR] = await Promise.all([
        fetchAssignableUsers(supabase),
        fetchLegacyUsers(supabase),
        supabase.from('activity_type').select('id, type').order('type'),
        supabase.from('priority').select('id, name').order('name'),
        supabase.from('activity_status').select('id, name').order('name'),
        supabase.from('stage').select('id, name').order('name'),
      ])
      setUsers((legacyUsers?.length ? legacyUsers : activeUsers) || [])
      setAssignableUsers(activeUsers || [])
      if (!atR.error) setActivityTypes(atR.data || [])
      if (!prioR.error) setPriorities(prioR.data || [])
      if (!statusR.error) setActivityStatuses(statusR.data || [])
      if (!stageR.error) setStages(stageR.data || [])
      lookupsLoadedRef.current = true
    }

    let ownedLeadIds = []
    if (isSalesRestricted) {
      const { data: ownedLeads } = await supabase
        .from('sales_lead')
        .select('id')
        .eq('assigned_to', currentLegacyUserId)
      ownedLeadIds = (ownedLeads || []).map(lead => lead.id).filter(Boolean)
    }

    let activityQuery = supabase
      .from('activity')
      .select(ACTIVITY_COLUMNS, { count: 'exact' })
      .order('id', { ascending: false })

    const text = submittedSearch.trim()
    let searchLeadIds = []
    let searchCustomerIds = []
    if (text) {
      let leadSearchQ = supabase
          .from('sales_lead')
          .select('id')
          .limit(200)
      let customerSearchQ = supabase
          .from('customer')
          .select('id')
          .limit(200)
      leadSearchQ = applyTokenIlike(leadSearchQ, 'company_name', text)
      customerSearchQ = applyTokenIlike(customerSearchQ, 'company_name', text)
      const [leadSearchR, customerSearchR] = await Promise.all([
        leadSearchQ,
        customerSearchQ,
      ])
      searchLeadIds = (leadSearchR.data || []).map(row => row.id).filter(Boolean)
      searchCustomerIds = (customerSearchR.data || []).map(row => row.id).filter(Boolean)
    }

    activityQuery = applyActivityFilters(activityQuery, { tabId: tab, ownedLeadIds, searchLeadIds, searchCustomerIds, text })

    activityQuery = activityQuery.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    const actR = await activityQuery
    const activityRows = actR.data || []
    const leadIds = [...new Set(activityRows.map(row => row.lead_id).filter(Boolean))]
    const customerIds = [...new Set(activityRows.map(row => row.company_id).filter(Boolean))]
    const leadR = leadIds.length
      ? await supabase.from('sales_lead').select('id, company_name, first_name, last_name, assigned_to, status').in('id', leadIds)
      : { data: [] }
    const custR = customerIds.length
      ? await supabase.from('customer').select('id, company_name').in('id', customerIds)
      : { data: [] }

    if (!leadsLoadedRef.current) setLeads(leadR.data || [])
    setCustomers(custR.data || [])
    if (!actR.error) setRawActivities(activityRows)
    setTotal(actR.count || 0)
    setLoading(false)
  }, [applyActivityFilters, currentLegacyUserId, isSalesRestricted, tab, submittedSearch, page])

  useEffect(() => { fetchRows() }, [fetchRows])

  const fetchTabCounts = useCallback(async () => {
    const text = submittedSearch.trim()
    let ownedLeadIds = []
    let searchLeadIds = []
    let searchCustomerIds = []

    const requests = []
    if (isSalesRestricted) {
      requests.push(
        supabase
          .from('sales_lead')
          .select('id')
          .eq('assigned_to', currentLegacyUserId)
      )
    }
    if (text) {
      let leadSearchQ = supabase
          .from('sales_lead')
          .select('id')
          .limit(200)
      let customerSearchQ = supabase
          .from('customer')
          .select('id')
          .limit(200)
      leadSearchQ = applyTokenIlike(leadSearchQ, 'company_name', text)
      customerSearchQ = applyTokenIlike(customerSearchQ, 'company_name', text)
      requests.push(leadSearchQ)
      requests.push(customerSearchQ)
    }

    const results = requests.length ? await Promise.all(requests) : []
    let resultIdx = 0
    if (isSalesRestricted) {
      ownedLeadIds = (results[resultIdx]?.data || []).map(row => row.id).filter(Boolean)
      resultIdx += 1
    }
    if (text) {
      searchLeadIds = (results[resultIdx]?.data || []).map(row => row.id).filter(Boolean)
      searchCustomerIds = (results[resultIdx + 1]?.data || []).map(row => row.id).filter(Boolean)
    }

    const entries = await Promise.all(visibleTabs.map(async (item) => {
      let countQuery = supabase
        .from('activity')
        .select('id', { count: 'exact', head: true })

      countQuery = applyActivityFilters(countQuery, {
        tabId: item.id,
        ownedLeadIds,
        searchLeadIds,
        searchCustomerIds,
        text,
      })

      const { count, error: countError } = await countQuery
      return [item.id, countError ? 0 : (count || 0)]
    }))

    setTabCounts(Object.fromEntries(entries))
  }, [applyActivityFilters, currentLegacyUserId, isSalesRestricted, submittedSearch, visibleTabs])

  useEffect(() => { fetchTabCounts() }, [fetchTabCounts])

  const ensureLeadData = async () => {
    if (leadsLoadedRef.current) return
    leadsLoadedRef.current = true
    const leadR = await fetchAllRows(
      'sales_lead',
      'id, company_name, first_name, last_name, assigned_to, status',
      'company_name',
      isSalesRestricted && !isSalesManager ? { eq: { assigned_to: currentLegacyUserId } } : {}
    )
    setLeads(leadR || [])
  }

  useEffect(() => {
    setRows(rawActivities.map(enrichActivity))
  }, [rawActivities, enrichActivity])

  const filteredRows = useMemo(() => {
    const today = todayString()
    const tomorrow = todayString(1)
    const text = submittedSearch.trim().toLowerCase()
    const isOwnActivity = (row) => (
      String(row.assignedTo || '') === String(currentLegacyUserId) ||
      String(row.user_id || '') === String(currentLegacyUserId) ||
      String(row.lead?.assigned_to || '') === String(currentLegacyUserId)
    )
    return rows
      .filter(r => {
        if (isSalesRestricted && (!isSalesManager || tab !== 'all') && !isOwnActivity(r)) return false
        const completed = isTerminalActivityStatus(r.status)
        if (tab === 'all') return true
        if (tab === 'open') return !completed
        if (tab === 'completed') return completed
        if (completed) return false
        if (tab === 'today') return r.date === today
        if (tab === 'tomorrow') return r.date === tomorrow
        if (tab === 'overdue') return r.date && r.date < today
        if (tab === 'upcoming') return r.date && r.date > tomorrow
        return true
      })
      .filter(r => !typeFilter || r.type === typeFilter)
      .filter(r => !assignedFilter || String(r.assignedTo || '') === String(assignedFilter))
      .filter(r => !text || [r.companyName, r.type, r.status, r.priority, r.description].some(value => String(value || '').toLowerCase().includes(text)))
      .sort((a, b) => {
        const dateA = a.date || ''
        const dateB = b.date || ''
        if (tab === 'overdue') return dateA.localeCompare(dateB) || b.id - a.id
        return dateB.localeCompare(dateA) || b.id - a.id
      })
  }, [rows, submittedSearch, typeFilter, assignedFilter, tab, currentLegacyUserId, isSalesRestricted, isSalesManager])
  const runSearch = () => {
    setSubmittedSearch(search.trim())
    setPage(1)
  }
  const clearSearch = () => {
    setSearch('')
    setSubmittedSearch('')
    setTF('')
    setAssignedFilter('')
    setPage(1)
  }

  const pagedRows = filteredRows
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const getUserName = (id) => formatUserName(users, id)
  const currentUserOption = users.find(u => String(u.id) === String(currentLegacyUserId))
    || assignableUsers.find(u => String(u.id) === String(currentLegacyUserId))
  const formAssignableUsers = isSalesRestricted
    ? (currentUserOption ? [currentUserOption] : [])
    : assignableUsers
  const filterUsers = isSalesRestricted
    ? (currentUserOption ? [currentUserOption] : [])
    : users
  const completeStatusName = activityStatuses.find(status => String(status.name || '').toLowerCase().includes('complete'))?.name || ''

  const historyForDetail = (activity) => {
    if (!activity?.lead_id) return [activity]
    return rawActivities
      .filter(item => String(item.lead_id) === String(activity.lead_id))
      .map(enrichActivity)
      .sort((a, b) => b.id - a.id)
  }

  const isOwnRow = (activity) => (
    String(activity.assigned_to || activity.assignedTo || '') === String(currentLegacyUserId) ||
    String(activity.user_id || '') === String(currentLegacyUserId) ||
    String(activity.lead?.assigned_to || '') === String(currentLegacyUserId)
  )
  const canEditRow = (activity) => (
    hasAdminAccess(profile?.role_id) ||
    (!isTerminalActivityStatus(activity.status) && isOwnRow(activity))
  )

  const openAdd = async () => {
    await ensureLeadData()
    setEditId(null)
    setEditOriginalAssignee('')
    setStageCloseBlockers([])
    setForm({
      ...emptyForm,
      date: new Date().toISOString().split('T')[0],
      assigned_to: isSalesRestricted ? String(currentLegacyUserId) : '',
    })
    setError('')
    setView('form')
  }

  const openUpdate = async (activity) => {
    await ensureLeadData()
    setEditId(null)
    setEditOriginalAssignee('')
    setStageCloseBlockers([])
    const isOpenActivity = !isTerminalActivityStatus(activity.status)
    setForm({
      ...emptyForm,
      date: activity.date || new Date().toISOString().split('T')[0],
      time: activity.time || '',
      type: activity.type || '',
      priority: activity.priority || '',
      status: isOpenActivity ? (completeStatusName || activity.status || '') : '',
      lead_id: activity.lead_id ? String(activity.lead_id) : '',
      company_id: activity.company_id ? String(activity.company_id) : '',
      assigned_to: isSalesRestricted ? String(currentLegacyUserId) : (activity.assignedTo ? String(activity.assignedTo) : ''),
      lead_stage: activity.lead?.status ? String(activity.lead.status) : '',
      followup_type: activity.type || '',
      source_activity_id: isOpenActivity ? String(activity.id) : '',
    })
    setError('')
    setView('form')
  }

  const openEdit = async (activity) => {
    await ensureLeadData()
    const assignedTo = activity.assigned_to || activity.assignedTo || ''
    setEditId(activity.id)
    setEditOriginalAssignee(String(assignedTo || ''))
    setStageCloseBlockers([])
    setForm({
      type: activity.type || '',
      priority: activity.priority || '',
      status: activity.status || '',
      date: activity.date || '',
      time: activity.time || '',
      description: activity.description || '',
      lead_id: activity.lead_id ? String(activity.lead_id) : '',
      company_id: activity.company_id ? String(activity.company_id) : '',
      assigned_to: isSalesRestricted ? String(currentLegacyUserId) : (assignedTo ? String(assignedTo) : ''),
      lead_stage: activity.lead?.status ? String(activity.lead.status) : '',
      followup_date: '',
      followup_time: '',
      followup_type: '',
      source_activity_id: '',
    })
    setError('')
    setView('form')
  }

  const selectedLead = form.lead_id ? leadsById[String(form.lead_id)] : null
  const isTerminalStatus = isTerminalActivityStatus(form.status)
  const selectedStage = form.lead_stage || selectedLead?.status || ''
  const selectedStageName = stages.find(stage => String(stage.id) === String(selectedStage))?.name || ''
  const shouldMoveStage = selectedLead && selectedStage && String(selectedStage) !== String(selectedLead.status || '')
  const followupType = form.followup_type || form.type || 'Follow Up'
  const sourceActivityId = form.source_activity_id ? parseInt(form.source_activity_id) : null
  const isCompletingPlannedActivity = !editId && !!sourceActivityId
  const shouldLockActivityFields = isTerminalStatus && !isCompletingPlannedActivity
  const lockedFieldClass = shouldLockActivityFields ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''
  const requiresActivityDetails = !isTerminalStatus || isCompletingPlannedActivity

  const handleSave = async (e) => {
    e.preventDefault()
    if (requiresActivityDetails && !form.type) { setError('Activity type is required'); return }
    if (requiresActivityDetails && !form.description.trim()) { setError('Description is required'); return }
    if (isCompletingPlannedActivity && !form.status) { setError('Current activity outcome is required'); return }
    if (isCompletingPlannedActivity && !form.description.trim()) { setError('Progress notes are required'); return }
    setSaving(true)
    setError('')
    setStageCloseBlockers([])
    if (shouldMoveStage && isClosedStageName(selectedStageName)) {
      const { data: leadActivities, error: blockersError } = await supabase
        .from('activity')
        .select('id, type, status, date')
        .eq('lead_id', parseInt(form.lead_id))
      if (blockersError) { setError(blockersError.message); setSaving(false); return }
      const blockers = (leadActivities || []).filter(activity => {
        if (editId && isTerminalStatus && String(activity.id) === String(editId)) return false
        if (sourceActivityId && isTerminalStatus && String(activity.id) === String(sourceActivityId)) return false
        return !isTerminalActivityStatus(activity.status)
      })
      if (!isTerminalStatus && !sourceActivityId) {
        blockers.push({ id: 'current', type: form.type || 'Current update', status: form.status || 'No status', date: form.date || null })
      }
      if (blockers.length) {
        setStageCloseBlockers(blockers)
        setError('Before closing this lead, all activities under this lead must be Complete or Cancelled.')
        setSaving(false)
        return
      }
    }
    const payload = {
      type: form.type || (isTerminalStatus ? 'Status Update' : ''),
      priority: isTerminalStatus ? null : (form.priority || null),
      status: form.status || null,
      date: isTerminalStatus ? null : (isCompletingPlannedActivity ? (form.followup_date || form.date || null) : (editId ? (form.date || null) : null)),
      time: isTerminalStatus ? null : (isCompletingPlannedActivity ? (form.followup_time || form.time || null) : (editId ? (form.time || null) : null)),
      description: form.description || (isTerminalStatus ? `Marked activity as ${form.status}.` : ''),
      lead_id: form.lead_id ? parseInt(form.lead_id) : null,
      company_id: form.lead_id ? null : (form.company_id || null),
      assigned_to: isSalesRestricted ? currentLegacyUserId : (form.assigned_to || selectedLead?.assigned_to || null),
      updated_at: new Date().toISOString(),
    }
    const result = editId
      ? await supabase.from('activity').update(payload).eq('id', editId)
      : isCompletingPlannedActivity
        ? await supabase.from('activity').update(payload).eq('id', sourceActivityId)
        : await supabase.from('activity').insert([{ ...payload, user_id: getLegacyUserId(profile), created_at: new Date().toISOString() }])
    const { error: err } = result
    if (err) { setError(err.message); setSaving(false); return }
    if (shouldMoveStage) {
      const { error: stageError } = await supabase
        .from('sales_lead')
        .update({ status: selectedStage, updated_at: new Date().toISOString() })
        .eq('id', parseInt(form.lead_id))
      if (stageError) { setError(stageError.message); setSaving(false); return }
      logActivity({
        module: 'leads',
        action: 'update',
        recordTable: 'sales_lead',
        recordId: parseInt(form.lead_id),
        recordLabel: selectedLead?.company_name || `Lead #${form.lead_id}`,
        summary: `Updated lead status to ${selectedStageName}`,
        metadata: { status: selectedStage, status_name: selectedStageName },
      })
    }
    if (!editId && form.followup_date && (!isCompletingPlannedActivity || isTerminalStatus)) {
      const followupPayload = {
        type: followupType,
        priority: form.priority || null,
        status: null,
        date: form.followup_date,
        time: form.followup_time || null,
        description: 'Scheduled follow-up',
        lead_id: form.lead_id ? parseInt(form.lead_id) : null,
        company_id: form.lead_id ? null : (form.company_id || null),
        assigned_to: payload.assigned_to,
        user_id: getLegacyUserId(profile),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const { error: followupError } = await supabase.from('activity').insert([followupPayload])
      if (followupError) { setError(followupError.message); setSaving(false); return }
    }
    logActivity({
      module: 'activities',
      action: (editId || isCompletingPlannedActivity) ? 'update' : 'create',
      recordTable: 'activity',
      recordId: editId || sourceActivityId || null,
      recordLabel: payload.type,
      summary: `${(editId || isCompletingPlannedActivity) ? 'Updated' : 'Created'} activity ${payload.type}`,
      metadata: { lead_id: form.lead_id || null, company_id: payload.company_id || null, assigned_to: payload.assigned_to || null },
    })
    const assignee = payload.assigned_to ? String(payload.assigned_to) : ''
    const company = selectedLead || (form.company_id ? customersById[String(form.company_id)] : null)
    const shouldNotifyAssignee = assignee &&
      assignee !== String(currentLegacyUserId || '') &&
      (!editId || assignee !== String(editOriginalAssignee || ''))
    if (shouldNotifyAssignee) {
      await notifyUser(supabase, {
        userId: parseInt(assignee),
        actorUserId: currentLegacyUserId,
        title: 'Activity assigned to you',
        reference: form.type || 'Activity',
        companyName: company?.company_name || '',
        body: `You have been assigned an activity${company?.company_name ? ' for ' + company.company_name : ''}.`,
        details: [
          ['Company', company?.company_name || ''],
          ['Activity Type', payload.type],
          ['Description', payload.description],
          ['Date', payload.date || ''],
          ['Time', payload.time || ''],
          ['Assigned By', getUserName(currentLegacyUserId)],
        ],
        link: '/activities',
      })
    }
    const followupAssignee = payload.assigned_to ? String(payload.assigned_to) : ''
    if (!editId && form.followup_date && (!isCompletingPlannedActivity || isTerminalStatus) && followupAssignee && followupAssignee !== String(currentLegacyUserId || '')) {
      await notifyUser(supabase, {
        userId: parseInt(followupAssignee),
        actorUserId: currentLegacyUserId,
        title: 'Activity assigned to you',
        reference: followupType,
        companyName: company?.company_name || '',
        body: `You have been assigned a follow-up${company?.company_name ? ' for ' + company.company_name : ''}.`,
        details: [
          ['Company', company?.company_name || ''],
          ['Activity Type', followupType],
          ['Date', form.followup_date || ''],
          ['Time', form.followup_time || ''],
          ['Assigned By', getUserName(currentLegacyUserId)],
        ],
        link: '/activities',
      })
    }
    setSaving(false)
    setEditId(null)
    setEditOriginalAssignee('')
    await fetchRows()
    setView('list')
  }

  const handleDelete = async (id) => {
    if (!canDeleteActivities) {
      setError('Only Admin and Super Admin can delete activities.')
      setDeleteId(null)
      return
    }
    await supabase.from('activity').delete().eq('id', id)
    logActivity({
      module: 'activities',
      action: 'delete',
      recordTable: 'activity',
      recordId: id,
      summary: `Deleted activity #${id}`,
    })
    setDeleteId(null)
    fetchRows()
  }

  const setLeadContext = (leadId) => {
    const lead = leadsById[String(leadId)]
    setForm(f => ({
      ...f,
      lead_id: leadId,
      company_id: '',
      assigned_to: isSalesRestricted ? String(currentLegacyUserId) : (lead?.assigned_to ? String(lead.assigned_to) : f.assigned_to),
      lead_stage: lead?.status ? String(lead.status) : '',
    }))
  }

  if (view === 'form') return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => { setEditId(null); setEditOriginalAssignee(''); setView('list') }} className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1"><ArrowLeft size={15} /> Back</button>
        <h1 className="text-2xl font-bold text-gray-900">{editId ? 'Edit Activity' : 'New Activity Update'}</h1>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      <form onSubmit={handleSave} className="bg-white border border-gray-200 p-6 space-y-5">
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">What happened</h2>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Lead</label>
          <div className="col-span-2">
            <select value={form.lead_id} onChange={e => setLeadContext(e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.company_name || `${l.first_name || ''} ${l.last_name || ''}`.trim()}</option>)}
            </select>
          </div>
        </div>
        {!editId && form.lead_id && (
          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Move Lead To Stage</label>
            <div className="col-span-2">
              <select value={selectedStage} onChange={e => setForm(f => ({...f, lead_stage: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                <option value="">No stage change</option>
                {stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </div>
          </div>
        )}
        {stageCloseBlockers.length > 0 && (
          <div className="rounded border border-red-100 bg-red-50 p-3">
            <p className="text-xs font-semibold text-red-700 mb-2">These activities must be completed or cancelled before closing the lead:</p>
            <div className="space-y-1.5">
              {stageCloseBlockers.map(activity => (
                <div key={activity.id} className="flex items-center justify-between gap-3 text-xs text-red-700">
                  <span className="min-w-0 truncate">{activity.type || 'Activity'} · {activity.date ? fmt(activity.date) : 'No date'}</span>
                  <span className="shrink-0">{activity.status || 'No status'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Status</label>
          <div className="col-span-2">
            <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {activityStatuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
            {isCompletingPlannedActivity && <p className="mt-1 text-xs text-gray-400">This is the outcome for the scheduled activity you clicked.</p>}
            {isTerminalStatus && !isCompletingPlannedActivity && <p className="mt-1 text-xs text-gray-400">This status closes the activity, so the remaining fields are locked.</p>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Activity Type <span className="text-red-500">*</span></label>
          <div className="col-span-2">
            <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))} required={requiresActivityDetails} disabled={shouldLockActivityFields} className={`w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 disabled:bg-gray-100 disabled:text-gray-400 ${lockedFieldClass}`}>
              <option value="">Please Select</option>
              {activityTypes.map(t => <option key={t.id} value={t.type}>{t.type}</option>)}
            </select>
          </div>
        </div>
        {editId && (
          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Activity Date</label>
            <div className="col-span-2 flex gap-3">
              <input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} disabled={isTerminalStatus} className={`flex-1 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 disabled:bg-gray-100 disabled:text-gray-400 ${lockedFieldClass}`} />
              <input type="time" value={form.time} onChange={e => setForm(f => ({...f, time: e.target.value}))} disabled={isTerminalStatus} className={`w-32 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 disabled:bg-gray-100 disabled:text-gray-400 ${lockedFieldClass}`} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Priority</label>
          <div className="col-span-2">
            <select value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))} disabled={shouldLockActivityFields} className={`w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 disabled:bg-gray-100 disabled:text-gray-400 ${lockedFieldClass}`}>
              <option value="">Please Select</option>
              {priorities.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Assigned To</label>
          <div className="col-span-2">
            <select value={form.assigned_to} onChange={e => setForm(f => ({...f, assigned_to: e.target.value}))} disabled={shouldLockActivityFields} className={`w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 disabled:bg-gray-100 disabled:text-gray-400 ${lockedFieldClass}`}>
              <option value="">Please Select</option>
              {formAssignableUsers.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <label className="text-sm font-medium text-gray-700 pt-2">Progress Notes <span className="text-red-500">*</span></label>
          <div className="col-span-2">
            <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} required={requiresActivityDetails} disabled={shouldLockActivityFields} rows={4} placeholder="Activity notes..." className={`w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none disabled:bg-gray-100 disabled:text-gray-400 ${lockedFieldClass}`} />
          </div>
        </div>
        {!editId && (
          <div className="border-t border-gray-100 pt-5 space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Schedule next follow-up</h2>
            <div className="grid grid-cols-3 gap-4 items-center">
              <label className="text-sm font-medium text-gray-700">Next Follow-up</label>
              <div className="col-span-2 flex gap-3">
                <input type="date" value={form.followup_date} onChange={e => setForm(f => ({...f, followup_date: e.target.value}))} className="flex-1 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
                <input type="time" value={form.followup_time} onChange={e => setForm(f => ({...f, followup_time: e.target.value}))} className="w-32 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 items-center">
              <label className="text-sm font-medium text-gray-700">Follow-up Type</label>
              <div className="col-span-2">
                <select value={form.followup_type} onChange={e => setForm(f => ({...f, followup_type: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                  <option value="">Use activity type</option>
                  {activityTypes.map(t => <option key={t.id} value={t.type}>{t.type}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={() => { setEditId(null); setEditOriginalAssignee(''); setView('list') }} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-6 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"><Save size={14} />{saving ? 'Saving...' : editId ? 'Update Activity' : 'Save Update'}</button>
        </div>
      </form>
    </div>
  )

  if (view === 'detail' && detail) {
    const history = historyForDetail(detail)
    return (
      <div className="p-6 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1"><ArrowLeft size={15} /> Back</button>
            <h1 className="text-2xl font-bold text-gray-900">{detail.companyName}</h1>
          </div>
          <div className="flex items-center gap-2">
            {detail.lead_id && <button onClick={() => navigate('/leads', { state: { leadId: detail.lead_id } })} className="px-3 py-1.5 text-sm border border-gray-200 hover:bg-gray-50">Open Lead</button>}
            <button onClick={() => openUpdate(detail)} className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 text-sm hover:bg-red-700"><Plus size={14} /> Add Update</button>
          </div>
        </div>
        <div className="bg-white border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Activity History</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {history.map(item => (
              <div key={item.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-8 h-8 bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0"><CalendarClock size={15} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${typeColor(item.type)}`}>{item.type || 'Activity'}</span>
                      {item.priority && <span className={`px-2 py-0.5 text-xs font-medium rounded ${priorityColor(item.priority)}`}>{item.priority}</span>}
                      {item.status && <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusColor(item.status)}`}>{item.status}</span>}
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{item.description || '-'}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                      <span>Created {fmt(item.created_at)}</span>
                      <span>Next contact {item.date ? `${fmt(item.date)}${item.time ? ` ${item.time}` : ''}` : '-'}</span>
                      <span>By {getUserName(item.user_id)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity Follow Ups</h1>
          <p className="text-sm text-gray-500 mt-1">{total} lead follow up{total !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700"><Plus size={16} /> New Update</button>
      </div>

      <div className="flex flex-wrap gap-1 mb-5 border-b border-gray-200">
        {visibleTabs.map(t => {
          return (
            <button key={t.id} onClick={() => { setTab(t.id); setPage(1) }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label} <span className="text-xs text-gray-400">({tabCounts[t.id] ?? 0})</span>
            </button>
          )
        })}
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search company, notes, status..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runSearch() }}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-red-400" />
        </div>
        <button onClick={runSearch} className="flex items-center gap-1.5 bg-red-600 text-white px-3 py-2 text-sm hover:bg-red-700"><Search size={14} /> Search</button>
        <select value={typeFilter} onChange={e => { setTF(e.target.value); setPage(1) }} className="border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
          <option value="">All Types</option>
          {activityTypes.map(t => <option key={t.id} value={t.type}>{t.type}</option>)}
        </select>
        {!isSalesRestricted && (
          <select value={assignedFilter} onChange={e => { setAssignedFilter(e.target.value); setPage(1) }} className="border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
            <option value="">All Assigned Users</option>
            {filterUsers.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
          </select>
        )}
        {(search || submittedSearch || typeFilter || assignedFilter) && <button onClick={clearSearch} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"><X size={14} /> Clear</button>}
      </div>

      <div className="bg-white border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Next Contact</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Company / Lead</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Latest Update</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Priority</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Assigned To</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading...</td></tr>
            : pagedRows.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">No follow ups found.</td></tr>
            : pagedRows.map(r => (
              <tr key={`${r.lead_id || 'activity'}-${r.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.date ? fmt(r.date) : '-'} {r.time || ''}</td>
                <td className="px-4 py-3">
                  <button onClick={() => { setDetail(r); setView('detail') }} className="text-left font-semibold text-gray-900 hover:text-red-600">{r.companyName}</button>
                  {r.lead_id && <div className="text-xs text-gray-400">Lead #{r.lead_id}</div>}
                </td>
                <td className="px-4 py-3 max-w-md">
                  <div className={`inline-block px-2 py-0.5 text-xs font-medium rounded mb-1 ${typeColor(r.type)}`}>{r.type || '-'}</div>
                  <p className="text-xs text-gray-600 line-clamp-2">{r.description || '-'}</p>
                </td>
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${priorityColor(r.priority)}`}>{r.priority || '-'}</span></td>
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${statusColor(r.status)}`}>{r.status || '-'}</span></td>
                <td className="px-4 py-3 text-gray-600">{getUserName(r.assignedTo)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => { setDetail(r); setView('detail') }} className="text-gray-500 hover:text-gray-700" title="View history"><Eye size={15} /></button>
                    {canEditRow(r) && <button onClick={() => openEdit(r)} className="text-gray-500 hover:text-green-700" title="Edit this update"><Edit2 size={15} /></button>}
                    <button onClick={() => openUpdate(r)} className="text-red-600 hover:text-red-700 text-xs font-semibold" title="Add a new update">Add update</button>
                    {canDeleteActivities && <button onClick={() => setDeleteId(r.id)} className="text-gray-400 hover:text-red-700" title="Delete this entry"><Trash2 size={15} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationControls page={page} totalPages={totalPages} total={total} label="follow up" onPageChange={setPage} />

      {deleteId && canDeleteActivities && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"><div className="bg-white p-6 w-full max-w-sm shadow-lg"><h3 className="font-semibold mb-2">Delete Latest Update?</h3><p className="text-sm text-gray-600">Only this activity row will be removed. Older lead history stays unchanged.</p><div className="flex justify-end gap-3 mt-4"><button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-gray-200">Cancel</button><button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm bg-red-600 text-white">Delete</button></div></div></div>}
    </div>
  )
}
