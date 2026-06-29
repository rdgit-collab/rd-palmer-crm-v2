import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { isStandaloneApp } from '../lib/pwa'

export default function PwaInstallButton() {
  const [promptEvent, setPromptEvent] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isStandaloneApp()) return undefined

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setPromptEvent(event)
      setVisible(true)
    }

    const handleInstalled = () => {
      setPromptEvent(null)
      setVisible(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const installApp = async () => {
    if (!promptEvent) return
    promptEvent.prompt()
    await promptEvent.userChoice.catch(() => undefined)
    setPromptEvent(null)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <button
      type="button"
      onClick={installApp}
      className="flex h-8 w-8 items-center justify-center rounded border border-gray-200 text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-[#CC0000]"
      title="Install app"
      aria-label="Install app"
    >
      <Download size={16} />
    </button>
  )
}
