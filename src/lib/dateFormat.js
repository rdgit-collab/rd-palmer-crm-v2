export const MALAYSIA_TIME_ZONE = 'Asia/Kuala_Lumpur'

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_TIME_WITHOUT_ZONE_PATTERN = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/
const TIME_ZONE_SUFFIX_PATTERN = /(?:[zZ]|[+-]\d{2}:?\d{2})$/

function partsFor(value, options) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: MALAYSIA_TIME_ZONE,
    hourCycle: 'h23',
    ...options,
  })
  return Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  )
}

export function parseDateForDisplay(value) {
  if (!value) return null

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const text = String(value).trim()
  if (!text) return null

  const dateOnly = text.match(DATE_ONLY_PATTERN)
  if (dateOnly) {
    return new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00+08:00`)
  }

  const normalized = DATE_TIME_WITHOUT_ZONE_PATTERN.test(text) && !TIME_ZONE_SUFFIX_PATTERN.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatDate(value, fallback = '—') {
  if (!value) return fallback

  const text = String(value).trim()
  const match = text.match(DATE_ONLY_PATTERN)
  if (match) return `${match[3]}/${match[2]}/${match[1]}`

  const parsed = parseDateForDisplay(value)
  if (!parsed) return fallback

  const parts = partsFor(parsed, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  return `${parts.day}/${parts.month}/${parts.year}`
}

export function formatDateKey(value, fallback = '') {
  if (!value) return fallback

  const text = String(value).trim()
  const match = text.match(DATE_ONLY_PATTERN)
  if (match) return `${match[1]}-${match[2]}-${match[3]}`

  const parsed = parseDateForDisplay(value)
  if (!parsed) return fallback

  const parts = partsFor(parsed, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function formatShortDate(value, fallback = '—', { year = true } = {}) {
  if (!value) return fallback

  const parsed = parseDateForDisplay(value)
  if (!parsed) return fallback

  const parts = partsFor(parsed, {
    day: '2-digit',
    month: 'short',
    ...(year ? { year: 'numeric' } : {}),
  })
  return [parts.day, parts.month, parts.year].filter(Boolean).join(' ')
}

export function formatDateTime(value, fallback = '—') {
  if (!value) return fallback

  const text = String(value).trim()
  const match = text.match(DATE_ONLY_PATTERN)
  if (match) return `${match[3]}/${match[2]}/${match[1]}`

  const parsed = parseDateForDisplay(value)
  if (!parsed) return fallback

  const parts = partsFor(parsed, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`
}

export function formatDateTimeShort(value, fallback = '—') {
  if (!value) return fallback

  const parsed = parseDateForDisplay(value)
  if (!parsed) return fallback

  const parts = partsFor(parsed, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`
}

export function formatTime(value, fallback = '') {
  if (!value) return fallback

  const parsed = parseDateForDisplay(value)
  if (!parsed) return fallback

  const parts = partsFor(parsed, {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${parts.hour}:${parts.minute}`
}

export function formatMalaysiaDateTimeInput(value = new Date()) {
  const parsed = parseDateForDisplay(value)
  if (!parsed) return ''

  const parts = partsFor(parsed, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

export function malaysiaDateTimeInputToIso(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return ''
  const [, year, month, day, hour, minute] = match.map(Number)
  const instant = new Date(Date.UTC(year, month - 1, day, hour - 8, minute, 0, 0))
  return Number.isNaN(instant.getTime()) ? '' : instant.toISOString()
}
