import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function CustomerSearchSelect({
  value,
  displayLabel,
  onSelect,
  required = false,
  placeholder = 'Search company name...',
  className = '',
}) {
  const [text, setText] = useState(displayLabel || '')
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef(null)
  const timerRef = useRef(null)
  const requestRef = useRef(0)
  const editingRef = useRef(false)

  useEffect(() => {
    if (!editingRef.current) setText(displayLabel || '')
  }, [displayLabel, value])

  useEffect(() => {
    function onDocClick(e) {
      if (!wrapRef.current?.contains(e.target)) {
        setOpen(false)
        editingRef.current = false
        setText(displayLabel || '')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [displayLabel])

  async function runSearch(term) {
    const cleanTerm = term.trim()
    if (cleanTerm.length < 2) {
      requestRef.current += 1
      setOptions([])
      setLoading(false)
      return
    }
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('search_customers', {
        p_search: cleanTerm,
        p_limit: 30,
        p_offset: 0,
      })
      if (error) throw error
      if (requestRef.current !== requestId) return
      const result = Array.isArray(data) ? data[0] : data
      setOptions(Array.isArray(result?.rows) ? result.rows : [])
    } catch {
      if (requestRef.current === requestId) setOptions([])
    } finally {
      if (requestRef.current === requestId) setLoading(false)
    }
  }

  function scheduleSearch(term) {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => runSearch(term), 250)
  }

  function pick(row) {
    editingRef.current = false
    setText(row?.company_name || '')
    setOpen(false)
    onSelect?.(row)
  }

  function clearSelection() {
    editingRef.current = false
    setText('')
    setOpen(false)
    setOptions([])
    onSelect?.(null)
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={text}
        onFocus={() => {
          editingRef.current = true
          setText('')
          setOpen(true)
          setOptions([])
        }}
        onChange={e => {
          editingRef.current = true
          setText(e.target.value)
          setOpen(true)
          scheduleSearch(e.target.value)
        }}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            setOpen(false)
            editingRef.current = false
            setText(displayLabel || '')
          }
        }}
        required={required && !value}
        placeholder={placeholder}
        autoComplete="off"
        className={`${className || 'w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400'} pr-9`}
      />
      {value && (
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={clearSelection}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700"
          title="Clear company"
          aria-label="Clear company"
        >
          <X size={14} />
        </button>
      )}
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto border border-gray-200 bg-white shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-gray-400">Searching...</div>}
          {!loading && text.trim().length < 2 && (
            <div className="px-3 py-2 text-xs text-gray-400">Type at least 2 characters</div>
          )}
          {!loading && text.trim().length >= 2 && options.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">No matches</div>
          )}
          {!loading && options.map(row => (
            <button
              key={row.id}
              type="button"
              onClick={() => pick(row)}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
            >
              {row.company_name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
