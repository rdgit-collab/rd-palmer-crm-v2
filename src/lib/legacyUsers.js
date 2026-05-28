export async function fetchAssignableUsers(supabase) {
  const { data, error } = await supabase
    .from('legacy_users')
    .select('old_user_id, first_name, last_name, status')
    .eq('status', '1')
    .order('first_name')

  if (error) return []

  return (data || []).map((user) => ({
    id: user.old_user_id,
    first_name: user.first_name || '',
    last_name: user.last_name || '',
  }))
}

export async function fetchLegacyUsers(supabase) {
  const { data, error } = await supabase
    .from('legacy_users')
    .select('old_user_id, first_name, last_name, status')
    .order('first_name')

  if (error) return []

  return (data || []).map((user) => ({
    id: user.old_user_id,
    first_name: user.first_name || '',
    last_name: user.last_name || '',
  }))
}

export function getLegacyUserId(profile) {
  return profile?.old_user_id || 1
}

export function getUserName(users, id) {
  const user = users.find((item) => String(item.id) === String(id))
  return user ? `${user.first_name} ${user.last_name}`.trim() : '—'
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}
