import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { applyTokenIlike } from '../lib/searchUtils'

/**
 * Server-side searchable select.
 *
 * This component queries the table on demand (ilike + limit), so it NEVER pulls a
 * whole table into the browser. Reach for this instead of fetchAllRows('customer')
 * / fetchAllRows('goodsservices') etc. whenever you need a picker over a large table.
 *
 * Props:
 *   table          - supabase table name (e.g. 'customer')
 *   searchColumn   - column to ilike against / the visible label column (e.g. 'company_name')
 *   selectColumns  - columns to fetch (default: `id, ${searchColumn}`)
 *   valueKey       - row key stored as the selected value (default 'id')
 *   getOptionLabel - (row) => string shown in the dropdown (default: row[searchColumn])
 *   value          - currently selected value | ''
 *   displayLabel   - text shown when collapsed (use the record's stored name in edit mode)
 *   onSelect       - (value, row) => void
 *   filter         - optional eq filters, e.g. { is_completed: 0 }
 *   limit          - max rows to fetch (default 20)
 *   minSearchLength - chars required before querying (default 0)
 *   placeholder, className, disabled, required, allowClear
 */
export default function SearchSelect({
  table,
  searchColumn,
  selectColumns,
  valueKey = 'id',
  getOptionLabel,
  value = '',
  displayLabel = '',
  onSelect,
  filter,
  limit = 20,
  minSearchLength = 0,
  placeholder = 'Search…',
  className = '',
  disabled = false,
  required = false,
  allowClear = true,
}) {
  const [text, setText] = useState(displayLabel || '')
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef(null)
  const timerRef = useRef(null)
  const reqRef = useRef(0)
  const editingRef = useRef(false)

  const columns = selectColumns || `${valueKey}, ${searchColumn}`
  const labelOf = getOptionLabel || ((row) => row?.[searchColumn] ?? '')

  // Keep the visible text in sync with the selected record when not actively typing.
  useEffect(() => {
    if (!editingRef.current) setText(displayLabel || '')
  }, [displayLabel, value])

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
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
    if (cleanTerm.length < minSearchLength) {
      reqRef.current += 1
      setOptions([])
      setLoading(false)
      return
    }
    const requestId = reqRef.current + 1
    reqRef.current = requestId
    setLoading(true)
    try {
      let query = supabase.from(table).select(columns)
      if (filter) {
        Object.entries(filter).forEach(([col, val]) => { query = query.eq(col, val) })
      }
      if (cleanTerm) query = applyTokenIlike(query, searchColumn, cleanTerm)
      query = query.order(searchColumn, { ascending: true }).limit(limit)
      const { data, error } = await query
      if (reqRef.current !== requestId) return
      if (error) throw error
      setOptions(data || [])
    } catch {
      if (reqRef.current === requestId) setOptions([])
    } finally {
      if (reqRef.current === requestId) setLoading(false)
    }
  }

  function scheduleSearch(term) {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => runSearch(term), 250)
  }

  function handleFocus() {
    if (disabled) return
    setOpen(true)
    editingRef.current = true
    setText('')
    if (minSearchLength === 0) runSearch('')
    else setOptions([])
  }

  function handleChange(e) {
    const v = e.target.value
    editingRef.current = true
    setText(v)
    setOpen(true)
    scheduleSearch(v)
  }

  function handlePick(row) {
    editingRef.current = false
    setText(labelOf(row))
    setOpen(false)
    onSelect?.(row?.[valueKey], row)
  }

  function handleClear() {
    editingRef.current = false
    setText('')
    setOptions([])
    onSelect?.('', null)
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={text}
          onFocus={handleFocus}
          onChange={handleChange}
          onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); editingRef.current = false; setText(displayLabel || '') } }}
          placeholder={placeholder}
          disabled={disabled}
          required={required && !value}
          autoComplete="off"
          className={className || 'w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400'}
        />
        {allowClear && value && !editingRef.current && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
            aria-label="Clear"
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto border border-gray-200 bg-white shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-gray-400">Searching…</div>}
          {!loading && options.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">
              {text.trim().length < minSearchLength
                ? `Type at least ${minSearchLength} characters`
                : 'No matches'}
            </div>
          )}
          {!loading && options.map((row) => (
            <button
              key={row[valueKey]}
              type="button"
              onClick={() => handlePick(row)}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
            >
              {labelOf(row)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
