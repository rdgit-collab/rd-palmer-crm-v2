import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function PaginationControls({ page, totalPages, total, label = 'record', zeroBased = false, onPageChange, className = 'mt-4' }) {
  const currentPage = zeroBased ? page + 1 : page
  const [jumpPage, setJumpPage] = useState(String(currentPage || 1))

  useEffect(() => {
    setJumpPage(String(currentPage || 1))
  }, [currentPage])

  if (!totalPages || totalPages <= 1) return null

  const goToHumanPage = (value) => {
    const next = Math.max(1, Math.min(totalPages, Number(value) || 1))
    onPageChange(zeroBased ? next - 1 : next)
  }

  const totalLabel = total !== undefined
    ? `${total} ${label}${total !== 1 ? 's' : ''}`
    : ''

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600 ${className}`}>
      <span>{totalLabel}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => goToHumanPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-1 disabled:opacity-40 hover:text-gray-900"
          title="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <span>Page {currentPage} of {totalPages}</span>
        <button
          onClick={() => goToHumanPage(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-1 disabled:opacity-40 hover:text-gray-900"
          title="Next page"
        >
          <ChevronRight size={16} />
        </button>
        <form
          onSubmit={e => { e.preventDefault(); goToHumanPage(jumpPage) }}
          className="flex items-center gap-1"
        >
          <span className="text-xs text-gray-400">Go to</span>
          <input
            type="number"
            min="1"
            max={totalPages}
            value={jumpPage}
            onChange={e => setJumpPage(e.target.value)}
            className="w-16 border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:border-red-400"
          />
        </form>
      </div>
    </div>
  )
}
