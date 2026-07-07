import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { logActivity } from '../../lib/activityLog'

const SALES_MODULES = [
  { module: 'customers', label: 'Customers' },
  { module: 'contacts', label: 'Contacts' },
  { module: 'leads', label: 'Sales Leads' },
  { module: 'activities', label: 'Activities' },
  { module: 'quotations', label: 'Quotations' },
  { module: 'invoices', label: 'Invoices' },
  { module: 'tickets', label: 'Tickets' },
  { module: 'tasks', label: 'Tasks' },
  { module: 'booking', label: 'Booking' },
  { module: 'training', label: 'Training' },
]

const SERVICE_MODULES = [
  { module: 'tickets', label: 'Tickets' },
  { module: 'tasks', label: 'Tasks' },
  { module: 'onsite-tickets', label: 'On-Site' },
  { module: 'rma', label: 'RMA' },
  { module: 'calibration', label: 'Calibration' },
  { module: 'serial-numbers', label: 'Serial Numbers' },
  { module: 'booking', label: 'Booking' },
  { module: 'training', label: 'Training' },
]

export default function RolePermissionsPanel() {
  const [perms, setPerms] = useState({})
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
    logActivity({
      module: 'users',
      action: 'permission_change',
      recordTable: 'module_permission',
      recordId: `${roleId}:${module}`,
      recordLabel: `${module} role ${roleId}`,
      summary: `${next ? 'Enabled' : 'Disabled'} ${module} access for role ${roleId}`,
      metadata: { role_id: roleId, permission_module: module, can_access: next },
    })
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
          type="button"
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
          <h3 className="font-semibold text-gray-800 text-sm">Sales Role</h3>
          <span className="text-xs text-gray-400 ml-1">- control what Sales staff can access</span>
        </div>
        <div>
          {SALES_MODULES.map(m => <ToggleRow key={m.module} roleId={2} module={m.module} label={m.label} />)}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
          <h3 className="font-semibold text-gray-800 text-sm">Sales Manager Role</h3>
          <span className="text-xs text-gray-400 ml-1">- same sales modules with manager access</span>
        </div>
        <div>
          {SALES_MODULES.map(m => <ToggleRow key={m.module} roleId={4} module={m.module} label={m.label} />)}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
          <h3 className="font-semibold text-gray-800 text-sm">Water Dep Role</h3>
          <span className="text-xs text-gray-400 ml-1">- sales modules shared across the Water Dep team</span>
        </div>
        <div>
          {SALES_MODULES.map(m => <ToggleRow key={m.module} roleId={5} module={m.module} label={m.label} />)}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          <h3 className="font-semibold text-gray-800 text-sm">Service Role</h3>
          <span className="text-xs text-gray-400 ml-1">- control what Service staff can access</span>
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
