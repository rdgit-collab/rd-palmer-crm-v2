import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Ticket, FileText, Receipt, ClipboardList, Users, AlertTriangle, Activity } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function StatCard({ label, value, icon: Icon, color, bg, to }) {
  const inner = (
    <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 hover:border-gray-300 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: bg }}>
          <Icon size={15} style={{ color }} />
        </div>
      </div>
      <div className="text-3xl font-bold text-[#111111]">{value}</div>
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

function activityTypeColor(type) {
  switch (type) {
    case 'Call':       return 'bg-blue-100 text-blue-700'
    case 'Meeting':    return 'bg-purple-100 text-purple-700'
    case 'Follow-Up':  return 'bg-yellow-100 text-yellow-700'
    case 'Email':      return 'bg-green-100 text-green-700'
    case 'Visit':      return 'bg-orange-100 text-orange-700'
    default:           return 'bg-gray-100 text-gray-600'
  }
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({
    customers: 0, openTickets: 0, quotations: 0, invoices: 0,
    openTasks: 0, leads: 0, overdueInvoices: 0,
  })
  const [recentActivities, setRecentActivities] = useState([])
  const [recentTickets, setRecentTickets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().split('T')[0]
      const [
        custR, tickR, quotR, invR,
        taskR, leadR, overdueR,
        actR, recentTickR,
      ] = await Promise.all([
        supabase.from('customer').select('*', { count: 'exact', head: true }),
        supabase.from('ticket').select('*', { count: 'exact', head: true }).eq('is_completed', 0),
        supabase.from('quotation').select('*', { count: 'exact', head: true }),
        supabase.from('invoice').select('*', { count: 'exact', head: true }),
        supabase.from('task').select('*', { count: 'exact', head: true }).eq('is_completed', 0),
        supabase.from('sales_lead').select('*', { count: 'exact', head: true }),
        supabase.from('invoice').select('*', { count: 'exact', head: true })
          .eq('status', 'Unpaid').lt('due_date', today),
        supabase.from('activity').select('id, type, date, description, company_id').order('date', { ascending: false }).limit(8),
        supabase.from('ticket').select('id, ticket_id, company_name, priority, status, due_date').eq('is_completed', 0).order('id', { ascending: false }).limit(5),
      ])

      setStats({
        customers:      custR.count    || 0,
        openTickets:    tickR.count    || 0,
        quotations:     quotR.count    || 0,
        invoices:       invR.count     || 0,
        openTasks:      taskR.count    || 0,
        leads:          leadR.count    || 0,
        overdueInvoices: overdueR.count || 0,
      })
      setRecentActivities(actR.data || [])
      setRecentTickets(recentTickR.data || [])
      setLoading(false)
    }
    load()
  }, [])

  const today = new Date().toISOString().split('T')[0]

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading dashboard...</div>

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-[#111111]">{greeting}, {profile?.first_name}!</h2>
        <p className="text-gray-400 text-sm mt-0.5">Here's your business overview.</p>
      </div>

      {/* Top stats row — 4 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Customers"      value={stats.customers}   icon={Building2}     color="#2563EB" bg="#EFF6FF" to="/customers" />
        <StatCard label="Open Tickets"   value={stats.openTickets} icon={Ticket}        color="#D97706" bg="#FFFBEB" to="/tickets" />
        <StatCard label="Quotations"     value={stats.quotations}  icon={FileText}      color="#7C3AED" bg="#F5F3FF" to="/quotations" />
        <StatCard label="Invoices"       value={stats.invoices}    icon={Receipt}       color="#059669" bg="#ECFDF5" to="/invoices" />
      </div>

      {/* Second stats row — 3 cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Open Tasks"       value={stats.openTasks}       icon={ClipboardList}  color="#0891B2" bg="#ECFEFF" to="/tasks" />
        <StatCard label="Sales Leads"      value={stats.leads}           icon={Users}          color="#BE185D" bg="#FDF2F8" to="/leads" />
        <StatCard label="Overdue Invoices" value={stats.overdueInvoices} icon={AlertTriangle}  color="#CC0000" bg="#FEF2F2" to="/invoices" />
      </div>

      {/* Two-column lower section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Open Tickets */}
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#111111] text-sm">Recent Open Tickets</h3>
            <Link to="/tickets" className="text-xs text-red-600 hover:underline">View all</Link>
          </div>
          {recentTickets.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No open tickets.</p>
          ) : (
            <div className="space-y-2">
              {recentTickets.map(t => {
                const isOverdue = t.due_date && t.due_date < today
                return (
                  <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <span className="text-sm font-semibold text-red-600 mr-2">TID{t.ticket_id}</span>
                      <span className="text-sm text-gray-800">{t.company_name || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {t.priority && (
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          t.priority === 'High' ? 'bg-red-100 text-red-700' :
                          t.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>{t.priority}</span>
                      )}
                      {isOverdue && (
                        <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">Overdue</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent Activities */}
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#111111] text-sm flex items-center gap-2">
              <Activity size={14} className="text-gray-400" /> Recent Activities
            </h3>
            <Link to="/activities" className="text-xs text-red-600 hover:underline">View all</Link>
          </div>
          {recentActivities.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No activities yet.</p>
          ) : (
            <div className="space-y-2">
              {recentActivities.map(a => (
                <div key={a.id} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium mt-0.5 ${activityTypeColor(a.type)}`}>{a.type || '—'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{a.description || a.company_id || '—'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.date || ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
        <h3 className="font-semibold text-[#111111] text-sm mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '+ New Quotation', href: '/quotations' },
            { label: '+ New Invoice',   href: '/invoices' },
            { label: '+ New Ticket',    href: '/tickets' },
            { label: '+ New Customer',  href: '/customers' },
          ].map(a => (
            <Link key={a.label} to={a.href}
              className="border border-[#E0E0E0] rounded-lg px-4 py-3 text-sm font-medium text-[#111111] hover:border-[#CC0000] hover:text-[#CC0000] transition-colors text-center">
              {a.label}
            </Link>
          ))}
        </div>
      </div>

    </div>
  )
}
