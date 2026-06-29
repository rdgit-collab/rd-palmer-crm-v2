import { createClient } from 'npm:@supabase/supabase-js@2'
import webPush from 'npm:web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function cleanText(value: unknown, fallback = '') {
  return String(value || fallback).replace(/\s+/g, ' ').trim().slice(0, 240)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || ''
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || ''
  const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@rd-palmer.my'

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Supabase environment is not configured' }, 500)
  }

  const authHeader = req.headers.get('Authorization') || ''
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: authData, error: authError } = await authClient.auth.getUser()
  if (authError || !authData.user) return jsonResponse({ error: 'Unauthorized' }, 401)

  if (!publicKey || !privateKey) {
    return jsonResponse({ sent: 0, configured: false })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch (_) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const targetOldUserId = Number(body.userId)
  if (!Number.isFinite(targetOldUserId)) return jsonResponse({ error: 'Missing userId' }, 400)

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data: subscriptions, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, subscription')
    .eq('old_user_id', targetOldUserId)
    .limit(20)

  if (error) return jsonResponse({ error: error.message }, 500)
  if (!subscriptions?.length) return jsonResponse({ sent: 0, configured: true })

  webPush.setVapidDetails(subject, publicKey, privateKey)

  const payload = JSON.stringify({
    title: cleanText(body.title, 'RD Palmer CRM'),
    body: cleanText(body.body || body.reference || body.companyName, 'New CRM notification'),
    url: cleanText(body.link, '/'),
    tag: cleanText(body.reference || body.link || body.title, 'rd-palmer-crm'),
  })

  let sent = 0
  const expiredIds: number[] = []

  await Promise.allSettled(subscriptions.map(async (row) => {
    try {
      await webPush.sendNotification(row.subscription, payload, { TTL: 60 * 60 })
      sent += 1
    } catch (err) {
      const statusCode = Number((err as { statusCode?: number })?.statusCode)
      if (statusCode === 404 || statusCode === 410) expiredIds.push(row.id)
    }
  }))

  if (expiredIds.length) {
    await supabaseAdmin.from('push_subscriptions').delete().in('id', expiredIds)
  }

  return jsonResponse({ sent, removed: expiredIds.length, configured: true })
})
