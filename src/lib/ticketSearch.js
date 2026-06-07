import { supabase } from './supabase'

export function ticketOptionLabel(ticket) {
  if (!ticket) return ''
  const number = ticket.ticket_id ? `TID${ticket.ticket_id}` : `#${ticket.id}`
  return `${number}${ticket.company_name ? ` - ${ticket.company_name}` : ''}`
}

export async function searchTicketOptions(term, { openOnly = false, limit = 30 } = {}) {
  const { data, error } = await supabase.rpc('search_ticket_options', {
    p_search: term || '',
    p_open_only: openOnly,
    p_limit: limit,
  })
  if (error) throw error
  return data || []
}
