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

// ── Role Permissions Panel ────────────────────────────────────────
const SALES_MODULES = [
  { module: 'customers',  label: 'Customers' },
  { module: 'contacts',   label: 'Contacts' },
  { module: 'leads',      label: 'Sales Leads' },
  { module: 'activities', label: 'Activities' },
  { module: 'quotations', label: 'Quotations' },
  { module: 'invoices',   label: 'Invoices' },
]
const SERVICE_MODULES = [
  { module: 'tickets',       label: 'Tickets' },
  { module: 'tasks',         label: 'Tasks' },
  { module: 'onsite-tickets',label: 'Onsite Tickets' },
  { module: 'rma',           label: 'RMA' },
  { module: 'calibration',   label: 'Calibration' },
  { module: 'serial-numbers',label: 'Serial Numbers' },
]

function RolePermissionsPanel() {
  const [perms, setPerms] = useState({}) // { 'sales:customers': true, ... }
  const [saving, setSaving] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    supabase.from('module_permission').select('role_id, module, can_access')
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(p => { map[`${p.role_id}:${p.module}`] = p.can_access })
        setPerms(map)
        setLoaded(true)
      })
  }, [])

  const toggle = async (roleId, module) => {
    const key = `${roleId}:${module}`
    const current = perms[key] ?? true
    const next = !current
    setSaving(key)
    setPerms(prev => ({ ...prev, [key]: next }))
    await supabase.from('module_permission')
      .upsert({ role_id: roleId, module, can_access: next }, { onConflict: 'role_id,module' })
    setSaving(null)
  }

  if (!loaded) return <div className="text-sm text-gray-400 py-6 text-center">Loading permissions...</div>

  const ToggleRow = ({ roleId, module, label }) => {
    const key = `${roleId}:${module}`
    const on = perms[key] ?? true
    return (
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
        <span className="text-sm text-gray-800">{label}</span>
        <button
          onClick={() => toggle(roleId, module)}
          disabled={saving === key}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${on ? 'bg-red-600' : 'bg-gray-300'} disabled:opacity-50`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-1'}`} />
        </button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Sales Role */}
      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
          <h3 className="font-semibold text-gray-800 text-sm">Sales Role</h3>
          <span className="text-xs text-gray-400 ml-1">— control what Sales staff can access</span>
        </div>
        <div>
          {SALES_MODULES.map(m => <ToggleRow key={m.module} roleId={2} module={m.module} label={m.label} />)}
        </div>
      </div>

      {/* Service Role */}
      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          <h3 className="font-semibold text-gray-800 text-sm">Service Role</h3>
          <span className="text-xs text-gray-400 ml-1">— control what Service staff can access</span>
        </div>
        <div>
          {SERVICE_MODULES.map(m => <ToggleRow key={m.module} roleId={3} module={m.module} label={m.label} />)}
        </div>
      </div>

      <p className="col-span-full text-xs text-gray-400">
        Changes take effect the next time the user loads a page. Admin always has full access regardless of these settings.
      </p>
    </div>
  )
}

const TABS = [
  { id: 'sales',   label: 'Sales' },
  { id: 'service', label: 'Service' },
  { id: 'finance', label: 'Finance' },
  { id: 'roles',   label: 'Role Permissions' },
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

      {tab === 'roles' && <RolePermissionsPanel />}
    </div>
  )
}
