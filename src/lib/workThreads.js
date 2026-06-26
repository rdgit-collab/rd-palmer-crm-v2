export const WORK_THREAD_FILE_LIMIT = 3
export const WORK_THREAD_FILE_SIZE_LIMIT = 10 * 1024 * 1024

export function isMissingWorkThreadTable(error) {
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  return text.includes('42p01') ||
    text.includes('pgrst205') ||
    (text.includes('schema cache') && (
      text.includes('work_threads') ||
      text.includes('work_messages') ||
      text.includes('work_thread_reads')
    ))
}

export function workThreadRoute(thread) {
  const recordId = thread?.record_id
  switch (thread?.record_type) {
    case 'ticket':
      return { pathname: '/tickets', state: recordId ? { ticketId: recordId } : null }
    case 'task':
      return { pathname: '/tasks', state: recordId ? { taskId: recordId } : null }
    case 'lead':
      return { pathname: '/leads', state: null }
    case 'booking':
      return { pathname: '/booking', state: null }
    case 'calibration':
      return { pathname: '/calibration', state: null }
    default:
      return { pathname: '/work-inbox', state: null }
  }
}

export function workThreadLink(thread) {
  return workThreadRoute(thread).pathname
}

export function workThreadRecordLabel(thread) {
  const reference = thread?.reference || thread?.title
  if (reference) return reference
  const type = String(thread?.record_type || 'Record')
  return `${type.charAt(0).toUpperCase()}${type.slice(1)} #${thread?.record_id || ''}`.trim()
}

export function formatThreadTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function validateWorkThreadFiles(files = []) {
  if (files.length > WORK_THREAD_FILE_LIMIT) {
    return `Maximum ${WORK_THREAD_FILE_LIMIT} files per message.`
  }

  const blocked = files.find(file => file.size > WORK_THREAD_FILE_SIZE_LIMIT)
  if (blocked) return `${blocked.name} is larger than 10 MB.`

  const invalid = files.find(file => {
    const type = String(file.type || '')
    const name = String(file.name || '')
    return !(
      type.startsWith('image/') ||
      type === 'application/pdf' ||
      type === 'text/plain' ||
      type.includes('word') ||
      type.includes('excel') ||
      type.includes('spreadsheet') ||
      type.includes('presentation') ||
      /\.(pdf|docx?|xlsx?|pptx?|txt|png|jpe?g|webp)$/i.test(name)
    )
  })
  if (invalid) return `${invalid.name} is not an allowed attachment type.`

  return ''
}

export function safeStorageName(name = 'attachment') {
  return String(name || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}
