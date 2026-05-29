import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60)   return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function NotificationBell() {
  const { user, profile } = useAuth()
  const notificationUserId = profile?.old_user_id
  const navigate  = useNavigate()
  const [open, setOpen]         = useState(false)
  const [items, setItems]       = useState([])
  const [unread, setUnread]     = useState(0)
  const panelRef                = useRef(null)

  // ── Initial fetch ─────────────────────────────────────────────────
  const fetchNotifications = async () => {
    if (!user || !notificationUserId) return
    const { data } = await supabase
      .from('notification')
      .select('*')
      .eq('user_id', notificationUserId)
      .order('created_at', { ascending: false })
      .limit(20)
    const list = data || []
    setItems(list)
    setUnread(list.filter(n => !n.is_read).length)
  }

  useEffect(() => {
    fetchNotifications()
  }, [user, notificationUserId])

  // ── Realtime subscription ─────────────────────────────────────────
  useEffect(() => {
    if (!user || !notificationUserId) return
    const channel = supabase
      .channel(`notif-${notificationUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notification', filter: `user_id=eq.${notificationUserId}` },
        (payload) => {
          setItems(prev => [payload.new, ...prev.slice(0, 19)])
          setUnread(n => n + 1)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notification', filter: `user_id=eq.${notificationUserId}` },
        () => { fetchNotifications() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user, notificationUserId])

  // ── Close on outside click ────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ── Mark single as read ───────────────────────────────────────────
  const markRead = async (item) => {
    if (!item.is_read) {
      await supabase.from('notification').update({ is_read: true }).eq('id', item.id)
      setItems(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n))
      setUnread(n => Math.max(0, n - 1))
    }
    if (item.link) { navigate(item.link); setOpen(false) }
  }

  // ── Mark all read ─────────────────────────────────────────────────
  const markAllRead = async () => {
    if (!user || !notificationUserId) return
    await supabase.from('notification').update({ is_read: true }).eq('user_id', notificationUserId).eq('is_read', false)
    setItems(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnread(0)
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-1.5 text-gray-400 hover:text-[#CC0000] transition-colors"
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-[#CC0000] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 shadow-lg z-50 rounded-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-sm font-semibold text-gray-800">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-red-600 hover:underline">
                Mark all as read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-sm text-gray-400 text-center">No notifications yet.</div>
            ) : items.map(item => (
              <button
                key={item.id}
                onClick={() => markRead(item)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3 ${!item.is_read ? 'bg-red-50' : ''}`}
              >
                {/* Unread dot */}
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${!item.is_read ? 'bg-[#CC0000]' : 'bg-transparent'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${!item.is_read ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                    {item.title}
                  </p>
                  {item.body && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.body}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{timeAgo(item.created_at)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
