import { supabase } from './supabase'

const SERVICE_WORKER_PATH = '/sw.js'
const WEB_PUSH_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || ''

export function registerPwaServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SERVICE_WORKER_PATH).catch(error => {
      console.warn('Service worker registration failed:', error?.message || error)
    })
  })
}

export function isStandaloneApp() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function supportsPhonePush() {
  return Boolean(
    WEB_PUSH_PUBLIC_KEY &&
    window.isSecureContext &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)))
}

async function getServiceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing) return existing
  await navigator.serviceWorker.register(SERVICE_WORKER_PATH)
  return navigator.serviceWorker.ready
}

function serializeSubscription(subscription) {
  return subscription?.toJSON ? subscription.toJSON() : subscription
}

export async function getPhonePushState() {
  if (!supportsPhonePush()) {
    return {
      supported: false,
      enabled: false,
      permission: 'Notification' in window ? Notification.permission : 'default',
    }
  }

  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  return {
    supported: true,
    enabled: Boolean(subscription),
    permission: Notification.permission,
  }
}

export async function enablePhonePush({ user, profile }) {
  if (!supportsPhonePush()) {
    throw new Error('Phone notifications are not supported or not configured for this browser.')
  }
  if (!user?.id || !profile?.old_user_id) {
    throw new Error('Unable to identify the current CRM user.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not allowed.')
  }

  const registration = await getServiceWorkerRegistration()
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),
    })
  }

  const now = new Date().toISOString()
  const { error } = await supabase.from('push_subscriptions').upsert([{
    user_id: user.id,
    old_user_id: profile.old_user_id,
    endpoint: subscription.endpoint,
    subscription: serializeSubscription(subscription),
    user_agent: navigator.userAgent || '',
    platform: navigator.platform || '',
    last_seen_at: now,
    updated_at: now,
  }], { onConflict: 'endpoint' })

  if (error) {
    throw new Error(error.message || 'Unable to save this phone notification device.')
  }

  return getPhonePushState()
}

export async function disablePhonePush() {
  if (!supportsPhonePush()) return { supported: false, enabled: false }

  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
    await subscription.unsubscribe().catch(() => undefined)
  }
  return getPhonePushState()
}
