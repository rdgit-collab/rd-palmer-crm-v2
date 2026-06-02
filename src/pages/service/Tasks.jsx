import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { notifyUser } from '../../lib/notifyUser'
import { fetchAssignableUsers, fetchLegacyUsers, getLegacyUserId, getUserName as formatUserName, isUuid } from '../../lib/legacyUsers'
import { fetchAllRows } from '../../lib/fetchAllRows'
import SignedFileLink from '../../components/SignedFileLink'
import PaginationControls from '../../components/PaginationControls'
import { Plus, Search, Eye, Edit2, Trash2, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 30

function fmtDateTime(value) {
  return value ? new Date(value).toLocaleString('en-GB') : '—'
}

const emptyForm = {
  ticket_id: '',
  servicetype: '',
  startdate: '',
  starttime: '',
  enddate: '',
  endtime: '',
  spare: '',
  description: '',
  action_taken: '',
  assigned_to: '',
  file: '',
}

export default function Tasks() {
  const { user, profile } = useAuth()
  const [view, setView]           = useState('list')
  const [tab, setTab]             = useState('open')
  const [scope, setScope]         = useState('all')
  const [tasks, setTasks]         = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [assignedFilter, setAssignedFilter] = useState('')
  const [serviceTypeFilter, setServiceTypeFilter] = useState('')
  const [loading, setLoading]     = useState(false)
  const [form, setForm]           = useState(emptyForm)
  const [editId, setEditId]       = useState(null)
  const [detail, setDetail]       = useState(null)
  const [deleteId, setDeleteId]   = useState(null)
  const [completeId, setCompleteId] = useState(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [uploadFile, setUploadFile] = useState(null)

  const [tickets, setTickets]         = useState([])
  const [serviceTypes, setServiceTypes] = useState([])
  const [users, setUsers]             = useState([])
  const [allUsers, setAllUsers]       = useState([])
  const [spares, setSpares]           = useState([])
  const origAssignedTo                = useRef(null)

  // ── Fetch list ────────────────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('task')
      .select('*', { count: 'exact' })
      .eq('is_completed', tab === 'open' ? 0 : 1)
      .order('id', { ascending: false })

    const term = search.trim()
    if (term) {
      const tid = term.replace(/^TID/i, '')
      const { data: companyTickets, error: companyTicketErr } = await supabase
        .from('ticket')
        .select('id')
        .ilike('company_name', `%${term}%`)
        .limit(1000)
      let numberTickets = []
      if (/^\d+$/.test(tid)) {
        const { data: numberTicketRows, error: numberTicketErr } = await supabase
          .from('ticket')
          .select('id')
          .eq('ticket_id', parseInt(tid))
          .limit(1000)
        if (!numberTicketErr) numberTickets = numberTicketRows || []
      }
      const matchingTickets = [
        ...(!companyTicketErr ? companyTickets || [] : []),
        ...numberTickets,
      ]
      const ticketIds = [...new Set(matchingTickets.map(t => t.id))]
      if (ticketIds.length > 0) {
        q = q.in('ticket_id', ticketIds)
      } else {
        q = q.eq('id', -1)
      }
    }
    if (scope === 'mine') q = q.eq('assigned_to', getLegacyUserId(profile))
    if (assignedFilter) q = q.eq('assigned_to', parseInt(assignedFilter))
    if (serviceTypeFilter) q = q.eq('servicetype', serviceTypeFilter)
    q = q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    const { data, count, error: err } = await q
    if (!err) { setTasks(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, page, tab, scope, profile, assignedFilter, serviceTypeFilter])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  // ── Fetch dropdowns ───────────────────────────────────────────────
  useEffect(() => {
    const run = async () => {
      const [tickR, stR, usrR, allUsrR, sprR, taskSpareR] = await Promise.all([
        fetchAllRows('ticket', 'id, ticket_id, company_name, is_completed', 'id', { ascending: false }),
        supabase.from('service_type').select('id, type').order('type'),
        fetchAssignableUsers(supabase),
        fetchLegacyUsers(supabase),
        fetchAllRows('spare', 'id, name', 'name'),
        supabase.from('task').select('spare').not('spare', 'is', null).neq('spare', '').limit(1000),
      ])
      setTickets(tickR || [])
      if (!stR.error)   setServiceTypes(stR.data || [])
      setUsers(usrR || [])
      setAllUsers(allUsrR || [])
      if (sprR?.length) {
        setSpares(sprR || [])
      } else if (!taskSpareR.error) {
        const names = [...new Set((taskSpareR.data || []).map(row => row.spare).filter(Boolean))]
        setSpares(names.map((name, idx) => ({ id: idx + 1, name })))
      }
    }
    run()
  }, [])

  // ── Open add ─────────────────────────────────────────────────────
  const openAdd = () => {
    setForm({ ...emptyForm, startdate: new Date().toISOString().split('T')[0] })
    setUploadFile(null)
    setEditId(null)
    setError('')
    setView('form')
  }

  // ── Open edit ─────────────────────────────────────────────────────
  const openEdit = (t) => {
    setForm({
      ticket_id:   String(t.ticket_id   || ''),
      servicetype: t.servicetype        || '',
      startdate:   t.startdate          || '',
      starttime:   t.starttime          || '',
      enddate:     t.enddate            || '',
      endtime:     t.endtime            || '',
      spare:       t.spare              || '',
      description: t.description        || '',
      action_taken: t.action_taken      || '',
      assigned_to: String(t.assigned_to || ''),
      file:        t.file               || '',
    })
    setUploadFile(null)
    origAssignedTo.current = t.assigned_to || ''
    setEditId(t.id)
    setError('')
    setView('form')
  }

  // ── Save ──────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    let filePath = form.file || null
    if (uploadFile) {
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      filePath = `task/${Date.now()}-${safeName}`
      const { error: uploadErr } = await supabase.storage.from('crm-uploads').upload(filePath, uploadFile, { upsert: true })
      if (uploadErr) { setError(uploadErr.message); setSaving(false); return }
    }

    const payload = {
      ticket_id:    form.ticket_id   ? parseInt(form.ticket_id)   : null,
      servicetype:  form.servicetype || null,
      startdate:    form.startdate   || null,
      starttime:    form.starttime   || null,
      enddate:      form.enddate     || null,
      endtime:      form.endtime     || null,
      spare:        form.spare       || null,
      description:  form.description,
      action_taken: form.action_taken || null,
      assigned_to:  form.assigned_to ? parseInt(form.assigned_to) : null,
      is_completed: 0,
      is_archived:  0,
      user_id:      getLegacyUserId(profile),
      file:         filePath,
    }

    if (editId) {
      const { error: err } = await supabase.from('task').update(payload).eq('id', editId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('task').insert([payload])
      if (err) { setError(err.message); setSaving(false); return }
    }

    // ── Notify assigned user ──────────────────────────────────────
    const newAssignee = form.assigned_to || ''
    const oldAssignee = editId ? (origAssignedTo.current || '') : ''
    const isNewAssignment = isUuid(newAssignee) && newAssignee !== user?.id &&
      (!editId || newAssignee !== oldAssignee)

    if (isNewAssignment) {
      const tickRef = tickets.find(t => String(t.id) === String(form.ticket_id))
      await notifyUser(supabase, {
        userId: newAssignee,
        title:  'Task assigned to you',
        body:   `You have been assigned a task${tickRef ? ' for ' + tickRef.company_name : ''}`,
        link:   '/tasks',
      })
    }

    setSaving(false)
    setUploadFile(null)
    fetchTasks()
    setView('list')
  }

  // ── Mark complete ─────────────────────────────────────────────────
  const markComplete = async (id) => {
    await supabase.from('task').update({ is_completed: 1 }).eq('id', id)
    setCompleteId(null)
    fetchTasks()
  }

  // ── Delete ────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    await supabase.from('task').delete().eq('id', id)
    setDeleteId(null)
    fetchTasks()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  // ── Helpers ───────────────────────────────────────────────────────
  const getTicketLabel = (ticketId) => {
    const t = tickets.find(t => t.id == ticketId || t.ticket_id == ticketId)
    return t ? `TID${t.ticket_id} — ${t.company_name || ''}` : ticketId ? `TID${ticketId}` : '—'
  }
  const getUserName = (id) => {
    return formatUserName(allUsers.length ? allUsers : users, id)
  }

  // ══════════════════════════════════════════════════════════════════
  // LIST
  // ══════════════════════════════════════════════════════════════════
  if (view === 'list') {
    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <button onClick={openAdd} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700">
            <Plus size={16} /> New Task
          </button>
        </div>

        {/* Open / Closed tabs */}
        <div className="flex gap-1 mb-5 border-b border-gray-200">
          {[['open', 'Open'], ['closed', 'Closed']].map(([id, label]) => (
            <button key={id} onClick={() => { setTab(id); setPage(1) }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === id ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >{label}</button>
          ))}
        </div>

        <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search customer or ticket number..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 text-sm focus:outline-none focus:border-red-400"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={assignedFilter}
              onChange={e => { setAssignedFilter(e.target.value); setPage(1) }}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 sm:w-48"
            >
              <option value="">All Assigned Users</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
            </select>
            <select
              value={serviceTypeFilter}
              onChange={e => { setServiceTypeFilter(e.target.value); setPage(1) }}
              className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 sm:w-48"
            >
              <option value="">All Service Types</option>
              {serviceTypes.map(s => <option key={s.id} value={s.type}>{s.type}</option>)}
            </select>
          </div>
          <div className="flex border border-gray-200 bg-white text-sm">
            {[['all', 'All Tasks'], ['mine', 'My Assigned']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => { setScope(id); setPage(1) }}
                className={`px-4 py-2 ${scope === id ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Ticket</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Service Type</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Start Date</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">End Date</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Assigned To</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading...</td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">No {tab} tasks found.</td></tr>
              ) : tasks.map(t => (
                <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-red-600">{getTicketLabel(t.ticket_id)}</td>
                  <td className="px-4 py-3 text-gray-700">{t.servicetype || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.startdate || '—'} {t.starttime || ''}</td>
                  <td className="px-4 py-3 text-gray-600">{t.enddate || '—'} {t.endtime || ''}</td>
                  <td className="px-4 py-3 text-gray-600">{getUserName(t.assigned_to)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => { setDetail(t); setView('detail') }} className="text-gray-500 hover:text-gray-700"><Eye size={15} /></button>
                      <button onClick={() => openEdit(t)} className="text-gray-500 hover:text-gray-700"><Edit2 size={15} /></button>
                      {tab === 'open' && <button onClick={() => setCompleteId(t.id)} className="text-green-600 hover:text-green-700" title="Mark Complete"><CheckCircle size={15} /></button>}
                      <button onClick={() => setDeleteId(t.id)} className="text-red-500 hover:text-red-700"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationControls page={page} totalPages={totalPages} total={total} label="task" onPageChange={setPage} />

        {completeId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white p-6 w-full max-w-sm shadow-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Mark Task as Completed?</h3>
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setCompleteId(null)} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
                <button onClick={() => markComplete(completeId)} className="px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700">Confirm</button>
              </div>
            </div>
          </div>
        )}

        {deleteId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white p-6 w-full max-w-sm shadow-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Delete Task?</h3>
              <p className="text-sm text-gray-600 mb-4">This action cannot be undone.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
                <button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════
  // FORM
  // ══════════════════════════════════════════════════════════════════
  if (view === 'form') {
    return (
      <div className="p-6 max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
          <h1 className="text-2xl font-bold text-gray-900">{editId ? 'Edit Task' : 'New Task'}</h1>
        </div>
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <form onSubmit={handleSave} className="bg-white border border-gray-200 p-6 space-y-5">

          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Ticket <span className="text-red-500">*</span></label>
            <div className="col-span-2">
              <select value={form.ticket_id} onChange={e => setForm(f => ({ ...f, ticket_id: e.target.value }))} required className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                <option value="">Please Select</option>
                {tickets.filter(t => t.is_completed != 1).map(t => <option key={t.id} value={t.id}>TID{t.ticket_id} — {t.company_name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Service Type</label>
            <div className="col-span-2">
              <select value={form.servicetype} onChange={e => setForm(f => ({ ...f, servicetype: e.target.value }))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                <option value="">Please Select</option>
                {serviceTypes.map(s => <option key={s.id} value={s.type}>{s.type}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Start Date / Time</label>
            <div className="col-span-2 flex gap-3">
              <input type="date" value={form.startdate} onChange={e => setForm(f => ({ ...f, startdate: e.target.value }))} className="flex-1 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
              <input type="time" value={form.starttime} onChange={e => setForm(f => ({ ...f, starttime: e.target.value }))} className="flex-1 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">End Date / Time</label>
            <div className="col-span-2 flex gap-3">
              <input type="date" value={form.enddate} onChange={e => setForm(f => ({ ...f, enddate: e.target.value }))} className="flex-1 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
              <input type="time" value={form.endtime} onChange={e => setForm(f => ({ ...f, endtime: e.target.value }))} className="flex-1 border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Spare Used</label>
            <div className="col-span-2">
              <select value={form.spare} onChange={e => setForm(f => ({ ...f, spare: e.target.value }))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                <option value="">None</option>
                {spares.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Document</label>
            <div className="col-span-2">
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400"
              />
              {form.file && !uploadFile && (
                <SignedFileLink path={form.file} label="Current document" className="mt-2 text-xs text-red-600 hover:underline" />
              )}
              {uploadFile && <p className="mt-2 text-xs text-gray-500">{uploadFile.name}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <label className="text-sm font-medium text-gray-700 pt-2">Description <span className="text-red-500">*</span></label>
            <div className="col-span-2">
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required rows={3} placeholder="Task description..." className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <label className="text-sm font-medium text-gray-700 pt-2">Action Taken</label>
            <div className="col-span-2">
              <textarea value={form.action_taken} onChange={e => setForm(f => ({ ...f, action_taken: e.target.value }))} rows={3} placeholder="Action taken..." className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Assigned To</label>
            <div className="col-span-2">
              <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} className="w-full border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-red-400">
                <option value="">Please Select</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setView('list')} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-6 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">
              {saving ? 'Saving...' : editId ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════
  // DETAIL
  // ══════════════════════════════════════════════════════════════════
  if (view === 'detail' && detail) {
    return (
      <div className="p-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
            <h1 className="text-2xl font-bold text-gray-900">Task Detail</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => openEdit(detail)} className="flex items-center gap-1.5 border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"><Edit2 size={14} /> Edit</button>
            {detail.is_completed === 0 && (
              <button onClick={() => setCompleteId(detail.id)} className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 text-sm hover:bg-green-700"><CheckCircle size={14} /> Mark Complete</button>
            )}
          </div>
        </div>
        <div className="bg-white border border-gray-200 p-6 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <div><span className="font-medium text-gray-500">Ticket: </span><span className="text-red-600 font-semibold">{getTicketLabel(detail.ticket_id)}</span></div>
            <div><span className="font-medium text-gray-500">Service Type: </span>{detail.servicetype || '—'}</div>
            <div><span className="font-medium text-gray-500">Start: </span>{detail.startdate || '—'} {detail.starttime || ''}</div>
            <div><span className="font-medium text-gray-500">End: </span>{detail.enddate || '—'} {detail.endtime || ''}</div>
            <div><span className="font-medium text-gray-500">Spare Used: </span>{detail.spare || '—'}</div>
            <div><span className="font-medium text-gray-500">Assigned To: </span>{getUserName(detail.assigned_to)}</div>
            <div><span className="font-medium text-gray-500">Created By: </span>{getUserName(detail.user_id)}</div>
            <div><span className="font-medium text-gray-500">Date Created: </span>{fmtDateTime(detail.created_at)}</div>
            <div>
              <span className="font-medium text-gray-500">Document: </span>
              {detail.file ? (
                <SignedFileLink path={detail.file} className="text-red-600 hover:underline" />
              ) : '—'}
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4">
            <p className="font-medium text-gray-500 mb-1">Description</p>
            <p className="text-gray-800 whitespace-pre-wrap">{detail.description || '—'}</p>
          </div>
          {detail.action_taken && (
            <div className="border-t border-gray-100 pt-4">
              <p className="font-medium text-gray-500 mb-1">Action Taken</p>
              <p className="text-gray-800 whitespace-pre-wrap">{detail.action_taken}</p>
            </div>
          )}
        </div>
        {completeId && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white p-6 w-full max-w-sm shadow-lg">
              <h3 className="font-semibold text-gray-900 mb-2">Mark Task as Completed?</h3>
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setCompleteId(null)} className="px-4 py-2 text-sm border border-gray-200 hover:bg-gray-50">Cancel</button>
                <button onClick={async () => { await markComplete(completeId); setView('list') }} className="px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700">Confirm</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return null
}
