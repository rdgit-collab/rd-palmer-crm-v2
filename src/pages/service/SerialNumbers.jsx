import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { getLegacyUserId } from '../../lib/legacyUsers'
import SearchSelect from '../../components/SearchSelect'
import { logActivity } from '../../lib/activityLog'
import { formatDate } from '../../lib/dateFormat'
import PaginationControls from '../../components/PaginationControls'
import { Plus, Search, Edit2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 30
const SERIAL_COLUMNS = 'id, date, ref_number, customername, sku, serial_number, warranty_period'

const SEARCH_FIELDS = [
  { value: 'serial_number', label: 'Serial Number', placeholder: 'Search serial number...' },
  { value: 'sku', label: 'SKU', placeholder: 'Search SKU...' },
  { value: 'customername', label: 'Customer', placeholder: 'Search customer...' },
  { value: 'ref_number', label: 'Ref Number', placeholder: 'Search ref number...' },
]

const SORT_OPTIONS = [
  { value: 'latest', label: 'Latest Record' },
  { value: 'date_desc', label: 'Date Newest' },
  { value: 'date_asc', label: 'Date Oldest' },
]

const WARRANTY_PERIODS = [
  { value: '0', label: 'No Warranty' },
  { value: '1', label: '1 Year' },
  { value: '2', label: '2 Years' },
  { value: '3', label: '3 Years' },
]

const emptyForm = {
  date: new Date().toISOString().split('T')[0],
  ref_number: '', customername: '', sku: '',
  serial_number: '', warranty_period: '',
}

export default function SerialNumbers() {
  const { profile } = useAuth()
  const [view, setView]         = useState('list')
  const [rows, setRows]         = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [draftSearch, setDraftSearch] = useState('')
  const [searchField, setSearchField] = useState('serial_number')
  const [draftSearchField, setDraftSearchField] = useState('serial_number')
  const [sortMode, setSortMode] = useState('latest')
  const [loading, setLoading]   = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [editId, setEditId]     = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const fetchRows = useCallback(async () => {
    setLoading(true)
    setError('')
    const term = search.trim()
    const from = (page - 1) * PAGE_SIZE
    const to = page * PAGE_SIZE - 1
    const applySort = (query) => {
      if (sortMode === 'date_asc') {
        return query.order('date', { ascending: true, nullsFirst: false }).order('id', { ascending: false })
      }
      if (sortMode === 'date_desc') {
        return query.order('date', { ascending: false, nullsFirst: false }).order('id', { ascending: false })
      }
      return query.order('id', { ascending: false })
    }

    if (term) {
      const exactCountResult = await supabase
        .from('serialnumber')
        .select('id', { count: 'exact', head: true })
        .eq(searchField, term)

      if (exactCountResult.error) {
        setRows([])
        setTotal(0)
        setError(exactCountResult.error.message)
        setLoading(false)
        return
      }

      const exactCount = exactCountResult.count || 0

      if (exactCount > 0) {
        const exactResult = await applySort(supabase
          .from('serialnumber')
          .select(SERIAL_COLUMNS)
          .eq(searchField, term))
          .range(from, to)

        if (exactResult.error) {
          setRows([])
          setTotal(exactCount)
          setError(exactResult.error.message)
          setLoading(false)
          return
        }

        setRows(exactResult.data)
        setTotal(exactCount)
        setLoading(false)
        return
      }

      const fuzzyResult = await applySort(supabase
        .from('serialnumber')
        .select(SERIAL_COLUMNS, { count: 'estimated' })
        .ilike(searchField, `%${term}%`))
        .range(from, to)

      if (fuzzyResult.error) {
        setRows([])
        setTotal(0)
        setError(fuzzyResult.error.message)
        setLoading(false)
        return
      }

      const fuzzyRows = fuzzyResult.data || []
      setRows(fuzzyRows)
      setTotal(fuzzyResult.count || 0)
      setLoading(false)
      return
    }

    let q = supabase
      .from('serialnumber')
      .select(SERIAL_COLUMNS, { count: 'estimated' })

    q = applySort(q)
    q = q.range(from, to)
    const { data, count, error: err } = await q
    if (err) {
      setRows([])
      setTotal(0)
      setError(err.message)
    } else {
      setRows(data || [])
      setTotal(count || 0)
    }
    setLoading(false)
  }, [search, searchField, sortMode, page])

  useEffect(() => { fetchRows() }, [fetchRows])

  const openAdd = () => { setForm({ ...emptyForm, date: new Date().toISOString().split('T')[0] }); setEditId(null); setError(''); setView('form') }
  const openEdit = (r) => {
    setForm({
      date: r.date || '', ref_number: r.ref_number || '',
      customername: r.customername || '', sku: r.sku || '',
      serial_number: r.serial_number || '', warranty_period: r.warranty_period || '',
    })
    setEditId(r.id); setError(''); setView('form')
  }

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    const payload = {
      date: form.date || null, ref_number: form.ref_number || null,
      customername: form.customername || null, sku: form.sku || null,
      serial_number: form.serial_number, warranty_period: form.warranty_period || null,
      user_id: getLegacyUserId(profile),
    }
    const { error: err } = editId
      ? await supabase.from('serialnumber').update(payload).eq('id', editId)
      : await supabase.from('serialnumber').insert([payload])
    if (err) { setError(err.message); setSaving(false); return }
    logActivity({
      module: 'serial-numbers',
      action: editId ? 'update' : 'create',
      recordTable: 'serialnumber',
      recordId: editId || null,
      recordLabel: form.serial_number,
      summary: `${editId ? 'Updated' : 'Created'} serial number ${form.serial_number}`,
      metadata: { sku: form.sku || null, customername: form.customername || null },
    })
    setSaving(false); fetchRows(); setView('list')
  }

  const handleDelete = async (id) => {
    await supabase.from('serialnumber').delete().eq('id', id)
    logActivity({
      module: 'serial-numbers',
      action: 'delete',
      recordTable: 'serialnumber',
      recordId: id,
      summary: `Deleted serial number record #${id}`,
    })
    setDeleteId(null); fetchRows()
  }

  const applySearch = (e) => {
    e?.preventDefault()
    setSearchField(draftSearchField)
    setSearch(draftSearch.trim())
    setPage(1)
  }

  const clearSearch = () => {
    setDraftSearch('')
    setSearch('')
    setPage(1)
  }

  const changeSortMode = (value) => {
    setSortMode(value)
    setPage(1)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const activeSearchField = SEARCH_FIELDS.find(field => field.value === draftSearchField) || SEARCH_FIELDS[0]
  const hasCurrentWarrantyOption = !form.warranty_period || WARRANTY_PERIODS.some(w => w.value === form.warranty_period)

  if (view === 'list') return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Serial Numbers</h1>
        <button onClick={openAdd} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700"><Plus size={16} /> New Record</button>
      </div>
      <form onSubmit={applySearch} className="flex flex-col sm:flex-row gap-3 mb-4">
        <select
          value={draftSearchField}
          onChange={e => setDraftSearchField(e.target.value)}
          className="w-full sm:w-48 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
        >
          {SEARCH_FIELDS.map(field => (
            <option key={field.value} value={field.value}>{field.label}</option>
          ))}
        </select>
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder={activeSearchField.placeholder} value={draftSearch} onChange={e => setDraftSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-red-400" />
        </div>
        <select
          value={sortMode}
          onChange={e => changeSortMode(e.target.value)}
          className="w-full sm:w-40 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
        >
          {SORT_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button type="submit" disabled={loading} className="px-4 py-2 bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60">Search</button>
        {search && <button type="button" onClick={clearSearch} className="px-4 py-2 border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Clear</button>}
      </form>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      <div className="bg-white border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Serial Number</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">SKU</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Customer</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Date</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Ref Number</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Warranty</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">No serial number records found.</td></tr>
            : rows.map(r => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold text-red-600">{r.serial_number || '—'}</td>
                <td className="px-4 py-3 text-gray-700">{r.sku || '—'}</td>
                <td className="px-4 py-3 text-gray-700">{r.customername || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{formatDate(r.date)}</td>
                <td className="px-4 py-3 text-gray-600">{r.ref_number || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{r.warranty_period || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openEdit(r)} className="text-gray-500 hover:text-gray-700"><Edit2 size={15} /></button>
                    <button onClick={() => setDeleteId(r.id)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginationControls page={page} totalPages={totalPages} total={total} label="record" onPageChange={setPage} />
      {deleteId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"><div className="bg-white p-6 w-full max-w-sm shadow-lg"><h3 className="font-semibold mb-2">Delete Serial Number Record?</h3><div className="flex justify-end gap-3 mt-4"><button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-gray-200">Cancel</button><button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm bg-red-600 text-white">Delete</button></div></div></div>}
    </div>
  )

  if (view === 'form') return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
        <h1 className="text-2xl font-bold text-gray-900">{editId ? 'Edit Serial Number' : 'New Serial Number'}</h1>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      <form onSubmit={handleSave} className="bg-white border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Date</label>
          <div className="col-span-2"><input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Reference Number</label>
          <div className="col-span-2"><input type="text" value={form.ref_number} onChange={e => setForm(f => ({...f, ref_number: e.target.value}))} placeholder="INV/DO number" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Customer Name</label>
          <div className="col-span-2">
            <SearchSelect
              table="customer"
              searchColumn="company_name"
              valueKey="company_name"
              value={form.customername}
              displayLabel={form.customername}
              placeholder="Search customer…"
              onSelect={(val) => setForm(f => ({ ...f, customername: val || '' }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">SKU</label>
          <div className="col-span-2">
            <SearchSelect
              table="goodsservices"
              searchColumn="sku"
              valueKey="sku"
              value={form.sku}
              displayLabel={form.sku}
              placeholder="Search SKU…"
              onSelect={(val) => setForm(f => ({ ...f, sku: val || '' }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Serial Number <span className="text-red-500">*</span></label>
          <div className="col-span-2"><input type="text" value={form.serial_number} onChange={e => setForm(f => ({...f, serial_number: e.target.value}))} required placeholder="SN-0001" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Warranty Period</label>
          <div className="col-span-2">
            <select value={form.warranty_period} onChange={e => setForm(f => ({...f, warranty_period: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {!hasCurrentWarrantyOption && <option value={form.warranty_period}>{form.warranty_period}</option>}
              {WARRANTY_PERIODS.map(period => <option key={period.value} value={period.value}>{period.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={() => setView('list')} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="px-6 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">{saving ? 'Saving...' : editId ? 'Update' : 'Save'}</button>
        </div>
      </form>
    </div>
  )

  return null
}
