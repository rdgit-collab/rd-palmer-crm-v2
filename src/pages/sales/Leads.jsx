import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { getLegacyUserId, getUserName, fetchRoleLegacyUserIds } from '../../lib/legacyUsers'
import { notifyUser } from '../../lib/notifyUser'
import { logActivity } from '../../lib/activityLog'
import PaginationControls from '../../components/PaginationControls'
import CustomerSearchSelect from '../../components/CustomerSearchSelect'
import { hasAdminAccess, isSalesRole, isWaterRole, ROLE_WATER } from '../../lib/roles'
import { isClosedStageName, isTerminalActivityStatus } from '../../lib/activityStatus'
import { formatShortDate } from '../../lib/dateFormat'
import {
  useAccountTypes,
  useActivityStatuses,
  useActivityTypes,
  useAssignableUsers,
  useCountries,
  useIndustries,
  useLeadSources,
  useLegacyUsers,
  usePriorities,
  useStages,
} from '../../hooks/useLookups'
import {
  Plus, Search, Eye, Pencil, Trash2, ArrowLeft, Save,
  X, ChevronLeft, ChevronRight, Building2, Phone, Mail, CalendarClock, Edit2
} from 'lucide-react'

const fmt = (d) => formatShortDate(d)
const PAGE_SIZE = 30

const lookupName = (items, id, fallbackPrefix) => {
  if (!id) return '—'
  const item = items.find((row) => String(row.id) === String(id))
  return item?.name || `${fallbackPrefix} #${id}`
}

function optionValue(items, value, field = 'name') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const match = items.find(item => String(item.id) === raw || String(item[field] || '').trim() === raw)
  return match?.[field] || raw
}

function hasOption(items, value, field = 'name') {
  const raw = String(value || '').trim()
  return !raw || items.some(item => String(item[field] || '') === raw)
}

// Stage badge colours by name
const stageColor = (name = '') => {
  const n = name.toLowerCase()
  if (n.startsWith('closed') && n.includes('won')) return 'bg-green-100 text-green-700'
  if (n.startsWith('closed') && n.includes('lost')) return 'bg-red-100 text-red-700'
  if (n.startsWith('closed'))  return 'bg-gray-200 text-gray-700'
  if (n.includes('won'))       return 'bg-green-100 text-green-700'
  if (n.includes('lost'))      return 'bg-red-100 text-red-700'
  if (n.includes('open'))      return 'bg-blue-100 text-blue-700'
  if (n.includes('new'))       return 'bg-blue-100 text-blue-700'
  if (n.includes('contact'))   return 'bg-cyan-100 text-cyan-700'
  if (n.includes('follow'))    return 'bg-yellow-100 text-yellow-700'
  if (n.includes('qualif'))    return 'bg-indigo-100 text-indigo-700'
  if (n.includes('negotiation')) return 'bg-orange-100 text-orange-700'
  if (n.includes('propose') || n.includes('quote')) return 'bg-purple-100 text-purple-700'
  if (n.includes('proposal'))  return 'bg-purple-100 text-purple-700'
  if (n.includes('complete'))  return 'bg-emerald-100 text-emerald-700'
  return 'bg-gray-100 text-gray-600'
}

const activityStatusColor = (name = '') => {
  const n = name.toLowerCase()
  if (n.includes('complete')) return 'bg-green-100 text-green-700'
  if (n.includes('cancel')) return 'bg-gray-100 text-gray-500'
  if (n.includes('progress')) return 'bg-blue-100 text-blue-700'
  return 'bg-yellow-100 text-yellow-700'
}

const activityPriorityColor = (name = '') => {
  const n = name.toLowerCase()
  if (n.includes('high')) return 'bg-red-100 text-red-700'
  if (n.includes('medium')) return 'bg-yellow-100 text-yellow-700'
  if (n.includes('low')) return 'bg-green-100 text-green-700'
  return 'bg-gray-100 text-gray-600'
}

const defaultActivityForm = () => ({
  type: '',
  priority: '',
  status: '',
  date: new Date().toISOString().split('T')[0],
  time: '',
  description: '',
  lead_stage: '',
})

// ─── Lead Detail View ──────────────────────────────────────────────────────────
function LeadDetail({ leadId, onBack, onEdit }) {
  const { profile } = useAuth()
  const [lead, setLead] = useState(null)
  const [activities, setActivities] = useState([])
  const [users, setUsers] = useState([])
  const [leadSources, setLeadSources] = useState([])
  const [stages, setStages] = useState([])
  const [activityTypes, setActivityTypes] = useState([])
  const [priorities, setPriorities] = useState([])
  const [activityStatuses, setActivityStatuses] = useState([])
  const [showActivityForm, setShowActivityForm] = useState(false)
  const [activityForm, setActivityForm] = useState(defaultActivityForm)
  const [activityEditId, setActivityEditId] = useState(null)
  const [activitySaving, setActivitySaving] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [activityDeleteId, setActivityDeleteId] = useState(null)
  const [leadStatusError, setLeadStatusError] = useState('')
  const [leadCloseBlockers, setLeadCloseBlockers] = useState([])
  const [blockedCloseStatus, setBlockedCloseStatus] = useState(null)
  const [leadStatusSaving, setLeadStatusSaving] = useState(false)
  const [pendingCloseStatus, setPendingCloseStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const legacyUsersQuery = useLegacyUsers()
  const leadSourcesQuery = useLeadSources()
  const stagesQuery = useStages()
  const activityTypesQuery = useActivityTypes()
  const prioritiesQuery = usePriorities()
  const activityStatusesQuery = useActivityStatuses()

  const load = useCallback(async () => {
    setLoading(true)
    let leadQuery = supabase.from('sales_lead').select('*').eq('id', leadId)
    if (isSalesRole(profile?.role_id)) {
      leadQuery = leadQuery.eq('assigned_to', getLegacyUserId(profile))
    } else if (isWaterRole(profile?.role_id)) {
      // Water Dep members may open any lead assigned to a teammate, not the whole
      // company. Resolve the team's legacy ids and scope the lookup to them.
      const teamIds = await fetchRoleLegacyUserIds(supabase, ROLE_WATER)
      leadQuery = leadQuery.in('assigned_to', teamIds.length ? teamIds : [-1])
    }
    const [{ data: l }, { data: act }] = await Promise.all([
      leadQuery.maybeSingle(),
      supabase.from('activity').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }),
    ])
    setLead(l)
    setActivities(act || [])
    setLoading(false)
  }, [leadId, profile])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => { setUsers(legacyUsersQuery.data || []) }, [legacyUsersQuery.data])
  useEffect(() => { setLeadSources(leadSourcesQuery.data || []) }, [leadSourcesQuery.data])
  useEffect(() => { setStages(stagesQuery.data || []) }, [stagesQuery.data])
  useEffect(() => { setActivityTypes(activityTypesQuery.data || []) }, [activityTypesQuery.data])
  useEffect(() => { setPriorities(prioritiesQuery.data || []) }, [prioritiesQuery.data])
  useEffect(() => { setActivityStatuses(activityStatusesQuery.data || []) }, [activityStatusesQuery.data])

  if (loading) return <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Loading...</div>
  if (!lead) return <div className="text-gray-500 text-sm p-4">Lead not found.</div>

  const phone = lead.mobile_number || lead.office_number || '—'
  const statusName = lookupName(stages, lead.status, 'Status')
  const sourceName = lookupName(leadSources, lead.lead_source, 'Source')
  const latestActivity = activities[0]
  const nextContact = latestActivity?.date
    ? `${fmt(latestActivity.date)}${latestActivity.time ? ` ${latestActivity.time}` : ''}`
    : '—'

  const setActivity = (k, v) => setActivityForm(f => ({ ...f, [k]: v }))
  const isTerminalActivity = isTerminalActivityStatus(activityForm.status)
  const selectedUpdateStage = activityForm.lead_stage || lead.status || ''
  const isOwnActivity = (activity) => (
    String(activity.assigned_to || '') === String(getLegacyUserId(profile) || '') ||
    String(activity.user_id || '') === String(getLegacyUserId(profile) || '') ||
    String(lead.assigned_to || '') === String(getLegacyUserId(profile) || '')
  )
  const canEditActivity = (activity) => (
    hasAdminAccess(profile?.role_id) ||
    (!isTerminalActivityStatus(activity.status) && isOwnActivity(activity))
  )
  const resetActivityForm = () => {
    setActivityForm(defaultActivityForm())
    setActivityEditId(null)
    setActivityError('')
    setShowActivityForm(false)
  }
  const openNewActivityForm = () => {
    setActivityForm(defaultActivityForm())
    setActivityEditId(null)
    setActivityError('')
    setShowActivityForm(true)
  }
  const openEditActivityForm = (activity) => {
    setActivityForm({
      type: activity.type || '',
      priority: activity.priority || '',
      status: activity.status || '',
      date: activity.date || '',
      time: activity.time || '',
      description: activity.description || '',
      lead_stage: lead.status || '',
    })
    setActivityEditId(activity.id)
    setActivityError('')
    setShowActivityForm(true)
  }
  const canDeleteActivities = hasAdminAccess(profile?.role_id)

  const stageNameFor = (stageId) => lookupName(stages, stageId, 'Status')
  const allActivitiesReadyToClose = () => (
    activities.every(activity => isTerminalActivityStatus(activity.status))
  )
  const completeStatusName = activityStatuses.find(status => String(status.name || '').toLowerCase().includes('complete'))?.name || ''

  const updateLeadStatus = async (nextStatus) => {
    setLeadStatusSaving(true)
    setLeadStatusError('')
    const { error } = await supabase
      .from('sales_lead')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', lead.id)
    setLeadStatusSaving(false)
    if (error) {
      setLeadStatusError(error.message)
      return false
    }
    const nextStageName = stageNameFor(nextStatus)
    setLead(current => ({ ...current, status: nextStatus, updated_at: new Date().toISOString() }))
    logActivity({
      module: 'leads',
      action: 'update',
      recordTable: 'sales_lead',
      recordId: lead.id,
      recordLabel: lead.company_name,
      summary: `Updated lead status to ${nextStageName}`,
      metadata: { status: nextStatus, status_name: nextStageName },
    })
    return true
  }

  const handleLeadStatusChange = async (nextStatus) => {
    if (!nextStatus || String(nextStatus) === String(lead.status || '')) return
    const nextStageName = stageNameFor(nextStatus)
    if (isClosedStageName(nextStageName)) {
      if (!allActivitiesReadyToClose()) {
        const blockers = activities.filter(activity => !isTerminalActivityStatus(activity.status))
        setLeadStatusError('Before closing this lead, all activities under this lead must be Complete or Cancelled.')
        setLeadCloseBlockers(blockers)
        setBlockedCloseStatus({ id: nextStatus, name: nextStageName })
        return
      }
      setLeadStatusError('')
      setLeadCloseBlockers([])
      setBlockedCloseStatus(null)
      setPendingCloseStatus({ id: nextStatus, name: nextStageName })
      return
    }
    setLeadCloseBlockers([])
    setBlockedCloseStatus(null)
    await updateLeadStatus(nextStatus)
  }

  const markBlockersCompleteAndContinue = async () => {
    if (!completeStatusName || leadCloseBlockers.length === 0) return
    setLeadStatusSaving(true)
    setLeadStatusError('')
    const blockerIds = leadCloseBlockers.map(activity => activity.id)
    const { error } = await supabase
      .from('activity')
      .update({ status: completeStatusName, updated_at: new Date().toISOString() })
      .in('id', blockerIds)
    setLeadStatusSaving(false)
    if (error) {
      setLeadStatusError(error.message)
      return
    }
    logActivity({
      module: 'activities',
      action: 'update',
      recordTable: 'activity',
      recordLabel: completeStatusName,
      summary: `Marked ${blockerIds.length} lead activities as ${completeStatusName}`,
      metadata: { lead_id: lead.id, activity_ids: blockerIds },
    })
    const nextActivities = activities.map(activity =>
      blockerIds.includes(activity.id) ? { ...activity, status: completeStatusName, updated_at: new Date().toISOString() } : activity
    )
    setActivities(nextActivities)
    setLeadCloseBlockers([])
    if (blockedCloseStatus) {
      setPendingCloseStatus(blockedCloseStatus)
      setBlockedCloseStatus(null)
    }
  }

  const confirmCloseLead = async () => {
    if (!pendingCloseStatus) return
    const ok = await updateLeadStatus(pendingCloseStatus.id)
    if (ok) setPendingCloseStatus(null)
  }

  const saveActivity = async (e) => {
    e.preventDefault()
    if (!activityForm.status) { setActivityError('Activity status is required'); return }
    if (!activityForm.type) { setActivityError('Activity type is required'); return }
    if (!activityForm.date) { setActivityError('Next contact date is required'); return }
    if (!activityForm.description.trim()) { setActivityError('Progress notes are required'); return }
    setActivitySaving(true)
    setActivityError('')
    const selectedStageName = selectedUpdateStage ? stageNameFor(selectedUpdateStage) : ''
    const shouldMoveStage = selectedUpdateStage && String(selectedUpdateStage) !== String(lead.status || '')
    if (!activityEditId && !completeStatusName) {
      setActivityError('Complete activity status is missing in settings.')
      setActivitySaving(false)
      return
    }
    if (shouldMoveStage && isClosedStageName(selectedStageName) && !isTerminalActivity) {
      const blockers = [{ id: 'current', type: activityForm.type || 'Current update', status: activityForm.status || 'No status', date: activityForm.date || null }]
      setLeadCloseBlockers(blockers)
      setBlockedCloseStatus({ id: selectedUpdateStage, name: selectedStageName })
      setActivityError('Before closing this lead, all activities under this lead must be Complete or Cancelled.')
      setActivitySaving(false)
      return
    }
    const payload = {
      lead_id: lead.id,
      company_id: null,
      assigned_to: lead.assigned_to || null,
      type: activityForm.type,
      priority: activityForm.priority || null,
      status: activityForm.status || null,
      date: activityForm.date || null,
      time: activityForm.time || null,
      description: activityForm.description,
      updated_at: new Date().toISOString(),
    }
    const result = activityEditId
      ? await supabase.from('activity').update(payload).eq('id', activityEditId)
      : await supabase.from('activity').insert([{ ...payload, user_id: getLegacyUserId(profile), created_at: new Date().toISOString() }])
    const { error } = result
    if (error) { setActivitySaving(false); setActivityError(error.message); return }
    if (!activityEditId) {
      const openActivityIds = activities
        .filter(activity => !isTerminalActivityStatus(activity.status))
        .map(activity => activity.id)
      if (openActivityIds.length) {
        const { error: closeError } = await supabase
          .from('activity')
          .update({ status: completeStatusName, updated_at: new Date().toISOString() })
          .in('id', openActivityIds)
        if (closeError) { setActivitySaving(false); setActivityError(closeError.message); return }
      }
    }
    logActivity({
      module: 'activities',
      action: activityEditId ? 'update' : 'create',
      recordTable: 'activity',
      recordId: activityEditId || null,
      recordLabel: payload.type,
      summary: `${activityEditId ? 'Updated' : 'Added'} ${payload.type} progress update for lead ${lead.company_name || lead.id}`,
      metadata: { lead_id: lead.id, assigned_to: lead.assigned_to || null },
    })
    if (shouldMoveStage) {
      const moved = await updateLeadStatus(selectedUpdateStage)
      if (!moved) { setActivitySaving(false); return }
    }
    setActivitySaving(false)
    resetActivityForm()
    const { data: nextActivities } = await supabase
      .from('activity')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
    setActivities(nextActivities || [])
  }

  const deleteActivity = async () => {
    if (!activityDeleteId || !canDeleteActivities) return
    setActivitySaving(true)
    setActivityError('')
    const activity = activities.find(row => String(row.id) === String(activityDeleteId))
    const { error } = await supabase.from('activity').delete().eq('id', activityDeleteId)
    setActivitySaving(false)
    if (error) {
      setActivityError(error.message)
      return
    }
    logActivity({
      module: 'activities',
      action: 'delete',
      recordTable: 'activity',
      recordId: activityDeleteId,
      recordLabel: activity?.type || 'Activity',
      summary: `Deleted activity ${activity?.type || activityDeleteId} from lead ${lead.company_name || lead.id}`,
      metadata: { lead_id: lead.id },
    })
    setActivities(current => current.filter(row => String(row.id) !== String(activityDeleteId)))
    setActivityDeleteId(null)
    if (String(activityEditId || '') === String(activityDeleteId)) resetActivityForm()
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm">
            <ArrowLeft size={16} /> Back
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Lead Information</h1>
        </div>
        <div className="grid grid-cols-1 gap-2 w-full sm:w-auto sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          <button onClick={onEdit}
            className="flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap">
            <Pencil size={14} /> Edit
          </button>
        </div>
      </div>

      {leadStatusError && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">{leadStatusError}</div>}

      <div className="bg-white rounded-lg border border-gray-200 px-4 py-3 mb-4">
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Lead Status</label>
        <select
          value={lead.status || ''}
          onChange={e => handleLeadStatusChange(e.target.value)}
          disabled={leadStatusSaving}
          className="w-full max-w-sm border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500 disabled:bg-gray-100 disabled:text-gray-500"
        >
          <option value="">Please Select</option>
          {stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
        </select>
        <p className="mt-1 text-xs text-gray-400">Closed stages require all lead activities to be Complete or Cancelled.</p>
        {leadCloseBlockers.length > 0 && (
          <div className="mt-3 rounded border border-red-100 bg-red-50 p-3">
            <p className="text-xs font-semibold text-red-700 mb-2">These activities must be completed or cancelled first:</p>
            <div className="space-y-1.5">
              {leadCloseBlockers.map(activity => (
                <div key={activity.id} className="flex items-center justify-between gap-3 text-xs text-red-700">
                  <span className="min-w-0 truncate">{activity.type || 'Activity'} · {activity.date ? fmt(activity.date) : 'No date'}</span>
                  <span className="shrink-0">{activity.status || 'No status'}</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={markBlockersCompleteAndContinue}
              disabled={!completeStatusName || leadStatusSaving}
              className="mt-3 px-3 py-1.5 text-xs bg-red-600 text-white rounded disabled:cursor-not-allowed disabled:opacity-50"
            >
              {completeStatusName ? 'Mark all as Complete & continue' : 'No Complete status found'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Next Contact</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{nextContact}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Latest Activity</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{latestActivity?.type || '—'}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Activity Status</p>
          <p className="mt-1">
            {latestActivity?.status ? (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${activityStatusColor(latestActivity.status)}`}>{latestActivity.status}</span>
            ) : (
              <span className="text-sm font-semibold text-gray-900">—</span>
            )}
          </p>
        </div>
      </div>

      {/* Lead Info */}
      <div className="bg-white rounded-lg border border-gray-200 mb-4">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Lead Information</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-10">
          <table className="text-sm w-full">
            <tbody>
              {[
                ['Company Name', lead.company_name || '—'],
                ['Address', [lead.address1, lead.address2].filter(Boolean).join(', ') || '—'],
                ['City', lead.city || '—'],
                ['State', lead.state || '—'],
                ['Country', lead.country || '—'],
                ['Postcode', lead.zipcode || '—'],
                ['Phone', phone],
                ['Email', lead.email || '—'],
                ['Website', lead.website || '—'],
              ].map(([label, val]) => (
                <tr key={label} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-4 text-gray-500 font-medium w-36 align-top">{label}</td>
                  <td className="py-2 text-gray-800">{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="text-sm w-full">
            <tbody>
              {[
                ['Lead Source', sourceName],
                ['Status', lead.status ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageColor(statusName)}`}>{statusName}</span> : '—'],
                ['Type', lead.type === 1 ? 'Existing' : 'New'],
                ['Industry', lead.industry || '—'],
                ['Account Type', lead.account_type || '—'],
                ['Assigned To', getUserName(users, lead.assigned_to)],
                ['Created By', getUserName(users, lead.user_id)],
                ['Contact Name', [lead.salutation, lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—'],
                ['Contact Mobile', lead.contact_mobile_number || '—'],
                ['Contact Email', lead.contact_email || '—'],
                ['Created', fmt(lead.created_at)],
              ].map(([label, val]) => (
                <tr key={label} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-4 text-gray-500 font-medium w-36 align-top">{label}</td>
                  <td className="py-2 text-gray-800">{val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-4 flex justify-end">
        <button onClick={showActivityForm && !activityEditId ? resetActivityForm : openNewActivityForm}
          className="flex items-center gap-2 px-3 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700">
          <Plus size={14} /> New Update
        </button>
      </div>

      {showActivityForm && (
        <form onSubmit={saveActivity} className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{activityEditId ? 'Edit Activity Update' : 'New Activity Update'}</h2>
            <button type="button" onClick={resetActivityForm} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          {activityError && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">{activityError}</div>}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Next Activity Status</label>
            <select value={activityForm.status} onChange={e => setActivity('status', e.target.value)} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500">
              <option value="">Please Select</option>
              {activityStatuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Activity Type</label>
              <select value={activityForm.type} onChange={e => setActivity('type', e.target.value)} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="">Please Select</option>
                {activityTypes.map(t => <option key={t.id} value={t.type}>{t.type}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Next Contact Date</label>
              <input type="date" value={activityForm.date} onChange={e => setActivity('date', e.target.value)} required className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <input type="time" value={activityForm.time} onChange={e => setActivity('time', e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>
          </div>
          <div className="mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select value={activityForm.priority} onChange={e => setActivity('priority', e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="">Please Select</option>
                {priorities.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Progress Notes</label>
            <textarea
              value={activityForm.description}
              onChange={e => setActivity('description', e.target.value)}
              required
              rows={6}
              placeholder="Type detailed progress notes..."
              className="w-full min-h-[140px] max-h-[420px] resize-y border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
          <div className="border-t border-gray-100 pt-4 mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Move lead to stage</h3>
            <select value={selectedUpdateStage} onChange={e => setActivity('lead_stage', e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500">
              <option value="">No stage change</option>
              {stages.map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={resetActivityForm} className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={activitySaving} className="flex items-center gap-2 px-4 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700 disabled:opacity-50">
              <Save size={14} /> {activitySaving ? 'Saving...' : activityEditId ? 'Update Activity' : 'Save Update'}
            </button>
          </div>
        </form>
      )}

      {/* Activity History */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Activity History</h2>
          <span className="text-xs text-gray-400">{activities.length} update{activities.length !== 1 ? 's' : ''}</span>
        </div>
        {activities.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-400">No activity history for this lead.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {activities.map(a => (
              <div key={a.id} className="px-5 py-4 hover:bg-gray-50">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-8 h-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
                    <CalendarClock size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900 text-sm">{a.type || 'Activity'}</span>
                        {a.priority && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${activityPriorityColor(a.priority)}`}>{a.priority}</span>}
                        {a.status && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${activityStatusColor(a.status)}`}>{a.status}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        {canEditActivity(a) && (
                          <button type="button" onClick={() => openEditActivityForm(a)} className="text-gray-400 hover:text-green-700" title="Edit activity">
                            <Edit2 size={15} />
                          </button>
                        )}
                        {canDeleteActivities && (
                          <button type="button" onClick={() => setActivityDeleteId(a.id)} className="text-gray-400 hover:text-red-700" title="Delete activity">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{a.description || '—'}</p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                      <span>Created {fmt(a.created_at)}</span>
                      <span>Next contact {a.date ? `${fmt(a.date)}${a.time ? ` ${a.time}` : ''}` : '—'}</span>
                      <span>By {getUserName(users, a.user_id)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activityDeleteId && canDeleteActivities && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Activity</h3>
            <p className="text-sm text-gray-600 mb-4">Only this activity row will be removed from the lead history.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setActivityDeleteId(null)} className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={deleteActivity} disabled={activitySaving} className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50">
                {activitySaving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingCloseStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Close Lead</h3>
            <p className="text-sm text-gray-600 mb-4">Are you confirm to close this leads?</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setPendingCloseStatus(null)} className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={confirmCloseLead} disabled={leadStatusSaving} className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50">
                {leadStatusSaving ? 'Closing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Lead Form (Add / Edit) ────────────────────────────────────────────────────
function LeadForm({ lead, onSave, onCancel }) {
  const { profile } = useAuth()
  const isEdit = !!lead
  const isSalesRestricted = isSalesRole(profile?.role_id)
  const isWater = isWaterRole(profile?.role_id)
  const currentLegacyUserId = getLegacyUserId(profile)
  const [waterTeamIds, setWaterTeamIds] = useState([])
  useEffect(() => {
    if (!isWater) return
    fetchRoleLegacyUserIds(supabase, ROLE_WATER).then(setWaterTeamIds)
  }, [isWater])
  const [leadSources, setLeadSources] = useState([])
  const [stages, setStages] = useState([])
  const [users, setUsers] = useState([])
  const [customers, setCustomers] = useState([])
  const [contacts, setContacts] = useState([])
  const [industries, setIndustries] = useState([])
  const [accountTypes, setAccountTypes] = useState([])
  const [countries, setCountries] = useState([])
  const [states, setStates] = useState([])
  const [cities, setCities] = useState([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedContactId, setSelectedContactId] = useState('')
  const [contactMode, setContactMode] = useState('existing')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const leadSourcesQuery = useLeadSources()
  const stagesQuery = useStages()
  const usersQuery = useAssignableUsers()
  const industriesQuery = useIndustries()
  const accountTypesQuery = useAccountTypes()
  const countriesQuery = useCountries()

  const [form, setForm] = useState({
    lead_source: lead?.lead_source ? String(lead.lead_source) : '',
    status: lead?.status ? String(lead.status) : '',
    type: lead?.type !== undefined ? String(lead.type) : '0',
    // Company info
    company_name: lead?.company_name || '',
    industry: lead?.industry || '',
    account_type: lead?.account_type || '',
    address1: lead?.address1 || '',
    address2: lead?.address2 || '',
    country: lead?.country || '',
    state: lead?.state || '',
    city: lead?.city || '',
    zipcode: lead?.zipcode || '',
    office_number: lead?.office_number || '',
    mobile_number: lead?.mobile_number || '',
    email: lead?.email || '',
    website: lead?.website || '',
    // Contact info
    salutation: lead?.salutation || '',
    first_name: lead?.first_name || '',
    last_name: lead?.last_name || '',
    position: lead?.position || '',
    department_id: lead?.department_id || '',
    contact_mobile_number: lead?.contact_mobile_number || '',
    contact_email: lead?.contact_email || '',
    // Assigned
    assigned_to: lead?.assigned_to ? String(lead.assigned_to) : (isSalesRestricted ? String(currentLegacyUserId) : ''),
  })

  useEffect(() => { setLeadSources(leadSourcesQuery.data || []) }, [leadSourcesQuery.data])
  useEffect(() => { setStages(stagesQuery.data || []) }, [stagesQuery.data])
  useEffect(() => { setUsers(usersQuery.data || []) }, [usersQuery.data])
  useEffect(() => { setIndustries(industriesQuery.data || []) }, [industriesQuery.data])
  useEffect(() => { setAccountTypes(accountTypesQuery.data || []) }, [accountTypesQuery.data])
  useEffect(() => { setCountries(countriesQuery.data || []) }, [countriesQuery.data])

  useEffect(() => {
    const loadSelectedCustomer = async () => {
      if (!lead?.company_id) return
      const { data } = await supabase
        .from('customer')
        .select('id, industry, account_type, company_name, address1, address2, country, state, city, zipcode, office_number, mobile_number, email, website, assignto')
        .eq('id', lead.company_id)
        .maybeSingle()
      if (!data) return
      setCustomers([data])
      setSelectedCustomerId(String(data.id))
    }
    loadSelectedCustomer()
  }, [lead?.company_id])

  useEffect(() => {
    if (!form.country || countries.length === 0) { setStates([]); return }
    const countryRow = countries.find(country => country.name === form.country || String(country.id) === String(form.country))
    if (!countryRow) { setStates([]); return }
    supabase
      .from('state')
      .select('id, name, country_id')
      .eq('country_id', countryRow.id)
      .order('name')
      .then(({ data }) => setStates(data || []))
  }, [form.country, countries])

  useEffect(() => {
    if (!form.state || states.length === 0) { setCities([]); return }
    const stateRow = states.find(state => state.name === form.state || String(state.id) === String(form.state))
    if (!stateRow) { setCities([]); return }
    supabase
      .from('city')
      .select('id, name, state_id, country_id')
      .eq('state_id', stateRow.id)
      .order('name')
      .then(({ data }) => setCities(data || []))
  }, [form.state, states])

  useEffect(() => {
    if (isSalesRestricted && !form.assigned_to) {
      set('assigned_to', String(currentLegacyUserId))
    }
  }, [isSalesRestricted, currentLegacyUserId, form.assigned_to])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const selectedCustomer = customers.find(c => String(c.id) === String(selectedCustomerId))

  const loadContacts = async (companyId) => {
    if (!companyId) { setContacts([]); return }
    const { data } = await supabase.from('contact').select('*').eq('company_id', parseInt(companyId)).order('first_name')
    setContacts(data || [])
  }

  const applyCustomer = async (companyId, customerRecord = null) => {
    setSelectedCustomerId(companyId)
    setSelectedContactId('')
    if (!companyId) {
      setContacts([])
      setForm(f => ({
        ...f,
        company_name: '',
        industry: '',
        account_type: '',
        address1: '',
        address2: '',
        country: '',
        state: '',
        city: '',
        zipcode: '',
        office_number: '',
        mobile_number: '',
        email: '',
        website: '',
      }))
      return
    }
    await loadContacts(companyId)
    const customer = customerRecord || customers.find(c => String(c.id) === String(companyId))
    if (!customer) return
    setCustomers(prev => {
      const map = new Map(prev.map(row => [String(row.id), row]))
      map.set(String(customer.id), { ...map.get(String(customer.id)), ...customer })
      return Array.from(map.values())
    })
    setForm(f => ({
      ...f,
      company_name: customer.company_name || '',
      industry: optionValue(industries, customer.industry),
      account_type: optionValue(accountTypes, customer.account_type, 'type'),
      address1: customer.address1 || '',
      address2: customer.address2 || '',
      country: optionValue(countries, customer.country),
      state: customer.state || '',
      city: customer.city || '',
      zipcode: customer.zipcode || '',
      office_number: customer.office_number || '',
      mobile_number: customer.mobile_number || '',
      email: customer.email || '',
      website: customer.website || '',
      assigned_to: isSalesRestricted ? String(currentLegacyUserId) : (f.assigned_to || (customer.assignto ? String(customer.assignto) : '')),
    }))
  }

  const applyContact = (contactId) => {
    setSelectedContactId(contactId)
    const contact = contacts.find(c => String(c.id) === String(contactId))
    if (!contact) return
    setForm(f => ({
      ...f,
      salutation: contact.Salutation || '',
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      position: contact.position || '',
      department_id: contact.department_id || '',
      contact_mobile_number: contact.mobile_number || '',
      contact_email: contact.email || '',
    }))
  }

  const setType = (value) => {
    set('type', value)
    if (value === '0') {
      setSelectedCustomerId('')
      setSelectedContactId('')
      setContacts([])
      setContactMode('existing')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.type === '1' && !selectedCustomerId) { setError('Please search and select an existing company.'); return }
    if (!form.company_name.trim()) { setError('Company name is required'); return }
    setSaving(true); setError('')
    const assignedUser = users.find(u => String(u.id) === String(form.assigned_to))
    const assignedName = assignedUser ? `${assignedUser.first_name} ${assignedUser.last_name}`.trim() : ''

    const payload = {
      lead_source: form.lead_source,
      status: form.status,
      type: parseInt(form.type),
      company_id: form.type === '1' && selectedCustomerId ? parseInt(selectedCustomerId) : null,
      contact_id: form.type === '1' && selectedContactId ? parseInt(selectedContactId) : null,
      company_name: form.company_name,
      industry: form.industry,
      account_type: form.account_type,
      address1: form.address1,
      address2: form.address2,
      country: form.country,
      state: form.state,
      city: form.city,
      zipcode: form.zipcode,
      office_number: form.office_number,
      mobile_number: form.mobile_number,
      email: form.email,
      website: form.website,
      salutation: form.salutation,
      first_name: form.first_name,
      last_name: form.last_name,
      position: form.position,
      department_id: form.department_id,
      contact_mobile_number: form.contact_mobile_number,
      contact_email: form.contact_email,
      assigned_to: isSalesRestricted ? currentLegacyUserId : (form.assigned_to ? parseInt(form.assigned_to) : null),
      user_id: getLegacyUserId(profile),
      updated_at: new Date().toISOString(),
    }

    let result
    if (isEdit) {
      result = await supabase.from('sales_lead').update(payload).eq('id', lead.id).select().single()
    } else {
      payload.created_at = new Date().toISOString()
      result = await supabase.from('sales_lead').insert(payload).select().single()
    }

    setSaving(false)
    if (result.error) { setError(result.error.message); return }

    if (!isEdit && form.type === '0') {
      let customerId = null
      const { data: existingCustomers } = await supabase
        .from('customer')
        .select('id')
        .ilike('company_name', form.company_name.trim())
        .limit(1)

      if (existingCustomers?.length) {
        customerId = existingCustomers[0].id
      } else {
        const { data: newCustomer, error: customerError } = await supabase.from('customer').insert([{
          user_id: getLegacyUserId(profile),
          company_name: form.company_name,
          industry: form.industry || null,
          account_type: form.account_type || null,
          address1: form.address1 || null,
          address2: form.address2 || null,
          country: form.country || null,
          state: form.state || null,
          city: form.city || null,
          zipcode: form.zipcode || null,
          office_number: form.office_number || null,
          mobile_number: form.mobile_number || null,
          email: form.email || null,
          website: form.website || null,
          assigned: assignedName || null,
          assignto: form.assigned_to ? parseInt(form.assigned_to) : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }]).select('id').single()
        if (customerError) { setError(`Lead saved, but customer creation failed: ${customerError.message}`); return }
        customerId = newCustomer?.id || null
      }

      let contactId = null
      if (customerId && (form.first_name || form.last_name || form.contact_email || form.contact_mobile_number)) {
        const { data: newContact, error: contactError } = await supabase.from('contact').insert([{
          user_id: getLegacyUserId(profile),
          company_id: customerId,
          Salutation: form.salutation || null,
          first_name: form.first_name || null,
          last_name: form.last_name || null,
          position: form.position || null,
          department_id: form.department_id || null,
          mobile_number: form.contact_mobile_number || null,
          email: form.contact_email || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }]).select('id').single()
        if (contactError) { setError(`Lead and customer saved, but contact creation failed: ${contactError.message}`); return }
        contactId = newContact?.id || null
      }

      if (customerId) {
        await supabase.from('sales_lead').update({ company_id: customerId, contact_id: contactId, updated_at: new Date().toISOString() }).eq('id', result.data.id)
        result.data = { ...result.data, company_id: customerId, contact_id: contactId }
      }
    }

    if (!isEdit && form.type === '1' && selectedCustomerId && contactMode === 'new' && (form.first_name || form.last_name || form.contact_email || form.contact_mobile_number)) {
      const { data: createdContact } = await supabase.from('contact').insert([{
        user_id: getLegacyUserId(profile),
        company_id: parseInt(selectedCustomerId),
        Salutation: form.salutation || null,
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        position: form.position || null,
        department_id: form.department_id || null,
        mobile_number: form.contact_mobile_number || null,
        email: form.contact_email || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }]).select('id').single()
      if (createdContact?.id) {
        await supabase.from('sales_lead').update({ contact_id: createdContact.id, updated_at: new Date().toISOString() }).eq('id', result.data.id)
        result.data = { ...result.data, contact_id: createdContact.id }
      }
    }

    logActivity({
      module: 'leads',
      action: isEdit ? 'update' : 'create',
      recordTable: 'sales_lead',
      recordId: result.data.id,
      recordLabel: form.company_name,
      summary: `${isEdit ? 'Updated' : 'Created'} sales lead ${form.company_name}`,
      metadata: { assigned_to: payload.assigned_to || null, company_id: result.data.company_id || null },
    })

    const newAssignee = payload.assigned_to ? String(payload.assigned_to) : ''
    const oldAssignee = lead?.assigned_to ? String(lead.assigned_to) : ''
    const isNewAssignment = newAssignee && String(newAssignee) !== String(currentLegacyUserId || '') &&
      (!isEdit || newAssignee !== oldAssignee)

    if (isNewAssignment) {
      const stageName = stages.find(s => String(s.id) === String(form.status))?.name || form.status
      await notifyUser(supabase, {
        userId: parseInt(newAssignee),
        actorUserId: currentLegacyUserId,
        title: 'Lead assigned to you',
        reference: `Lead #${result.data.id}`,
        companyName: form.company_name,
        body: `You have been assigned a lead for ${form.company_name}.`,
        details: [
          ['Company', form.company_name],
          ['Contact', [form.salutation, form.first_name, form.last_name].filter(Boolean).join(' ')],
          ['Stage', stageName],
          ['Assigned By', getUserName(users, currentLegacyUserId)],
        ],
        link: '/leads',
      })
    }

    onSave(result.data)
  }

  const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const sectionCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 mt-6 pb-1 border-b border-gray-100'
  const selectedCountry = countries.find(country => country.name === form.country || String(country.id) === String(form.country))
  const selectedState = states.find(state => state.name === form.state || String(state.id) === String(form.state))
  const stateOptions = selectedCountry ? states : []
  const cityOptions = selectedState ? cities : []

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onCancel} className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-xl font-semibold text-gray-900">{isEdit ? 'Edit Lead' : 'Add Lead'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 max-w-3xl">
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">{error}</div>}

        {/* Lead Source & Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>Lead Source <span className="text-red-500">*</span></label>
            <select className={inputCls} value={form.lead_source} onChange={e => set('lead_source', e.target.value)}>
              <option value="">Please Select</option>
              {leadSources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Status <span className="text-red-500">*</span></label>
            <select className={inputCls} value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="">Please Select</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        {/* Type */}
        <div className="mb-4">
          <label className={labelCls}>Type <span className="text-red-500">*</span></label>
          <div className="flex gap-6">
            {[['0', 'New'], ['1', 'Existing']].map(([val, label]) => (
              <label key={val} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="radio" name="type" value={val} checked={form.type === val} onChange={e => setType(e.target.value)}
                  className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500" />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Company Information */}
        <p className={sectionCls}>Company Information</p>

        {form.type === '1' && (
          <div className="mb-4">
            <label className={labelCls}>Existing Company <span className="text-red-500">*</span></label>
            <CustomerSearchSelect
              value={selectedCustomerId}
              displayLabel={selectedCustomer?.company_name || form.company_name || ''}
              onSelect={(customer) => {
                setError('')
                applyCustomer(customer ? String(customer.id) : '', customer)
              }}
              placeholder="Search company name..."
              required={!isEdit && form.type === '1'}
              className={inputCls}
            />
          </div>
        )}

        {form.type !== '1' && (
          <div className="mb-4">
            <label className={labelCls}>Company Name <span className="text-red-500">*</span></label>
            <input className={inputCls} value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Company Name" required />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>Industry</label>
            <select className={inputCls} value={form.industry} onChange={e => set('industry', e.target.value)}>
              <option value="">Please Select</option>
              {!hasOption(industries, form.industry) && <option value={form.industry}>{form.industry}</option>}
              {industries.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Account Type</label>
            <select className={inputCls} value={form.account_type} onChange={e => set('account_type', e.target.value)}>
              <option value="">Please Select</option>
              {!hasOption(accountTypes, form.account_type, 'type') && <option value={form.account_type}>{form.account_type}</option>}
              {accountTypes.map(item => <option key={item.id} value={item.type}>{item.type}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className={labelCls}>Address</label>
          <input className={inputCls} value={form.address1} onChange={e => set('address1', e.target.value)} placeholder="Street Address" />
        </div>
        <div className="mb-4">
          <input className={inputCls} value={form.address2} onChange={e => set('address2', e.target.value)} placeholder="Street Address Line 2 (optional)" />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>Country</label>
            <select className={inputCls} value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value, state: '', city: '' }))}>
              <option value="">Please Select</option>
              {!hasOption(countries, form.country) && <option value={form.country}>{form.country}</option>}
              {countries.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>State</label>
            <select className={inputCls} value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value, city: '' }))}>
              <option value="">Please Select</option>
              {!hasOption(stateOptions, form.state) && <option value={form.state}>{form.state}</option>}
              {stateOptions.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>City</label>
            <select className={inputCls} value={form.city} onChange={e => set('city', e.target.value)}>
              <option value="">Please Select</option>
              {!hasOption(cityOptions, form.city) && <option value={form.city}>{form.city}</option>}
              {cityOptions.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Postcode</label>
            <input className={inputCls} value={form.zipcode} onChange={e => set('zipcode', e.target.value)} placeholder="Postcode" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>Office Tel. No.</label>
            <input className={inputCls} value={form.office_number} onChange={e => set('office_number', e.target.value)} placeholder="Office number" />
          </div>
          <div>
            <label className={labelCls}>Mobile Number</label>
            <input className={inputCls} value={form.mobile_number} onChange={e => set('mobile_number', e.target.value)} placeholder="Mobile number" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="Email" />
          </div>
          <div>
            <label className={labelCls}>Website</label>
            <input className={inputCls} value={form.website} onChange={e => set('website', e.target.value)} placeholder="www.domain.com" />
          </div>
        </div>

        {/* Contact Information */}
        <p className={sectionCls}>Contact Information</p>

        {form.type === '1' && selectedCustomerId && (
          <div className="mb-4">
            <label className={labelCls}>Contact Person</label>
            <div className="flex gap-6 mb-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="radio" name="contactMode" value="existing" checked={contactMode === 'existing'} onChange={e => setContactMode(e.target.value)}
                  className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500" />
                Select Existing
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="radio" name="contactMode" value="new" checked={contactMode === 'new'} onChange={e => { setContactMode(e.target.value); setSelectedContactId('') }}
                  className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500" />
                Create New
              </label>
            </div>
            {contactMode === 'existing' && (
              <select className={inputCls} value={selectedContactId} onChange={e => applyContact(e.target.value)}>
                <option value="">Please Select</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{[c.Salutation, c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || `Contact #${c.id}`}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className={labelCls}>Salutation</label>
            <input className={inputCls} value={form.salutation} onChange={e => set('salutation', e.target.value)} placeholder="Mr / Ms / Dr" />
          </div>
          <div>
            <label className={labelCls}>First Name</label>
            <input className={inputCls} value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="First Name" />
          </div>
          <div>
            <label className={labelCls}>Last Name</label>
            <input className={inputCls} value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Last Name" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>Position</label>
            <input className={inputCls} value={form.position} onChange={e => set('position', e.target.value)} placeholder="Job title" />
          </div>
          <div>
            <label className={labelCls}>Department</label>
            <input className={inputCls} value={form.department_id} onChange={e => set('department_id', e.target.value)} placeholder="Department" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>Contact Mobile</label>
            <input className={inputCls} value={form.contact_mobile_number} onChange={e => set('contact_mobile_number', e.target.value)} placeholder="Contact mobile" />
          </div>
          <div>
            <label className={labelCls}>Contact Email</label>
            <input className={inputCls} type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder="Contact email" />
          </div>
        </div>

        {/* Assigned To */}
        <p className={sectionCls}>Assignment</p>
        <div className="mb-6">
          <label className={labelCls}>Assigned To</label>
          <select className={inputCls} value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} disabled={isSalesRestricted}>
            <option value="">Please Select</option>
            {(isSalesRestricted
              ? users.filter(u => String(u.id) === String(currentLegacyUserId))
              : isWater
              ? users.filter(u => waterTeamIds.map(String).includes(String(u.id)))
              : users
            ).map(u => (
              <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700 disabled:opacity-50">
            <Save size={14} />
            {saving ? 'Saving...' : (isEdit ? 'Update' : 'Save')}
          </button>
        </div>
      </form>
    </>
  )
}

// ─── Main Leads Page ───────────────────────────────────────────────────────────
export default function Leads() {
  const { profile } = useAuth()
  const location = useLocation()
  const canDeleteLeads = hasAdminAccess(profile?.role_id)
  const [view, setView] = useState('list')
  const [selectedId, setSelectedId] = useState(null)
  const [editLead, setEditLead] = useState(null)

  const [leads, setLeads] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [tab, setTab] = useState('open')
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAssigned, setFilterAssigned] = useState('')
  const [stages, setStages] = useState([])
  const [leadSources, setLeadSources] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState(null)
  const stagesQuery = useStages()
  const leadSourcesQuery = useLeadSources()
  const legacyUsersQuery = useLegacyUsers()

  // Water Dep: scope the lead list to the whole team instead of one owner.
  const isWater = isWaterRole(profile?.role_id)
  const [waterTeamIds, setWaterTeamIds] = useState(null)
  useEffect(() => {
    if (!isWater) { setWaterTeamIds(null); return }
    fetchRoleLegacyUserIds(supabase, ROLE_WATER).then(setWaterTeamIds)
  }, [isWater])
  const closedStageIds = useMemo(
    () => stages.filter(stage => isClosedStageName(stage.name)).map(stage => String(stage.id)),
    [stages]
  )

  useEffect(() => { setStages(stagesQuery.data || []) }, [stagesQuery.data])
  useEffect(() => { setLeadSources(leadSourcesQuery.data || []) }, [leadSourcesQuery.data])
  useEffect(() => { setUsers(legacyUsersQuery.data || []) }, [legacyUsersQuery.data])

  useEffect(() => {
    if (location.state?.openForm) {
      setEditLead(null)
      setSelectedId(null)
      setView('form')
    } else if (location.state?.leadId) {
      setSelectedId(location.state.leadId)
      setView('detail')
    }
  }, [location.state])

  const fetchLeads = useCallback(async () => {
    if (!profile) return
    if (isWater && waterTeamIds === null) return
    setLoading(true)
    const isSalesRestricted = isSalesRole(profile?.role_id)
    const currentLegacyUserId = getLegacyUserId(profile)
    try {
      const { data, error } = await supabase.rpc('search_leads', {
        p_tab: tab,
        p_search: submittedSearch.trim(),
        p_status_filter: filterStatus || '',
        p_assigned_filter: !isSalesRestricted && filterAssigned ? parseInt(filterAssigned) : null,
        p_current_user_id: currentLegacyUserId || null,
        p_restricted: isSalesRestricted,
        p_team_ids: isWater ? (waterTeamIds || []) : null,
        p_closed_stage_ids: closedStageIds,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      })
      if (error) throw error
      const result = Array.isArray(data) ? data[0] : data
      setLeads(Array.isArray(result?.rows) ? result.rows : [])
      setTotal(Number(result?.total_count || 0))
    } catch (error) {
      setLeads([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [submittedSearch, filterStatus, filterAssigned, page, profile, tab, closedStageIds, isWater, waterTeamIds])

  useEffect(() => { fetchLeads() }, [fetchLeads])
  useEffect(() => { setPage(0) }, [submittedSearch, filterStatus, filterAssigned, tab])
  const runSearch = () => {
    setSubmittedSearch(search.trim())
    setPage(0)
  }
  const clearSearch = () => {
    setSearch('')
    setSubmittedSearch('')
    setFilterStatus('')
    setFilterAssigned('')
    setPage(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handleDelete = async (id) => {
    if (!canDeleteLeads) {
      setDeleteId(null)
      return
    }
    await supabase.from('sales_lead').delete().eq('id', id)
    logActivity({
      module: 'leads',
      action: 'delete',
      recordTable: 'sales_lead',
      recordId: id,
      summary: `Deleted sales lead #${id}`,
    })
    setDeleteId(null)
    fetchLeads()
  }

  const handleSaved = (savedLead) => {
    if (savedLead?.id) {
      setSelectedId(savedLead.id)
      setView('detail')
    } else {
      setView('list')
    }
    setEditLead(null)
    fetchLeads()
  }

  const openEdit = async (l) => {
    if (l) { setEditLead(l); setView('form') }
    else {
      const { data } = await supabase.from('sales_lead').select('*').eq('id', selectedId).single()
      if (data) { setEditLead(data); setView('form') }
    }
  }

  if (view === 'form') {
    return <LeadForm lead={editLead} onSave={handleSaved} onCancel={() => { setView('list'); setEditLead(null) }} />
  }

  if (view === 'detail') {
    return <LeadDetail leadId={selectedId} onBack={() => setView('list')} onEdit={() => openEdit(null)} />
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Manage Leads</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} lead{total !== 1 ? 's' : ''} total</p>
        </div>
        <button
          onClick={() => { setEditLead(null); setView('form') }}
          className="flex w-full items-center justify-center gap-2 px-4 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700 sm:w-auto"
        >
          <Plus size={16} /> Add Lead
        </button>
      </div>

      <div className="flex flex-wrap gap-1 mb-5 border-b border-gray-200">
        {[
          ['open', 'Open Leads'],
          ['closed', 'Closed Leads'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => { setTab(id); setPage(0) }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === id ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
            placeholder="Search by company name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runSearch() }}
          />
        </div>
        <button onClick={runSearch} className="flex items-center gap-1.5 px-3 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700">
          <Search size={14} /> Search
        </button>
        <select
          className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">All Stages</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {!isSalesRole(profile?.role_id) && (
          <select
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
            value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)}
          >
            <option value="">All Assigned Users</option>
            {(isWater ? users.filter(u => (waterTeamIds || []).map(String).includes(String(u.id))) : users)
              .map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
          </select>
        )}
        {(search || submittedSearch || filterStatus || filterAssigned) && (
          <button onClick={clearSearch}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide w-10">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Company / Address</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Lead Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Phone / Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Assigned To</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">Loading...</td></tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">
                    {search || filterStatus ? 'No leads match your filters.' : 'No leads yet. Click "Add Lead" to get started.'}
                  </td>
                </tr>
              ) : (
                leads.map((l, idx) => {
                  const phone = l.mobile_number || l.office_number || ''
                  const addrParts = [l.address1, l.city, l.state].filter(Boolean)
                  const statusName = lookupName(stages, l.status, 'Status')
                  return (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 text-xs">{page * PAGE_SIZE + idx + 1}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => { setSelectedId(l.id); setView('detail') }} className="text-left">
                          <div className="flex items-center gap-2">
                            <Building2 size={13} className="text-gray-400 flex-shrink-0" />
                            <span className="font-medium text-gray-900 hover:text-[#CC0000] text-xs">{l.company_name || '—'}</span>
                          </div>
                          {addrParts.length > 0 && (
                            <div className="text-xs text-gray-400 mt-0.5 pl-5">{addrParts.join(', ')}</div>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{lookupName(leadSources, l.lead_source, 'Source')}</td>
                      <td className="px-4 py-3">
                        {l.status ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageColor(statusName)}`}>{statusName}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {phone && <div className="flex items-center gap-1 text-gray-700 text-xs"><Phone size={11} className="text-gray-400" />{phone}</div>}
                        {l.email && <div className="flex items-center gap-1 text-gray-500 text-xs mt-0.5"><Mail size={11} className="text-gray-400" />{l.email}</div>}
                        {!phone && !l.email && <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{getUserName(users, l.assigned_to)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmt(l.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setSelectedId(l.id); setView('detail') }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="View">
                            <Eye size={14} />
                          </button>
                          <button onClick={() => openEdit(l)}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Edit">
                            <Pencil size={14} />
                          </button>
                          {canDeleteLeads && (
                            <button onClick={() => setDeleteId(l.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls
          page={page}
          totalPages={totalPages}
          total={total}
          label="lead"
          zeroBased
          onPageChange={setPage}
          className="px-4 py-3 border-t border-gray-200 bg-gray-50"
        />
      </div>

      {/* Delete Confirm */}
      {deleteId && canDeleteLeads && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Lead</h3>
            <p className="text-sm text-gray-600 mb-4">Are you sure you want to delete this lead? This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)}
                className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
