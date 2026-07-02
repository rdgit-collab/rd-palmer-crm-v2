import { useEffect, useRef } from 'react'
import { X, Printer } from 'lucide-react'

// Renders a document preview inside the app as a dismissible full-screen modal.
// Previously previews opened via window.open('_blank'); in an installed/PWA
// standalone window that spawns a chrome-less window with no back button, which
// traps the user (they had to kill and relaunch the app). Keeping the preview
// in-app guarantees there is always a way back via Close / Escape.
export default function PdfPreviewModal({ html, title, onClose }) {
  const frameRef = useRef(null)

  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  const printFrame = () => {
    const win = frameRef.current?.contentWindow
    if (win) { win.focus(); win.print() }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} className="flex items-center gap-1 text-gray-600 hover:text-gray-900 text-sm">
            <X size={18} /> Close
          </button>
          {title && <span className="text-sm font-medium text-gray-800 truncate">{title}</span>}
        </div>
        <button onClick={printFrame}
          className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap">
          <Printer size={14} /> Print
        </button>
      </div>
      <iframe ref={frameRef} title="Document preview" srcDoc={html} className="flex-1 w-full bg-gray-200 border-0" />
    </div>
  )
}
