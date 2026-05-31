export const ROLE_ADMIN = 1
export const ROLE_SALES = 2
export const ROLE_SERVICE = 3
export const ROLE_SALES_MANAGER = 4

export function isAdminRole(roleId) {
  return Number(roleId) === ROLE_ADMIN
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
  return isSalesManagerRole(roleId) ? ROLE_SALES : Number(roleId)
}

export function roleLabel(roleId) {
  if (isAdminRole(roleId)) return 'Admin'
  if (Number(roleId) === ROLE_SALES) return 'Sales'
  if (isSalesManagerRole(roleId)) return 'Sales Manager'
  if (isServiceRole(roleId)) return 'Service'
  return '—'
}
