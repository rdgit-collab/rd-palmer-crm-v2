import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Printer } from 'lucide-react'

// Natural width of an A4 page at 96dpi (210mm). The sales-document templates
// lay their pages out at exactly 210mm, so rendering the iframe at this width
// matches the print layout; we then scale the whole thing down to fit narrow
// screens (phones in the installed PWA) so the full document is visible.
const A4_WIDTH_PX = 794
const A4_HEIGHT_PX = 1123 // one A4 page tall, used as the initial estimate

// Renders a document preview inside the app as a dismissible full-screen modal.
// Previously previews opened via window.open('_blank'); in an installed/PWA
// standalone window that spawns a chrome-less window with no back button, which
// traps the user (they had to kill and relaunch the app). Keeping the preview
// in-app guarantees there is always a way back via Close / Escape.
export default function PdfPreviewModal({ html, title, onClose }) {
  const frameRef = useRef(null)
  const scrollRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [contentHeight, setContentHeight] = useState(A4_HEIGHT_PX)

  // Fit the A4-wide document to the available width (never upscale past 100%,
  // so on desktop it stays crisp and centred).
  const recomputeScale = useCallback(() => {
    const container = scrollRef.current
    if (!container) return
    const available = container.clientWidth
    if (available > 0) setScale(Math.min(1, available / A4_WIDTH_PX))
  }, [])

  const measureHeight = useCallback(() => {
    try {
      const doc = frameRef.current?.contentDocument
      if (doc) {
        const height = Math.max(
          doc.body?.scrollHeight || 0,
          doc.documentElement?.scrollHeight || 0,
        )
        if (height > 0) setContentHeight(height)
      }
    } catch { /* cross-origin shouldn't happen for srcDoc — ignore */ }
  }, [])

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

  useEffect(() => {
    recomputeScale()
    const container = scrollRef.current
    if (container && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(recomputeScale)
      observer.observe(container)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', recomputeScale)
    return () => window.removeEventListener('resize', recomputeScale)
  }, [recomputeScale])

  const handleLoad = () => {
    measureHeight()
    recomputeScale()
    // The letterhead logo loads after the document does; re-measure once it's in
    // so the last page isn't clipped.
    setTimeout(measureHeight, 400)
  }

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
      <div ref={scrollRef} className="flex-1 overflow-auto bg-gray-200 flex justify-center p-2 sm:p-4">
        {/* Wrapper reserves the *scaled* footprint so the scroll area sizes
            correctly; the iframe renders at full A4 width and is scaled down. */}
        <div
          style={{ width: A4_WIDTH_PX * scale, height: contentHeight * scale, overflow: 'hidden', flexShrink: 0 }}
        >
          <iframe
            ref={frameRef}
            title="Document preview"
            srcDoc={html}
            onLoad={handleLoad}
            style={{
              width: A4_WIDTH_PX,
              height: contentHeight,
              border: 0,
              background: '#fff',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          />
        </div>
      </div>
    </div>
  )
}
