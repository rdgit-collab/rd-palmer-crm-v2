import { useEffect, useState } from 'react'
import { BellRing, BellOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { disablePhonePush, enablePhonePush, getPhonePushState, supportsPhonePush } from '../lib/pwa'

export default function PhoneNotificationControl() {
  const { user, profile } = useAuth()
  const [state, setState] = useState({ loading: true, supported: false, enabled: false, permission: 'default' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!supportsPhonePush()) {
      setState({ loading: false, supported: false, enabled: false, permission: 'default' })
      return undefined
    }

    getPhonePushState()
      .then(next => { if (active) setState({ loading: false, ...next }) })
      .catch(() => { if (active) setState({ loading: false, supported: true, enabled: false, permission: 'default' }) })

    return () => { active = false }
  }, [])

  const toggle = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const next = state.enabled
        ? await disablePhonePush()
        : await enablePhonePush({ user, profile })
      setState({ loading: false, ...next })
    } catch (err) {
      setError(err.message || 'Unable to update phone notifications.')
    } finally {
      setSaving(false)
    }
  }

  if (state.loading || !state.supported) return null

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className="flex w-full items-center justify-between gap-3 text-left text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          {state.enabled ? <BellRing size={15} className="text-[#CC0000]" /> : <BellOff size={15} className="text-gray-400" />}
          <span className="truncate">{state.enabled ? 'Phone alerts on' : 'Enable phone alerts'}</span>
        </span>
        <span className="shrink-0 text-xs text-gray-400">{saving ? 'Saving...' : state.permission}</span>
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
