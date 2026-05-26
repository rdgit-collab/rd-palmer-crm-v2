import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { LayoutDashboard, Building2, UserCircle, TrendingUp, FileText, Receipt, Activity, Ticket, Wrench, MapPin, RotateCcw, Gauge, Hash, Package, Settings, Users, X } from 'lucide-react'

const salesItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Customers', href: '/customers', icon: Building2 },
  { name: 'Contacts', href: '/contacts', icon: UserCircle },
  { name: 'Sales Leads', href: '/leads', icon: TrendingUp },
  { name: 'Activities', href: '/activities', icon: Activity },
  { name: 'Quotations', href: '/quotations', icon: FileText },
  { name: 'Invoices', href: '/invoices', icon: Receipt },
]
const serviceItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Tickets', href: '/tickets', icon: Ticket },
  { name: 'Tasks', href: '/tasks', icon: Wrench },
  { name: 'Onsite Tickets', href: '/onsite-tickets', icon: MapPin },
  { name: 'RMA', href: '/rma', icon: RotateCcw },
  { name: 'Calibration', href: '/calibration', icon: Gauge },
  { name: 'Serial Numbers', href: '/serial-numbers', icon: Hash },
]
const adminItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { divider: 'SALES' },
  { name: 'Customers', href: '/customers', icon: Building2 },
  { name: 'Contacts', href: '/contacts', icon: UserCircle },
  { name: 'Sales Leads', href: '/leads', icon: TrendingUp },
  { name: 'Activities', href: '/activities', icon: Activity },
  { name: 'Quotations', href: '/quotations', icon: FileText },
  { name: 'Invoices', href: '/invoices', icon: Receipt },
  { divider: 'SERVICE' },
  { name: 'Tickets', href: '/tickets', icon: Ticket },
  { name: 'Tasks', href: '/tasks', icon: Wrench },
  { name: 'Onsite Tickets', href: '/onsite-tickets', icon: MapPin },
  { name: 'RMA', href: '/rma', icon: RotateCcw },
  { name: 'Calibration', href: '/calibration', icon: Gauge },
  { name: 'Serial Numbers', href: '/serial-numbers', icon: Hash },
  { divider: 'ADMIN' },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Catalogue', href: '/catalogue', icon: Package },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export default function Sidebar({ open, onClose }) {
  const { profile } = useAuth()
  const location = useLocation()
  const items = profile?.role_id === 1 ? adminItems : profile?.role_id === 2 ? salesItems : serviceItems
  const roleLabel = profile?.role_id === 1 ? 'Admin' : profile?.role_id === 2 ? 'Sales' : 'Service'

  return (
    <>
      {open && <div className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden" onClick={onClose} />}
      <div className={`fixed left-0 top-0 h-full w-64 bg-[#111111] z-30 flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#CC0000] rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">RD</span>
            </div>
            <span className="text-white font-semibold text-sm">RD Palmer CRM</span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white lg:hidden"><X size={18} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {items.map((item, i) => {
            if (item.divider) return (
              <div key={i} className="px-4 pt-5 pb-1">
                <span className="text-gray-500 text-xs font-semibold tracking-widest">{item.divider}</span>
              </div>
            )
            const active = location.pathname === item.href
            const Icon = item.icon
            return (
              <Link key={item.href} to={item.href} onClick={onClose}
                className={`flex items-center gap-3 mx-2 px-3 py-2.5 rounded text-sm transition-colors mb-0.5 ${active ? 'bg-[#CC0000] text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}>
                <Icon size={15} />{item.name}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-gray-800 px-4 py-3">
          <div className="text-xs text-gray-500">Signed in as</div>
          <div className="text-sm text-white font-medium truncate">{profile?.first_name} {profile?.last_name}</div>
          <div className="text-xs text-[#CC0000]">{roleLabel}</div>
        </div>
      </div>
    </>
  )
}
