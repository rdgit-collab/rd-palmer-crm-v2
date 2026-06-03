export function displayText(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const text = value.map(item => displayText(item, '')).filter(Boolean).join(', ')
    return text || fallback
  }
  if (typeof value === 'object') {
    const preferred = value.name || value.label || value.title || value.description || value.status || value.company_name || value.value
    if (preferred && preferred !== value) return displayText(preferred, fallback)
    try {
      return JSON.stringify(value)
    } catch {
      return fallback
    }
  }
  return String(value)
}
