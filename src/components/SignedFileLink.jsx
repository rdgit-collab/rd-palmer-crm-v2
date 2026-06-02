import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function SignedFileLink({ path, label = 'Open document', className = '' }) {
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'

  useEffect(() => {
    let alive = true
    setUrl('')
    setStatus('loading')

    async function loadUrl() {
      if (!path) { setStatus('error'); return }
      const { data, error } = await supabase.storage.from('crm-uploads').createSignedUrl(path, 60 * 60)
      if (!alive) return
      if (error || !data?.signedUrl) {
        setStatus('error')
      } else {
        setUrl(data.signedUrl)
        setStatus('ready')
      }
    }

    loadUrl()
    return () => { alive = false }
  }, [path])

  if (!path) return null

  if (status === 'loading') {
    return (
      <span className={`inline-flex items-center gap-1 text-gray-400 ${className}`}>
        <FileText size={14} /> Loading file...
      </span>
    )
  }

  if (status === 'error') {
    return (
      <span className={`inline-flex items-center gap-1 text-gray-400 ${className}`} title="File not found in storage">
        <FileText size={14} /> No file
      </span>
    )
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 ${className}`}>
      <FileText size={14} /> {label}
    </a>
  )
}
