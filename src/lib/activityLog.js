import { supabase } from './supabase'

export function logActivity({
  module,
  action,
  recordTable,
  recordId,
  recordLabel,
  summary,
  metadata = {},
}) {
  if (!module || !action) return

  supabase
    .from('activity_log')
    .insert([{
      module,
      action,
      record_table: recordTable || null,
      record_id: recordId == null ? null : String(recordId),
      record_label: recordLabel || null,
      summary: summary || null,
      metadata,
    }])
    .then(({ error }) => {
      if (error) console.warn('Activity log failed:', error.message)
    })
}
