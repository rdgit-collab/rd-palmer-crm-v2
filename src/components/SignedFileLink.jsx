import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function SignedFileLink({ path, label = 'Open document', className = '' }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    let alive = true
    setUrl('')

    async function loadUrl() {
      if (!path) return
      const { data, error } = await supabase.storage.from('crm-uploads').createSignedUrl(path, 60 * 60)
      if (alive && !error) setUrl(data?.signedUrl || '')
    }

    loadUrl()
    return () => { alive = false }
  }, [path])

  if (!path) return null

  if (!url) {
    return (
      <span className={`inline-flex items-center gap-1 text-gray-400 ${className}`}>
        <FileText size={14} /> Loading file...
      </span>
    )
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 ${className}`}>
      <FileText size={14} /> {label}
    </a>
  )
}
