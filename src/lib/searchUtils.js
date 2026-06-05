export function searchTokens(value = '') {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean)
}

export function applyTokenIlike(query, column, value) {
  return searchTokens(value).reduce(
    (nextQuery, token) => nextQuery.ilike(column, `%${token}%`),
    query
  )
}

function normalizeSearchValue(value = '') {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function rankRowsBySearch(rows = [], column, value) {
  const searchValue = normalizeSearchValue(value)
  const tokens = searchTokens(searchValue)
  if (!searchValue || tokens.length === 0) return rows

  return [...rows].sort((a, b) => {
    const aText = normalizeSearchValue(a?.[column])
    const bText = normalizeSearchValue(b?.[column])

    const score = (text) => {
      if (!text) return -1
      let total = 0
      if (text === searchValue) total += 10000
      if (text.startsWith(searchValue)) total += 7000
      if (text.includes(searchValue)) total += 4000
      tokens.forEach((token) => {
        const index = text.indexOf(token)
        if (index >= 0) total += 1000 - Math.min(index, 999)
      })
      total -= Math.abs(text.length - searchValue.length)
      return total
    }

    const diff = score(bText) - score(aText)
    return diff || aText.localeCompare(bText)
  })
}
