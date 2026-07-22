import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fetchAssignableUsers, getLegacyUserId, getUserName } from '../lib/legacyUsers'
import { displayText } from '../lib/displayText'
import {
  formatThreadTime,
  isMissingWorkThreadTable,
  workThreadRecordLabel,
  workThreadRoute,
} from '../lib/workThreads'
import { parseDateForDisplay } from '../lib/dateFormat'

const INBOX_LIMIT = 60

function threadTypeLabel(type = '') {
  const map = {
    ticket: 'Ticket',
    task: 'Task',
    lead: 'Lead',
    booking: 'Booking',
    calibration: 'Calibration',
  }
  return map[type] || displayText(type, 'Record')
}

function latestMessageFor(threadId, messagesByThread) {
  return messagesByThread[String(threadId)] || null
}

export default function WorkInbox() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [threads, setThreads] = useState([])
  const [messagesByThread, setMessagesByThread] = useState({})
  const [readsByThread, setReadsByThread] = useState({})
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState('')

  const currentOldUserId = getLegacyUserId(profile)

  const userName = useCallback((oldUserId) => {
    return displayText(getUserName(users, oldUserId), 'System')
  }, [users])

  const unreadCount = useMemo(() => threads.filter(thread => {
    const latest = latestMessageFor(thread.id, messagesByThread)
    const readAt = readsByThread[String(thread.id)]
    if (!latest?.created_at) return false
    if (String(latest.created_by_old_user_id || '') === String(currentOldUserId || '')) return false
    const latestAt = parseDateForDisplay(latest.created_at)
    const lastReadAt = parseDateForDisplay(readAt)
    return !!latestAt && (!lastReadAt || latestAt > lastReadAt)
  }).length, [currentOldUserId, messagesByThread, readsByThread, threads])

  const fetchInbox = useCallback(async () => {
    setLoading(true)
    setError('')
    setUnavailable(false)

    const { data: threadRows, error: threadError } = await supabase
      .from('work_threads')
      .select('*')
      .eq('is_archived', false)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(INBOX_LIMIT)

    if (threadError) {
      if (isMissingWorkThreadTable(threadError)) setUnavailable(true)
      else setError(threadError.message)
      setLoading(false)
      return
    }

    const list = threadRows || []
    setThreads(list)

    if (list.length === 0) {
      setMessagesByThread({})
      setReadsByThread({})
      setLoading(false)
      return
    }

    const threadIds = list.map(thread => thread.id)
    const [messageR, readR] = await Promise.all([
      supabase
        .from('work_messages')
        .select('*')
        .in('thread_id', threadIds)
        .order('created_at', { ascending: false })
        .limit(INBOX_LIMIT * 3),
      currentOldUserId
        ? supabase
            .from('work_thread_reads')
            .select('thread_id,last_read_at')
            .eq('user_old_user_id', currentOldUserId)
            .in('thread_id', threadIds)
        : Promise.resolve({ data: [] }),
    ])

    if (messageR.error) {
      if (isMissingWorkThreadTable(messageR.error)) setUnavailable(true)
      else setError(messageR.error.message)
      setLoading(false)
      return
    }

    const latestByThread = {}
    ;(messageR.data || []).forEach(message => {
      const key = String(message.thread_id)
      if (!latestByThread[key]) latestByThread[key] = message
    })
    setMessagesByThread(latestByThread)
    setReadsByThread(Object.fromEntries((readR.data || []).map(row => [String(row.thread_id), row.last_read_at])))
    setLoading(false)
  }, [currentOldUserId])

  useEffect(() => {
    fetchAssignableUsers(supabase).then(setUsers)
  }, [])

  useEffect(() => {
    fetchInbox()
  }, [fetchInbox])

  const openThread = async (thread) => {
    if (currentOldUserId) {
      await supabase.from('work_thread_reads').upsert([{
        thread_id: thread.id,
        user_old_user_id: currentOldUserId,
        last_read_at: new Date().toISOString(),
      }], { onConflict: 'thread_id,user_old_user_id' })
    }
    const route = workThreadRoute(thread)
    navigate(route.pathname, { state: route.state || undefined })
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Work Inbox</h1>
          <p className="mt-1 text-sm text-gray-500">Recent ticket and task discussions in one place.</p>
        </div>
        <button
          type="button"
          onClick={fetchInbox}
          className="inline-flex items-center justify-center gap-1.5 border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {unavailable ? (
        <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Work Inbox is ready in the app, but the database update has not been applied yet.
        </div>
      ) : error ? (
        <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : (
        <div className="bg-white border border-gray-200">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <MessageSquare size={16} />
              Discussions
            </div>
            <span className="text-xs text-gray-500">{unreadCount} unread</span>
          </div>

          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">Loading work inbox...</div>
          ) : threads.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">No work discussions yet.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {threads.map(thread => {
                const latest = latestMessageFor(thread.id, messagesByThread)
                const readAt = readsByThread[String(thread.id)]
                const unread = latest?.created_at &&
                  String(latest.created_by_old_user_id || '') !== String(currentOldUserId || '') &&
                  (() => {
                    const latestAt = parseDateForDisplay(latest.created_at)
                    const lastReadAt = parseDateForDisplay(readAt)
                    return !!latestAt && (!lastReadAt || latestAt > lastReadAt)
                  })()
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => openThread(thread)}
                    className={`block w-full px-4 py-3 text-left hover:bg-gray-50 ${unread ? 'bg-red-50/60' : 'bg-white'}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {threadTypeLabel(thread.record_type)}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">{workThreadRecordLabel(thread)}</span>
                      {thread.company_name && <span className="text-xs text-gray-500">{thread.company_name}</span>}
                      {unread && <span className="ml-auto h-2 w-2 rounded-full bg-[#CC0000]" />}
                    </div>
                    <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="line-clamp-2 text-sm text-gray-600">
                        {latest
                          ? `${userName(latest.created_by_old_user_id)}: ${latest.body || 'Attachment'}`
                          : 'No messages yet.'}
                      </p>
                      <span className="shrink-0 text-xs text-gray-400">
                        {formatThreadTime(latest?.created_at || thread.last_message_at || thread.updated_at)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
