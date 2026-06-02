import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import PaginationControls from '../../components/PaginationControls'
import { Search } from 'lucide-react'

const PAGE_SIZE = 30

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function ActivityLog() {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [moduleFilter, setModuleFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchRows = useCallback(async () => {
    setLoading(true)
    setError('')

    let query = supabase
      .from('activity_log')
      .select('id, created_at, actor_name, actor_role_id, module, action, record_table, record_id, record_label, summary', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (moduleFilter.trim()) query = query.ilike('module', `%${moduleFilter.trim()}%`)
    if (actionFilter.trim()) query = query.ilike('action', `%${actionFilter.trim()}%`)
    if (search.trim()) {
      const term = search.trim()
      query = query.or(`actor_name.ilike.%${term}%,record_label.ilike.%${term}%,summary.ilike.%${term}%,record_id.ilike.%${term}%`)
    }

    query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    const { data, count, error: err } = await query
    if (err) {
      setRows([])
      setTotal(0)
      setError(err.message)
    } else {
      setRows(data || [])
      setTotal(count || 0)
    }
    setLoading(false)
  }, [actionFilter, moduleFilter, page, search])

  useEffect(() => { fetchRows() }, [fetchRows])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
        <p className="mt-1 text-sm text-gray-500">
          Private audit trail for Super Admin users. Normal Admin, Sales, Sales Manager, and Service users cannot access this page.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search user, record, or summary..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-red-400 focus:outline-none"
          />
        </div>
        <input
          type="text"
          placeholder="Filter module..."
          value={moduleFilter}
          onChange={e => { setModuleFilter(e.target.value); setPage(1) }}
          className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
        />
        <input
          type="text"
          placeholder="Filter action..."
          value={actionFilter}
          onChange={e => { setActionFilter(e.target.value); setPage(1) }}
          className="w-full border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
        />
      </div>

      {error && <div className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Time</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Actor</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Module</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Action</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Record</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-700">Summary</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-12 text-center text-gray-400">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-gray-400">No activity has been logged yet.</td></tr>
            ) : rows.map(row => (
              <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(row.created_at)}</td>
                <td className="px-4 py-3 text-gray-900">
                  {row.actor_name || '—'}
                  {row.actor_role_id && <span className="ml-1 text-xs text-gray-400">Role {row.actor_role_id}</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">{row.module || '—'}</td>
                <td className="px-4 py-3">
                  <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {row.action || '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {row.record_label || row.record_id || row.record_table || '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{row.summary || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationControls page={page} totalPages={totalPages} total={total} label="activity log" onPageChange={setPage} />
    </div>
  )
}
