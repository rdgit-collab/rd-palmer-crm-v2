import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { getLegacyUserId } from '../../lib/legacyUsers'
import { logActivity } from '../../lib/activityLog'
import { applyTokenIlike, rankRowsBySearch } from '../../lib/searchUtils'
import PaginationControls from '../../components/PaginationControls'
import {
  Plus, Search, Pencil, Trash2, ArrowLeft, Save,
  X, ChevronLeft, ChevronRight, User
} from 'lucide-react'

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const PAGE_SIZE = 30

// ─── Contact Form (Add / Edit) ─────────────────────────────────────────────────
function ContactForm({ contact, onSave, onCancel }) {
  const isEdit = !!contact
  const { profile } = useAuth()
  const [customers, setCustomers] = useState([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerSearchedTerm, setCustomerSearchedTerm] = useState('')
  const [customerLoading, setCustomerLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    company_id: contact?.company_id ? String(contact.company_id) : '',
    Salutation: contact?.Salutation || '',
    first_name: contact?.first_name || '',
    last_name: contact?.last_name || '',
    department_id: contact?.department_id || '',
    position: contact?.position || '',
    mobile_number: contact?.mobile_number || '',
    email: contact?.email || '',
    address: contact?.address || '',
  })

  useEffect(() => {
    const loadSelectedCustomer = async () => {
      if (!contact?.company_id) return
      const { data } = await supabase
        .from('customer')
        .select('id, company_name')
        .eq('id', contact.company_id)
        .maybeSingle()
      if (!data) return
      setCustomers([data])
      setCustomerSearch(data.company_name || '')
    }
    loadSelectedCustomer()
  }, [contact?.company_id])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const searchCustomers = async () => {
    const term = customerSearch.trim()
    setCustomerSearchedTerm(term)
    set('company_id', '')
    setError('')
    if (term.length < 2) {
      setCustomers([])
      return
    }
    setCustomerLoading(true)
    try {
      let q = supabase
        .from('customer')
        .select('id, company_name')
        .order('company_name')
        .limit(100)
      q = applyTokenIlike(q, 'company_name', term)
      const { data, error: searchError } = await q
      if (searchError) throw searchError
      setCustomers(rankRowsBySearch(data || [], 'company_name', term).slice(0, 30))
    } catch (searchError) {
      setCustomers([])
      setError(searchError.message || 'Unable to search customers.')
    } finally {
      setCustomerLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.company_id) { setError('Please search and select a company.'); return }
    if (!form.first_name.trim()) { setError('First name is required'); return }
    if (!form.mobile_number.trim() && !form.email.trim()) {
      setError('Please enter at least a mobile number or email address.')
      return
    }
    setSaving(true); setError('')

    const payload = {
      company_id: form.company_id ? parseInt(form.company_id) : null,
      Salutation: form.Salutation,
      first_name: form.first_name,
      last_name: form.last_name,
      department_id: form.department_id,
      position: form.position,
      mobile_number: form.mobile_number,
      email: form.email,
      address: form.address,
      user_id: contact?.user_id || getLegacyUserId(profile),
      updated_at: new Date().toISOString(),
    }

    let result
    if (isEdit) {
      result = await supabase.from('contact').update(payload).eq('id', contact.id).select().single()
    } else {
      payload.created_at = new Date().toISOString()
      result = await supabase.from('contact').insert(payload).select().single()
    }

    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    logActivity({
      module: 'contacts',
      action: isEdit ? 'update' : 'create',
      recordTable: 'contact',
      recordId: result.data.id,
      recordLabel: `${form.first_name} ${form.last_name}`.trim(),
      summary: `${isEdit ? 'Updated' : 'Created'} contact ${`${form.first_name} ${form.last_name}`.trim()}`,
      metadata: { company_id: form.company_id || null },
    })
    onSave(result.data)
  }

  const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onCancel} className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-xl font-semibold text-gray-900">{isEdit ? 'Edit Contact' : 'Add Contact'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 max-w-2xl">
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">{error}</div>}

        {/* Company */}
        <div className="mb-4">
          <label className={labelCls}>Company Name <span className="text-red-500">*</span></label>
          <div className="flex gap-2 mb-2">
            <input
              className={inputCls}
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchCustomers() } }}
              placeholder="Type company name..."
            />
            <button type="button" onClick={searchCustomers} className="px-3 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700">
              Search
            </button>
          </div>
          <select className={inputCls} value={form.company_id} onChange={e => set('company_id', e.target.value)} disabled={customerLoading || customers.length === 0} required>
            <option value="">Please Select</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
          {customerLoading && <p className="mt-1 text-xs text-gray-400">Searching customers...</p>}
          {!customerLoading && customerSearchedTerm.length > 0 && customerSearchedTerm.length < 2 && (
            <p className="mt-1 text-xs text-gray-400">Type at least 2 characters before searching.</p>
          )}
          {!customerLoading && customerSearchedTerm.length >= 2 && customers.length === 0 && (
            <p className="mt-1 text-xs text-gray-400">No matching customers found.</p>
          )}
          {!customerLoading && customerSearchedTerm.length >= 2 && customers.length > 0 && (
            <p className="mt-1 text-xs text-gray-400">{customers.length} matching customer{customers.length === 1 ? '' : 's'} found.</p>
          )}
        </div>

        {/* Salutation */}
        <div className="mb-4">
          <label className={labelCls}>Salutation</label>
          <input className={inputCls} value={form.Salutation} onChange={e => set('Salutation', e.target.value)} placeholder="e.g. Mr, Ms, Dr" />
        </div>

        {/* First / Last Name */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>First Name <span className="text-red-500">*</span></label>
            <input className={inputCls} value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="First Name" required />
          </div>
          <div>
            <label className={labelCls}>Last Name</label>
            <input className={inputCls} value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Last Name" />
          </div>
        </div>

        {/* Department / Position */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>Department</label>
            <input className={inputCls} value={form.department_id} onChange={e => set('department_id', e.target.value)} placeholder="Department Name" />
          </div>
          <div>
            <label className={labelCls}>Position</label>
            <input className={inputCls} value={form.position} onChange={e => set('position', e.target.value)} placeholder="Job Title / Position" />
          </div>
        </div>

        {/* Mobile / Email */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={labelCls}>Mobile Number <span className="text-red-500">*</span></label>
            <input className={inputCls} value={form.mobile_number} onChange={e => set('mobile_number', e.target.value)} placeholder="Mobile number" />
          </div>
          <div>
            <label className={labelCls}>Email <span className="text-red-500">*</span></label>
            <input className={inputCls} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="Email address" />
          </div>
        </div>
        <p className="-mt-2 mb-4 text-xs text-gray-500">Fill in at least one: mobile number or email.</p>

        {/* Address */}
        <div className="mb-6">
          <label className={labelCls}>Address</label>
          <input className={inputCls} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Address (optional)" />
        </div>

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

// ─── Main Contacts Page ────────────────────────────────────────────────────────
export default function Contacts() {
  const [view, setView] = useState('list')
  const [editContact, setEditContact] = useState(null)

  const [contacts, setContacts] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [searchField, setSearchField] = useState('name')
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState(null)

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    const term = submittedSearch.trim()
    const { data, error } = await supabase.rpc('search_contacts', {
      p_search: term,
      p_search_field: searchField,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    })
    if (!error) {
      const contactRows = data || []
      setContacts(contactRows.map(c => ({
        ...c,
        customer: c.company_name ? { id: c.company_id, company_name: c.company_name } : null,
      })))
      setTotal(contactRows[0]?.total_count || 0)
    }
    setLoading(false)
  }, [submittedSearch, searchField, page])

  useEffect(() => { fetchContacts() }, [fetchContacts])
  useEffect(() => { setPage(0) }, [submittedSearch, searchField])
  const runSearch = () => {
    setSubmittedSearch(search.trim())
    setPage(0)
  }
  const clearSearch = () => {
    setSearch('')
    setSubmittedSearch('')
    setPage(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handleDelete = async (id) => {
    await supabase.from('contact').delete().eq('id', id)
    logActivity({
      module: 'contacts',
      action: 'delete',
      recordTable: 'contact',
      recordId: id,
      summary: `Deleted contact #${id}`,
    })
    setDeleteId(null)
    fetchContacts()
  }

  const handleSaved = () => {
    setView('list')
    setEditContact(null)
    fetchContacts()
  }

  if (view === 'form') {
    return (
      <ContactForm
        contact={editContact}
        onSave={handleSaved}
        onCancel={() => { setView('list'); setEditContact(null) }}
      />
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Manage Contacts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} contact{total !== 1 ? 's' : ''} total</p>
        </div>
        <button
          onClick={() => { setEditContact(null); setView('form') }}
          className="flex w-full items-center justify-center gap-2 px-4 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700 sm:w-auto"
        >
          <Plus size={16} /> Add Contact
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <select
          className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
          value={searchField}
          onChange={e => setSearchField(e.target.value)}
        >
          <option value="name">Contact Name</option>
          <option value="company">Company Name</option>
        </select>
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
            placeholder={searchField === 'company' ? 'Search by company name...' : 'Search by contact name...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runSearch() }}
          />
        </div>
        <button onClick={runSearch} className="flex items-center gap-1.5 px-3 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700">
          <Search size={14} /> Search
        </button>
        {(search || submittedSearch) && (
          <button onClick={clearSearch} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Company</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Department</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Position</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Mobile</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">Loading...</td></tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">
                    {search ? 'No contacts match your search.' : 'No contacts yet. Click "Add Contact" to get started.'}
                  </td>
                </tr>
              ) : (
                contacts.map((c, idx) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 text-xs">{page * PAGE_SIZE + idx + 1}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-gray-700">
                        {c.customer?.company_name || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <User size={13} className="text-gray-400" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 text-xs">
                            {[c.Salutation, c.first_name, c.last_name].filter(Boolean).join(' ')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.department_id || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.position || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.mobile_number || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmt(c.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setEditContact(c); setView('form') }}
                          className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteId(c.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls page={page} totalPages={totalPages} total={total} label="contact" zeroBased onPageChange={setPage} className="px-4 py-3 border-t border-gray-200 bg-gray-50" />
      </div>

      {/* Delete Confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Contact</h3>
            <p className="text-sm text-gray-600 mb-4">Are you sure you want to delete this contact? This cannot be undone.</p>
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
