import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, Search, Edit2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 15

const emptyForm = {
  date: new Date().toISOString().split('T')[0],
  ref_number: '', customername: '', sku: '',
  serial_number: '', warranty_period: '',
}

export default function SerialNumbers() {
  const { user } = useAuth()
  const [view, setView]         = useState('list')
  const [rows, setRows]         = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [editId, setEditId]     = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [skuList, setSkuList]   = useState([])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('serialnumber').select('*', { count: 'exact' }).order('id', { ascending: false })
    if (search) q = q.or(`serial_number.ilike.%${search}%,sku.ilike.%${search}%,customername.ilike.%${search}%`)
    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    const { data, count, error: err } = await q
    if (!err) { setRows(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, page])

  useEffect(() => { fetchRows() }, [fetchRows])

  useEffect(() => {
    supabase.from('goodsservices').select('id, sku').order('sku')
      .then(({ data }) => setSkuList(data || []))
  }, [])

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
      user_id: user?.id,
    }
    const { error: err } = editId
      ? await supabase.from('serialnumber').update(payload).eq('id', editId)
      : await supabase.from('serialnumber').insert([payload])
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); fetchRows(); setView('list')
  }

  const handleDelete = async (id) => {
    await supabase.from('serialnumber').delete().eq('id', id)
    setDeleteId(null); fetchRows()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (view === 'list') return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Serial Numbers</h1>
        <button onClick={openAdd} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700"><Plus size={16} /> New Record</button>
      </div>
      <div className="relative max-w-sm mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search serial, SKU or customer..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-red-400" />
      </div>
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
                <td className="px-4 py-3 text-gray-600">{r.date || '—'}</td>
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>{total} record{total !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="p-1 disabled:opacity-40"><ChevronLeft size={16}/></button>
            <span>Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="p-1 disabled:opacity-40"><ChevronRight size={16}/></button>
          </div>
        </div>
      )}
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
          <div className="col-span-2"><input type="text" value={form.customername} onChange={e => setForm(f => ({...f, customername: e.target.value}))} placeholder="Customer" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">SKU</label>
          <div className="col-span-2">
            <select value={form.sku} onChange={e => setForm(f => ({...f, sku: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">Please Select</option>
              {skuList.map(s => <option key={s.id} value={s.sku}>{s.sku}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Serial Number <span className="text-red-500">*</span></label>
          <div className="col-span-2"><input type="text" value={form.serial_number} onChange={e => setForm(f => ({...f, serial_number: e.target.value}))} required placeholder="SN-0001" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Warranty Period</label>
          <div className="col-span-2"><input type="text" value={form.warranty_period} onChange={e => setForm(f => ({...f, warranty_period: e.target.value}))} placeholder="e.g. 1 Year, 24 Months" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" /></div>
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
