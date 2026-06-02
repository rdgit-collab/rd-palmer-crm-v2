export const ROLE_ADMIN = 1
export const ROLE_SALES = 2
export const ROLE_SERVICE = 3
export const ROLE_SALES_MANAGER = 4
export const ROLE_SUPER_ADMIN = 99

export function isAdminRole(roleId) {
  return Number(roleId) === ROLE_ADMIN
}

export function isSuperAdminRole(roleId) {
  return Number(roleId) === ROLE_SUPER_ADMIN
}

export function hasAdminAccess(roleId) {
  return isAdminRole(roleId) || isSuperAdminRole(roleId)
}

export function isSalesRole(roleId) {
  return [ROLE_SALES, ROLE_SALES_MANAGER].includes(Number(roleId))
}

export function isSalesManagerRole(roleId) {
  return Number(roleId) === ROLE_SALES_MANAGER
}

export function isServiceRole(roleId) {
  return Number(roleId) === ROLE_SERVICE
}

export function effectivePermissionRoleId(roleId) {
  return Number(roleId)
}

export function roleLabel(roleId) {
  if (isSuperAdminRole(roleId)) return 'Super Admin'
  if (isAdminRole(roleId)) return 'Admin'
  if (Number(roleId) === ROLE_SALES) return 'Sales'
  if (isSalesManagerRole(roleId)) return 'Sales Manager'
  if (isServiceRole(roleId)) return 'Service'
  return '—'
}

export function roleColor(roleId) {
  if (isSuperAdminRole(roleId)) return 'bg-black text-white'
  if (isAdminRole(roleId)) return 'bg-red-100 text-red-700'
  if (Number(roleId) === ROLE_SALES) return 'bg-blue-100 text-blue-700'
  if (isServiceRole(roleId)) return 'bg-green-100 text-green-700'
  if (isSalesManagerRole(roleId)) return 'bg-purple-100 text-purple-700'
  return 'bg-gray-100 text-gray-600'
}
