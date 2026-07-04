import { supabase } from './supabase'

const LOOKUP_PAGE_SIZE = 1000

export async function fetchAllRows(tableName, columns = '*', orderField = 'id', options = {}) {
  let from = 0
  let rows = []

  while (true) {
    let query = supabase
      .from(tableName)
      .select(columns)
      .order(orderField, { ascending: options.ascending ?? true })
      .range(from, from + LOOKUP_PAGE_SIZE - 1)

    if (options.eq) {
      Object.entries(options.eq).forEach(([column, value]) => {
        query = query.eq(column, value)
      })
    }
    if (options.gte) {
      Object.entries(options.gte).forEach(([column, value]) => {
        query = query.gte(column, value)
      })
    }
    if (options.lte) {
      Object.entries(options.lte).forEach(([column, value]) => {
        query = query.lte(column, value)
      })
    }

    const { data, error } = await query

    if (error) throw error

    rows = rows.concat(data || [])
    if (!data || data.length < LOOKUP_PAGE_SIZE) return rows
    from += LOOKUP_PAGE_SIZE
  }
}

// Batched `.in()` lookup: fetches only the rows matching the given ids, in
// chunks so the request URL stays within limits. Use this to resolve labels
// for referenced rows instead of downloading a whole table with fetchAllRows.
const IN_CHUNK_SIZE = 200

export async function fetchRowsByIds(tableName, columns, ids, idColumn = 'id') {
  const unique = [...new Set((ids || []).filter(value => value !== null && value !== undefined && value !== ''))]
  if (!unique.length) return []
  const chunks = []
  for (let i = 0; i < unique.length; i += IN_CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + IN_CHUNK_SIZE))
  }
  const results = await Promise.all(chunks.map(chunk =>
    supabase.from(tableName).select(columns).in(idColumn, chunk)
  ))
  const firstError = results.find(result => result.error)?.error
  if (firstError) throw firstError
  return results.flatMap(result => result.data || [])
}
