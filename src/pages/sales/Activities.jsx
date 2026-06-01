import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAssignableUsers, fetchLegacyUsers, getLegacyUserId, getUserName as formatUserName } from '../../lib/legacyUsers'
import { fetchAllRows } from '../../lib/fetchAllRows'
import { isSalesManagerRole, isSalesRole } from '../../lib/roles'
import PaginationControls from '../../components/PaginationControls'
import { Plus, Search, Eye, Trash2, ChevronLeft, ChevronRight, CalendarClock, ArrowLeft, Save, X } from 'lucide-react'

const PAGE_SIZE = 30
const ACTIVITY_COLUMNS = 'id, type, priority, status, date, time, description, lead_id, company_id, assigned_to, user_id, created_at, updated_at'

const emptyForm = {
  type: '', priority: '', status: '',
  date: new Date().toISOString().split('T')[0], time: '',
  description: '', lead_id: '', company_id: '', assigned_to: '',
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

function isCompleted(status = '') {
  return status.toLowerCase().includes('complete')
}

function priorityColor(p = '') {
  const n = p.toLowerCase()
  if (n.includes('high')) return 'bg-red-100 text-red-700'
  if (n.includes('medium')) return 'bg-yellow-100 text-yellow-700'
  if (n.includes('low')) return 'bg-green-100 text-green-700'
  return 'bg-gray-100 text-gray-600'
}

function statusColor(s = '') {
  const n = s.toLowerCase()
  if (n.includes('complete')) return 'bg-green-100 text-green-700'
  if (n.includes('cancel')) return 'bg-gray-100 text-gray-500'
  if (n.includes('progress')) return 'bg-blue-100 text-blue-700'
  return 'bg-yellow-100 text-yellow-700'
}

function typeColor(t = '') {
  const n = t.toLowerCase()
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
  const currentLegacyUserId = getLegacyUserId(profile)
  const visibleTabs = useMemo(() => (
    isSalesManager ? [...TABS, { id: 'all', label: 'All Activity' }] : TABS
  ), [isSalesManager])
  const [view, setView]         = useState('list')
  const [rows, setRows]         = useState([])
  const [rawActivities, setRawActivities] = useState([])
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [typeFilter, setTF]     = useState('')
  const [assignedFilter, setAssignedFilter] = useState('')
  const [tab, setTab]           = useState('open')
  const [loading, setLoading]   = useState(false)
  const [form, setForm]         = useState(emptyForm)
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

  const leadsById = useMemo(() => Object.fromEntries(leads.map(l => [String(l.id), l])), [leads])
  const customersById = useMemo(() => Object.fromEntries(customers.map(c => [String(c.id), c])), [customers])

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
    const [leadR, activeUsers, legacyUsers, atR, prioR, statusR] = await Promise.all([
      fetchAllRows(
        'sales_lead',
        'id, company_name, first_name, last_name, assigned_to, status',
        'company_name',
        isSalesRestricted && !isSalesManager ? { eq: { assigned_to: currentLegacyUserId } } : {}
      ),
      fetchAssignableUsers(supabase),
      fetchLegacyUsers(supabase),
      supabase.from('activity_type').select('id, type').order('type'),
      supabase.from('priority').select('id, name').order('name'),
      supabase.from('activity_status').select('id, name').order('name'),
    ])

    let activityQuery = supabase.from('activity').select(ACTIVITY_COLUMNS).order('id', { ascending: false }).limit(5000)
    if (isSalesRestricted && !isSalesManager) {
      const ownedLeadIds = (leadR || []).map(lead => lead.id).filter(Boolean)
      const ownershipFilters = [
        `assigned_to.eq.${currentLegacyUserId}`,
        `user_id.eq.${currentLegacyUserId}`,
      ]
      if (ownedLeadIds.length) ownershipFilters.push(`lead_id.in.(${ownedLeadIds.join(',')})`)
      activityQuery = activityQuery.or(ownershipFilters.join(','))
    }
    const actR = await activityQuery
    const activityRows = actR.data || []
    const customerIds = [...new Set(activityRows.map(row => row.company_id).filter(Boolean))]
    const custR = customerIds.length
      ? await supabase.from('customer').select('id, company_name').in('id', customerIds)
      : { data: [] }

    setLeads(leadR || [])
    setCustomers(custR.data || [])
    if (!actR.error) setRawActivities(activityRows)
    setUsers((legacyUsers?.length ? legacyUsers : activeUsers) || [])
    setAssignableUsers(activeUsers || [])
    if (!atR.error) setActivityTypes(atR.data || [])
    if (!prioR.error) setPriorities(prioR.data || [])
    if (!statusR.error) setActivityStatuses(statusR.data || [])
    setLoading(false)
  }, [currentLegacyUserId, isSalesRestricted, isSalesManager])

  useEffect(() => { fetchRows() }, [fetchRows])

  useEffect(() => {
    const latest = new Map()
    rawActivities.map(enrichActivity).forEach(activity => {
      const key = activity.lead_id ? `lead-${activity.lead_id}` : `activity-${activity.id}`
      if (!latest.has(key)) latest.set(key, activity)
    })
    setRows(Array.from(latest.values()))
  }, [rawActivities, enrichActivity])

  const filteredRows = useMemo(() => {
    const today = todayString()
    const tomorrow = todayString(1)
    const text = search.trim().toLowerCase()
    const isOwnActivity = (row) => (
      String(row.assignedTo || '') === String(currentLegacyUserId) ||
      String(row.user_id || '') === String(currentLegacyUserId) ||
      String(row.lead?.assigned_to || '') === String(currentLegacyUserId)
    )
    return rows
      .filter(r => {
        if (isSalesRestricted && (!isSalesManager || tab !== 'all') && !isOwnActivity(r)) return false
        const completed = isCompleted(r.status)
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
  }, [rows, search, typeFilter, assignedFilter, tab, currentLegacyUserId, isSalesRestricted, isSalesManager])

  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.ceil(filteredRows.length / PAGE_SIZE)

  const getUserName = (id) => formatUserName(users, id)
  const currentUserOption = users.find(u => String(u.id) === String(currentLegacyUserId))
    || assignableUsers.find(u => String(u.id) === String(currentLegacyUserId))
  const formAssignableUsers = isSalesRestricted
    ? (currentUserOption ? [currentUserOption] : [])
    : assignableUsers
  const filterUsers = isSalesRestricted
    ? (currentUserOption ? [currentUserOption] : [])
    : users

  const historyForDetail = (activity) => {
    if (!activity?.lead_id) return [activity]
    return rawActivities
      .filter(item => String(item.lead_id) === String(activity.lead_id))
      .map(enrichActivity)
      .sort((a, b) => b.id - a.id)
  }

  const openAdd = () => {
    setForm({
      ...emptyForm,
      date: new Date().toISOString().split('T')[0],
      assigned_to: isSalesRestricted ? String(currentLegacyUserId) : '',
    })
    setError('')
    setView('form')
  }

  const openUpdate = (activity) => {
    setForm({
      ...emptyForm,
      date: new Date().toISOString().split('T')[0],
      lead_id: activity.lead_id ? String(activity.lead_id) : '',
      company_id: activity.company_id ? String(activity.company_id) : '',
      assigned_to: isSalesRestricted ? String(currentLegacyUserId) : (activity.assignedTo ? String(activity.assignedTo) : ''),
    })
    setError('')
    setView('form')
  }

  const selectedLead = form.lead_id ? leadsById[String(form.lead_id)] : null

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.type) { setError('Activity type is required'); return }
    if (!form.description.trim()) { setError('Description is required'); return }
    setSaving(true)
    setError('')
    const payload = {
      type: form.type,
      priority: form.priority || null,
      status: form.status || null,
      date: form.date || null,
      time: form.time || null,
      description: form.description,
      lead_id: form.lead_id ? parseInt(form.lead_id) : null,
      company_id: form.lead_id ? null : (form.company_id || null),
      assigned_to: isSalesRestricted ? currentLegacyUserId : (form.assigned_to || selectedLead?.assigned_to || null),
      user_id: getLegacyUserId(profile),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const { error: err } = await supabase.from('activity').insert([payload])
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false)
    await fetchRows()
    setView('list')
  }

  const handleDelete = async (id) => {
    await supabase.from('activity').delete().eq('id', id)
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
    }))
  }

  if (view === 'form') return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1"><ArrowLeft size={15} /> Back</button>
        <h1 className="text-2xl font-bold text-gray-900">New Activity Update</h1>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      <form onSubmit={handleSave} className="bg-white border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Lead</label>
          <div className="col-span-2">
            <select value={form.lead_id} onChange={e => setLeadContext(e.target.value)} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.company_name || `${l.first_name || ''} ${l.last_name || ''}`.trim()}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Activity Type <span className="text-red-500">*</span></label>
          <div className="col-span-2">
            <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))} required className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {activityTypes.map(t => <option key={t.id} value={t.type}>{t.type}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Next Contact</label>
          <div className="col-span-2 flex gap-3">
            <input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} className="flex-1 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
            <input type="time" value={form.time} onChange={e => setForm(f => ({...f, time: e.target.value}))} className="w-32 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Priority</label>
          <div className="col-span-2">
            <select value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {priorities.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Status</label>
          <div className="col-span-2">
            <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {activityStatuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Assigned To</label>
          <div className="col-span-2">
            <select value={form.assigned_to} onChange={e => setForm(f => ({...f, assigned_to: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {formAssignableUsers.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <label className="text-sm font-medium text-gray-700 pt-2">Progress Notes <span className="text-red-500">*</span></label>
          <div className="col-span-2">
            <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} required rows={4} placeholder="Activity notes..." className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={() => setView('list')} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-6 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"><Save size={14} />{saving ? 'Saving...' : 'Save Update'}</button>
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
          <p className="text-sm text-gray-500 mt-1">{filteredRows.length} lead follow up{filteredRows.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700"><Plus size={16} /> New Update</button>
      </div>

      <div className="flex flex-wrap gap-1 mb-5 border-b border-gray-200">
        {visibleTabs.map(t => {
          const today = todayString()
          const tomorrow = todayString(1)
          const isOwnActivity = (row) => (
            String(row.assignedTo || '') === String(currentLegacyUserId) ||
            String(row.user_id || '') === String(currentLegacyUserId) ||
            String(row.lead?.assigned_to || '') === String(currentLegacyUserId)
          )
          const count = rows.filter(r => {
            if (isSalesRestricted && (!isSalesManager || t.id !== 'all') && !isOwnActivity(r)) return false
            const completed = isCompleted(r.status)
            if (t.id === 'all') return true
            if (t.id === 'open') return !completed
            if (t.id === 'completed') return completed
            if (completed) return false
            if (t.id === 'today') return r.date === today
            if (t.id === 'tomorrow') return r.date === tomorrow
            if (t.id === 'overdue') return r.date && r.date < today
            if (t.id === 'upcoming') return r.date && r.date > tomorrow
            return true
          }).length
          return (
            <button key={t.id} onClick={() => { setTab(t.id); setPage(1) }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label} <span className="text-xs text-gray-400">({count})</span>
            </button>
          )
        })}
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search company, notes, status..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-red-400" />
        </div>
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
        {(search || typeFilter || assignedFilter) && <button onClick={() => { setSearch(''); setTF(''); setAssignedFilter('') }} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"><X size={14} /> Clear</button>}
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
                    <button onClick={() => openUpdate(r)} className="text-red-600 hover:text-red-700 text-xs font-semibold">Update</button>
                    <button onClick={() => setDeleteId(r.id)} className="text-gray-400 hover:text-red-700" title="Delete latest update"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationControls page={page} totalPages={totalPages} total={filteredRows.length} label="follow up" onPageChange={setPage} />

      {deleteId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"><div className="bg-white p-6 w-full max-w-sm shadow-lg"><h3 className="font-semibold mb-2">Delete Latest Update?</h3><p className="text-sm text-gray-600">Only this activity row will be removed. Older lead history stays unchanged.</p><div className="flex justify-end gap-3 mt-4"><button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-gray-200">Cancel</button><button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm bg-red-600 text-white">Delete</button></div></div></div>}
    </div>
  )
}
