import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2, Ticket, FileText, Receipt,
  ClipboardList, Users, AlertTriangle, Activity,
  TrendingUp, MapPin, RotateCcw, Gauge, CheckCircle2,
  Download,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getLegacyUserId } from '../lib/legacyUsers'
import { displayText } from '../lib/displayText'
import { isSalesRole, isServiceRole } from '../lib/roles'

// ── Shared loading spinner ────────────────────────────────────────
function DashboardSpinner({ label }) {
  return (
    <div className="p-6 space-y-6">
      {label && (
        <div>
          <h2 className="text-xl font-bold text-[#111111]">{label}</h2>
        </div>
      )}
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400 text-sm">Loading…</span>
        </div>
      </div>
    </div>
  )
}

// ── Shared stat card ──────────────────────────────────────────────
function StatInfo({ text }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  const toggleOpen = (event) => {
    event.preventDefault()
    event.stopPropagation()
    setOpen(current => !current)
  }
  return (
    <span className="relative inline-flex group" title={text} aria-label={text} onMouseLeave={() => setOpen(false)}>
      <span
        role="button"
        tabIndex={0}
        onClick={toggleOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') toggleOpen(event)
        }}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-[10px] font-bold text-gray-400 leading-none hover:border-gray-400 hover:text-gray-500"
      >
        !
      </span>
      <span className={`pointer-events-none absolute left-0 top-5 z-20 w-56 rounded border border-gray-200 bg-white px-3 py-2 text-[11px] font-normal normal-case leading-snug tracking-normal text-gray-600 shadow-lg ${open ? 'block' : 'hidden group-hover:block group-focus-within:block'}`}>
        {text}
      </span>
    </span>
  )
}

function StatCard({ label, value, icon: Icon, color, bg, to, info }) {
  const inner = (
    <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 hover:border-gray-300 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</span>
          <StatInfo text={info} />
        </div>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: bg }}>
          <Icon size={15} style={{ color }} />
        </div>
      </div>
      <div className="text-3xl font-bold text-[#111111]">{value ?? '—'}</div>
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

function activityTypeColor(type) {
  const map = {
    'Call':      'bg-blue-100 text-blue-700',
    'Meeting':   'bg-purple-100 text-purple-700',
    'Follow-Up': 'bg-yellow-100 text-yellow-700',
    'Email':     'bg-green-100 text-green-700',
    'Visit':     'bg-orange-100 text-orange-700',
  }
  return map[type] || 'bg-gray-100 text-gray-600'
}

function priorityColor(p) {
  if (p === 'High')   return 'bg-red-100 text-red-700'
  if (p === 'Medium') return 'bg-yellow-100 text-yellow-700'
  if (p === 'Low')    return 'bg-green-100 text-green-700'
  return 'bg-gray-100 text-gray-600'
}

function fmtDate(value) {
  return value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'
}

function formatDaysOverdue(days) {
  const value = Number(days || 0)
  return `${value} ${value === 1 ? 'day' : 'days'} overdue`
}

function formatDaysLeft(days) {
  if (days === null || days === undefined || days === '') return 'Nil'
  const value = Number(days ?? 0)
  if (value < 0) return `${Math.abs(value)} ${Math.abs(value) === 1 ? 'day' : 'days'} overdue`
  if (value === 0) return 'Due today'
  return `${value} ${value === 1 ? 'day' : 'days'} left`
}

function fmtCurrency(value) {
  return `MYR ${Number(value || 0).toLocaleString('en-MY', { maximumFractionDigits: 0 })}`
}

function monthValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthOptions(count = 12) {
  const now = new Date()
  return Array.from({ length: count }, (_, idx) => {
    const date = new Date(now.getFullYear(), now.getMonth() - idx, 1)
    return {
      value: monthValue(date),
      label: date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    }
  })
}

function csvValue(value) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows]
    .map(row => row.map(csvValue).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const salesStatInfo = {
  customers: 'Total customers visible to your sales dashboard permission.',
  leads: 'Open sales leads that are still active.',
  newLeadsThisMonth: 'Leads created in the selected/current month.',
  quotations: 'Total quotation records visible to your dashboard permission.',
  quoteValueThisMonth: 'Total quotation value counted for the selected/current month.',
  invoiceValueThisMonth: 'Total invoice value counted for the selected/current month.',
  quoteConversion: 'Percentage of quotations converted to invoice or won business.',
  invoices: 'Total invoice records visible to your dashboard permission.',
  overdueInvoices: 'Invoices past due date and not yet settled.',
}

const serviceStatInfo = {
  openTickets: 'Tickets that are not completed yet.',
  closedTickets: 'Tickets closed during the month selected in Staff Workload & Performance.',
  openTasks: 'Tasks that are not completed yet.',
  onsiteTickets: 'Onsite tickets that are not completed yet.',
  overdueTickets: 'Open tickets with due date before today.',
  dueToday: 'Open tickets and tasks with due date today.',
  completionRate: 'Completed service work divided by completed plus pending work for the selected month.',
  rmaCount: 'RMA records that have not been returned yet.',
}

// ════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ════════════════════════════════════════════════════════════════════
function AdminDashboard({ firstName }) {
  const { profile } = useAuth()
  const [stats, setStats] = useState({})
  const [recentTickets, setRecentTickets] = useState([])
  const [recentActivities, setRecentActivities] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    setLoading(true)
    const today = new Date().toISOString().split('T')[0]
    Promise.all([
      supabase.from('customer').select('id', { count: 'estimated', head: true }),
      supabase.from('ticket').select('id', { count: 'exact', head: true }).eq('is_completed', 0),
      supabase.from('quotation').select('id', { count: 'estimated', head: true }),
      supabase.from('invoice').select('id', { count: 'estimated', head: true }),
      supabase.from('task').select('id', { count: 'exact', head: true }).eq('is_completed', 0),
      supabase.from('sales_lead').select('id', { count: 'estimated', head: true }),
      supabase.from('invoice').select('id', { count: 'exact', head: true }).lt('due_date', today),
      supabase.from('ticket').select('id, ticket_id, company_name, priority, due_date').eq('is_completed', 0).order('id', { ascending: false }).limit(5),
      supabase.from('activity').select('id, type, date, description, company_id').order('date', { ascending: false }).limit(6),
    ]).then(([c, t, q, inv, tsk, l, ov, rTick, rAct]) => {
      setStats({ customers: c.count||0, openTickets: t.count||0, quotations: q.count||0, invoices: inv.count||0, openTasks: tsk.count||0, leads: l.count||0, overdueInvoices: ov.count||0 })
      setRecentTickets(rTick.data || [])
      setRecentActivities(rAct.data || [])
    }).finally(() => setLoading(false))
  }, [profile])

  const today = new Date().toISOString().split('T')[0]

  if (loading) return <DashboardSpinner label={`Good day, ${firstName}!`} />

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#111111]">Good day, {firstName}!</h2>
        <p className="text-gray-400 text-sm mt-0.5">Company-wide overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Customers"      value={stats.customers}      icon={Building2}     color="#2563EB" bg="#EFF6FF" to="/customers" />
        <StatCard label="Open Tickets"   value={stats.openTickets}    icon={Ticket}        color="#D97706" bg="#FFFBEB" to="/tickets" />
        <StatCard label="Quotations"     value={stats.quotations}     icon={FileText}      color="#7C3AED" bg="#F5F3FF" to="/quotations" />
        <StatCard label="Invoices"       value={stats.invoices}       icon={Receipt}       color="#059669" bg="#ECFDF5" to="/invoices" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Open Tasks"        value={stats.openTasks}       icon={ClipboardList} color="#0891B2" bg="#ECFEFF" to="/tasks" />
        <StatCard label="Sales Leads"       value={stats.leads}           icon={Users}         color="#BE185D" bg="#FDF2F8" to="/leads" />
        <StatCard label="Overdue Invoices"  value={stats.overdueInvoices} icon={AlertTriangle} color="#CC0000" bg="#FEF2F2" to="/invoices" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#111111] text-sm">Recent Open Tickets</h3>
            <Link to="/tickets" className="text-xs text-red-600 hover:underline">View all</Link>
          </div>
          {recentTickets.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No open tickets.</p> : (
            <div className="space-y-2">
              {recentTickets.map(t => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <span className="text-sm font-semibold text-red-600 mr-2">TID{t.ticket_id}</span>
                    <span className="text-sm text-gray-800">{displayText(t.company_name)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.priority && <span className={`text-xs px-2 py-0.5 rounded ${priorityColor(t.priority)}`}>{t.priority}</span>}
                    {t.due_date && t.due_date < today && <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">Overdue</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#111111] text-sm flex items-center gap-2"><Activity size={14} className="text-gray-400" /> Recent Activities</h3>
            <Link to="/activities" className="text-xs text-red-600 hover:underline">View all</Link>
          </div>
          {recentActivities.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No activities yet.</p> : (
            <div className="space-y-2">
              {recentActivities.map(a => (
                <div key={a.id} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium mt-0.5 ${activityTypeColor(a.type)}`}>{a.type || '—'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{displayText(a.description || a.company_id)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.date || ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
        <h3 className="font-semibold text-[#111111] text-sm mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[['+ New Quotation','/quotations'],['+ New Invoice','/invoices'],['+ New Ticket','/tickets'],['+ New Customer','/customers']].map(([l,h]) => (
            <Link key={l} to={h} className="border border-[#E0E0E0] rounded-lg px-4 py-3 text-sm font-medium text-[#111111] hover:border-[#CC0000] hover:text-[#CC0000] transition-colors text-center">{l}</Link>
          ))}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// SALES DASHBOARD
// ════════════════════════════════════════════════════════════════════
function SalesDashboard({ firstName }) {
  const { profile } = useAuth()
  const [stats, setStats] = useState({})
  const [recentActivities, setRecentActivities] = useState([])
  const [recentLeads, setRecentLeads] = useState([])
  const [salesRows, setSalesRows] = useState([])
  const [followUpItems, setFollowUpItems] = useState([])
  const [performanceMonth, setPerformanceMonth] = useState(monthValue())
  const [loading, setLoading] = useState(true)
  const performanceMonths = useMemo(() => monthOptions(12), [])

  useEffect(() => {
    setLoading(true)
    const isSalesRestricted = isSalesRole(profile?.role_id)
    const currentLegacyUserId = getLegacyUserId(profile)

    const dashboardSummaryQuery = supabase.rpc('get_sales_dashboard_summary', {
      p_month: performanceMonth,
      p_current_user_id: currentLegacyUserId || null,
      p_restricted: isSalesRestricted,
    })
    let recentActivitiesQuery = supabase.from('activity').select('id, user_id, assigned_to, type, date, description, company_id').order('date', { ascending: false }).limit(8)
    let recentLeadsQuery = supabase.from('sales_lead').select('id, first_name, last_name, company_name, status, assigned_to, created_at, updated_at').order('id', { ascending: false }).limit(5)

    if (isSalesRestricted) {
      recentActivitiesQuery = recentActivitiesQuery.or(`assigned_to.eq.${currentLegacyUserId},user_id.eq.${currentLegacyUserId}`)
      recentLeadsQuery = recentLeadsQuery.eq('assigned_to', currentLegacyUserId)
    }

    Promise.all([
      dashboardSummaryQuery,
      recentActivitiesQuery,
      recentLeadsQuery,
      supabase.from('stage').select('id, name').order('name'),
    ]).then(([summaryResult, acts, rLeads, stageRows]) => {
      const summary = summaryResult.data || {}
      const stageLookup = Object.fromEntries((stageRows.data || []).map(stage => [String(stage.id), stage.name]))
      const getLeadStatusName = (status) => status ? (stageLookup[String(status)] || String(status)) : 'Open'

      setStats(summary.stats || {})
      setRecentActivities(acts.data || [])
      setRecentLeads((rLeads.data || []).map(lead => ({ ...lead, status_name: getLeadStatusName(lead.status) })))
      setSalesRows(summary.salesRows || [])
      setFollowUpItems(summary.followUpItems || [])
    }).finally(() => setLoading(false))
  }, [performanceMonth, profile])

  function leadStatusColor(s) {
    if (!s) return 'bg-gray-100 text-gray-600'
    const l = s.toLowerCase()
    if (l === 'new')         return 'bg-blue-100 text-blue-700'
    if (l === 'contacted')   return 'bg-yellow-100 text-yellow-700'
    if (l === 'qualified')   return 'bg-purple-100 text-purple-700'
    if (l === 'won')         return 'bg-green-100 text-green-700'
    if (l === 'lost')        return 'bg-red-100 text-red-700'
    return 'bg-gray-100 text-gray-600'
  }

  if (loading) return <DashboardSpinner label={`Good day, ${firstName}!`} />

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#111111]">Good day, {firstName}!</h2>
        <p className="text-gray-400 text-sm mt-0.5">Sales overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Customers"        value={stats.customers}       icon={Building2}     color="#2563EB" bg="#EFF6FF" to="/customers" info={salesStatInfo.customers} />
        <StatCard label="Open Leads"       value={stats.leads}           icon={TrendingUp}    color="#BE185D" bg="#FDF2F8" to="/leads" info={salesStatInfo.leads} />
        <StatCard label="New Leads This Month" value={stats.newLeadsThisMonth} icon={Users} color="#7C3AED" bg="#F5F3FF" to="/leads" info={salesStatInfo.newLeadsThisMonth} />
        <StatCard label="Quotations"       value={stats.quotations}      icon={FileText}      color="#7C3AED" bg="#F5F3FF" to="/quotations" info={salesStatInfo.quotations} />
        <StatCard label="Quotation Value"  value={fmtCurrency(stats.quoteValueThisMonth)} icon={FileText} color="#0891B2" bg="#ECFEFF" to="/quotations" info={salesStatInfo.quoteValueThisMonth} />
        <StatCard label="Invoice Value"    value={fmtCurrency(stats.invoiceValueThisMonth)} icon={Receipt} color="#059669" bg="#ECFDF5" to="/invoices" info={salesStatInfo.invoiceValueThisMonth} />
        <StatCard label="Quote Conversion" value={`${stats.quoteConversion ?? 0}%`} icon={CheckCircle2} color="#059669" bg="#ECFDF5" info={salesStatInfo.quoteConversion} />
        <StatCard label="Invoices"         value={stats.invoices}         icon={Receipt}       color="#D97706" bg="#FFFBEB" to="/invoices" info={salesStatInfo.invoices} />
        <StatCard label="Overdue Invoices" value={stats.overdueInvoices} icon={AlertTriangle} color="#CC0000" bg="#FEF2F2" to="/invoices" info={salesStatInfo.overdueInvoices} />
      </div>

      <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-[#111111] text-sm">Salesperson Performance</h3>
            <p className="text-xs text-gray-400 mt-0.5">Monthly activity, quotation value, invoice value, and open pipeline ownership for sales users only.</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={performanceMonth}
              onChange={e => setPerformanceMonth(e.target.value)}
              className="border border-gray-200 px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-red-400"
            >
              {performanceMonths.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <Link to="/quotations" className="text-xs text-red-600 hover:underline">Review sales docs</Link>
          </div>
        </div>
        {salesRows.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No sales performance data yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Salesperson</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Open Leads</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Activities</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Quotes</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Converted</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Quote Value</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Invoice Value</th>
                </tr>
              </thead>
              <tbody>
                {salesRows.map(row => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-gray-900">{row.name || '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.openLeads}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.activities}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.quotations}</td>
                    <td className="px-3 py-2 text-right text-green-700">{row.converted}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{fmtCurrency(row.quotationValue)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmtCurrency(row.invoiceValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#111111] text-sm">Recent Leads</h3>
            <Link to="/leads" className="text-xs text-red-600 hover:underline">View all</Link>
          </div>
          {recentLeads.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No leads yet.</p> : (
            <div className="space-y-2">
              {recentLeads.map(l => (
                <Link key={l.id} to="/leads" state={{ leadId: l.id }} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{[l.first_name, l.last_name].filter(Boolean).join(' ') || '—'}</p>
                    <p className="text-xs text-gray-500">{displayText(l.company_name, '')}</p>
                  </div>
                  {l.status_name && <span className={`text-xs px-2 py-0.5 rounded ${leadStatusColor(l.status_name)}`}>{l.status_name}</span>}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#111111] text-sm">Follow-Up Attention</h3>
            <span className="text-xs text-gray-400">{followUpItems.length} stale leads</span>
          </div>
          {followUpItems.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No stale open leads.</p> : (
            <div className="space-y-2">
              {followUpItems.map(lead => (
                <Link key={lead.id} to="/leads" state={{ leadId: lead.id }} className="block py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${leadStatusColor(lead.status)}`}>{lead.status}</span>
                        <span className="text-sm font-semibold text-gray-900 truncate">{lead.name}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 truncate">{lead.company} · {lead.owner}</p>
                    </div>
                    <span className="text-xs font-medium text-red-600 shrink-0">{lead.lastActivity ? fmtDate(lead.lastActivity) : 'No update'}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#111111] text-sm flex items-center gap-2"><Activity size={14} className="text-gray-400" /> Recent Activities</h3>
            <Link to="/activities" className="text-xs text-red-600 hover:underline">View all</Link>
          </div>
          {recentActivities.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No activities yet.</p> : (
            <div className="space-y-2">
              {recentActivities.map(a => (
                <div key={a.id} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded font-medium mt-0.5 ${activityTypeColor(a.type)}`}>{a.type || '—'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{displayText(a.description || a.company_id)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.date || ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
        <h3 className="font-semibold text-[#111111] text-sm mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[['+ New Lead','/leads'],['+ New Quotation','/quotations'],['+ New Invoice','/invoices'],['+ New Customer','/customers']].map(([l,h]) => (
            <Link key={l} to={h} className="border border-[#E0E0E0] rounded-lg px-4 py-3 text-sm font-medium text-[#111111] hover:border-[#CC0000] hover:text-[#CC0000] transition-colors text-center">{l}</Link>
          ))}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// SERVICE DASHBOARD
// ════════════════════════════════════════════════════════════════════
function ServiceDashboard({ firstName }) {
  const [stats, setStats] = useState({})
  const [recentTickets, setRecentTickets] = useState([])
  const [recentTasks, setRecentTasks] = useState([])
  const [staffRows, setStaffRows] = useState([])
  const [staffLoadNote, setStaffLoadNote] = useState('')
  const [attentionItems, setAttentionItems] = useState([])
  const [staffMonth, setStaffMonth] = useState(monthValue())
  const [loading, setLoading] = useState(true)
  const staffMonths = useMemo(() => monthOptions(12), [])

  useEffect(() => {
    setLoading(true)
    supabase.rpc('get_service_dashboard_summary', { p_month: staffMonth }).then(summaryResult => {
      const summary = summaryResult.data || {}
      setStats(summary.stats || {})
      setRecentTickets(summary.highPriorityTickets || [])
      setRecentTasks(summary.overdueTasks || [])
      const nextStaffRows = summary.staffRows || []
      setStaffRows(nextStaffRows)
      setStaffLoadNote(summaryResult.error
        ? `Unable to load dashboard summary: ${summaryResult.error.message}`
        : nextStaffRows.length === 0
          ? 'No active users found. Check user status in Settings > Users.'
          : '')
      setAttentionItems(summary.attentionItems || [])
    }).finally(() => setLoading(false))
  }, [staffMonth])

  const selectedStaffMonthLabel = staffMonths.find(option => option.value === staffMonth)?.label || staffMonth
  const exportStaffRows = () => {
    downloadCsv(
      `staff-workload-performance-${staffMonth}.csv`,
      ['Month', 'Staff', 'Role', 'Tickets', 'Tasks', 'Onsite', 'Pending', 'Completed', 'Overdue'],
      staffRows.map(row => [
        selectedStaffMonthLabel,
        row.name || '',
        row.role || '',
        row.openTickets,
        row.openTasks,
        row.openOnsites,
        row.pending,
        row.completed,
        row.overdue,
      ])
    )
  }

  if (loading) return <DashboardSpinner label={`Good day, ${firstName}!`} />

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#111111]">Good day, {firstName}!</h2>
        <p className="text-gray-400 text-sm mt-0.5">Service overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Open Tickets"     value={stats.openTickets}    icon={Ticket}        color="#D97706" bg="#FFFBEB" to="/tickets" info={serviceStatInfo.openTickets} />
        <StatCard label="Closed Tickets"   value={stats.closedTickets}  icon={CheckCircle2}  color="#059669" bg="#ECFDF5" to="/tickets" info={serviceStatInfo.closedTickets} />
        <StatCard label="Open Tasks"       value={stats.openTasks}      icon={ClipboardList} color="#0891B2" bg="#ECFEFF" to="/tasks" info={serviceStatInfo.openTasks} />
        <StatCard label="Onsite Tickets"   value={stats.onsiteTickets}  icon={MapPin}        color="#7C3AED" bg="#F5F3FF" to="/onsite-tickets" info={serviceStatInfo.onsiteTickets} />
        <StatCard label="Overdue Tickets"  value={stats.overdueTickets} icon={AlertTriangle} color="#CC0000" bg="#FEF2F2" to="/tickets" info={serviceStatInfo.overdueTickets} />
        <StatCard label="Due Today"        value={stats.dueToday}       icon={Gauge}         color="#2563EB" bg="#EFF6FF" to="/tasks" info={serviceStatInfo.dueToday} />
        <StatCard label="Work Completion"  value={`${stats.completionRate ?? 0}%`} icon={CheckCircle2} color="#059669" bg="#ECFDF5" info={serviceStatInfo.completionRate} />
        <StatCard label="Open RMA"          value={stats.rmaCount}       icon={RotateCcw}     color="#059669" bg="#ECFDF5" to="/rma" info={serviceStatInfo.rmaCount} />
      </div>

      <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-[#111111] text-sm">Staff Workload & Performance</h3>
            <p className="text-xs text-gray-400 mt-0.5">Open work by current assignment, with completed work counted for {selectedStaffMonthLabel}.</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={staffMonth}
              onChange={e => setStaffMonth(e.target.value)}
              className="border border-gray-200 px-3 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-red-400"
            >
              {staffMonths.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button
              type="button"
              onClick={exportStaffRows}
              disabled={staffRows.length === 0}
              className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={13} /> CSV
            </button>
            <Link to="/tasks" className="text-xs text-red-600 hover:underline">Review work</Link>
          </div>
        </div>
        {staffRows.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">{staffLoadNote || 'No active users found.'}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Staff</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Role</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Tickets</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Tasks</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Onsite</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Pending</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Completed</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {staffRows.map(row => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-gray-900">{displayText(row.name)}</td>
                    <td className="px-3 py-2 text-gray-500">{displayText(row.role)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.openTickets}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.openTasks}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{row.openOnsites}</td>
                    <td className="px-3 py-2 text-right font-semibold text-gray-900">{row.pending}</td>
                    <td className="px-3 py-2 text-right text-green-700">{row.completed}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${row.overdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>{row.overdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#111111] text-sm">High Priority Tickets</h3>
            <Link to="/tickets" className="text-xs text-red-600 hover:underline">View all</Link>
          </div>
          {recentTickets.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No high priority tickets.</p> : (
            <div className="space-y-2">
              {recentTickets.map(t => (
                <Link key={t.key || t.id} to={t.to || '/tickets'} state={t.state || { ticketId: t.id }} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-600">{displayText(t.label, `TID${t.ticket_id}`)}</p>
                    <p className="text-xs text-gray-500 truncate">{displayText(t.companyName || t.company_name, 'No company')}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-500">{displayText(t.assignedTo, 'Unassigned')}</p>
                    <p className={`text-xs font-medium ${t.daysLeft !== null && t.daysLeft !== undefined && Number(t.daysLeft) < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                      {(t.dueDate || t.due_date) ? `${fmtDate(t.dueDate || t.due_date)} · ${formatDaysLeft(t.daysLeft)}` : 'Nil'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#111111] text-sm">Overdue Ticket</h3>
            <span className="text-xs text-gray-400">{attentionItems.length} overdue</span>
          </div>
          {attentionItems.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No overdue tickets.</p> : (
            <div className="space-y-2">
              {attentionItems.map(item => (
                <Link key={item.key} to={item.to} state={item.state} className="block py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">{item.type}</span>
                        <span className="text-sm font-semibold text-gray-900 truncate">{item.label}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 truncate">{displayText(item.text, '')} · {displayText(item.owner, '—')}</p>
                    </div>
                    <span className="text-xs font-medium text-red-600 shrink-0">{formatDaysOverdue(item.daysOverdue)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#111111] text-sm">Task Overdue List</h3>
            <Link to="/tasks" className="text-xs text-red-600 hover:underline">View all</Link>
          </div>
          {recentTasks.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No overdue tasks.</p> : (
            <div className="space-y-2">
              {recentTasks.map(t => (
                <Link key={t.key || t.id} to={t.to || '/tasks'} state={t.state || { taskId: t.id }} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{displayText(t.serviceType || t.servicetype, `Task #${t.id}`)}</p>
                    <p className="text-xs text-gray-500">{displayText(t.ticketNumber, 'No ticket linked')} · {displayText(t.assignedTo, 'Unassigned')}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 shrink-0">{formatDaysOverdue(t.daysOverdue)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
        <h3 className="font-semibold text-[#111111] text-sm mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[['+ New Ticket','/tickets'],['+ New Task','/tasks'],['+ Onsite Ticket','/onsite-tickets'],['+ Serial Number','/serial-numbers']].map(([l,h]) => (
            <Link key={l} to={h} className="border border-[#E0E0E0] rounded-lg px-4 py-3 text-sm font-medium text-[#111111] hover:border-[#CC0000] hover:text-[#CC0000] transition-colors text-center">{l}</Link>
          ))}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// Named exports for dedicated routes
// ════════════════════════════════════════════════════════════════════
export function SalesDashboardPage() {
  const { profile } = useAuth()
  return <SalesDashboard firstName={profile?.first_name || 'there'} />
}

export function ServiceDashboardPage() {
  const { profile } = useAuth()
  return <ServiceDashboard firstName={profile?.first_name || 'there'} />
}

// ════════════════════════════════════════════════════════════════════
// ROOT — default route picks the right dashboard by role
// ════════════════════════════════════════════════════════════════════
export default function Dashboard() {
  const { profile } = useAuth()
  const firstName = profile?.first_name || 'there'

  if (isSalesRole(profile?.role_id)) return <SalesDashboard firstName={firstName} />
  if (isServiceRole(profile?.role_id)) return <ServiceDashboard firstName={firstName} />
  return <AdminDashboard firstName={firstName} />
}
