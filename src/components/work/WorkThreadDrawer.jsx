import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, MessageSquare, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { displayText } from '../../lib/displayText'
import { formatThreadTime, isMissingWorkThreadTable } from '../../lib/workThreads'
import WorkThread from './WorkThread'

function messagePreview(message) {
  if (!message) return 'No discussion yet.'
  const attachments = Array.isArray(message.attachment_paths) ? message.attachment_paths.length : 0
  if (message.body) return message.body
  if (attachments) return `${attachments} attachment${attachments !== 1 ? 's' : ''}`
  return 'New discussion update.'
}

export default function WorkThreadDrawer({
  recordType,
  recordId,
  title,
  reference,
  companyName = '',
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState({ loading: true, unavailable: false, count: 0, latest: null })

  const loadSummary = useCallback(async () => {
    if (!recordType || !recordId) return
    setSummary(prev => ({ ...prev, loading: true, unavailable: false }))

    const { data: thread, error: threadError } = await supabase
      .from('work_threads')
      .select('id')
      .eq('record_type', recordType)
      .eq('record_id', String(recordId))
      .maybeSingle()

    if (threadError) {
      setSummary(prev => ({
        ...prev,
        loading: false,
        unavailable: isMissingWorkThreadTable(threadError),
      }))
      return
    }

    if (!thread?.id) {
      setSummary({ loading: false, unavailable: false, count: 0, latest: null })
      return
    }

    const { data: messages, count, error: messageError } = await supabase
      .from('work_messages')
      .select('id, body, attachment_paths, created_at', { count: 'exact' })
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (messageError) {
      setSummary(prev => ({
        ...prev,
        loading: false,
        unavailable: isMissingWorkThreadTable(messageError),
      }))
      return
    }

    setSummary({
      loading: false,
      unavailable: false,
      count: count || 0,
      latest: messages?.[0] || null,
    })
  }, [recordId, recordType])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  useEffect(() => {
    if (!open) loadSummary()
  }, [loadSummary, open])

  const closeDrawer = () => {
    setOpen(false)
    loadSummary()
  }

  return (
    <div className={`border-t border-gray-100 pt-5 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 border border-gray-200 bg-white px-4 py-3 text-left hover:border-red-200 hover:bg-red-50/30"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-red-50 text-red-600">
          <MessageSquare size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">Discussion</span>
            <span className="text-xs text-gray-400">
              {summary.loading ? 'Loading...' : `${summary.count} message${summary.count !== 1 ? 's' : ''}`}
            </span>
          </span>
          <span className={`mt-1 block truncate text-xs ${summary.unavailable ? 'text-amber-700' : 'text-gray-500'}`}>
            {summary.unavailable
              ? 'Database update pending.'
              : `${displayText(messagePreview(summary.latest), 'No discussion yet.')}${summary.latest?.created_at ? ` · ${formatThreadTime(summary.latest.created_at)}` : ''}`}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close discussion"
            onClick={closeDrawer}
            className="absolute inset-0 bg-black/40"
          />
          <aside className="absolute right-0 top-0 flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Discussion</p>
                <h2 className="mt-1 truncate text-lg font-semibold text-gray-900">{reference || title || 'Work discussion'}</h2>
                {companyName && <p className="mt-0.5 truncate text-sm text-gray-500">{companyName}</p>}
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="flex h-9 w-9 shrink-0 items-center justify-center border border-gray-200 text-gray-500 hover:bg-gray-50"
                title="Close discussion"
              >
                <X size={17} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <WorkThread
                recordType={recordType}
                recordId={recordId}
                title={title}
                reference={reference}
                companyName={companyName}
                link="/work-inbox"
                showHeader={false}
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
