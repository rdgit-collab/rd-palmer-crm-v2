import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react'

// Generic CRUD panel for simple name/type lookup tables
function LookupPanel({ title, tableName, valueField = 'name', extraField = null, extraLabel = null, extraType = 'text' }) {
  const { user } = useAuth()
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(false)
  const [adding, setAdding]       = useState(false)
  const [editId, setEditId]       = useState(null)
  const [newVal, setNewVal]       = useState('')
  const [newExtra, setNewExtra]   = useState('')
  const [editVal, setEditVal]     = useState('')
  const [editExtra, setEditExtra] = useState('')

  const fetch = async () => {
    setLoading(true)
    const { data } = await supabase.from(tableName).select('*').order(valueField)
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { fetch() }, [tableName])

  const handleAdd = async () => {
    if (!newVal.trim()) return
    const payload = { [valueField]: newVal.trim(), user_id: user?.id }
    if (extraField) payload[extraField] = newExtra
    await supabase.from(tableName).insert([payload])
    setNewVal(''); setNewExtra(''); setAdding(false); fetch()
  }

  const handleUpdate = async (id) => {
    const payload = { [valueField]: editVal }
    if (extraField) payload[extraField] = editExtra
    await supabase.from(tableName).update(payload).eq('id', id)
    setEditId(null); fetch()
  }

  const handleDelete = async (id) => {
    await supabase.from(tableName).delete().eq('id', id)
    fetch()
  }

  return (
    <div className="bg-white border border-gray-200 rounded overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs bg-red-600 text-white px-2.5 py-1.5 hover:bg-red-700">
          <Plus size={12} /> Add
        </button>
      </div>
      <div className="divide-y divide-gray-100">
        {loading ? <div className="px-4 py-6 text-sm text-gray-400 text-center">Loading...</div>
        : rows.length === 0 && !adding ? <div className="px-4 py-6 text-sm text-gray-400 text-center">No entries yet.</div>
        : null}

        {adding && (
          <div className="px-4 py-2 flex items-center gap-2 bg-red-50">
            <input autoFocus type="text" value={newVal} onChange={e => setNewVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder={`Enter ${valueField}...`}
              className="flex-1 border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-red-400" />
            {extraField && (
              <input type={extraType} value={newExtra} onChange={e => setNewExtra(e.target.value)}
                placeholder={extraLabel || extraField}
                className="w-24 border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-red-400" />
            )}
            <button onClick={handleAdd} className="text-green-600 hover:text-green-700"><Check size={16} /></button>
            <button onClick={() => { setAdding(false); setNewVal(''); setNewExtra('') }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
        )}

        {rows.map(r => (
          <div key={r.id} className="px-4 py-2 flex items-center gap-2 hover:bg-gray-50">
            {editId === r.id ? (
              <>
                <input autoFocus type="text" value={editVal} onChange={e => setEditVal(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleUpdate(r.id)}
                  className="flex-1 border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-red-400" />
                {extraField && (
                  <input type={extraType} value={editExtra} onChange={e => setEditExtra(e.target.value)}
                    placeholder={extraLabel || extraField}
                    className="w-24 border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-red-400" />
                )}
                <button onClick={() => handleUpdate(r.id)} className="text-green-600 hover:text-green-700"><Check size={15} /></button>
                <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600"><X size={15} /></button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-gray-800">{r[valueField]}</span>
                {extraField && <span className="text-xs text-gray-500 w-20">{r[extraField] || '—'}</span>}
                <button onClick={() => { setEditId(r.id); setEditVal(r[valueField]); setEditExtra(r[extraField] || '') }} className="text-gray-400 hover:text-gray-600 ml-auto"><Edit2 size={14} /></button>
                <button onClick={() => handleDelete(r.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const TABS = [
  { id: 'sales',   label: 'Sales' },
  { id: 'service', label: 'Service' },
  { id: 'finance', label: 'Finance' },
]

export default function Settings() {
  const [tab, setTab] = useState('sales')

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sales' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <LookupPanel title="Industries" tableName="industries" valueField="name" />
          <LookupPanel title="Account Types" tableName="account_type" valueField="type" />
          <LookupPanel title="Lead Sources" tableName="lead" valueField="name" />
          <LookupPanel title="Stages" tableName="stage" valueField="name" />
        </div>
      )}

      {tab === 'service' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <LookupPanel title="Ticket Categories" tableName="category" valueField="name" />
          <LookupPanel title="Service Types" tableName="service_type" valueField="type" />
        </div>
      )}

      {tab === 'finance' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <LookupPanel
            title="Taxes"
            tableName="tax"
            valueField="name"
            extraField="rate"
            extraLabel="Rate (%)"
            extraType="number"
          />
          <LookupPanel title="Payment Terms" tableName="payment_term" valueField="name" />
        </div>
      )}
    </div>
  )
}
