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
