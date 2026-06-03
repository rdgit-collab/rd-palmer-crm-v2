import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAssignableUsers, getLegacyUserId } from '../../lib/legacyUsers'
import { logActivity } from '../../lib/activityLog'
import PaginationControls from '../../components/PaginationControls'
import {
  Plus, Search, Eye, Pencil, Trash2, ArrowLeft, Save,
  X, ChevronLeft, ChevronRight, Building2, Phone, Mail
} from 'lucide-react'

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const CUSTOMER_LIST_COLUMNS = 'id, industry, account_type, company_name, address1, address2, country, state, city, zipcode, office_number, mobile_number, email, website, assigned, assignto, created_at, updated_at'


// ─── Customer Form (Add / Edit) ────────────────────────────────────────────────
const emptyContact = {
  Salutation: '',
  first_name: '',
  last_name: '',
  position: '',
  department_id: '',
  mobile_number: '',
  email: '',
  address: '',
}

function CustomerForm({ customer, onSave, onCancel }) {
  const { profile } = useAuth()
  const isEdit = !!customer

  const [industries, setIndustries] = useState([])
  const [accountTypes, setAccountTypes] = useState([])
  const [users, setUsers] = useState([])
  const [countries, setCountries] = useState([])
  const [states, setStates] = useState([])
  const [cities, setCities] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [newContacts, setNewContacts] = useState([{ ...emptyContact }])

  const [form, setForm] = useState({
    industry: customer?.industry || '',
    account_type: customer?.account_type || '',
    company_name: customer?.company_name || '',
    address1: customer?.address1 || '',
    address2: customer?.address2 || '',
    country: customer?.country || '',
    state: customer?.state || '',
    city: customer?.city || '',
    zipcode: customer?.zipcode || '',
    office_number: customer?.office_number || '',
    mobile_number: customer?.mobile_number || '',
    email: customer?.email || '',
    website: customer?.website || '',
    assignto: customer?.assignto ? String(customer.assignto) : '',
  })

  useEffect(() => {
    supabase.from('industries').select('id, name').order('name').then(({ data }) => setIndustries(data || []))
    supabase.from('account_type').select('id, type').order('type').then(({ data }) => setAccountTypes(data || []))
    fetchAssignableUsers(supabase).then(setUsers)
    supabase.from('country').select('id, name').order('name').then(({ data }) => setCountries(data || []))
  }, [])

  // Load states when country changes
  useEffect(() => {
    if (!form.country || countries.length === 0) { setStates([]); return }
    const countryRow = countries.find(c => c.name === form.country)
    if (countryRow) {
      supabase.from('state').select('id, name').eq('country_id', countryRow.id).order('name')
        .then(({ data }) => setStates(data || []))
    } else {
      setStates([])
    }
  }, [form.country, countries])

  // Load cities when state changes
  useEffect(() => {
    if (!form.state || states.length === 0) { setCities([]); return }
    const stateRow = states.find(s => s.name === form.state)
    if (stateRow) {
      supabase.from('city').select('id, name').eq('state_id', stateRow.id).order('name')
        .then(({ data }) => setCities(data || []))
    } else {
      setCities([])
    }
  }, [form.state, states])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Cascading location handlers — reset child fields when parent changes
  const setCountry = (val) => setForm(f => ({ ...f, country: val, state: '', city: '' }))
  const setState  = (val) => setForm(f => ({ ...f, state: val, city: '' }))
  const setCity   = (val) => setForm(f => ({ ...f, city: val }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.company_name.trim()) { setError('Company name is required'); return }
    setSaving(true); setError('')

    const assignedUser = users.find(u => String(u.id) === String(form.assignto))
    const assignedName = assignedUser ? `${assignedUser.first_name} ${assignedUser.last_name}`.trim() : ''

    const payload = {
      industry: form.industry,
      account_type: form.account_type,
      company_name: form.company_name,
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
      assigned: assignedName,
      assignto: form.assignto ? parseInt(form.assignto) : null,
      user_id: getLegacyUserId(profile),
      updated_at: new Date().toISOString(),
    }

    let result
    if (isEdit) {
      result = await supabase.from('customer').update(payload).eq('id', customer.id).select().single()
    } else {
      payload.created_at = new Date().toISOString()
      result = await supabase.from('customer').insert(payload).select().single()
    }

    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    logActivity({
      module: 'customers',
      action: isEdit ? 'update' : 'create',
      recordTable: 'customer',
      recordId: result.data.id,
      recordLabel: form.company_name,
      summary: `${isEdit ? 'Updated' : 'Created'} customer ${form.company_name}`,
      metadata: { assignto: form.assignto || null },
    })

    if (!isEdit) {
      const contactPayload = newContacts
        .filter(contact => [contact.first_name, contact.last_name, contact.mobile_number, contact.email].some(value => String(value || '').trim()))
        .map(contact => ({
          user_id: getLegacyUserId(profile),
          company_id: result.data.id,
          Salutation: contact.Salutation || null,
          first_name: contact.first_name || null,
          last_name: contact.last_name || null,
          position: contact.position || null,
          department_id: contact.department_id || null,
          mobile_number: contact.mobile_number || null,
          email: contact.email || null,
          address: contact.address || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }))
      if (contactPayload.length > 0) {
        const { error: contactError } = await supabase.from('contact').insert(contactPayload)
        if (contactError) { setError(`Customer saved, but contact creation failed: ${contactError.message}`); return }
      }
    }

    onSave(result.data)
  }

  const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const setContact = (idx, field, value) => setNewContacts(prev => prev.map((contact, itemIdx) => itemIdx === idx ? { ...contact, [field]: value } : contact))
  const addContact = () => setNewContacts(prev => [...prev, { ...emptyContact }])
  const removeContact = (idx) => setNewContacts(prev => prev.length === 1 ? [{ ...emptyContact }] : prev.filter((_, itemIdx) => itemIdx !== idx))

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onCancel} className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-xl font-semibold text-gray-900">{isEdit ? 'Edit Customer' : 'Add Customer'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 max-w-3xl">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">{error}</div>
        )}

        {/* Industry + Account Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>Industry</label>
            <select className={inputCls} value={form.industry} onChange={e => set('industry', e.target.value)}>
              <option value="">Please Select</option>
              {industries.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Account Type</label>
            <select className={inputCls} value={form.account_type} onChange={e => set('account_type', e.target.value)}>
              <option value="">Please Select</option>
              {accountTypes.map(a => <option key={a.id} value={a.type}>{a.type}</option>)}
            </select>
          </div>
        </div>

        {/* Company Name */}
        <div className="mb-4">
          <label className={labelCls}>Company Name <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Company Name" required />
        </div>

        {/* Address Lines */}
        <div className="mb-4">
          <label className={labelCls}>Address</label>
          <input className={inputCls} value={form.address1} onChange={e => set('address1', e.target.value)} placeholder="Street Address" />
        </div>
        <div className="mb-4">
          <input className={inputCls} value={form.address2} onChange={e => set('address2', e.target.value)} placeholder="Street Address Line 2 (optional)" />
        </div>

        {/* Country / State */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>Country</label>
            {countries.length > 0 ? (
              <select className={inputCls} value={form.country} onChange={e => setCountry(e.target.value)}>
                <option value="">— Select Country —</option>
                {countries.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            ) : (
              <input className={inputCls} value={form.country} onChange={e => setCountry(e.target.value)} placeholder="Country" />
            )}
          </div>
          <div>
            <label className={labelCls}>State</label>
            {states.length > 0 ? (
              <select className={inputCls} value={form.state} onChange={e => setState(e.target.value)}>
                <option value="">— Select State —</option>
                {states.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            ) : (
              <input className={inputCls} value={form.state} onChange={e => setState(e.target.value)}
                placeholder={form.country ? 'State / Province' : 'Select country first'} />
            )}
          </div>
        </div>

        {/* City / Postcode */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>City</label>
            {cities.length > 0 ? (
              <select className={inputCls} value={form.city} onChange={e => setCity(e.target.value)}>
                <option value="">— Select City —</option>
                {cities.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            ) : (
              <input className={inputCls} value={form.city} onChange={e => setCity(e.target.value)}
                placeholder={form.state ? 'City' : 'Select state first'} />
            )}
          </div>
          <div>
            <label className={labelCls}>Postal / Zip Code</label>
            <input className={inputCls} value={form.zipcode} onChange={e => set('zipcode', e.target.value)} placeholder="Postal/Zip Code" />
          </div>
        </div>

        {/* Office / Mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>Office Tel. No.</label>
            <input className={inputCls} value={form.office_number} onChange={e => set('office_number', e.target.value)} placeholder="Office number" />
          </div>
          <div>
            <label className={labelCls}>Phone Number</label>
            <input className={inputCls} value={form.mobile_number} onChange={e => set('mobile_number', e.target.value)} placeholder="Mobile number" />
          </div>
        </div>

        {/* Email / Website */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>Email</label>
            <input className={inputCls} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="example@example.com" />
          </div>
          <div>
            <label className={labelCls}>Website</label>
            <input className={inputCls} value={form.website} onChange={e => set('website', e.target.value)} placeholder="www.domain.com" />
          </div>
        </div>

        {/* Assigned To */}
        <div className="mb-6">
          <label className={labelCls}>Assigned To</label>
          <select className={inputCls} value={form.assignto} onChange={e => set('assignto', e.target.value)}>
            <option value="">Please Select</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
            ))}
          </select>
        </div>

        {!isEdit && (
          <div className="mb-6 border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contacts</h2>
              <button type="button" onClick={addContact} className="flex items-center gap-1 text-xs bg-red-600 text-white px-2.5 py-1.5 rounded hover:bg-red-700">
                <Plus size={12} /> Add Contact
              </button>
            </div>
            <div className="space-y-4">
              {newContacts.map((contact, idx) => (
                <div key={idx} className="border border-gray-200 rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-gray-500">Contact {idx + 1}</span>
                    <button type="button" onClick={() => removeContact(idx)} className="text-gray-400 hover:text-red-600"><X size={14} /></button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className={labelCls}>Salutation</label>
                      <input className={inputCls} value={contact.Salutation} onChange={e => setContact(idx, 'Salutation', e.target.value)} placeholder="Mr / Ms / Dr" />
                    </div>
                    <div>
                      <label className={labelCls}>First Name</label>
                      <input className={inputCls} value={contact.first_name} onChange={e => setContact(idx, 'first_name', e.target.value)} placeholder="First Name" />
                    </div>
                    <div>
                      <label className={labelCls}>Last Name</label>
                      <input className={inputCls} value={contact.last_name} onChange={e => setContact(idx, 'last_name', e.target.value)} placeholder="Last Name" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className={labelCls}>Position</label>
                      <input className={inputCls} value={contact.position} onChange={e => setContact(idx, 'position', e.target.value)} placeholder="Job title" />
                    </div>
                    <div>
                      <label className={labelCls}>Department</label>
                      <input className={inputCls} value={contact.department_id} onChange={e => setContact(idx, 'department_id', e.target.value)} placeholder="Department" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className={labelCls}>Mobile</label>
                      <input className={inputCls} value={contact.mobile_number} onChange={e => setContact(idx, 'mobile_number', e.target.value)} placeholder="Mobile number" />
                    </div>
                    <div>
                      <label className={labelCls}>Email</label>
                      <input className={inputCls} type="email" value={contact.email} onChange={e => setContact(idx, 'email', e.target.value)} placeholder="example@example.com" />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Address</label>
                    <input className={inputCls} value={contact.address} onChange={e => setContact(idx, 'address', e.target.value)} placeholder="Contact address" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
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

// ─── Customer Detail View ──────────────────────────────────────────────────────
function CustomerDetail({ customerId, onBack, onEdit }) {
  const [customer, setCustomer] = useState(null)
  const [contacts, setContacts] = useState([])
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: c }, { data: con }, { data: act }] = await Promise.all([
        supabase.from('customer').select('*').eq('id', customerId).single(),
        supabase.from('contact').select('*').eq('company_id', customerId).order('created_at', { ascending: false }),
        supabase.from('activity').select('*').eq('company_id', customerId).order('created_at', { ascending: false }),
      ])
      setCustomer(c)
      setContacts(con || [])
      setActivities(act || [])
      setLoading(false)
    }
    load()
  }, [customerId])

  if (loading) return <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Loading...</div>
  if (!customer) return <div className="text-gray-500 text-sm p-4">Customer not found.</div>

  const phone = customer.mobile_number || customer.office_number || '—'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm">
            <ArrowLeft size={16} /> Back
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Customer Information</h1>
        </div>
        <button onClick={onEdit}
          className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">
          <Pencil size={14} /> Edit
        </button>
      </div>

      {/* Account Info */}
      <div className="bg-white rounded-lg border border-gray-200 mb-4">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Account Information</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-10">
          <table className="text-sm w-full">
            <tbody>
              {[
                ['Customer Name', customer.company_name],
                ['Address', [customer.address1, customer.address2].filter(Boolean).join(', ') || '—'],
                ['City', customer.city || '—'],
                ['State', customer.state || '—'],
                ['Country', customer.country || '—'],
                ['Postcode', customer.zipcode || '—'],
                ['Phone', phone],
                ['Website', customer.website || '—'],
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
                ['Type', 'Customer'],
                ['Assigned To', customer.assigned || '—'],
                ['Industry', customer.industry || '—'],
                ['Account Type', customer.account_type || '—'],
                ['Email', customer.email || '—'],
                ['Created', fmt(customer.created_at)],
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

      {/* Contacts */}
      <div className="bg-white rounded-lg border border-gray-200 mb-4">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contacts</h2>
        </div>
        {contacts.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-400">No contacts linked to this customer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Name', 'Position', 'Mobile', 'Email', 'Created'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{c.first_name} {c.last_name}</td>
                    <td className="px-4 py-3 text-gray-600">{c.position || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.mobile_number || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{fmt(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Activity History */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Activity History</h2>
        </div>
        {activities.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-400">No activity history for this customer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Date & Time', 'Activity Type', 'Priority', 'Status', 'Description'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activities.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{fmt(a.created_at)}</td>
                    <td className="px-4 py-3 text-gray-600">{a.type || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{a.priority || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{a.status || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{a.description || '—'}</td>
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

// ─── Main Customers Page (List) ────────────────────────────────────────────────
const PAGE_SIZE = 30

export default function Customers() {
  const [view, setView] = useState('list')   // 'list' | 'form' | 'detail'
  const [selectedId, setSelectedId] = useState(null)
  const [editCustomer, setEditCustomer] = useState(null)

  const [customers, setCustomers] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState(null)
  const [deleteError, setDeleteError] = useState('')

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('customer').select(CUSTOMER_LIST_COLUMNS, { count: 'estimated' })
    if (search.trim()) q = q.ilike('company_name', `%${search.trim()}%`)
    q = q.order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    const { data, count, error } = await q
    if (!error) { setCustomers(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, page])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])
  useEffect(() => { setPage(0) }, [search])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handleDelete = async (id) => {
    setDeleteError('')
    const { data: quoteCheck } = await supabase.from('quotation').select('id').eq('companyid', id).limit(1)
    if (quoteCheck && quoteCheck.length > 0) {
      setDeleteError('Cannot delete: this customer has linked quotations.')
      return
    }
    await supabase.from('customer').delete().eq('id', id)
    logActivity({
      module: 'customers',
      action: 'delete',
      recordTable: 'customer',
      recordId: id,
      summary: `Deleted customer #${id}`,
    })
    setDeleteId(null)
    fetchCustomers()
  }

  const handleSaved = () => {
    setView('list')
    setEditCustomer(null)
    fetchCustomers()
  }

  const openEdit = async (c) => {
    // If we have the full object, use it; otherwise fetch
    if (c) { setEditCustomer(c); setView('form') }
    else {
      const { data } = await supabase.from('customer').select('*').eq('id', selectedId).single()
      if (data) { setEditCustomer(data); setView('form') }
    }
  }

  // ─── Sub-views ──────────────────────────────────────────────────────────────
  if (view === 'form') {
    return (
      <CustomerForm
        customer={editCustomer}
        onSave={handleSaved}
        onCancel={() => { setView('list'); setEditCustomer(null) }}
      />
    )
  }

  if (view === 'detail') {
    return (
      <CustomerDetail
        customerId={selectedId}
        onBack={() => setView('list')}
        onEdit={() => openEdit(null)}
      />
    )
  }

  // ─── List View ───────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Manage Customers</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} customer{total !== 1 ? 's' : ''} total</p>
        </div>
        <button
          onClick={() => { setEditCustomer(null); setView('form') }}
          className="flex items-center gap-2 px-4 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700"
        >
          <Plus size={16} /> Add Customer
        </button>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
            placeholder="Search by company name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {search && (
          <button onClick={() => setSearch('')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Industry</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Phone / Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Assigned To</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">Loading...</td></tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">
                    {search ? 'No customers match your search.' : 'No customers yet. Click "Add Customer" to get started.'}
                  </td>
                </tr>
              ) : (
                customers.map((c, idx) => {
                  const phone = c.mobile_number || c.office_number || ''
                  const addrParts = [c.address1, c.city, c.state].filter(Boolean)
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 text-xs">{page * PAGE_SIZE + idx + 1}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => { setSelectedId(c.id); setView('detail') }} className="text-left">
                          <div className="flex items-center gap-2">
                            <Building2 size={13} className="text-gray-400 flex-shrink-0" />
                            <span className="font-medium text-gray-900 hover:text-[#CC0000]">{c.company_name}</span>
                          </div>
                          {addrParts.length > 0 && (
                            <div className="text-xs text-gray-400 mt-0.5 pl-5">{addrParts.join(', ')}</div>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{c.industry || '—'}</td>
                      <td className="px-4 py-3">
                        {phone && (
                          <div className="flex items-center gap-1 text-gray-700 text-xs">
                            <Phone size={11} className="text-gray-400" />{phone}
                          </div>
                        )}
                        {c.email && (
                          <div className="flex items-center gap-1 text-gray-500 text-xs mt-0.5">
                            <Mail size={11} className="text-gray-400" />{c.email}
                          </div>
                        )}
                        {!phone && !c.email && <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{c.assigned || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmt(c.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setSelectedId(c.id); setView('detail') }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="View">
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => openEdit(c)}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Edit">
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => { setDeleteId(c.id); setDeleteError('') }}
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

        <PaginationControls page={page} totalPages={totalPages} total={total} label="customer" zeroBased onPageChange={setPage} className="px-4 py-3 border-t border-gray-200 bg-gray-50" />
      </div>

      {/* Delete Confirm Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Customer</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete this customer? This action cannot be undone.
            </p>
            {deleteError && (
              <p className="text-sm text-red-600 mb-3 bg-red-50 p-2 rounded">{deleteError}</p>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setDeleteId(null); setDeleteError('') }}
                className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
