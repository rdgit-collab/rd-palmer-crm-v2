import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAssignableUsers, fetchLegacyUsers, getLegacyUserId, getUserName } from '../../lib/legacyUsers'
import PaginationControls from '../../components/PaginationControls'
import {
  Plus, Search, Eye, Pencil, Trash2, ArrowLeft, Save,
  X, ChevronLeft, ChevronRight, Building2, Phone, Mail, CalendarClock
} from 'lucide-react'

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const PAGE_SIZE = 30
const LOOKUP_PAGE_SIZE = 1000

const lookupName = (items, id, fallbackPrefix) => {
  if (!id) return '—'
  const item = items.find((row) => String(row.id) === String(id))
  return item?.name || `${fallbackPrefix} #${id}`
}

async function fetchAllRows(tableName, columns = '*', orderField = 'id') {
  let from = 0
  let rows = []
  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select(columns)
      .order(orderField)
      .range(from, from + LOOKUP_PAGE_SIZE - 1)
    if (error) return rows
    rows = rows.concat(data || [])
    if (!data || data.length < LOOKUP_PAGE_SIZE) return rows
    from += LOOKUP_PAGE_SIZE
  }
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
  if (n.includes('won'))       return 'bg-green-100 text-green-700'
  if (n.includes('lost'))      return 'bg-red-100 text-red-700'
  if (n.includes('closed'))    return 'bg-gray-100 text-gray-600'
  if (n.includes('new'))       return 'bg-blue-100 text-blue-700'
  if (n.includes('follow'))    return 'bg-yellow-100 text-yellow-700'
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
  const [activitySaving, setActivitySaving] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    let leadQuery = supabase.from('sales_lead').select('*').eq('id', leadId)
    if (profile?.role_id === 2) {
      leadQuery = leadQuery.eq('assigned_to', getLegacyUserId(profile))
    }
    const [{ data: l }, { data: act }, legacyUsers, { data: sources }, { data: stageRows }, { data: typeRows }, { data: priorityRows }, { data: statusRows }] = await Promise.all([
      leadQuery.maybeSingle(),
      supabase.from('activity').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }),
      fetchLegacyUsers(supabase),
      supabase.from('lead').select('id, name').order('name'),
      supabase.from('stage').select('id, name').order('name'),
      supabase.from('activity_type').select('id, type').order('type'),
      supabase.from('priority').select('id, name').order('name'),
      supabase.from('activity_status').select('id, name').order('name'),
    ])
    setLead(l)
    setActivities(act || [])
    setUsers(legacyUsers || [])
    setLeadSources(sources || [])
    setStages(stageRows || [])
    setActivityTypes(typeRows || [])
    setPriorities(priorityRows || [])
    setActivityStatuses(statusRows || [])
    setLoading(false)
  }, [leadId, profile])

  useEffect(() => {
    load()
  }, [load])

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

  const saveActivity = async (e) => {
    e.preventDefault()
    if (!activityForm.type) { setActivityError('Activity type is required'); return }
    if (!activityForm.description.trim()) { setActivityError('Description is required'); return }
    setActivitySaving(true)
    setActivityError('')
    const payload = {
      user_id: getLegacyUserId(profile),
      lead_id: lead.id,
      company_id: null,
      assigned_to: lead.assigned_to || null,
      type: activityForm.type,
      priority: activityForm.priority || null,
      status: activityForm.status || null,
      date: activityForm.date || null,
      time: activityForm.time || null,
      description: activityForm.description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('activity').insert([payload])
    setActivitySaving(false)
    if (error) { setActivityError(error.message); return }
    setActivityForm(defaultActivityForm())
    setShowActivityForm(false)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm">
            <ArrowLeft size={16} /> Back
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Lead Information</h1>
        </div>
        <div className="flex items-center gap-2">
          {lead.status && (
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${stageColor(statusName)}`}>{statusName}</span>
          )}
          <button onClick={() => setShowActivityForm(v => !v)}
            className="flex items-center gap-2 px-3 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700">
            <Plus size={14} /> Update Progress
          </button>
          <button onClick={onEdit}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">
            <Pencil size={14} /> Edit
          </button>
        </div>
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
          <p className="mt-1 text-sm font-semibold text-gray-900">{latestActivity?.status || '—'}</p>
        </div>
      </div>

      {showActivityForm && (
        <form onSubmit={saveActivity} className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Update Lead Progress</h2>
            <button type="button" onClick={() => setShowActivityForm(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
          {activityError && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">{activityError}</div>}
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
              <input type="date" value={activityForm.date} onChange={e => setActivity('date', e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
              <input type="time" value={activityForm.time} onChange={e => setActivity('time', e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select value={activityForm.priority} onChange={e => setActivity('priority', e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="">Please Select</option>
                {priorities.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={activityForm.status} onChange={e => setActivity('status', e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500">
                <option value="">Please Select</option>
                {activityStatuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Progress Notes</label>
            <textarea value={activityForm.description} onChange={e => setActivity('description', e.target.value)} required rows={3} className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500 resize-none" />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowActivityForm(false)} className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={activitySaving} className="flex items-center gap-2 px-4 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700 disabled:opacity-50">
              <Save size={14} /> {activitySaving ? 'Saving...' : 'Save Update'}
            </button>
          </div>
        </form>
      )}

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
                ['Status', statusName],
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
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900 text-sm">{a.type || 'Activity'}</span>
                      {a.priority && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${activityPriorityColor(a.priority)}`}>{a.priority}</span>}
                      {a.status && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${activityStatusColor(a.status)}`}>{a.status}</span>}
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
    </div>
  )
}

// ─── Lead Form (Add / Edit) ────────────────────────────────────────────────────
function LeadForm({ lead, onSave, onCancel }) {
  const { profile } = useAuth()
  const isEdit = !!lead
  const isSalesRestricted = profile?.role_id === 2
  const currentLegacyUserId = getLegacyUserId(profile)
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

  useEffect(() => {
    const run = async () => {
      const [
        { data: sources },
        { data: stageRows },
        assignableUsers,
        customerRows,
        { data: industryRows },
        { data: accountRows },
        { data: countryRows },
        { data: stateRows },
        { data: cityRows },
      ] = await Promise.all([
        supabase.from('lead').select('id, name').order('name'),
        supabase.from('stage').select('id, name').order('name'),
        fetchAssignableUsers(supabase),
        fetchAllRows('customer', '*', 'company_name'),
        supabase.from('industries').select('id, name').order('name'),
        supabase.from('account_type').select('id, type').order('type'),
        supabase.from('country').select('id, name').order('name'),
        supabase.from('state').select('id, name, country_id').order('name'),
        supabase.from('city').select('id, name, state_id, country_id').order('name'),
      ])
      setLeadSources(sources || [])
      setStages(stageRows || [])
      setUsers(assignableUsers || [])
      setCustomers(customerRows || [])
      setIndustries(industryRows || [])
      setAccountTypes(accountRows || [])
      setCountries(countryRows || [])
      setStates(stateRows || [])
      setCities(cityRows || [])
    }
    run()
  }, [])

  useEffect(() => {
    if (isSalesRestricted && !form.assigned_to) {
      set('assigned_to', String(currentLegacyUserId))
    }
  }, [isSalesRestricted, currentLegacyUserId, form.assigned_to])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const loadContacts = async (companyId) => {
    if (!companyId) { setContacts([]); return }
    const { data } = await supabase.from('contact').select('*').eq('company_id', parseInt(companyId)).order('first_name')
    setContacts(data || [])
  }

  const applyCustomer = async (companyId) => {
    setSelectedCustomerId(companyId)
    setSelectedContactId('')
    await loadContacts(companyId)
    const customer = customers.find(c => String(c.id) === String(companyId))
    if (!customer) return
    setForm(f => ({
      ...f,
      company_name: customer.company_name || '',
      industry: optionValue(industries, customer.industry),
      account_type: optionValue(accountTypes, customer.account_type, 'type'),
      address1: customer.address1 || '',
      address2: customer.address2 || '',
      country: optionValue(countries, customer.country),
      state: optionValue(states, customer.state),
      city: optionValue(cities, customer.city),
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

    onSave(result.data)
  }

  const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const sectionCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 mt-6 pb-1 border-b border-gray-100'
  const selectedCountry = countries.find(country => country.name === form.country || String(country.id) === String(form.country))
  const selectedState = states.find(state => state.name === form.state || String(state.id) === String(form.state))
  const stateOptions = selectedCountry ? states.filter(state => String(state.country_id || '') === String(selectedCountry.id)) : states
  const cityOptions = selectedState
    ? cities.filter(city => String(city.state_id || '') === String(selectedState.id))
    : selectedCountry
      ? cities.filter(city => String(city.country_id || '') === String(selectedCountry.id))
      : cities

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
            <select className={inputCls} value={selectedCustomerId} onChange={e => applyCustomer(e.target.value)} required={!isEdit && form.type === '1'}>
              <option value="">Please Select</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
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
            {(isSalesRestricted ? users.filter(u => String(u.id) === String(currentLegacyUserId)) : users).map(u => (
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
  const [view, setView] = useState('list')
  const [selectedId, setSelectedId] = useState(null)
  const [editLead, setEditLead] = useState(null)

  const [leads, setLeads] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAssigned, setFilterAssigned] = useState('')
  const [stages, setStages] = useState([])
  const [leadSources, setLeadSources] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState(null)

  useEffect(() => {
    const run = async () => {
      const [{ data: stageRows }, { data: sourceRows }, legacyUsers] = await Promise.all([
        supabase.from('stage').select('id, name').order('name'),
        supabase.from('lead').select('id, name').order('name'),
        fetchLegacyUsers(supabase),
      ])
      setStages(stageRows || [])
      setLeadSources(sourceRows || [])
      setUsers(legacyUsers || [])
    }
    run()
  }, [])

  useEffect(() => {
    if (location.state?.leadId) {
      setSelectedId(location.state.leadId)
      setView('detail')
    }
  }, [location.state])

  const fetchLeads = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    let q = supabase.from('sales_lead').select('*', { count: 'exact' })
    const isSalesRestricted = profile?.role_id === 2
    const currentLegacyUserId = getLegacyUserId(profile)

    if (isSalesRestricted) {
      q = q.eq('assigned_to', currentLegacyUserId)
    }

    if (search.trim()) {
      q = q.ilike('company_name', `%${search.trim()}%`)
    }
    if (filterStatus) {
      q = q.eq('status', filterStatus)
    }
    if (!isSalesRestricted && filterAssigned) {
      q = q.eq('assigned_to', parseInt(filterAssigned))
    }

    q = q.order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    const { data, count, error } = await q
    if (!error) { setLeads(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, filterStatus, filterAssigned, page, profile])

  useEffect(() => { fetchLeads() }, [fetchLeads])
  useEffect(() => { setPage(0) }, [search, filterStatus, filterAssigned])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handleDelete = async (id) => {
    await supabase.from('sales_lead').delete().eq('id', id)
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Manage Leads</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} lead{total !== 1 ? 's' : ''} total</p>
        </div>
        <button
          onClick={() => { setEditLead(null); setView('form') }}
          className="flex items-center gap-2 px-4 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700"
        >
          <Plus size={16} /> Add Lead
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
            placeholder="Search by company name..."
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">All Stages</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {profile?.role_id !== 2 && (
          <select
            className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
            value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)}
          >
            <option value="">All Assigned Users</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
          </select>
        )}
        {(search || filterStatus || filterAssigned) && (
          <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterAssigned('') }}
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
                          <button onClick={() => setDeleteId(l.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                            <Trash2 size={14} />
                          </button>
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
      {deleteId && (
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
