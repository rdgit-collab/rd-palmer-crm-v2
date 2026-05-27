import { Menu } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import NotificationBell from '../NotificationBell'

export default function Header({ onMenuClick }) {
  const { profile } = useAuth()
  const roleLabel = profile?.role_id === 1 ? 'Admin' : profile?.role_id === 2 ? 'Sales' : 'Service'
  const initials  = `${profile?.first_name?.[0] ?? ''}${profile?.last_name?.[0] ?? ''}`

  return (
    <header className="bg-white border-b border-[#E0E0E0] px-4 py-3 flex items-center justify-between shrink-0">
      <button onClick={onMenuClick} className="lg:hidden text-[#111111] hover:text-[#CC0000]">
        <Menu size={20} />
      </button>

      <div className="flex items-center gap-3 ml-auto">
        {/* Notification Bell */}
        <NotificationBell />

        {/* User info */}
        <div className="text-right hidden sm:block">
          <div className="text-sm font-medium text-[#111111]">{profile?.first_name} {profile?.last_name}</div>
          <div className="text-xs text-gray-400">{roleLabel}</div>
        </div>
        <div className="w-8 h-8 bg-[#CC0000] rounded-full flex items-center justify-center text-white text-xs font-bold">
          {initials}
        </div>
      </div>
    </header>
  )
}
