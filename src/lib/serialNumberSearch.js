import { supabase } from './supabase'

export async function searchSerialNumberOptions(term, limit = 50) {
  const searchTerm = String(term || '').trim()
  if (searchTerm.length < 2) return []

  const { data, error } = await supabase.rpc('search_serialnumber_options', {
    p_search_term: searchTerm,
    p_limit: limit,
  })

  if (error) throw error
  return data || []
}
