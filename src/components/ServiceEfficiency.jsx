import { useEffect, useMemo, useState } from 'react'
import { TrendingUp, Layers, Timer, Clock, Gauge, CalendarCheck } from 'lucide-react'
import { fetchAllRows, fetchRowsByIds } from '../lib/fetchAllRows'
import { useAssignableUsers, useLegacyUsers } from '../hooks/useLookups'
import { getUserName } from '../lib/legacyUsers'
import { displayText } from '../lib/displayText'

const DAY_MS = 86400000

function parseDateOnly(value) {
  if (!value) return null
  const date = new Date(String(value).slice(0, 10) + 'T00:00:00')
  return Number.isNaN(date.getTime()) ? null : date
}

// Builds a Date from the task's separate date + time columns. Time formats in
// legacy data vary, so anything that doesn't look like HH:MM is treated as
// missing (the task still counts, it just can't contribute measured hours).
function taskTimestamp(dateValue, timeValue) {
  const day = String(dateValue || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const match = String(timeValue || '').trim().match(/^([01]?\d|2[0-3]):([0-5]\d)/)
  if (!match) return null
  const stamp = new Date(`${day}T${match[1].padStart(2, '0')}:${match[2]}:00`)
  return Number.isNaN(stamp.getTime()) ? null : stamp
}

// Measured duration of a task in hours, or null when the timestamps are
// missing/invalid. Durations over 24h (multi-day date-entry artefacts) are
// excluded so one bad row can't distort the totals.
function taskHours(task) {
  const start = taskTimestamp(task.startdate, task.starttime)
  const end = taskTimestamp(task.enddate, task.endtime)
  if (!start || !end) return null
  const hours = (end.getTime() - start.getTime()) / 3600000
  return hours > 0 && hours <= 24 ? hours : null
}

function monthBounds(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(year, monthNumber, 0).getDate()
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` }
}

function trailingMonths(count) {
  const now = new Date()
  return Array.from({ length: count }, (_, idx) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - idx), 1)
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-GB', { month: 'short' }),
    }
  })
}

const AGE_BUCKETS = [
  { label: '0–3 days', max: 3, bar: 'bg-green-500' },
  { label: '4–7 days', max: 7, bar: 'bg-yellow-500' },
  { label: '8–14 days', max: 14, bar: 'bg-orange-500' },
  { label: '15+ days', max: Infinity, bar: 'bg-red-500' },
]

function Panel({ icon: Icon, title, caption, children }) {
  return (
    <div className="border border-gray-100 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-gray-400" />
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</h4>
      </div>
      {caption && <p className="text-[11px] text-gray-400 mb-3">{caption}</p>}
      {children}
    </div>
  )
}

// Management view of service-team efficiency, computed client-side from the
// ticket and task tables (no dashboard RPC changes). Follows the same month
// selector as the Staff Workload table above it.
export default function ServiceEfficiency({ month, monthLabel, staffRows = [] }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const legacyUsersQuery = useLegacyUsers()
  const assignableUsersQuery = useAssignableUsers()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const { start: monthStart, end: monthEnd } = monthBounds(month)
    const now = new Date()
    const trendStartDate = new Date(now.getFullYear(), now.getMonth() - 5, 1)
    const trendStart = `${trendStartDate.getFullYear()}-${String(trendStartDate.getMonth() + 1).padStart(2, '0')}-01`

    Promise.all([
      fetchAllRows('ticket', 'id, date', 'id', { gte: { date: trendStart } }),
      fetchAllRows('ticket', 'id, date', 'id', { eq: { is_completed: 0 } }),
      fetchAllRows('ticket', 'id, date', 'id', { gte: { date: monthStart }, lte: { date: monthEnd } }),
      fetchAllRows('task', 'id, ticket_id, assigned_to, startdate, starttime, enddate, endtime', 'id', {
        gte: { startdate: monthStart },
        lte: { startdate: monthEnd },
      }),
      // Tickets completed within the selected month (completed_at is a timestamp,
      // so bound the range to the whole last day).
      fetchAllRows('ticket', 'id, date, due_date, completed_at', 'id', {
        gte: { completed_at: `${monthStart} 00:00:00` },
        lte: { completed_at: `${monthEnd} 23:59:59` },
      }),
    ]).then(async ([trendTickets, openTickets, monthTickets, monthTasks, completedTickets]) => {
      const firstTasks = await fetchRowsByIds(
        'task', 'ticket_id, startdate', monthTickets.map(t => t.id), 'ticket_id',
      )
      if (!cancelled) setData({ trendTickets, openTickets, monthTickets, monthTasks, firstTasks, completedTickets })
    }).catch(() => {
      if (!cancelled) setData(null)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [month])

  const userLookup = useMemo(() => {
    const merged = [...(legacyUsersQuery.data || []), ...(assignableUsersQuery.data || [])]
    const seen = new Set()
    return merged.filter(user => {
      const key = String(user.id)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [legacyUsersQuery.data, assignableUsersQuery.data])

  const metrics = useMemo(() => {
    if (!data) return null
    const today = new Date()

    const months = trailingMonths(6)
    const trendCounts = Object.fromEntries(months.map(m => [m.key, 0]))
    data.trendTickets.forEach(t => {
      const key = String(t.date || '').slice(0, 7)
      if (key in trendCounts) trendCounts[key] += 1
    })
    const trend = months.map(m => ({ ...m, count: trendCounts[m.key] }))
    const trendMax = Math.max(1, ...trend.map(m => m.count))

    const aging = AGE_BUCKETS.map(bucket => ({ ...bucket, count: 0 }))
    data.openTickets.forEach(t => {
      const created = parseDateOnly(t.date)
      if (!created) return
      const age = Math.max(0, Math.floor((today.getTime() - created.getTime()) / DAY_MS))
      aging.find(bucket => age <= bucket.max).count += 1
    })
    const agingMax = Math.max(1, ...aging.map(bucket => bucket.count))

    // Earliest logged task start per ticket created in the selected month.
    const firstStartByTicket = {}
    data.firstTasks.forEach(task => {
      const start = parseDateOnly(task.startdate)
      if (!start) return
      const key = String(task.ticket_id)
      if (!firstStartByTicket[key] || start < firstStartByTicket[key]) firstStartByTicket[key] = start
    })
    let respondedCount = 0
    let responseDaysTotal = 0
    data.monthTickets.forEach(t => {
      const created = parseDateOnly(t.date)
      const firstStart = firstStartByTicket[String(t.id)]
      if (!created || !firstStart) return
      respondedCount += 1
      responseDaysTotal += Math.max(0, Math.floor((firstStart.getTime() - created.getTime()) / DAY_MS))
    })
    const avgResponseDays = respondedCount ? responseDaysTotal / respondedCount : null
    const noActionCount = data.monthTickets.length - respondedCount

    // Hours logged per staff. Aggregate task hours by assignee first.
    const hoursByStaff = {}
    let totalHours = 0
    data.monthTasks.forEach(task => {
      const key = String(task.assigned_to || '')
      if (!hoursByStaff[key]) hoursByStaff[key] = { tasks: 0, hours: 0, timed: 0 }
      hoursByStaff[key].tasks += 1
      const hours = taskHours(task)
      if (hours !== null) {
        hoursByStaff[key].hours += hours
        hoursByStaff[key].timed += 1
        totalHours += hours
      }
    })
    // Start from the canonical active-staff list (same set as the Staff Workload
    // table) so every staff member is shown even with no tasks, then fold in any
    // assignees who aren't on that list (e.g. former staff still holding tasks).
    const seen = new Set()
    const hoursRows = []
    staffRows.forEach(staff => {
      const key = String(staff.id)
      seen.add(key)
      hoursRows.push({ id: key, name: staff.name, ...(hoursByStaff[key] || { tasks: 0, hours: 0, timed: 0 }) })
    })
    Object.entries(hoursByStaff).forEach(([key, agg]) => {
      if (seen.has(key)) return
      hoursRows.push({ id: key, name: key ? getUserName(userLookup, key) : 'Unassigned', ...agg })
    })
    hoursRows.sort((a, b) => b.hours - a.hours || b.tasks - a.tasks || String(a.name || '').localeCompare(String(b.name || '')))

    // Turnaround + on-time, from tickets completed during the selected month.
    let tatCount = 0
    let tatDaysTotal = 0
    let dueCount = 0
    let onTimeCount = 0
    ;(data.completedTickets || []).forEach(t => {
      const created = parseDateOnly(t.date)
      const completed = parseDateOnly(t.completed_at)
      if (created && completed) {
        tatCount += 1
        tatDaysTotal += Math.max(0, Math.floor((completed.getTime() - created.getTime()) / DAY_MS))
      }
      const due = String(t.due_date || '').slice(0, 10)
      const completedDay = String(t.completed_at || '').slice(0, 10)
      if (due && completedDay) {
        dueCount += 1
        if (completedDay <= due) onTimeCount += 1
      }
    })
    const avgTat = tatCount ? tatDaysTotal / tatCount : null
    const onTimeRate = dueCount ? Math.round((onTimeCount / dueCount) * 100) : null
    const completedCount = (data.completedTickets || []).length

    return {
      trend, trendMax, aging, agingMax, avgResponseDays, respondedCount, noActionCount,
      hoursRows, totalHours, monthTicketCount: data.monthTickets.length,
      avgTat, tatCount, onTimeRate, dueCount, onTimeCount, completedCount,
    }
  }, [data, staffRows, userLookup])

  return (
    <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[#111111] text-sm">Service Efficiency</h3>
          <p className="text-xs text-gray-400 mt-0.5">Turnaround, on-time rate, responsiveness, and hours logged. Uses the month selector above.</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded px-2.5 py-1">{monthLabel}</span>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-[#CC0000] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !metrics ? (
        <p className="text-sm text-gray-400 text-center py-6">Unable to load efficiency metrics.</p>
      ) : (
        <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="border border-gray-100 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Gauge size={14} className="text-gray-400" />
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Avg Turnaround</h4>
            </div>
            <div className="text-3xl font-bold text-[#111111] mt-2">
              {metrics.avgTat === null ? '—' : `${metrics.avgTat.toFixed(1)} days`}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {metrics.tatCount > 0
                ? `Across ${metrics.tatCount} ticket${metrics.tatCount === 1 ? '' : 's'} completed in ${monthLabel}.`
                : `No tickets completed in ${monthLabel} yet.`}
            </p>
          </div>
          <div className="border border-gray-100 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <CalendarCheck size={14} className="text-gray-400" />
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">On-Time Completion</h4>
            </div>
            <div className={`text-3xl font-bold mt-2 ${metrics.onTimeRate === null ? 'text-[#111111]' : metrics.onTimeRate >= 80 ? 'text-green-600' : metrics.onTimeRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {metrics.onTimeRate === null ? '—' : `${metrics.onTimeRate}%`}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {metrics.dueCount > 0
                ? `${metrics.onTimeCount} of ${metrics.dueCount} completed on/before due date.`
                : 'No completed tickets with a due date this month.'}
            </p>
          </div>
          <div className="border border-gray-100 rounded-lg p-4 col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-1">
              <CalendarCheck size={14} className="text-gray-400" />
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Completed This Month</h4>
            </div>
            <div className="text-3xl font-bold text-[#111111] mt-2">{metrics.completedCount}</div>
            <p className="text-[11px] text-gray-400 mt-1">Tickets closed in {monthLabel}.</p>
          </div>
        </div>
        {metrics.completedCount === 0 && (
          <p className="text-[11px] text-gray-400 -mt-1">
            Turnaround and on-time figures build up as tickets are completed — historical tickets completed before this feature have no recorded completion time.
          </p>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel icon={TrendingUp} title="Ticket Intake — Last 6 Months" caption="Tickets created per month.">
            <div className="flex items-end gap-2 h-28">
              {metrics.trend.map(m => (
                <div key={m.key} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="text-[11px] font-semibold text-gray-700 mb-1">{m.count}</span>
                  <div
                    className={`w-full rounded-t ${m.key === month ? 'bg-blue-600' : 'bg-blue-200'}`}
                    style={{ height: `${Math.max(4, (m.count / metrics.trendMax) * 100)}%` }}
                  />
                  <span className="text-[11px] text-gray-400 mt-1">{m.label}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel icon={Layers} title="Open Ticket Ageing" caption="How long current open tickets have been sitting, from creation date.">
            <div className="space-y-2.5">
              {metrics.aging.map(bucket => (
                <div key={bucket.label} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-gray-500">{bucket.label}</span>
                  <div className="flex-1 h-2.5 bg-gray-100 rounded overflow-hidden">
                    <div className={`h-full rounded ${bucket.bar}`} style={{ width: `${(bucket.count / metrics.agingMax) * 100}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs font-semibold text-gray-700">{bucket.count}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel icon={Timer} title={`Response Time — ${monthLabel}`} caption="Average days from ticket creation to the first task being started.">
            <div className="text-3xl font-bold text-[#111111]">
              {metrics.avgResponseDays === null ? '—' : `${metrics.avgResponseDays.toFixed(1)} days`}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {metrics.respondedCount} of {metrics.monthTicketCount} tickets have work logged
              {metrics.noActionCount > 0 && <span className="text-red-600 font-medium"> · {metrics.noActionCount} with no task yet</span>}
            </p>
          </Panel>

          <Panel icon={Clock} title={`Hours Logged — ${monthLabel}`} caption="From task start/end times. Tasks without valid times are counted but not timed.">
            <div className="text-3xl font-bold text-[#111111] mb-3">{metrics.totalHours.toFixed(1)}h</div>
            {metrics.hoursRows.length === 0 ? (
              <p className="text-xs text-gray-400">No service staff found.</p>
            ) : (
              <div className="max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-400">
                      <th className="py-1 text-left font-medium">Staff</th>
                      <th className="py-1 text-right font-medium">Tasks</th>
                      <th className="py-1 text-right font-medium">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.hoursRows.map(row => (
                      <tr key={row.id || 'unassigned'} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 text-gray-800">{displayText(row.name, 'Unassigned')}</td>
                        <td className={`py-1.5 text-right ${row.tasks ? 'text-gray-600' : 'text-gray-300'}`}>{row.tasks}</td>
                        <td className={`py-1.5 text-right font-semibold ${row.timed ? 'text-gray-800' : 'text-gray-300'}`}>{row.timed ? `${row.hours.toFixed(1)}h` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
        </div>
      )}
    </div>
  )
}
