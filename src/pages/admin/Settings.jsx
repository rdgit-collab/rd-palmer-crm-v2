import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { logActivity } from '../../lib/activityLog'
import { isSuperAdminRole } from '../../lib/roles'
import { Plus, Edit2, Trash2, Check, X, Save, Bold, Underline } from 'lucide-react'

// Generic CRUD panel for simple name/type lookup tables
// hasUserIdInt = true  → table has a user_id INTEGER column (old Lovable tables); send 1
// noUserId     = true  → table has no user_id column at all (new tables)
// default (both false) → same as noUserId for safety
function LookupPanel({ title, tableName, valueField = 'name', extraField = null, extraLabel = null, extraType = 'text', noUserId = true, hasUserIdInt = false, multiline = false }) {
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(false)
  const [adding, setAdding]       = useState(false)
  const [editId, setEditId]       = useState(null)
  const [newVal, setNewVal]       = useState('')
  const [newExtra, setNewExtra]   = useState('')
  const [editVal, setEditVal]     = useState('')
  const [editExtra, setEditExtra] = useState('')

  const fetch = async () => {
    setLoading(true)
    const { data } = await supabase.from(tableName).select('*').order(valueField)
    setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { fetch() }, [tableName])

  const handleAdd = async () => {
    if (!newVal.trim()) return
    const payload = { [valueField]: newVal.trim() }
    if (hasUserIdInt) payload.user_id = 1          // old Lovable tables use INTEGER user_id
    if (extraField) payload[extraField] = newExtra
    await supabase.from(tableName).insert([payload])
    logActivity({
      module: 'settings',
      action: 'create',
      recordTable: tableName,
      recordLabel: newVal.trim(),
      summary: `Created ${title}: ${newVal.trim()}`,
    })
    setNewVal(''); setNewExtra(''); setAdding(false); fetch()
  }

  const handleUpdate = async (id) => {
    const payload = { [valueField]: editVal }
    if (extraField) payload[extraField] = editExtra
    await supabase.from(tableName).update(payload).eq('id', id)
    logActivity({
      module: 'settings',
      action: 'update',
      recordTable: tableName,
      recordId: id,
      recordLabel: editVal,
      summary: `Updated ${title}: ${editVal}`,
    })
    setEditId(null); fetch()
  }

  const handleDelete = async (id) => {
    await supabase.from(tableName).delete().eq('id', id)
    logActivity({
      module: 'settings',
      action: 'delete',
      recordTable: tableName,
      recordId: id,
      summary: `Deleted ${title} item #${id}`,
    })
    fetch()
  }

  return (
    <div className="bg-white border border-gray-200 rounded overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs bg-red-600 text-white px-2.5 py-1.5 hover:bg-red-700">
          <Plus size={12} /> Add
        </button>
      </div>
      <div className="divide-y divide-gray-100">
        {loading ? <div className="px-4 py-6 text-sm text-gray-400 text-center">Loading...</div>
        : rows.length === 0 && !adding ? <div className="px-4 py-6 text-sm text-gray-400 text-center">No entries yet.</div>
        : null}

        {adding && (
          <div className="px-4 py-2 flex items-center gap-2 bg-red-50">
            {multiline ? (
              <textarea autoFocus value={newVal} onChange={e => setNewVal(e.target.value)}
                placeholder={`Enter ${valueField}...`} rows={3}
                className="flex-1 border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-red-400 resize-y" />
            ) : (
              <input autoFocus type="text" value={newVal} onChange={e => setNewVal(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder={`Enter ${valueField}...`}
                className="flex-1 border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-red-400" />
            )}
            {extraField && (
              <input type={extraType} value={newExtra} onChange={e => setNewExtra(e.target.value)}
                placeholder={extraLabel || extraField}
                className="w-24 border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-red-400" />
            )}
            <button onClick={handleAdd} className="text-green-600 hover:text-green-700"><Check size={16} /></button>
            <button onClick={() => { setAdding(false); setNewVal(''); setNewExtra('') }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
        )}

        {rows.map(r => (
          <div key={r.id} className="px-4 py-2 flex items-center gap-2 hover:bg-gray-50">
            {editId === r.id ? (
              <>
                {multiline ? (
                  <textarea autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                    rows={3}
                    className="flex-1 border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-red-400 resize-y" />
                ) : (
                  <input autoFocus type="text" value={editVal} onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleUpdate(r.id)}
                    className="flex-1 border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-red-400" />
                )}
                {extraField && (
                  <input type={extraType} value={editExtra} onChange={e => setEditExtra(e.target.value)}
                    placeholder={extraLabel || extraField}
                    className="w-24 border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-red-400" />
                )}
                <button onClick={() => handleUpdate(r.id)} className="text-green-600 hover:text-green-700"><Check size={15} /></button>
                <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600"><X size={15} /></button>
              </>
            ) : (
              <>
                <span className={`flex-1 text-sm text-gray-800 ${multiline ? 'whitespace-pre-wrap' : ''}`}>{r[valueField]}</span>
                {extraField && <span className="text-xs text-gray-500 w-20">{r[extraField] || '—'}</span>}
                <button onClick={() => { setEditId(r.id); setEditVal(r[valueField]); setEditExtra(r[extraField] || '') }} className="text-gray-400 hover:text-gray-600 ml-auto"><Edit2 size={14} /></button>
                <button onClick={() => handleDelete(r.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Locations Panel ───────────────────────────────────────────────
function LocationsPanel() {
  const [countries, setCountries] = useState([])
  const [states, setStates]       = useState([])
  const [cities, setCities]       = useState([])

  const [selCountry, setSelCountry] = useState('')
  const [selState, setSelState]     = useState('')

  const [addingCountry, setAddingCountry] = useState(false)
  const [addingState, setAddingState]     = useState(false)
  const [addingCity, setAddingCity]       = useState(false)

  const [editCountry, setEditCountry] = useState(null)
  const [editState, setEditState]     = useState(null)
  const [editCity, setEditCity]       = useState(null)

  const [newCountry, setNewCountry] = useState('')
  const [newState, setNewState]     = useState('')
  const [newCity, setNewCity]       = useState('')
  const [editVal, setEditVal]       = useState('')

  const loadCountries = async () => {
    const { data } = await supabase.from('country').select('*').order('name')
    setCountries(data || [])
  }
  const loadStates = async (countryId) => {
    if (!countryId) { setStates([]); return }
    const [{ data: linkedStates }, { data: countryCities, error: cityErr }] = await Promise.all([
      supabase.from('state').select('*').eq('country_id', countryId).order('name'),
      supabase.from('city').select('state_id').eq('country_id', countryId).not('state_id', 'is', null),
    ])
    const cityStateIds = [...new Set((countryCities || []).map(row => row.state_id).filter(Boolean))]
    const { data: cityStates } = !cityErr && cityStateIds.length > 0
      ? await supabase.from('state').select('*').in('id', cityStateIds)
      : { data: [] }
    const merged = [...(linkedStates || []), ...cityStates].reduce((acc, state) => {
      if (!acc.some(item => String(item.id) === String(state.id))) acc.push(state)
      return acc
    }, [])
    setStates(merged.sort((a, b) => (a.name || '').localeCompare(b.name || '')))
  }
  const loadCities = async (stateId) => {
    if (!stateId) { setCities([]); return }
    let q = supabase.from('city').select('*').eq('state_id', stateId).order('name')
    if (selCountry) q = q.eq('country_id', selCountry)
    const { data } = await q
    setCities(data || [])
  }

  useEffect(() => { loadCountries() }, [])
  useEffect(() => { loadStates(selCountry); setSelState(''); setCities([]) }, [selCountry])
  useEffect(() => { loadCities(selState) }, [selState])

  // Country CRUD
  const addCountry = async () => {
    if (!newCountry.trim()) return
    await supabase.from('country').insert([{ name: newCountry.trim() }])
    setNewCountry(''); setAddingCountry(false); loadCountries()
  }
  const updateCountry = async (id, field, val) => {
    await supabase.from('country').update({ [field]: val }).eq('id', id)
    setEditCountry(null); loadCountries()
  }
  const deleteCountry = async (id) => {
    await supabase.from('country').delete().eq('id', id)
    if (String(selCountry) === String(id)) setSelCountry('')
    loadCountries()
  }

  // State CRUD
  const addState = async () => {
    if (!newState.trim() || !selCountry) return
    await supabase.from('state').insert([{ name: newState.trim(), country_id: selCountry }])
    setNewState(''); setAddingState(false); loadStates(selCountry)
  }
  const updateState = async (id) => {
    await supabase.from('state').update({ name: editVal }).eq('id', id)
    setEditState(null); loadStates(selCountry)
  }
  const deleteState = async (id) => {
    await supabase.from('state').delete().eq('id', id)
    if (String(selState) === String(id)) setSelState('')
    loadStates(selCountry)
  }

  // City CRUD
  const addCity = async () => {
    if (!newCity.trim() || !selState) return
    await supabase.from('city').insert([{ name: newCity.trim(), state_id: selState, country_id: selCountry || null }])
    setNewCity(''); setAddingCity(false); loadCities(selState)
  }
  const updateCity = async (id) => {
    await supabase.from('city').update({ name: editVal }).eq('id', id)
    setEditCity(null); loadCities(selState)
  }
  const deleteCity = async (id) => {
    await supabase.from('city').delete().eq('id', id)
    loadCities(selState)
  }

  const colClass = "bg-white border border-gray-200 rounded overflow-hidden"
  const headerClass = "flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50"
  const rowClass = "px-4 py-2 flex items-center gap-2 hover:bg-gray-50"

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

      {/* Countries */}
      <div className={colClass}>
        <div className={headerClass}>
          <h3 className="font-semibold text-gray-800 text-sm">Countries</h3>
          <button onClick={() => setAddingCountry(true)} className="flex items-center gap-1 text-xs bg-red-600 text-white px-2.5 py-1.5 hover:bg-red-700">
            <Plus size={12} /> Add
          </button>
        </div>
        <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {countries.length === 0 && !addingCountry && <div className="px-4 py-6 text-sm text-gray-400 text-center">No countries yet.</div>}
          {addingCountry && (
            <div className="px-4 py-2 flex items-center gap-2 bg-red-50">
              <input autoFocus type="text" value={newCountry} onChange={e => setNewCountry(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCountry()}
                placeholder="Country name" className="flex-1 border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-red-400" />
              <button onClick={addCountry} className="text-green-600 hover:text-green-700"><Check size={16} /></button>
              <button onClick={() => { setAddingCountry(false); setNewCountry('') }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
          )}
          {countries.map(c => (
            <div key={c.id}
              onClick={() => { if (editCountry !== c.id) setSelCountry(String(c.id)) }}
              className={`${rowClass} cursor-pointer ${String(selCountry) === String(c.id) ? 'bg-red-50' : ''}`}>
              {editCountry === c.id ? (
                <>
                  <input autoFocus type="text" defaultValue={c.name}
                    onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && updateCountry(c.id, 'name', editVal)}
                    className="flex-1 border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-red-400" />
                  <button onClick={() => updateCountry(c.id, 'name', editVal)} className="text-green-600"><Check size={14} /></button>
                  <button onClick={() => setEditCountry(null)} className="text-gray-400"><X size={14} /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-800">{c.name}</span>
                  <button onClick={e => { e.stopPropagation(); setEditCountry(c.id); setEditVal(c.name) }} className="text-gray-400 hover:text-gray-600"><Edit2 size={13} /></button>
                  <button onClick={e => { e.stopPropagation(); deleteCountry(c.id) }} className="text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">Click a country to manage its states →</div>
      </div>

      {/* States */}
      <div className={colClass}>
        <div className={headerClass}>
          <h3 className="font-semibold text-gray-800 text-sm">
            States / Provinces
            {selCountry && <span className="ml-1 text-gray-400 font-normal">— {countries.find(c => String(c.id) === String(selCountry))?.name}</span>}
          </h3>
          {selCountry && (
            <button onClick={() => setAddingState(true)} className="flex items-center gap-1 text-xs bg-red-600 text-white px-2.5 py-1.5 hover:bg-red-700">
              <Plus size={12} /> Add
            </button>
          )}
        </div>
        <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {!selCountry && <div className="px-4 py-6 text-sm text-gray-400 text-center">Select a country first.</div>}
          {selCountry && states.length === 0 && !addingState && <div className="px-4 py-6 text-sm text-gray-400 text-center">No states yet.</div>}
          {addingState && (
            <div className="px-4 py-2 flex items-center gap-2 bg-red-50">
              <input autoFocus type="text" value={newState} onChange={e => setNewState(e.target.value)}
                placeholder="State name" className="flex-1 border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-red-400" />
              <button onClick={addState} className="text-green-600"><Check size={16} /></button>
              <button onClick={() => { setAddingState(false); setNewState('') }} className="text-gray-400"><X size={16} /></button>
            </div>
          )}
          {states.map(s => (
            <div key={s.id}
              onClick={() => { if (editState !== s.id) setSelState(String(s.id)) }}
              className={`${rowClass} cursor-pointer ${String(selState) === String(s.id) ? 'bg-red-50' : ''}`}>
              {editState === s.id ? (
                <>
                  <input autoFocus type="text" defaultValue={s.name}
                    onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && updateState(s.id)}
                    className="flex-1 border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-red-400" />
                  <button onClick={() => updateState(s.id)} className="text-green-600"><Check size={14} /></button>
                  <button onClick={() => setEditState(null)} className="text-gray-400"><X size={14} /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-800">{s.name}</span>
                  <button onClick={e => { e.stopPropagation(); setEditState(s.id); setEditVal(s.name) }} className="text-gray-400 hover:text-gray-600"><Edit2 size={13} /></button>
                  <button onClick={e => { e.stopPropagation(); deleteState(s.id) }} className="text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">Click a state to manage its cities →</div>
      </div>

      {/* Cities */}
      <div className={colClass}>
        <div className={headerClass}>
          <h3 className="font-semibold text-gray-800 text-sm">
            Cities
            {selState && <span className="ml-1 text-gray-400 font-normal">— {states.find(s => String(s.id) === String(selState))?.name}</span>}
          </h3>
          {selState && (
            <button onClick={() => setAddingCity(true)} className="flex items-center gap-1 text-xs bg-red-600 text-white px-2.5 py-1.5 hover:bg-red-700">
              <Plus size={12} /> Add
            </button>
          )}
        </div>
        <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {!selState && <div className="px-4 py-6 text-sm text-gray-400 text-center">Select a state first.</div>}
          {selState && cities.length === 0 && !addingCity && <div className="px-4 py-6 text-sm text-gray-400 text-center">No cities yet.</div>}
          {addingCity && (
            <div className="px-4 py-2 flex items-center gap-2 bg-red-50">
              <input autoFocus type="text" value={newCity} onChange={e => setNewCity(e.target.value)}
                placeholder="City name" className="flex-1 border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-red-400" />
              <button onClick={addCity} className="text-green-600"><Check size={16} /></button>
              <button onClick={() => { setAddingCity(false); setNewCity('') }} className="text-gray-400"><X size={16} /></button>
            </div>
          )}
          {cities.map(c => (
            <div key={c.id} className={rowClass}>
              {editCity === c.id ? (
                <>
                  <input autoFocus type="text" defaultValue={c.name}
                    onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && updateCity(c.id)}
                    className="flex-1 border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-red-400" />
                  <button onClick={() => updateCity(c.id)} className="text-green-600"><Check size={14} /></button>
                  <button onClick={() => setEditCity(null)} className="text-gray-400"><X size={14} /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-800">{c.name}</span>
                  <button onClick={() => { setEditCity(c.id); setEditVal(c.name) }} className="text-gray-400 hover:text-gray-600"><Edit2 size={13} /></button>
                  <button onClick={() => deleteCity(c.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

// ── Document Templates Panel ──────────────────────────────────────
function escapeTemplateHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

function toEditorHtml(value = '') {
  const raw = String(value || '')
  if (!raw) return ''
  if (/<\/?[a-z][\s\S]*>/i.test(raw)) return raw
  return escapeTemplateHtml(raw).replace(/\n/g, '<br>')
}

function insertPlainTextAtCursor(text = '') {
  const selection = window.getSelection()
  if (!selection || !selection.rangeCount) {
    document.execCommand('insertText', false, text)
    return
  }

  const range = selection.getRangeAt(0)
  range.deleteContents()

  String(text).replace(/\r\n?/g, '\n').split('\n').forEach((line, index) => {
    if (index > 0) {
      range.insertNode(document.createElement('br'))
      range.collapse(false)
    }
    if (line) {
      range.insertNode(document.createTextNode(line))
      range.collapse(false)
    }
  })

  selection.removeAllRanges()
  selection.addRange(range)
}

function RichTemplateEditor({ value, onChange, placeholder }) {
  const editorRef = useRef(null)
  const isEditingRef = useRef(false)

  useEffect(() => {
    if (isEditingRef.current) return
    const nextHtml = toEditorHtml(value)
    if (editorRef.current && editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml
    }
  }, [value])

  const applyFormat = (command) => {
    editorRef.current?.focus()
    document.execCommand(command, false, null)
    onChange(editorRef.current?.innerHTML || '')
  }

  const handlePaste = (e) => {
    e.preventDefault()
    insertPlainTextAtCursor(e.clipboardData?.getData('text/plain') || '')
    onChange(editorRef.current?.innerHTML || '')
  }

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    insertPlainTextAtCursor('\n')
    onChange(editorRef.current?.innerHTML || '')
  }

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <button type="button" title="Bold" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('bold')}
          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-white border border-transparent hover:border-gray-200 rounded">
          <Bold size={15} />
        </button>
        <button type="button" title="Underline" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('underline')}
          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-white border border-transparent hover:border-gray-200 rounded">
          <Underline size={15} />
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={e => onChange(e.currentTarget.innerHTML)}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onFocus={() => { isEditingRef.current = true }}
        onBlur={() => { isEditingRef.current = false }}
        className="min-h-[145px] w-full px-4 py-3 text-sm text-gray-800 focus:outline-none leading-6 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 [&_*]:!text-sm [&_*]:!leading-6 [&_*]:!text-gray-800 [&_u]:underline [&_b]:font-bold [&_strong]:font-bold"
      />
    </div>
  )
}

function TemplatesPanel() {
  const [vals, setVals] = useState({
    quotation_notes: '',
    quotation_terms: '',
    invoice_notes: '',
    invoice_terms: '',
    task_terms: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    supabase.from('app_setting')
      .select('key, value')
      .in('key', ['quotation_notes', 'quotation_terms', 'invoice_notes', 'invoice_terms', 'task_terms'])
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(r => { map[r.key] = r.value || '' })
        setVals(prev => ({ ...prev, ...map }))
        setLoaded(true)
      })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    for (const [key, value] of Object.entries(vals)) {
      await supabase.from('app_setting')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (!loaded) return <div className="text-sm text-gray-400 py-6 text-center">Loading templates...</div>

  const TextBlock = ({ label, fieldKey, placeholder }) => (
    <div className="bg-white border border-gray-200 rounded overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="font-semibold text-gray-800 text-sm">{label}</h3>
        <p className="text-xs text-gray-400 mt-0.5">Pre-filled when staff create a new document — they can still edit before saving.</p>
      </div>
      <RichTemplateEditor
        value={vals[fieldKey]}
        onChange={value => setVals(prev => ({ ...prev, [fieldKey]: value }))}
        placeholder={placeholder}
      />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TextBlock label="Quotation — Notes" fieldKey="quotation_notes" placeholder="e.g. Thank you for your interest. This quotation is valid for 30 days." />
        <TextBlock label="Quotation — Terms & Conditions" fieldKey="quotation_terms" placeholder="e.g. 1. Prices are subject to change without notice..." />
        <TextBlock label="Invoice — Notes" fieldKey="invoice_notes" placeholder="e.g. Thank you for your business. Please retain this invoice for your records." />
        <TextBlock label="Invoice — Terms & Conditions" fieldKey="invoice_terms" placeholder="e.g. Payment is due within 30 days of invoice date..." />
        <TextBlock label="Task — Terms & Conditions" fieldKey="task_terms" placeholder="e.g. Service work is recorded based on findings at site..." />
      </div>
      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2 text-sm font-medium disabled:opacity-50 transition-colors">
          <Save size={14} />
          {saving ? 'Saving…' : 'Save Templates'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved successfully</span>}
      </div>
    </div>
  )
}

// ── Role Permissions Panel ────────────────────────────────────────
const SALES_MODULES = [
  { module: 'customers',  label: 'Customers' },
  { module: 'contacts',   label: 'Contacts' },
  { module: 'leads',      label: 'Sales Leads' },
  { module: 'activities', label: 'Activities' },
  { module: 'quotations', label: 'Quotations' },
  { module: 'invoices',   label: 'Invoices' },
  { module: 'tickets',    label: 'Tickets' },
  { module: 'tasks',      label: 'Tasks' },
  { module: 'booking',    label: 'Booking' },
]
const SERVICE_MODULES = [
  { module: 'tickets',       label: 'Tickets' },
  { module: 'tasks',         label: 'Tasks' },
  { module: 'onsite-tickets',label: 'Onsite Tickets' },
  { module: 'rma',           label: 'RMA' },
  { module: 'calibration',   label: 'Calibration' },
  { module: 'serial-numbers',label: 'Serial Numbers' },
  { module: 'booking',       label: 'Booking' },
]

const BOOKING_ITEM_STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'booked', label: 'Booked' },
  { value: 'loaned', label: 'Loaned' },
  { value: 'under_repair', label: 'Under Repair' },
  { value: 'missing', label: 'Missing' },
  { value: 'check_required', label: 'Check Required' },
]

function normaliseBookingPayload(fields, form, { editing = false } = {}) {
  const payload = {}
  fields.forEach(field => {
    if (editing && field.createOnly) return
    const raw = form[field.key]
    if (field.type === 'checkbox') {
      payload[field.key] = Boolean(raw)
    } else if (field.type === 'number') {
      payload[field.key] = raw === '' || raw == null ? null : Number(raw)
    } else {
      payload[field.key] = raw === '' || raw == null ? null : String(raw).trim()
    }
  })
  return payload
}

function emptyBookingForm(fields) {
  return Object.fromEntries(fields.map(field => [
    field.key,
    field.defaultValue ?? (field.type === 'checkbox' ? false : ''),
  ]))
}

function BookingCrudPanel({ title, rows, fields, onAdd, onUpdate, onDelete }) {
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState(null)
  const [newForm, setNewForm] = useState(() => emptyBookingForm(fields))
  const [editForm, setEditForm] = useState({})

  const setField = (setter, key, value) => setter(prev => ({ ...prev, [key]: value }))

  const startEdit = (row) => {
    setEditId(row.id)
    setEditForm(Object.fromEntries(fields.map(field => [field.key, row[field.key] ?? field.defaultValue ?? ''])))
  }

  const saveNew = async () => {
    const requiredMissing = fields.some(field => field.required && !String(newForm[field.key] || '').trim())
    if (requiredMissing) return
    await onAdd(normaliseBookingPayload(fields, newForm))
    setNewForm(emptyBookingForm(fields))
    setAdding(false)
  }

  const saveEdit = async () => {
    const requiredMissing = fields.some(field => !field.createOnly && field.required && !String(editForm[field.key] || '').trim())
    if (requiredMissing) return
    await onUpdate(editId, normaliseBookingPayload(fields, editForm, { editing: true }))
    setEditId(null)
  }

  const FieldInput = ({ field, value, onChange, disabled = false }) => {
    if (field.type === 'checkbox') {
      return (
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={e => onChange(e.target.checked)} />
          {field.label}
        </label>
      )
    }
    if (field.type === 'select') {
      return (
        <select value={value ?? ''} disabled={disabled} onChange={e => onChange(e.target.value)}
          className="w-full border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 disabled:bg-gray-50 disabled:text-gray-400">
          <option value="">Select {field.label}</option>
          {(field.options || []).map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      )
    }
    if (field.multiline) {
      return (
        <textarea value={value ?? ''} disabled={disabled} onChange={e => onChange(e.target.value)} rows={2}
          placeholder={field.placeholder || field.label}
          className="w-full border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 resize-y disabled:bg-gray-50 disabled:text-gray-400" />
      )
    }
    return (
      <input type={field.type === 'number' ? 'number' : 'text'} value={value ?? ''} disabled={disabled}
        onChange={e => onChange(e.target.value)} placeholder={field.placeholder || field.label}
        className="w-full border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:border-red-400 disabled:bg-gray-50 disabled:text-gray-400" />
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
        <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs bg-red-600 text-white px-2.5 py-1.5 hover:bg-red-700">
          <Plus size={12} /> Add
        </button>
      </div>
      <div className="divide-y divide-gray-100 max-h-[480px] overflow-y-auto">
        {adding && (
          <div className="p-4 bg-red-50 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {fields.map(field => (
                <label key={field.key} className={field.wide ? 'md:col-span-2' : ''}>
                  {field.type !== 'checkbox' && <span className="block text-xs font-medium text-gray-500 mb-1">{field.label}{field.required ? ' *' : ''}</span>}
                  <FieldInput field={field} value={newForm[field.key]} onChange={value => setField(setNewForm, field.key, value)} />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={saveNew} className="inline-flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 hover:bg-green-700"><Check size={13} /> Save</button>
              <button onClick={() => { setAdding(false); setNewForm(emptyBookingForm(fields)) }} className="inline-flex items-center gap-1 text-xs border border-gray-200 px-3 py-1.5 hover:bg-white"><X size={13} /> Cancel</button>
            </div>
          </div>
        )}

        {rows.length === 0 && !adding ? <div className="px-4 py-6 text-sm text-gray-400 text-center">No entries yet.</div> : null}

        {rows.map(row => (
          <div key={row.id} className="p-4 hover:bg-gray-50">
            {editId === row.id ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {fields.map(field => (
                    <label key={field.key} className={field.wide ? 'md:col-span-2' : ''}>
                      {field.type !== 'checkbox' && <span className="block text-xs font-medium text-gray-500 mb-1">{field.label}{field.required ? ' *' : ''}</span>}
                      <FieldInput field={field} value={editForm[field.key]} disabled={field.createOnly} onChange={value => setField(setEditForm, field.key, value)} />
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={saveEdit} className="inline-flex items-center gap-1 text-xs bg-green-600 text-white px-3 py-1.5 hover:bg-green-700"><Check size={13} /> Save</button>
                  <button onClick={() => setEditId(null)} className="inline-flex items-center gap-1 text-xs border border-gray-200 px-3 py-1.5 hover:bg-white"><X size={13} /> Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{row.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {fields
                      .filter(field => field.key !== 'name' && row[field.key] !== null && row[field.key] !== undefined && row[field.key] !== '')
                      .slice(0, 4)
                      .map(field => `${field.label}: ${field.type === 'checkbox' ? (row[field.key] ? 'Yes' : 'No') : row[field.key]}`)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => startEdit(row)} className="text-gray-400 hover:text-gray-600"><Edit2 size={14} /></button>
                  <button onClick={() => onDelete(row.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function BookingSettingsPanel() {
  const [venues, setVenues] = useState([])
  const [categories, setCategories] = useState([])
  const [groups, setGroups] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    const [venueResult, categoryResult, groupResult, itemResult] = await Promise.all([
      supabase.from('booking_venues').select('*').order('sort_order'),
      supabase.from('booking_equipment_categories').select('*').order('sort_order'),
      supabase.from('booking_equipment_groups').select('*').order('sort_order'),
      supabase.from('booking_equipment_items').select('*').order('sort_order'),
    ])
    const firstError = [venueResult, categoryResult, groupResult, itemResult].find(result => result.error)?.error
    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }
    setVenues(venueResult.data || [])
    setCategories(categoryResult.data || [])
    setGroups(groupResult.data || [])
    setItems(itemResult.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const mutate = async (tableName, action, payload, id) => {
    setError('')
    const query = action === 'insert'
      ? supabase.from(tableName).insert([payload])
      : action === 'update'
        ? supabase.from(tableName).update(payload).eq('id', id)
        : supabase.from(tableName).delete().eq('id', id)
    const { error: mutationError } = await query
    if (mutationError) {
      setError(mutationError.message)
      return
    }
    logActivity({
      module: 'settings',
      action,
      recordTable: tableName,
      recordId: id || payload.id,
      recordLabel: payload.name,
      summary: `${action === 'insert' ? 'Created' : action === 'update' ? 'Updated' : 'Deleted'} booking dropdown data`,
    })
    await load()
  }

  const deleteRow = (tableName, id) => {
    if (!window.confirm('Delete this dropdown item? Existing linked records may prevent deletion.')) return
    mutate(tableName, 'delete', {}, id)
  }

  const categoryOptions = categories.map(category => ({ value: category.id, label: category.name }))
  const groupOptions = groups.map(group => ({ value: group.id, label: group.name }))

  const venueFields = [
    { key: 'name', label: 'Venue Name', required: true },
    { key: 'location', label: 'Location' },
    { key: 'capacity', label: 'Capacity', type: 'number' },
    { key: 'sort_order', label: 'Sort Order', type: 'number', defaultValue: 0 },
    { key: 'notes', label: 'Notes', multiline: true, wide: true },
    { key: 'is_active', label: 'Active', type: 'checkbox', defaultValue: true },
  ]
  const categoryFields = [
    { key: 'id', label: 'Category Code', required: true, createOnly: true, placeholder: 'Example: EML' },
    { key: 'name', label: 'Category Name', required: true },
    { key: 'sort_order', label: 'Sort Order', type: 'number', defaultValue: 0 },
    { key: 'is_active', label: 'Active', type: 'checkbox', defaultValue: true },
  ]
  const groupFields = [
    { key: 'id', label: 'Group Code', required: true, createOnly: true, placeholder: 'Example: EML-001' },
    { key: 'category_id', label: 'Category', type: 'select', options: categoryOptions, required: true },
    { key: 'name', label: 'Group Name', required: true },
    { key: 'location', label: 'Location' },
    { key: 'booking_rule', label: 'Booking Rule', multiline: true, wide: true },
    { key: 'notes', label: 'Notes', multiline: true, wide: true },
    { key: 'sort_order', label: 'Sort Order', type: 'number', defaultValue: 0 },
    { key: 'is_active', label: 'Active', type: 'checkbox', defaultValue: true },
  ]
  const itemFields = [
    { key: 'id', label: 'Item Code', required: true, createOnly: true, placeholder: 'Example: EML-001-01' },
    { key: 'group_id', label: 'Group', type: 'select', options: groupOptions, required: true },
    { key: 'name', label: 'Item Name', required: true },
    { key: 'serial_no', label: 'Serial No.' },
    { key: 'quantity', label: 'Quantity', type: 'number', defaultValue: 1 },
    { key: 'location', label: 'Location' },
    { key: 'status', label: 'Status', type: 'select', options: BOOKING_ITEM_STATUS_OPTIONS, defaultValue: 'available' },
    { key: 'sort_order', label: 'Sort Order', type: 'number', defaultValue: 0 },
    { key: 'notes', label: 'Notes', multiline: true, wide: true },
    { key: 'required_for_complete_set', label: 'Required For Complete Set', type: 'checkbox', defaultValue: false },
    { key: 'is_bookable', label: 'Bookable', type: 'checkbox', defaultValue: true },
  ]

  if (loading) return <div className="text-sm text-gray-400 py-6 text-center">Loading booking dropdowns...</div>

  return (
    <div className="space-y-5">
      {error && <div className="border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BookingCrudPanel title="Booking Venues" rows={venues} fields={venueFields}
          onAdd={payload => mutate('booking_venues', 'insert', payload)}
          onUpdate={(id, payload) => mutate('booking_venues', 'update', payload, id)}
          onDelete={id => deleteRow('booking_venues', id)}
        />
        <BookingCrudPanel title="Equipment Categories" rows={categories} fields={categoryFields}
          onAdd={payload => mutate('booking_equipment_categories', 'insert', payload)}
          onUpdate={(id, payload) => mutate('booking_equipment_categories', 'update', payload, id)}
          onDelete={id => deleteRow('booking_equipment_categories', id)}
        />
        <BookingCrudPanel title="Equipment Groups" rows={groups} fields={groupFields}
          onAdd={payload => mutate('booking_equipment_groups', 'insert', payload)}
          onUpdate={(id, payload) => mutate('booking_equipment_groups', 'update', payload, id)}
          onDelete={id => deleteRow('booking_equipment_groups', id)}
        />
        <BookingCrudPanel title="Equipment Items" rows={items} fields={itemFields}
          onAdd={payload => mutate('booking_equipment_items', 'insert', payload)}
          onUpdate={(id, payload) => mutate('booking_equipment_items', 'update', payload, id)}
          onDelete={id => deleteRow('booking_equipment_items', id)}
        />
      </div>
    </div>
  )
}

function RolePermissionsPanel() {
  const [perms, setPerms] = useState({})
  const [saving, setSaving] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    supabase.from('module_permission').select('role_id, module, can_access')
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(p => { map[`${p.role_id}:${p.module}`] = p.can_access })
        setPerms(map)
        setLoaded(true)
      })
  }, [])

  const toggle = async (roleId, module) => {
    const key = `${roleId}:${module}`
    const current = perms[key] ?? true
    const next = !current
    setSaving(key)
    setPerms(prev => ({ ...prev, [key]: next }))
    await supabase.from('module_permission')
      .upsert({ role_id: roleId, module, can_access: next }, { onConflict: 'role_id,module' })
    logActivity({
      module: 'settings',
      action: 'permission_change',
      recordTable: 'module_permission',
      recordId: `${roleId}:${module}`,
      recordLabel: `${module} role ${roleId}`,
      summary: `${next ? 'Enabled' : 'Disabled'} ${module} access for role ${roleId}`,
      metadata: { role_id: roleId, permission_module: module, can_access: next },
    })
    setSaving(null)
  }

  if (!loaded) return <div className="text-sm text-gray-400 py-6 text-center">Loading permissions...</div>

  const ToggleRow = ({ roleId, module, label }) => {
    const key = `${roleId}:${module}`
    const on = perms[key] ?? true
    return (
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
        <span className="text-sm text-gray-800">{label}</span>
        <button
          onClick={() => toggle(roleId, module)}
          disabled={saving === key}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${on ? 'bg-red-600' : 'bg-gray-300'} disabled:opacity-50`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-1'}`} />
        </button>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
          <h3 className="font-semibold text-gray-800 text-sm">Sales Role</h3>
          <span className="text-xs text-gray-400 ml-1">— control what Sales staff can access</span>
        </div>
        <div>
          {SALES_MODULES.map(m => <ToggleRow key={m.module} roleId={2} module={m.module} label={m.label} />)}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
          <h3 className="font-semibold text-gray-800 text-sm">Sales Manager Role</h3>
          <span className="text-xs text-gray-400 ml-1">— same sales modules with manager access</span>
        </div>
        <div>
          {SALES_MODULES.map(m => <ToggleRow key={m.module} roleId={4} module={m.module} label={m.label} />)}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          <h3 className="font-semibold text-gray-800 text-sm">Service Role</h3>
          <span className="text-xs text-gray-400 ml-1">— control what Service staff can access</span>
        </div>
        <div>
          {SERVICE_MODULES.map(m => <ToggleRow key={m.module} roleId={3} module={m.module} label={m.label} />)}
        </div>
      </div>

      <p className="col-span-full text-xs text-gray-400">
        Changes take effect the next time the user loads a page. Admin always has full access regardless of these settings.
      </p>
    </div>
  )
}

const TABS = [
  { id: 'sales',      label: 'Sales' },
  { id: 'service',    label: 'Service' },
  { id: 'finance',    label: 'Finance' },
  { id: 'catalogue',  label: 'Catalogue' },
  { id: 'booking',    label: 'Booking' },
  { id: 'locations',  label: 'Locations' },
  { id: 'templates',  label: 'Doc Templates' },
  { id: 'roles',      label: 'Role Permissions' },
]

export default function Settings() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('sales')
  const canManageRolePermissions = isSuperAdminRole(profile?.role_id)
  const tabs = TABS.filter(t => t.id !== 'roles' || canManageRolePermissions)

  useEffect(() => {
    if (tab === 'roles' && !canManageRolePermissions) setTab('sales')
  }, [tab, canManageRolePermissions])

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-6 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sales' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <LookupPanel title="Industries"       tableName="industries"     valueField="name" hasUserIdInt />
          <LookupPanel title="Account Types"    tableName="account_type"   valueField="type" hasUserIdInt />
          <LookupPanel title="Lead Sources"     tableName="lead"           valueField="name" hasUserIdInt />
          <LookupPanel title="Stages"           tableName="stage"          valueField="name" hasUserIdInt />
          <LookupPanel title="Activity Types"   tableName="activity_type"  valueField="type" hasUserIdInt />
          <LookupPanel title="Activity Statuses" tableName="activity_status" valueField="name" />
          <LookupPanel title="Priority Levels"  tableName="priority"       valueField="name" />
        </div>
      )}

      {tab === 'service' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <LookupPanel title="Ticket Categories" tableName="category"     valueField="name" hasUserIdInt />
          <LookupPanel title="Service Types"     tableName="service_type" valueField="type" hasUserIdInt />
          <LookupPanel title="Spare Parts"       tableName="spare"        valueField="name" hasUserIdInt />
          <LookupPanel title="Vendors"           tableName="vendor"       valueField="name" hasUserIdInt />
          <LookupPanel title="RMA Modes"         tableName="mode"         valueField="name" hasUserIdInt />
          <LookupPanel title="Calibration Checklist" tableName="checklist" valueField="name" hasUserIdInt />
          <LookupPanel title="Calibration T&Cs" tableName="termcondition" valueField="name" hasUserIdInt multiline />
        </div>
      )}

      {tab === 'finance' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <LookupPanel
            title="Taxes"
            tableName="tax"
            valueField="name"
            extraField="rate"
            extraLabel="Rate (%)"
            extraType="number"
            hasUserIdInt
          />
          <LookupPanel title="Payment Terms" tableName="payment_term" valueField="name" hasUserIdInt />
        </div>
      )}

      {tab === 'catalogue' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <LookupPanel title="Product Categories" tableName="product_category" valueField="name" noUserId />
          <LookupPanel title="Product Models" tableName="product_model" valueField="name" noUserId />
          <LookupPanel title="Manufacturers" tableName="product_manufacturer" valueField="name" noUserId />
        </div>
      )}

      {tab === 'booking' && <BookingSettingsPanel />}

      {tab === 'locations' && <LocationsPanel />}

      {tab === 'templates' && <TemplatesPanel />}

      {tab === 'roles' && canManageRolePermissions && <RolePermissionsPanel />}
    </div>
  )
}
