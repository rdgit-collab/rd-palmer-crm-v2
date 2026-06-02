const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function pad(value) {
  return String(value).padStart(2, '0')
}

export function formatDate(value, fallback = '—') {
  if (!value) return fallback

  const text = String(value).trim()
  const match = text.match(DATE_ONLY_PATTERN)
  if (match) return `${match[3]}/${match[2]}/${match[1]}`

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return fallback

  return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()}`
}

export function formatDateTime(value, fallback = '—') {
  if (!value) return fallback

  const text = String(value).trim()
  const match = text.match(DATE_ONLY_PATTERN)
  if (match) return `${match[3]}/${match[2]}/${match[1]}`

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return fallback

  return `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
}
