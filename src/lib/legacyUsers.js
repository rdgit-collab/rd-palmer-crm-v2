export async function fetchAssignableUsers(supabase) {
  const { data, error } = await supabase
    .from('users')
    .select('old_user_id, first_name, last_name, status')
    .eq('status', 'Active')
    .not('old_user_id', 'is', null)
    .order('first_name')

  if (error) return []

  return (data || []).map((user) => ({
    id: user.old_user_id,
    first_name: user.first_name || '',
    last_name: user.last_name || '',
  }))
}

// Legacy (old CRM) user ids for every active user in a given role. Used to scope
// a team's shared visibility — e.g. Water Dep members see each other's records.
export async function fetchRoleLegacyUserIds(supabase, roleId) {
  const { data, error } = await supabase
    .from('users')
    .select('old_user_id')
    .eq('role_id', roleId)
    .neq('status', 'Inactive')
    .not('old_user_id', 'is', null)

  if (error) return []

  return (data || []).map((user) => user.old_user_id)
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
  return profile?.old_user_id ?? null
}

export function getUserName(users, id) {
  const user = users.find((item) => String(item.id) === String(id))
  return user ? `${user.first_name} ${user.last_name}`.trim() : '—'
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}
