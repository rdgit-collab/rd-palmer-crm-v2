import { createClient } from 'npm:@supabase/supabase-js@2'

const defaultAllowedOrigins = [
  'https://crm.rd-palmer.my',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]
const maxParticipants = 10

function allowedOrigins() {
  const configured = Deno.env.get('TRAINING_SIGNUP_ALLOWED_ORIGINS')
  return (configured ? configured.split(',') : defaultAllowedOrigins).map(origin => origin.trim()).filter(Boolean)
}

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') || ''
  const allowed = allowedOrigins()
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] || '*'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-request-id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'x-request-id',
    'Vary': 'Origin',
  }
}

function requestId(req: Request) {
  const candidate = cleanText(req.headers.get('x-client-request-id'), 64)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : crypto.randomUUID()
}

function jsonResponse(req: Request, body: Record<string, unknown>, status = 200, id = requestId(req)) {
  return new Response(JSON.stringify({ ...body, requestId: id }), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'X-Request-Id': id },
  })
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function normalizeEmail(value: unknown) {
  const email = cleanText(value, 254)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Please enter a valid email address.')
  const [local, domain] = email.split('@')
  return `${local}@${domain.toLowerCase()}`
}

function normalizePhone(value: unknown) {
  const raw = cleanText(value, 40)
  const compact = raw.replace(/[\s().-]/g, '')
  let digits = ''
  if (compact.startsWith('+')) {
    if (!/^\+[0-9]+$/.test(compact)) throw new Error('Please enter a valid contact number.')
    digits = compact.slice(1)
  } else {
    if (!/^[0-9]+$/.test(compact)) throw new Error('Please enter a valid contact number.')
    if (compact.startsWith('60')) digits = compact
    else if (compact.startsWith('0')) digits = `60${compact.slice(1)}`
    else digits = compact
  }
  if (digits.length < 8 || digits.length > 15) throw new Error('Please enter a valid contact number.')
  return `+${digits}`
}

function normalizeNric(value: unknown) {
  const nric = cleanText(value, 30).replace(/[\s-]/g, '')
  if (!/^[0-9]{12}$/.test(nric)) throw new Error('Please enter a valid 12-digit NRIC.')
  return nric
}

function cleanOptionalEmail(value: unknown) {
  const email = cleanText(value, 254)
  if (!email) return null
  return normalizeEmail(email)
}

function normalizeUuid(value: unknown) {
  const uuid = cleanText(value, 60)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new Error('Invalid training session.')
  }
  return uuid
}

function normalizeSlug(value: unknown) {
  const slug = cleanText(value, 180)
  if (!/^[a-z0-9](?:[a-z0-9-]{0,178}[a-z0-9])?$/i.test(slug)) throw new Error('Invalid training session.')
  return slug
}

function getClientIp(req: Request) {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function secretKey() {
  const legacyKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacyKey) return legacyKey
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (!secretKeys) return ''
  try {
    return JSON.parse(secretKeys).default || ''
  } catch (_) {
    return ''
  }
}

async function verifyTurnstile(req: Request, token: unknown) {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY') || ''
  const requireCaptcha = ['true', '1', 'yes'].includes((Deno.env.get('TRAINING_SIGNUP_REQUIRE_CAPTCHA') || '').toLowerCase())
  if (!secret && !requireCaptcha) return true
  if (!secret) throw new Error('Registration protection is not configured. Please contact training@rd-palmer.my.')
  const responseToken = cleanText(token, 4096)
  if (!responseToken) throw new Error('Please complete the verification check.')

  const form = new URLSearchParams()
  form.set('secret', secret)
  form.set('response', responseToken)
  const ip = getClientIp(req)
  if (ip !== 'unknown') form.set('remoteip', ip)

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })
  const result = await res.json().catch(() => null)
  if (!result?.success) throw new Error('Verification failed. Please refresh and try again.')
  return true
}

Deno.serve(async (req: Request) => {
  const id = requestId(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { ...corsHeaders(req), 'X-Request-Id': id } })
  if (req.method !== 'GET' && req.method !== 'POST') return jsonResponse(req, { ok: false, error: 'Method not allowed.' }, 405, id)

  const origin = req.headers.get('origin')
  if (origin && !allowedOrigins().includes(origin)) {
    return jsonResponse(req, { ok: false, error: 'This signup form is not available from this site.' }, 403, id)
  }

  const supabaseProjectUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = secretKey()
  if (!supabaseProjectUrl || !serviceRoleKey) {
    return jsonResponse(req, { ok: false, error: 'Registration service is not configured.' }, 500, id)
  }

  if (req.method === 'GET') return jsonResponse(req, { ok: true, status: 'ready' }, 200, id)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch (_) {
    return jsonResponse(req, { ok: false, error: 'Invalid signup request.' }, 400, id)
  }

  const participantInput = Array.isArray(body.participants) ? body.participants : []
  if (cleanText(body.website, 200)) {
    return jsonResponse(req, { ok: true, registered: Math.max(1, Math.min(participantInput.length || 1, maxParticipants)) }, 200, id)
  }

  try {
    await verifyTurnstile(req, body.turnstileToken)

    const sessionId = normalizeUuid(body.sessionId)
    const slug = normalizeSlug(body.slug)
    const company = cleanText(body.company, 500)
    const industry = cleanText(body.industry, 200) || null
    const hrEmail = cleanOptionalEmail(body.hrEmail)
    const hrdClaim = body.hrdClaim === true
    const referralCode = cleanText(body.referralCode, 32).toUpperCase() || null

    if (!company) throw new Error('Please enter your company name.')
    if (participantInput.length < 1) throw new Error('Please add at least one participant.')
    if (participantInput.length > maxParticipants) throw new Error(`Please register no more than ${maxParticipants} participants at once.`)

    const seenEmails = new Set<string>()
    const seenNrics = new Set<string>()
    const participants = participantInput.map((raw, index) => {
      const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
      const participantName = cleanText(row.participant_name, 100)
      if (!participantName) throw new Error(`Please enter the full name for Participant ${index + 1}.`)
      if (row.existing_user !== true && row.existing_user !== false) {
        throw new Error(`Please indicate whether Participant ${index + 1} is an existing EML Locator user.`)
      }
      const email = normalizeEmail(row.email)
      const nric = normalizeNric(row.nric)
      if (seenEmails.has(email.toLowerCase()) || seenNrics.has(nric)) {
        throw new Error('Each participant can only be listed once per submission.')
      }
      seenEmails.add(email.toLowerCase())
      seenNrics.add(nric)
      return {
        participant_name: participantName,
        company,
        email,
        phone: normalizePhone(row.phone),
        nric,
        industry,
        existing_user: row.existing_user,
        hrd_claim: hrdClaim,
        hr_email: hrdClaim ? hrEmail : null,
        referral_code: referralCode,
        session_id: sessionId,
        source: 'public',
      }
    })

    const supabaseAdmin = createClient(supabaseProjectUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('training_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('slug', slug)
      .eq('is_open', true)
      .maybeSingle()
    if (sessionError || !session) throw new Error('This training session is no longer accepting registrations.')

    const ipHash = await sha256(getClientIp(req))
    const { data: rateLimit, error: rateError } = await supabaseAdmin
      .rpc('claim_training_signup_rate_limit', { p_ip_hash: ipHash, p_session_id: sessionId })
    if (rateError) {
      console.error(JSON.stringify({
        event: 'training_registration_rate_limit_error',
        requestId: id,
        code: rateError.code,
        error: rateError.message,
      }))
      throw new Error('Registration is busy. Please try again shortly.')
    }
    if (rateLimit && typeof rateLimit === 'object' && (rateLimit as Record<string, unknown>).allowed === false) {
      return jsonResponse(req, { ok: false, error: 'Too many registration attempts. Please try again shortly.' }, 429)
    }

    const { error } = await supabaseAdmin.from('training_registrations').insert(participants)
    if (error) {
      const message = String(error.message || '')
      if (message.includes('duplicate')) throw new Error("You're already registered for this session.")
      if (message.includes('full')) throw new Error('This training session is already full.')
      if (message.includes('closed')) throw new Error('This training session is no longer accepting registrations.')
      throw new Error('Unable to submit this registration. Please check the details and try again.')
    }

    console.log(JSON.stringify({ event: 'training_registration_submitted', requestId: id, sessionId, participantCount: participants.length }))
    return jsonResponse(req, { ok: true, registered: participants.length }, 200, id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to submit this registration.'
    console.error(JSON.stringify({ event: 'training_registration_failed', requestId: id, error: message }))
    return jsonResponse(req, { ok: false, error: message }, 400, id)
  }
})
