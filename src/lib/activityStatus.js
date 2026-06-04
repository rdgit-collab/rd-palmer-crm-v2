export function isTerminalActivityStatus(status = '') {
  const n = String(status || '').trim().toLowerCase()
  return n.includes('complete') || n.includes('cancel') || n.includes('close')
}

export function isClosedStageName(name = '') {
  return String(name || '').trim().toLowerCase().startsWith('closed')
}
