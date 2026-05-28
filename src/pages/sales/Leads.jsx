import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAssignableUsers, fetchLegacyUsers, getLegacyUserId, getUserName } from '../../lib/legacyUsers'
import {
  Plus, Search, Eye, Pencil, Trash2, ArrowLeft, Save,
  X, ChevronLeft, ChevronRight, Building2, Phone, Mail
} from 'lucide-react'

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const PAGE_SIZE = 15

const lookupName = (items, id, fallbackPrefix) => {
  if (!id) return '—'
  const item = items.find((row) => String(row.id) === String(id))
  return item?.name || `${fallbackPrefix} #${id}`
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

// ─── Lead Detail View ──────────────────────────────────────────────────────────
function LeadDetail({ leadId, onBack, onEdit }) {
  const [lead, setLead] = useState(null)
  const [activities, setActivities] = useState([])
  const [users, setUsers] = useState([])
  const [leadSources, setLeadSources] = useState([])
  const [stages, setStages] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: l }, { data: act }, legacyUsers, { data: sources }, { data: stageRows }] = await Promise.all([
        supabase.from('sales_lead').select('*').eq('id', leadId).single(),
        supabase.from('activity').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }),
        fetchLegacyUsers(supabase),
        supabase.from('lead').select('id, name').order('name'),
        supabase.from('stage').select('id, name').order('name'),
      ])
      setLead(l)
      setActivities(act || [])
      setUsers(legacyUsers || [])
      setLeadSources(sources || [])
      setStages(stageRows || [])
      setLoading(false)
    }
    load()
  }, [leadId])

  if (loading) return <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Loading...</div>
  if (!lead) return <div className="text-gray-500 text-sm p-4">Lead not found.</div>

  const phone = lead.mobile_number || lead.office_number || '—'
  const statusName = lookupName(stages, lead.status, 'Status')
  const sourceName = lookupName(leadSources, lead.lead_source, 'Source')

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
          <button onClick={onEdit}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">
            <Pencil size={14} /> Edit
          </button>
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
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Activity History</h2>
        </div>
        {activities.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-400">No activity history for this lead.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Date', 'Type', 'Priority', 'Status', 'Description'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activities.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 whitespace-nowrap text-xs">{fmt(a.created_at)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{a.type || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{a.priority || '—'}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{a.status || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-xs truncate">{a.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
  const [leadSources, setLeadSources] = useState([])
  const [stages, setStages] = useState([])
  const [users, setUsers] = useState([])
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
    assigned_to: lead?.assigned_to ? String(lead.assigned_to) : '',
  })

  useEffect(() => {
    supabase.from('lead').select('id, name').order('name').then(({ data }) => setLeadSources(data || []))
    supabase.from('stage').select('id, name').order('name').then(({ data }) => setStages(data || []))
    fetchAssignableUsers(supabase).then(setUsers)
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.company_name.trim()) { setError('Company name is required'); return }
    setSaving(true); setError('')

    const payload = {
      lead_source: form.lead_source,
      status: form.status,
      type: parseInt(form.type),
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
      assigned_to: form.assigned_to ? parseInt(form.assigned_to) : null,
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
    onSave(result.data)
  }

  const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const sectionCls = 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 mt-6 pb-1 border-b border-gray-100'

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
                <input type="radio" name="type" value={val} checked={form.type === val} onChange={e => set('type', e.target.value)}
                  className="w-4 h-4 text-red-600 border-gray-300 focus:ring-red-500" />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Company Information */}
        <p className={sectionCls}>Company Information</p>

        <div className="mb-4">
          <label className={labelCls}>Company Name <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Company Name" required />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>Industry</label>
            <input className={inputCls} value={form.industry} onChange={e => set('industry', e.target.value)} placeholder="Industry" />
          </div>
          <div>
            <label className={labelCls}>Account Type</label>
            <input className={inputCls} value={form.account_type} onChange={e => set('account_type', e.target.value)} placeholder="Account Type" />
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
            <input className={inputCls} value={form.country} onChange={e => set('country', e.target.value)} placeholder="Country" />
          </div>
          <div>
            <label className={labelCls}>State</label>
            <input className={inputCls} value={form.state} onChange={e => set('state', e.target.value)} placeholder="State" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>City</label>
            <input className={inputCls} value={form.city} onChange={e => set('city', e.target.value)} placeholder="City" />
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
          <select className={inputCls} value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
            <option value="">Please Select</option>
            {users.map(u => (
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
  const [view, setView] = useState('list')
  const [selectedId, setSelectedId] = useState(null)
  const [editLead, setEditLead] = useState(null)

  const [leads, setLeads] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
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

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('sales_lead').select('*', { count: 'exact' })

    if (search.trim()) {
      q = q.ilike('company_name', `%${search.trim()}%`)
    }
    if (filterStatus) {
      q = q.eq('status', filterStatus)
    }

    q = q.order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    const { data, count, error } = await q
    if (!error) { setLeads(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, filterStatus, page])

  useEffect(() => { fetchLeads() }, [fetchLeads])
  useEffect(() => { setPage(0) }, [search, filterStatus])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handleDelete = async (id) => {
    await supabase.from('sales_lead').delete().eq('id', id)
    setDeleteId(null)
    fetchLeads()
  }

  const handleSaved = () => {
    setView('list')
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
        {(search || filterStatus) && (
          <button onClick={() => { setSearch(''); setFilterStatus('') }}
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

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="p-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-gray-600 px-2">Page {page + 1} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="p-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
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
