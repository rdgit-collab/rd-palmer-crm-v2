const url = process.env.TRAINING_SIGNUP_URL || 'https://jpvjqmkvtnedpmmrddft.supabase.co/functions/v1/training-register'
const origin = process.env.TRAINING_SIGNUP_ORIGIN || 'https://crm.rd-palmer.my'

const preflight = await fetch(url, {
  method: 'OPTIONS',
  headers: {
    Origin: origin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,apikey,content-type,x-client-request-id',
  },
})

const allowedHeaders = (preflight.headers.get('access-control-allow-headers') || '').toLowerCase()
const allowedMethods = (preflight.headers.get('access-control-allow-methods') || '').toUpperCase()
if (!preflight.ok || !allowedHeaders.includes('content-type') || !allowedHeaders.includes('x-client-request-id') || !allowedMethods.includes('POST')) {
  throw new Error(`Training-signup preflight failed: HTTP ${preflight.status}. Check that the training-register Edge Function is deployed with its CORS headers.`)
}

const health = await fetch(url)
const body = await health.json().catch(() => null)
if (!health.ok || body?.ok !== true || body?.status !== 'ready') {
  throw new Error(`Training-signup health check failed: HTTP ${health.status}. Check the training-register Edge Function deployment and secrets.`)
}

console.log(`Training signup is ready at ${url}`)
