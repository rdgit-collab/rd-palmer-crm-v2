import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import {
  LayoutDashboard, Building2, UserCircle, TrendingUp, FileText, Receipt,
  Activity, Ticket, Wrench, MapPin, RotateCcw, Gauge, Hash, Package,
  Settings, Users, X, User, LogOut,
} from 'lucide-react'

const salesItems = [
  { name: 'Dashboard',    href: '/sales-dashboard', icon: LayoutDashboard },
  { name: 'Customers',    href: '/customers',        icon: Building2,   module: 'customers' },
  { name: 'Contacts',     href: '/contacts',         icon: UserCircle,  module: 'contacts' },
  { name: 'Sales Leads',  href: '/leads',            icon: TrendingUp,  module: 'leads' },
  { name: 'Activities',   href: '/activities',       icon: Activity,    module: 'activities' },
  { name: 'Quotations',   href: '/quotations',       icon: FileText,    module: 'quotations' },
  { name: 'Invoices',     href: '/invoices',         icon: Receipt,     module: 'invoices' },
]

const serviceItems = [
  { name: 'Dashboard',      href: '/service-dashboard', icon: LayoutDashboard },
  { name: 'Tickets',        href: '/tickets',            icon: Ticket,       module: 'tickets' },
  { name: 'Tasks',          href: '/tasks',              icon: Wrench,       module: 'tasks' },
  { name: 'Onsite Tickets', href: '/onsite-tickets',     icon: MapPin,       module: 'onsite-tickets' },
  { name: 'RMA',            href: '/rma',                icon: RotateCcw,    module: 'rma' },
  { name: 'Calibration',    href: '/calibration',        icon: Gauge,        module: 'calibration' },
  { name: 'Serial Numbers', href: '/serial-numbers',     icon: Hash,         module: 'serial-numbers' },
]

const adminItems = [
  { name: 'Overview',  href: '/', icon: LayoutDashboard },
  { divider: 'SALES' },
  { name: 'Sales Dashboard', href: '/sales-dashboard', icon: LayoutDashboard },
  { name: 'Customers',   href: '/customers',  icon: Building2   },
  { name: 'Contacts',    href: '/contacts',   icon: UserCircle  },
  { name: 'Sales Leads', href: '/leads',      icon: TrendingUp  },
  { name: 'Activities',  href: '/activities', icon: Activity    },
  { name: 'Quotations',  href: '/quotations', icon: FileText    },
  { name: 'Invoices',    href: '/invoices',   icon: Receipt     },
  { divider: 'SERVICE' },
  { name: 'Service Dashboard', href: '/service-dashboard', icon: LayoutDashboard },
  { name: 'Tickets',        href: '/tickets',        icon: Ticket   },
  { name: 'Tasks',          href: '/tasks',          icon: Wrench   },
  { name: 'Onsite Tickets', href: '/onsite-tickets', icon: MapPin   },
  { name: 'RMA',            href: '/rma',            icon: RotateCcw},
  { name: 'Calibration',    href: '/calibration',    icon: Gauge    },
  { name: 'Serial Numbers', href: '/serial-numbers', icon: Hash     },
  { divider: 'ADMIN' },
  { name: 'Users',     href: '/admin/users', icon: Users   },
  { name: 'Catalogue', href: '/catalogue',   icon: Package },
  { name: 'Settings',  href: '/settings',    icon: Settings},
]

export default function Sidebar({ open, onClose }) {
  const { profile, signOut, hasPermission } = useAuth()
  const location = useLocation()

  const roleLabel = profile?.role_id === 1 ? 'Admin' : profile?.role_id === 2 ? 'Sales' : 'Service'

  // Pick the base item list for this role
  const baseItems = profile?.role_id === 1
    ? adminItems
    : profile?.role_id === 2
    ? salesItems
    : serviceItems

  // Filter out items the user doesn't have permission to see.
  // Admin items have no `module` key so they always pass.
  // Dividers are kept if at least one following item passes (handled below).
  const filteredItems = baseItems.reduce((acc, item) => {
    if (item.divider) {
      acc.push({ ...item, _divider: true })
      return acc
    }
    // Dashboard (no module) always visible
    if (!item.module) { acc.push(item); return acc }
    // Check permission
    if (hasPermission(item.module)) { acc.push(item); return acc }
    return acc
  }, [])

  // Remove dangling dividers (a divider with no items after it before the next divider/end)
  const visibleItems = filteredItems.filter((item, idx) => {
    if (!item._divider) return true
    // Look ahead: is there at least one non-divider item before the next divider?
    for (let i = idx + 1; i < filteredItems.length; i++) {
      if (filteredItems[i]._divider) break
      if (!filteredItems[i]._divider) return true
    }
    return false
  })

  return (
    <>
      {open && <div className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden" onClick={onClose} />}
      <div className={`fixed left-0 top-0 h-full w-64 bg-[#111111] z-30 flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>

        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#CC0000] rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">RD</span>
            </div>
            <span className="text-white font-semibold text-sm">RD Palmer CRM</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white lg:hidden"><X size={18} /></button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3">
          {visibleItems.map((item, i) => {
            if (item.divider || item._divider) return (
              <div key={i} className="px-4 pt-5 pb-1">
                <span className="text-gray-500 text-xs font-semibold tracking-widest">{item.divider}</span>
              </div>
            )
            const active = location.pathname === item.href
            const Icon = item.icon
            return (
              <Link key={item.href} to={item.href} onClick={onClose}
                className={`flex items-center gap-3 mx-2 px-3 py-2.5 rounded text-sm transition-colors mb-0.5 ${
                  active ? 'bg-[#CC0000] text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}>
                <Icon size={15} />{item.name}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-800 px-3 py-3 space-y-1">
          <div className="px-2 pb-1">
            <div className="text-xs text-gray-500">Signed in as</div>
            <div className="text-sm text-white font-medium truncate">{profile?.first_name} {profile?.last_name}</div>
            <div className="text-xs text-[#CC0000]">{roleLabel}</div>
          </div>
          <Link to="/profile" onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
              location.pathname === '/profile' ? 'bg-[#CC0000] text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}>
            <User size={14} /> My Profile
          </Link>
          <button onClick={signOut}
            className="flex items-center gap-3 w-full px-3 py-2 rounded text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors">
            <LogOut size={14} /> Sign Out
          </button>
        </div>

      </div>
    </>
  )
}
