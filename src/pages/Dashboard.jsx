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
import { fetchAssignableUsers, getLegacyUserId, getUserName as formatUserName } from '../lib/legacyUsers'
import { fetchAllRows } from '../lib/fetchAllRows'
import { isSalesRole, isServiceRole, ROLE_SALES, ROLE_SALES_MANAGER, ROLE_SERVICE } from '../lib/roles'

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

function fmtCurrency(value) {
  return `MYR ${Number(value || 0).toLocaleString('en-MY', { maximumFractionDigits: 0 })}`
}

function dateOnly(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monthStartIso() {
  const now = new Date()
  return dateOnly(new Date(now.getFullYear(), now.getMonth(), 1))
}

function isThisMonth(value, start = monthStartIso()) {
  return String(value || '').slice(0, 10) >= start
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

function monthRange(value) {
  const [year, month] = String(value || monthValue()).split('-').map(Number)
  return {
    start: dateOnly(new Date(year, month - 1, 1)),
    end: dateOnly(new Date(year, month, 1)),
  }
}

function isInMonth(value, range) {
  const date = String(value || '').slice(0, 10)
  return date >= range.start && date < range.end
}

function earlierDate(a, b) {
  return String(a) < String(b) ? a : b
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

function isClosedLeadStatus(status) {
  const value = String(status || '').toLowerCase()
  return value.includes('closed') || ['won', 'lost', 'complete', 'completed'].includes(value)
}

function isActiveUserStatus(status) {
  const value = String(status ?? '').trim().toLowerCase()
  return !['inactive', 'resigned', 'disabled', '0', 'false'].includes(value)
}

function serviceDashboardRoleLabel(roleId) {
  if (Number(roleId) === ROLE_SERVICE) return 'Tech'
  return '—'
}

function addStaffMetric(map, allowedStaffById, assignee, updates) {
  const key = assignee ? String(assignee) : ''
  if (!key || !allowedStaffById.has(key)) return
  if (!map[key]) map[key] = { ...allowedStaffById.get(key) }
  Object.entries(updates).forEach(([field, value]) => {
    map[key][field] += value
  })
}

function seedServiceStaffMetrics(map, staffUsers) {
  staffUsers.forEach(user => {
    const key = String(user.old_user_id || user.id || '')
    if (!key) return
    if (!map[key]) {
      map[key] = {
        id: key,
        name: `${user.first_name || ''} ${user.last_name || ''}`.replace(/\s+/g, ' ').trim() || '—',
        role: serviceDashboardRoleLabel(user.role_id),
        openTickets: 0,
        openTasks: 0,
        openOnsites: 0,
        completed: 0,
        overdue: 0,
      }
    } else {
      map[key].role = serviceDashboardRoleLabel(user.role_id)
      if (map[key].name === '—') {
        map[key].name = `${user.first_name || ''} ${user.last_name || ''}`.replace(/\s+/g, ' ').trim() || '—'
      }
    }
  })
}

function buildAllowedServiceStaffMap(staffUsers) {
  return new Map(staffUsers.map(user => {
    const key = String(user.old_user_id || user.id || '')
    return [key, {
      id: key,
      name: `${user.first_name || ''} ${user.last_name || ''}`.replace(/\s+/g, ' ').trim() || '—',
      role: serviceDashboardRoleLabel(user.role_id),
      openTickets: 0,
      openTasks: 0,
      openOnsites: 0,
      completed: 0,
      overdue: 0,
    }]
  }).filter(([key]) => key))
}

function normalizePersonName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function buildSalesUserIndex(users) {
  const byId = new Map()
  const byName = new Map()
  users.forEach(user => {
    const name = `${user.first_name || ''} ${user.last_name || ''}`.replace(/\s+/g, ' ').trim()
    const commaName = `${user.first_name || ''}, ${user.last_name || ''}`.replace(/\s+/g, ' ').trim()
    const record = { ...user, name }
    byId.set(String(user.id), record)
    if (normalizePersonName(name)) byName.set(normalizePersonName(name), record)
    if (normalizePersonName(commaName)) byName.set(normalizePersonName(commaName), record)
  })
  return { byId, byName }
}

function resolveSalesUser(index, owner) {
  const raw = String(owner || '').trim()
  if (!raw) return null
  return index.byId.get(raw) || index.byName.get(normalizePersonName(raw)) || null
}

function addSalesMetric(map, salesIndex, owner, updates) {
  const salesUser = resolveSalesUser(salesIndex, owner)
  if (!salesUser) return
  const key = String(salesUser.id)
  if (!map[key]) {
    map[key] = {
      id: key,
      name: salesUser.name,
      openLeads: 0,
      wonLeads: 0,
      lostLeads: 0,
      activities: 0,
      quotations: 0,
      quotationValue: 0,
      converted: 0,
      invoiceValue: 0,
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
  const { profile } = useAuth()
  const [stats, setStats] = useState({})
  const [recentTickets, setRecentTickets] = useState([])
  const [recentActivities, setRecentActivities] = useState([])

  useEffect(() => {
    if (!profile) return
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
  const { profile } = useAuth()
  const [stats, setStats] = useState({})
  const [recentActivities, setRecentActivities] = useState([])
  const [recentLeads, setRecentLeads] = useState([])
  const [salesRows, setSalesRows] = useState([])
  const [followUpItems, setFollowUpItems] = useState([])
  const [performanceMonth, setPerformanceMonth] = useState(monthValue())
  const performanceMonths = useMemo(() => monthOptions(12), [])

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    const monthStart = monthStartIso()
    const selectedRange = monthRange(performanceMonth)
    const staleDate = new Date()
    staleDate.setDate(staleDate.getDate() - 7)
    const staleIso = staleDate.toISOString().split('T')[0]
    const salesMetricStart = earlierDate(selectedRange.start, monthStart)
    const activityMetricStart = earlierDate(selectedRange.start, staleIso)
    const isSalesRestricted = isSalesRole(profile?.role_id)
    const currentLegacyUserId = getLegacyUserId(profile)

    let customerCountQuery = supabase.from('customer').select('id', { count: 'exact', head: true })
    let leadCountQuery = supabase.from('sales_lead').select('id', { count: 'exact', head: true })
    let quotationCountQuery = supabase.from('quotation').select('id', { count: 'exact', head: true })
    let invoiceCountQuery = supabase.from('invoice').select('id', { count: 'exact', head: true })
    let overdueInvoiceQuery = supabase.from('invoice').select('id', { count: 'exact', head: true }).lt('due_date', today)
    let recentActivitiesQuery = supabase.from('activity').select('id, user_id, assigned_to, type, date, description, company_id').order('date', { ascending: false }).limit(8)
    let recentLeadsQuery = supabase.from('sales_lead').select('id, first_name, last_name, company_name, status, assigned_to, created_at, updated_at').order('id', { ascending: false }).limit(5)

    if (isSalesRestricted) {
      customerCountQuery = customerCountQuery.or(`assignto.eq.${currentLegacyUserId},user_id.eq.${currentLegacyUserId}`)
      leadCountQuery = leadCountQuery.eq('assigned_to', currentLegacyUserId)
      quotationCountQuery = quotationCountQuery.eq('user_id', currentLegacyUserId)
      invoiceCountQuery = invoiceCountQuery.eq('user_id', currentLegacyUserId)
      overdueInvoiceQuery = overdueInvoiceQuery.eq('user_id', currentLegacyUserId)
      recentActivitiesQuery = recentActivitiesQuery.or(`assigned_to.eq.${currentLegacyUserId},user_id.eq.${currentLegacyUserId}`)
      recentLeadsQuery = recentLeadsQuery.eq('assigned_to', currentLegacyUserId)
    }

    let allLeadsQuery = supabase
      .from('sales_lead')
      .select('id, first_name, last_name, company_name, status, assigned_to, created_at, updated_at')

    let performanceActivitiesQuery = supabase
      .from('activity')
      .select('id, lead_id, user_id, assigned_to, type, status, date, description, created_at')
      .gte('created_at', activityMetricStart)

    let performanceQuotationsQuery = supabase
      .from('quotation')
      .select('id, user_id, number, date, sales_person, total, isconvert')
      .gte('date', salesMetricStart)

    let performanceInvoicesQuery = supabase
      .from('invoice')
      .select('id, user_id, invoice_number, date, sales_person, total')
      .gte('date', salesMetricStart)

    Promise.all([
      customerCountQuery,
      leadCountQuery,
      quotationCountQuery,
      invoiceCountQuery,
      overdueInvoiceQuery,
      recentActivitiesQuery,
      recentLeadsQuery,
      allLeadsQuery,
      performanceActivitiesQuery,
      performanceQuotationsQuery,
      performanceInvoicesQuery,
      supabase.from('stage').select('id, name').order('name'),
      fetchAssignableUsers(supabase),
      supabase.from('users').select('old_user_id, first_name, last_name').in('role_id', [ROLE_SALES, ROLE_SALES_MANAGER]).neq('status', 'Inactive').order('first_name'),
    ]).then(([cust, leads, quot, unpaidInv, overdue, acts, rLeads, allLeads, allActivities, allQuotations, allInvoices, stageRows, users, salesUsersResult]) => {
      const usersList = users || []
      const salesUsers = (salesUsersResult.data || []).map(user => ({
        id: user.old_user_id,
        first_name: user.first_name || '',
        last_name: user.last_name || '',
      }))
      const salesIndex = buildSalesUserIndex(salesUsers)
      const leadRows = allLeads.data || []
      const activityRows = allActivities.data || []
      const quotationRows = allQuotations.data || []
      const invoiceRows = allInvoices.data || []
      const stageLookup = Object.fromEntries((stageRows.data || []).map(stage => [String(stage.id), stage.name]))
      const getLeadStatusName = (status) => status ? (stageLookup[String(status)] || String(status)) : 'Open'
      const scopedLeadRows = isSalesRestricted ? leadRows.filter(lead => String(lead.assigned_to) === String(currentLegacyUserId)) : leadRows
      const scopedLeadIds = new Set(scopedLeadRows.map(lead => String(lead.id)))
      const scopedActivityRows = isSalesRestricted
        ? activityRows.filter(activity =>
          String(activity.assigned_to) === String(currentLegacyUserId) ||
          String(activity.user_id) === String(currentLegacyUserId) ||
          scopedLeadIds.has(String(activity.lead_id || '')))
        : activityRows
      const scopedQuotationRows = isSalesRestricted ? quotationRows.filter(row => String(row.user_id) === String(currentLegacyUserId)) : quotationRows
      const scopedInvoiceRows = isSalesRestricted ? invoiceRows.filter(row => String(row.user_id) === String(currentLegacyUserId)) : invoiceRows
      const openLeads = scopedLeadRows.filter(lead => !isClosedLeadStatus(getLeadStatusName(lead.status)))
      const newLeadsThisMonth = scopedLeadRows.filter(lead => isThisMonth(lead.created_at, monthStart)).length
      const quoteValueThisMonth = scopedQuotationRows
        .filter(row => isThisMonth(row.date, monthStart))
        .reduce((sum, row) => sum + Number(row.total || 0), 0)
      const invoiceValueThisMonth = scopedInvoiceRows
        .filter(row => isThisMonth(row.date, monthStart))
        .reduce((sum, row) => sum + Number(row.total || 0), 0)
      const convertedQuotes = scopedQuotationRows.filter(row => row.isconvert === 1).length
      const salesMap = {}

      leadRows.forEach(lead => {
        const status = getLeadStatusName(lead.status).toLowerCase()
        addSalesMetric(salesMap, salesIndex, lead.assigned_to, {
          openLeads: isClosedLeadStatus(status) ? 0 : 1,
          wonLeads: status.includes('won') ? 1 : 0,
          lostLeads: status.includes('lost') ? 1 : 0,
        })
      })
      activityRows
        .filter(activity => isInMonth(activity.date || activity.created_at, selectedRange))
        .forEach(activity => {
          addSalesMetric(salesMap, salesIndex, activity.assigned_to, { activities: 1 })
        })
      quotationRows
        .filter(row => isInMonth(row.date, selectedRange))
        .forEach(row => {
          addSalesMetric(salesMap, salesIndex, row.sales_person || row.user_id, {
            quotations: 1,
            quotationValue: Number(row.total || 0),
            converted: row.isconvert === 1 ? 1 : 0,
          })
        })
      invoiceRows
        .filter(row => isInMonth(row.date, selectedRange))
        .forEach(row => {
          addSalesMetric(salesMap, salesIndex, row.sales_person || row.user_id, { invoiceValue: Number(row.total || 0) })
        })

      const lastActivityByLead = {}
      scopedActivityRows.forEach(activity => {
        if (!activity.lead_id) return
        const date = String(activity.date || activity.created_at || '').slice(0, 10)
        if (!lastActivityByLead[activity.lead_id] || date > lastActivityByLead[activity.lead_id]) {
          lastActivityByLead[activity.lead_id] = date
        }
      })
      const followUps = openLeads
        .map(lead => {
          const lastActivity = lastActivityByLead[lead.id] || String(lead.updated_at || lead.created_at || '').slice(0, 10)
          return {
            id: lead.id,
            name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unnamed lead',
            company: lead.company_name || '—',
            owner: formatUserName(usersList, lead.assigned_to),
            status: getLeadStatusName(lead.status),
            lastActivity,
          }
        })
        .filter(lead => !lead.lastActivity || lead.lastActivity <= staleIso)
        .sort((a, b) => String(a.lastActivity).localeCompare(String(b.lastActivity)))
        .slice(0, 8)

      setStats({
        customers:      cust.count    || 0,
        leads:          openLeads.length,
        newLeadsThisMonth,
        quotations:     quot.count    || 0,
        invoices: unpaidInv.count || 0,
        overdueInvoices: overdue.count || 0,
        quoteValueThisMonth,
        invoiceValueThisMonth,
        quoteConversion: scopedQuotationRows.length > 0 ? Math.round((convertedQuotes / scopedQuotationRows.length) * 100) : 0,
      })
      setRecentActivities(acts.data || [])
      setRecentLeads((rLeads.data || []).map(lead => ({ ...lead, status_name: getLeadStatusName(lead.status) })))
      setSalesRows(Object.values(salesMap)
        .sort((a, b) => (b.invoiceValue + b.quotationValue + b.openLeads) - (a.invoiceValue + a.quotationValue + a.openLeads))
        .slice(0, 8))
      setFollowUpItems(followUps)
    })
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#111111]">Good day, {firstName}!</h2>
        <p className="text-gray-400 text-sm mt-0.5">Sales overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Customers"        value={stats.customers}       icon={Building2}     color="#2563EB" bg="#EFF6FF" to="/customers" />
        <StatCard label="Open Leads"       value={stats.leads}           icon={TrendingUp}    color="#BE185D" bg="#FDF2F8" to="/leads" />
        <StatCard label="New Leads This Month" value={stats.newLeadsThisMonth} icon={Users} color="#7C3AED" bg="#F5F3FF" to="/leads" />
        <StatCard label="Quotations"       value={stats.quotations}      icon={FileText}      color="#7C3AED" bg="#F5F3FF" to="/quotations" />
        <StatCard label="Quotation Value"  value={fmtCurrency(stats.quoteValueThisMonth)} icon={FileText} color="#0891B2" bg="#ECFEFF" to="/quotations" />
        <StatCard label="Invoice Value"    value={fmtCurrency(stats.invoiceValueThisMonth)} icon={Receipt} color="#059669" bg="#ECFDF5" to="/invoices" />
        <StatCard label="Quote Conversion" value={`${stats.quoteConversion ?? 0}%`} icon={CheckCircle2} color="#059669" bg="#ECFDF5" />
        <StatCard label="Invoices"         value={stats.invoices}         icon={Receipt}       color="#D97706" bg="#FFFBEB" to="/invoices" />
        <StatCard label="Overdue Invoices" value={stats.overdueInvoices} icon={AlertTriangle} color="#CC0000" bg="#FEF2F2" to="/invoices" />
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
                    <p className="text-xs text-gray-500">{l.company_name || ''}</p>
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
  const [staffLoadNote, setStaffLoadNote] = useState('')
  const [attentionItems, setAttentionItems] = useState([])
  const [staffMonth, setStaffMonth] = useState(monthValue())
  const staffMonths = useMemo(() => monthOptions(12), [])

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    const selectedRange = monthRange(staffMonth)
    const serviceWorkDate = (row, ...fields) => fields.map(field => row?.[field]).find(Boolean)
    const isServiceWorkInMonth = (row, ...fields) => isInMonth(serviceWorkDate(row, ...fields), selectedRange)
    Promise.all([
      supabase.from('ticket').select('id', { count: 'exact', head: true }).eq('is_completed', 0),
      supabase.from('task').select('id', { count: 'exact', head: true }).eq('is_completed', 0),
      supabase.from('onsiteticket').select('id', { count: 'exact', head: true }).eq('is_completed', 0),
      supabase.from('ticket').select('id', { count: 'exact', head: true }).eq('is_completed', 0).lt('due_date', today),
      supabase.from('rma').select('id', { count: 'exact', head: true }),
      supabase.from('ticket').select('id, ticket_id, company_name, priority, due_date, status').eq('is_completed', 0).order('id', { ascending: false }).limit(6),
      supabase.from('task').select('id, ticket_id, servicetype, startdate, assigned_to').eq('is_completed', 0).order('id', { ascending: false }).limit(5),
      fetchAllRows('ticket', 'id, ticket_id, company_name, assigned_to, date, due_date, priority, is_completed, status', 'id', { ascending: false }),
      fetchAllRows('task', 'id, ticket_id, servicetype, assigned_to, startdate, enddate, is_completed', 'id', { ascending: false }),
      fetchAllRows('onsiteticket', 'id, ticket_id, issue_description, product, assigned_to, date, is_completed, status', 'id', { ascending: false }),
      fetchAssignableUsers(supabase),
      supabase.from('users').select('id, old_user_id, first_name, last_name, role_id, status').eq('role_id', ROLE_SERVICE).order('first_name'),
    ]).then(([tick, tsk, onsite, overdue, rma, rTick, rTask, allTickets, allTasks, allOnsites, users, serviceStaff]) => {
      const tickets = allTickets || []
      const tasks = allTasks || []
      const onsites = allOnsites || []
      const activeServiceStaff = (serviceStaff.data || []).filter(user => isActiveUserStatus(user.status))
      const allowedStaffById = buildAllowedServiceStaffMap(activeServiceStaff)
      const ticketNumberById = Object.fromEntries(tickets.map(ticket => [ticket.id, ticket.ticket_id]))
      const completedWork = tasks.filter(t => t.is_completed == 1).length + onsites.filter(o => o.is_completed == 1 || o.status === 'Completed').length
      const pendingWork = tasks.filter(t => t.is_completed != 1).length + onsites.filter(o => o.is_completed != 1 && o.status !== 'Completed').length
      const dueToday = tasks.filter(t => t.is_completed != 1 && t.enddate === today).length
        + tickets.filter(t => t.is_completed != 1 && t.due_date === today).length

      const staffMap = {}
      seedServiceStaffMetrics(staffMap, activeServiceStaff)
      tickets.forEach(ticket => {
        if (ticket.is_completed == 1 || ticket.status === 'Completed') {
          if (isServiceWorkInMonth(ticket, 'due_date', 'date')) {
            addStaffMetric(staffMap, allowedStaffById, ticket.assigned_to, { completed: 1 })
          }
          return
        }
        addStaffMetric(staffMap, allowedStaffById, ticket.assigned_to, {
          openTickets: 1,
          overdue: ticket.due_date && ticket.due_date < today ? 1 : 0,
        })
      })
      tasks.forEach(task => {
        if (task.is_completed == 1) {
          if (isServiceWorkInMonth(task, 'enddate', 'startdate')) {
            addStaffMetric(staffMap, allowedStaffById, task.assigned_to, { completed: 1 })
          }
          return
        }
        addStaffMetric(staffMap, allowedStaffById, task.assigned_to, {
          openTasks: 1,
          overdue: task.enddate && task.enddate < today ? 1 : 0,
        })
      })
      onsites.forEach(onsiteRow => {
        if (onsiteRow.is_completed == 1 || onsiteRow.status === 'Completed') {
          if (isServiceWorkInMonth(onsiteRow, 'date')) {
            addStaffMetric(staffMap, allowedStaffById, onsiteRow.assigned_to, { completed: 1 })
          }
          return
        }
        addStaffMetric(staffMap, allowedStaffById, onsiteRow.assigned_to, { openOnsites: 1 })
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
            state: { ticketId: ticket.id },
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
      const nextStaffRows = Object.values(staffMap)
        .map(row => ({ ...row, pending: row.openTickets + row.openTasks + row.openOnsites }))
        .sort((a, b) => (b.pending + b.overdue) - (a.pending + a.overdue))
      setStaffRows(nextStaffRows)
      setStaffLoadNote(serviceStaff.error
        ? `Unable to load tech users: ${serviceStaff.error.message}`
        : nextStaffRows.length === 0
          ? 'No active Tech users found. Check user role and active status in Settings > Users.'
          : '')
      setAttentionItems(attention)
    })
  }, [staffMonth])

  const today = new Date().toISOString().split('T')[0]
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
        {staffRows.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">{staffLoadNote || 'No active tech users found.'}</p> : (
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
                    <td className="px-3 py-2 font-medium text-gray-900">{row.name || '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{row.role || '—'}</td>
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
                <Link key={t.id} to="/tickets" state={{ ticketId: t.id }} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <div>
                    <span className="text-sm font-semibold text-red-600 mr-2">TID{t.ticket_id}</span>
                    <span className="text-sm text-gray-800">{t.company_name || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.priority && <span className={`text-xs px-2 py-0.5 rounded ${priorityColor(t.priority)}`}>{t.priority}</span>}
                    {t.due_date && t.due_date < today && <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">Overdue</span>}
                  </div>
                </Link>
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
                <Link key={item.key} to={item.to} state={item.state} className="block py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50">
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

  if (isSalesRole(profile?.role_id)) return <SalesDashboard firstName={firstName} />
  if (isServiceRole(profile?.role_id)) return <ServiceDashboard firstName={firstName} />
  return <AdminDashboard firstName={firstName} />
}
