import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { getLegacyUserId } from '../../lib/legacyUsers'
import { Plus, Search, Eye, Edit2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 15

const emptyForm = {
  type: 'Goods', name: '', sku: '', price: '',
  qty: '', description: '', category: '',
  model: '', manufacture: '', item_type: '', tax: '',
}

export default function Catalogue() {
  const { profile } = useAuth()
  const [view, setView]         = useState('list')
  const [rows, setRows]         = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [typeFilter, setTF]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const [editId, setEditId]     = useState(null)
  const [detail, setDetail]     = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  // Lookup data for dropdowns
  const [categories, setCategories]       = useState([])
  const [models, setModels]               = useState([])
  const [manufacturers, setManufacturers] = useState([])

  useEffect(() => {
    supabase.from('product_category').select('id, name').order('name').then(({ data }) => setCategories(data || []))
    supabase.from('product_model').select('id, name').order('name').then(({ data }) => setModels(data || []))
    supabase.from('product_manufacturer').select('id, name').order('name').then(({ data }) => setManufacturers(data || []))
  }, [])

  const fetchRows = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('goodsservices').select('*', { count: 'exact' }).order('name')
    if (search)     q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
    if (typeFilter) q = q.eq('type', typeFilter)
    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    const { data, count, error: err } = await q
    if (!err) { setRows(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, typeFilter, page])

  useEffect(() => { fetchRows() }, [fetchRows])

  const openAdd = () => { setForm(emptyForm); setEditId(null); setError(''); setView('form') }
  const openView = (r) => {
    setDetail(r)
    setError('')
    setView('detail')
  }
  const openEdit = (r) => {
    setForm({
      type: r.type || 'Goods', name: r.name || '', sku: r.sku || '',
      price: r.price || '', qty: r.qty || '', description: r.description || '',
      category: r.category || '', model: r.model || '',
      manufacture: r.manufacture || '', item_type: r.item_type || '', tax: r.tax || '',
    })
    setEditId(r.id); setError(''); setView('form')
  }

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true); setError('')
    const payload = {
      type: form.type, name: form.name, sku: form.sku || null,
      price: form.price || null, qty: form.qty || null,
      description: form.description || null, category: form.category || null,
      model: form.model || null, manufacture: form.manufacture || null,
      item_type: form.item_type || null, tax: form.tax || null,
      user_id: getLegacyUserId(profile),
    }
    const { error: err } = editId
      ? await supabase.from('goodsservices').update(payload).eq('id', editId)
      : await supabase.from('goodsservices').insert([payload])
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false); fetchRows(); setView('list')
  }

  const handleDelete = async (id) => {
    await supabase.from('goodsservices').delete().eq('id', id)
    setDeleteId(null); fetchRows()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (view === 'list') return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Catalogue</h1>
        <button onClick={openAdd} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700"><Plus size={16} /> Add Item</button>
      </div>
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search name or SKU..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-red-400" />
        </div>
        <select value={typeFilter} onChange={e => { setTF(e.target.value); setPage(1) }} className="border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
          <option value="">All Types</option>
          <option>Goods</option>
          <option>Services</option>
        </select>
      </div>
      <div className="bg-white border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">SKU</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Type</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Price (MYR)</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Qty</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Category</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">Loading...</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="text-center py-12 text-gray-400">No items found.</td></tr>
            : rows.map(r => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                <td className="px-4 py-3 text-red-600 font-medium">{r.sku || '—'}</td>
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 text-xs rounded ${r.type === 'Services' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{r.type}</span></td>
                <td className="px-4 py-3 text-gray-700">{r.price ? `MYR ${parseFloat(r.price).toFixed(2)}` : '—'}</td>
                <td className="px-4 py-3 text-gray-600">{r.qty || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{r.category || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openView(r)} className="text-gray-500 hover:text-blue-600" title="View"><Eye size={15} /></button>
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
          <span>{total} item{total !== 1 ? 's' : ''}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="p-1 disabled:opacity-40"><ChevronLeft size={16}/></button>
            <span>Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages} className="p-1 disabled:opacity-40"><ChevronRight size={16}/></button>
          </div>
        </div>
      )}
      {deleteId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"><div className="bg-white p-6 w-full max-w-sm shadow-lg"><h3 className="font-semibold mb-2">Delete Item?</h3><p className="text-sm text-gray-600 mb-4">This cannot be undone.</p><div className="flex justify-end gap-3"><button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-gray-200">Cancel</button><button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm bg-red-600 text-white">Delete</button></div></div></div>}
    </div>
  )

  if (view === 'detail' && detail) return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => { setDetail(null); setView('list') }} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
          <h1 className="text-2xl font-bold text-gray-900">Catalogue Item</h1>
          <span className={`inline-block px-2 py-0.5 text-xs rounded ${detail.type === 'Services' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{detail.type || '—'}</span>
        </div>
        <button onClick={() => openEdit(detail)} className="flex items-center gap-2 border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
          <Edit2 size={14} /> Edit
        </button>
      </div>

      <div className="bg-white border border-gray-200 p-6 space-y-5">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Item Name</p>
          <p className="mt-1 text-lg font-semibold text-gray-900">{detail.name || '—'}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
          {[
            ['SKU', detail.sku],
            ['Price', detail.price ? `MYR ${parseFloat(detail.price).toFixed(2)}` : '—'],
            ['Quantity', detail.qty],
            ['Category', detail.category],
            ['Model', detail.model],
            ['Manufacturer', detail.manufacture],
            ['Item Type', detail.item_type],
            ['Tax', detail.tax],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-xs font-medium text-gray-500">{label}</p>
              <p className="mt-1 text-gray-900">{value || '—'}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{detail.description || '—'}</p>
        </div>
      </div>
    </div>
  )

  if (view === 'form') return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
        <h1 className="text-2xl font-bold text-gray-900">{editId ? 'Edit Item' : 'Add Item'}</h1>
      </div>
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
      <form onSubmit={handleSave} className="bg-white border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Type <span className="text-red-500">*</span></label>
          <div className="col-span-2">
            <select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option>Goods</option><option>Services</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Name <span className="text-red-500">*</span></label>
          <div className="col-span-2"><input type="text" value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} required placeholder="Item name" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">SKU</label>
          <div className="col-span-2"><input type="text" value={form.sku} onChange={e => setForm(f => ({...f, sku: e.target.value}))} placeholder="SKU code" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Price (MYR)</label>
          <div className="col-span-2"><input type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({...f, price: e.target.value}))} placeholder="0.00" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Quantity</label>
          <div className="col-span-2"><input type="text" value={form.qty} onChange={e => setForm(f => ({...f, qty: e.target.value}))} placeholder="Stock quantity" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Category</label>
          <div className="col-span-2">
            <select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">— Select Category —</option>
              {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            {categories.length === 0 && <p className="text-xs text-gray-400 mt-1">No categories yet — add them in Settings → Catalogue.</p>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Model</label>
          <div className="col-span-2">
            <select value={form.model} onChange={e => setForm(f => ({...f, model: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">— Select Model —</option>
              {models.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
            {models.length === 0 && <p className="text-xs text-gray-400 mt-1">No models yet — add them in Settings → Catalogue.</p>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Manufacturer</label>
          <div className="col-span-2">
            <select value={form.manufacture} onChange={e => setForm(f => ({...f, manufacture: e.target.value}))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
              <option value="">— Select Manufacturer —</option>
              {manufacturers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
            {manufacturers.length === 0 && <p className="text-xs text-gray-400 mt-1">No manufacturers yet — add them in Settings → Catalogue.</p>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 items-center">
          <label className="text-sm font-medium text-gray-700">Item Type</label>
          <div className="col-span-2"><input type="text" value={form.item_type} onChange={e => setForm(f => ({...f, item_type: e.target.value}))} placeholder="Item type" className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <label className="text-sm font-medium text-gray-700 pt-2">Description</label>
          <div className="col-span-2"><textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} rows={3} placeholder="Description..." className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" /></div>
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
