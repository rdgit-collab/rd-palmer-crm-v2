import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2, Ticket, FileText, Receipt,
  ClipboardList, Users, AlertTriangle, Activity,
  TrendingUp, MapPin, RotateCcw, Gauge, CheckCircle2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fetchAssignableUsers, getUserName as formatUserName } from '../lib/legacyUsers'

// ── Shared stat card ──────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, bg, to }) {
  const inner = (
    <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 hover:border-gray-300 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</span>
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

function addStaffMetric(map, users, assignee, updates) {
  const key = assignee ? String(assignee) : 'unassigned'
  if (!map[key]) {
    map[key] = {
      id: key,
      name: key === 'unassigned' ? 'Unassigned' : formatUserName(users, assignee),
      openTickets: 0,
      openTasks: 0,
      openOnsites: 0,
      completed: 0,
      overdue: 0,
    }
  }
  Object.entries(updates).forEach(([field, value]) => {
    map[key][field] += value
  })
}

// ════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ════════════════════════════════════════════════════════════════════
function AdminDashboard({ firstName }) {
  const [stats, setStats] = useState({})
  const [recentTickets, setRecentTickets] = useState([])
  const [recentActivities, setRecentActivities] = useState([])

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    Promise.all([
      supabase.from('customer').select('*', { count: 'exact', head: true }),
      supabase.from('ticket').select('*', { count: 'exact', head: true }).eq('is_completed', 0),
      supabase.from('quotation').select('*', { count: 'exact', head: true }),
      supabase.from('invoice').select('*', { count: 'exact', head: true }),
      supabase.from('task').select('*', { count: 'exact', head: true }).eq('is_completed', 0),
      supabase.from('sales_lead').select('*', { count: 'exact', head: true }),
      supabase.from('invoice').select('*', { count: 'exact', head: true }).eq('status', 'Unpaid').lt('due_date', today),
      supabase.from('ticket').select('id, ticket_id, company_name, priority, due_date').eq('is_completed', 0).order('id', { ascending: false }).limit(5),
      supabase.from('activity').select('id, type, date, description, company_id').order('date', { ascending: false }).limit(6),
    ]).then(([c, t, q, inv, tsk, l, ov, rTick, rAct]) => {
      setStats({ customers: c.count||0, openTickets: t.count||0, quotations: q.count||0, invoices: inv.count||0, openTasks: tsk.count||0, leads: l.count||0, overdueInvoices: ov.count||0 })
      setRecentTickets(rTick.data || [])
      setRecentActivities(rAct.data || [])
    })
  }, [])

  const today = new Date().toISOString().split('T')[0]

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
                    <span className="text-sm text-gray-800">{t.company_name || '—'}</span>
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
                    <p className="text-sm text-gray-800 truncate">{a.description || a.company_id || '—'}</p>
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
  const [stats, setStats] = useState({})
  const [recentActivities, setRecentActivities] = useState([])
  const [recentLeads, setRecentLeads] = useState([])

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    Promise.all([
      supabase.from('customer').select('*', { count: 'exact', head: true }),
      supabase.from('sales_lead').select('*', { count: 'exact', head: true }),
      supabase.from('quotation').select('*', { count: 'exact', head: true }),
      supabase.from('invoice').select('*', { count: 'exact', head: true }).eq('status', 'Unpaid'),
      supabase.from('invoice').select('*', { count: 'exact', head: true }).eq('status', 'Unpaid').lt('due_date', today),
      supabase.from('activity').select('id, type, date, description, company_id').order('date', { ascending: false }).limit(8),
      supabase.from('sales_lead').select('id, full_name, company_name, status, created_at').order('id', { ascending: false }).limit(5),
    ]).then(([cust, leads, quot, unpaidInv, overdue, acts, rLeads]) => {
      setStats({
        customers:      cust.count    || 0,
        leads:          leads.count   || 0,
        quotations:     quot.count    || 0,
        unpaidInvoices: unpaidInv.count || 0,
        overdueInvoices: overdue.count || 0,
      })
      setRecentActivities(acts.data || [])
      setRecentLeads(rLeads.data || [])
    })
  }, [])

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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#111111]">Good day, {firstName}!</h2>
        <p className="text-gray-400 text-sm mt-0.5">Sales overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Customers"        value={stats.customers}       icon={Building2}     color="#2563EB" bg="#EFF6FF" to="/customers" />
        <StatCard label="Active Leads"     value={stats.leads}           icon={TrendingUp}    color="#BE185D" bg="#FDF2F8" to="/leads" />
        <StatCard label="Quotations"       value={stats.quotations}      icon={FileText}      color="#7C3AED" bg="#F5F3FF" to="/quotations" />
        <StatCard label="Unpaid Invoices"  value={stats.unpaidInvoices}  icon={Receipt}       color="#D97706" bg="#FFFBEB" to="/invoices" />
        <StatCard label="Overdue Invoices" value={stats.overdueInvoices} icon={AlertTriangle} color="#CC0000" bg="#FEF2F2" to="/invoices" />
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
                <div key={l.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{l.full_name || '—'}</p>
                    <p className="text-xs text-gray-500">{l.company_name || ''}</p>
                  </div>
                  {l.status && <span className={`text-xs px-2 py-0.5 rounded ${leadStatusColor(l.status)}`}>{l.status}</span>}
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
                    <p className="text-sm text-gray-800 truncate">{a.description || a.company_id || '—'}</p>
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
  const [attentionItems, setAttentionItems] = useState([])

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    Promise.all([
      supabase.from('ticket').select('*', { count: 'exact', head: true }).eq('is_completed', 0),
      supabase.from('task').select('*', { count: 'exact', head: true }).eq('is_completed', 0),
      supabase.from('onsiteticket').select('*', { count: 'exact', head: true }).eq('is_completed', 0),
      supabase.from('ticket').select('*', { count: 'exact', head: true }).eq('is_completed', 0).lt('due_date', today),
      supabase.from('rma').select('*', { count: 'exact', head: true }),
      supabase.from('ticket').select('id, ticket_id, company_name, priority, due_date, status').eq('is_completed', 0).order('id', { ascending: false }).limit(6),
      supabase.from('task').select('id, ticket_id, servicetype, startdate, assigned_to').eq('is_completed', 0).order('id', { ascending: false }).limit(5),
      supabase.from('ticket').select('id, ticket_id, company_name, assigned_to, due_date, priority, is_completed, status').limit(2000),
      supabase.from('task').select('id, ticket_id, servicetype, assigned_to, startdate, enddate, is_completed').limit(2000),
      supabase.from('onsiteticket').select('id, ticket_id, issue_description, product, assigned_to, date, is_completed, status').limit(2000),
      fetchAssignableUsers(supabase),
    ]).then(([tick, tsk, onsite, overdue, rma, rTick, rTask, allTickets, allTasks, allOnsites, users]) => {
      const tickets = allTickets.data || []
      const tasks = allTasks.data || []
      const onsites = allOnsites.data || []
      const ticketNumberById = Object.fromEntries(tickets.map(ticket => [ticket.id, ticket.ticket_id]))
      const completedWork = tasks.filter(t => t.is_completed == 1).length + onsites.filter(o => o.is_completed == 1 || o.status === 'Completed').length
      const pendingWork = tasks.filter(t => t.is_completed != 1).length + onsites.filter(o => o.is_completed != 1 && o.status !== 'Completed').length
      const dueToday = tasks.filter(t => t.is_completed != 1 && t.enddate === today).length
        + tickets.filter(t => t.is_completed != 1 && t.due_date === today).length

      const staffMap = {}
      tickets.forEach(ticket => {
        if (ticket.is_completed == 1) return
        addStaffMetric(staffMap, users, ticket.assigned_to, {
          openTickets: 1,
          overdue: ticket.due_date && ticket.due_date < today ? 1 : 0,
        })
      })
      tasks.forEach(task => {
        addStaffMetric(staffMap, users, task.assigned_to, task.is_completed == 1
          ? { completed: 1 }
          : { openTasks: 1, overdue: task.enddate && task.enddate < today ? 1 : 0 })
      })
      onsites.forEach(onsiteRow => {
        addStaffMetric(staffMap, users, onsiteRow.assigned_to, onsiteRow.is_completed == 1 || onsiteRow.status === 'Completed'
          ? { completed: 1 }
          : { openOnsites: 1 })
      })

      const attention = [
        ...tickets
          .filter(ticket => ticket.is_completed != 1 && ticket.due_date && ticket.due_date < today)
          .map(ticket => ({
            key: `ticket-${ticket.id}`,
            type: 'Ticket',
            label: `TID${ticket.ticket_id}`,
            text: ticket.company_name || ticket.status || 'Open ticket',
            date: ticket.due_date,
            owner: formatUserName(users, ticket.assigned_to),
            to: '/tickets',
          })),
        ...tasks
          .filter(task => task.is_completed != 1 && task.enddate && task.enddate < today)
          .map(task => ({
            key: `task-${task.id}`,
            type: 'Task',
            label: task.servicetype || `Task #${task.id}`,
            text: task.ticket_id ? `TID${ticketNumberById[task.ticket_id] || task.ticket_id}` : 'Open task',
            date: task.enddate,
            owner: formatUserName(users, task.assigned_to),
            to: '/tasks',
          })),
      ].sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 8)

      setStats({
        openTickets:    tick.count   || 0,
        openTasks:      tsk.count    || 0,
        onsiteTickets:  onsite.count || 0,
        overdueTickets: overdue.count || 0,
        rmaCount:       rma.count    || 0,
        completedWork,
        pendingWork,
        dueToday,
        completionRate: completedWork + pendingWork > 0 ? Math.round((completedWork / (completedWork + pendingWork)) * 100) : 0,
      })
      setRecentTickets(rTick.data || [])
      setRecentTasks(rTask.data || [])
      setStaffRows(Object.values(staffMap)
        .map(row => ({ ...row, pending: row.openTickets + row.openTasks + row.openOnsites }))
        .sort((a, b) => (b.pending + b.overdue) - (a.pending + a.overdue))
        .slice(0, 8))
      setAttentionItems(attention)
    })
  }, [])

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#111111]">Good day, {firstName}!</h2>
        <p className="text-gray-400 text-sm mt-0.5">Service overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Open Tickets"     value={stats.openTickets}    icon={Ticket}        color="#D97706" bg="#FFFBEB" to="/tickets" />
        <StatCard label="Open Tasks"       value={stats.openTasks}      icon={ClipboardList} color="#0891B2" bg="#ECFEFF" to="/tasks" />
        <StatCard label="Onsite Tickets"   value={stats.onsiteTickets}  icon={MapPin}        color="#7C3AED" bg="#F5F3FF" to="/onsite-tickets" />
        <StatCard label="Overdue Tickets"  value={stats.overdueTickets} icon={AlertTriangle} color="#CC0000" bg="#FEF2F2" to="/tickets" />
        <StatCard label="Due Today"        value={stats.dueToday}       icon={Gauge}         color="#2563EB" bg="#EFF6FF" to="/tasks" />
        <StatCard label="Work Completion"  value={`${stats.completionRate ?? 0}%`} icon={CheckCircle2} color="#059669" bg="#ECFDF5" />
        <StatCard label="RMA Records"      value={stats.rmaCount}       icon={RotateCcw}     color="#059669" bg="#ECFDF5" to="/rma" />
      </div>

      <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-[#111111] text-sm">Staff Workload & Performance</h3>
            <p className="text-xs text-gray-400 mt-0.5">Open work, completed work, and overdue items by assigned staff.</p>
          </div>
          <Link to="/tasks" className="text-xs text-red-600 hover:underline">Review work</Link>
        </div>
        {staffRows.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No assigned service work yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Staff</th>
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
                    <td className="px-3 py-2 font-medium text-gray-900">{row.name || '—'}</td>
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
            <h3 className="font-semibold text-[#111111] text-sm">Recent Open Tickets</h3>
            <Link to="/tickets" className="text-xs text-red-600 hover:underline">View all</Link>
          </div>
          {recentTickets.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No open tickets.</p> : (
            <div className="space-y-2">
              {recentTickets.map(t => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <span className="text-sm font-semibold text-red-600 mr-2">TID{t.ticket_id}</span>
                    <span className="text-sm text-gray-800">{t.company_name || '—'}</span>
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
            <h3 className="font-semibold text-[#111111] text-sm">Attention Needed</h3>
            <span className="text-xs text-gray-400">{attentionItems.length} overdue</span>
          </div>
          {attentionItems.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No overdue service work.</p> : (
            <div className="space-y-2">
              {attentionItems.map(item => (
                <Link key={item.key} to={item.to} className="block py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">{item.type}</span>
                        <span className="text-sm font-semibold text-gray-900 truncate">{item.label}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 truncate">{item.text} · {item.owner}</p>
                    </div>
                    <span className="text-xs font-medium text-red-600 shrink-0">{fmtDate(item.date)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[#111111] text-sm">Recent Open Tasks</h3>
            <Link to="/tasks" className="text-xs text-red-600 hover:underline">View all</Link>
          </div>
          {recentTasks.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No open tasks.</p> : (
            <div className="space-y-2">
              {recentTasks.map(t => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{t.servicetype || 'Task #' + t.id}</p>
                    <p className="text-xs text-gray-500">{t.startdate || ''}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">Open</span>
                </div>
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

  if (profile?.role_id === 2) return <SalesDashboard firstName={firstName} />
  if (profile?.role_id === 3) return <ServiceDashboard firstName={firstName} />
  return <AdminDashboard firstName={firstName} />
}
