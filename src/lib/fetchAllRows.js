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

    const { data, error } = await query

    if (error) throw error

    rows = rows.concat(data || [])
    if (!data || data.length < LOOKUP_PAGE_SIZE) return rows
    from += LOOKUP_PAGE_SIZE
  }
}
