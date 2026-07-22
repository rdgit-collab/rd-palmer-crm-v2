import { useCallback, useEffect, useState } from 'react'
import {
  Plus, ArrowRight, ArrowLeft, Copy, Check, X, Calendar, Clock, MapPin,
  Users, GraduationCap, FileText, Upload, Trash2, Link2, Info, CreditCard, Sparkles,
  Eye, Mail, Phone, Building2, User,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, formatShortDate } from '../lib/dateFormat'
import { logActivity } from '../lib/activityLog'
import SignedFileLink from '../components/SignedFileLink'
import { STATUS_GROUPS } from '../lib/trainingStatus'
import { ROLE_SALES, hasAdminAccess } from '../lib/roles'

const slugify = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
const fmtShort = v => formatShortDate(v, '', { year: false })
const userName = u => u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : '—'
const initials = n => String(n || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
const signupUrl = (slug, referralCode = '') => `${window.location.origin}/training/signup/${slug}${referralCode ? `?ref=${encodeURIComponent(referralCode)}` : ''}`
const LANGUAGE_OPTIONS = ['', 'English', 'Bahasa Malaysia', 'English & Bahasa Malaysia', 'Mandarin', 'Tamil']
const LEVEL_OPTIONS = ['', 'Beginner', 'Intermediate', 'Advanced', 'Beginner - Intermediate', 'Intermediate - Advanced']
const CAPACITY_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50]

const linesToArr = t => String(t || '').split('\n').map(s => s.trim()).filter(Boolean)
const agendaToArr = t => linesToArr(t).map(line => {
  const m = line.match(/^\s*([0-9:.\sAaPpMm]+?)\s*[-|–]\s*(.+)$/)
  return m ? { time: m[1].trim(), title: m[2].trim() } : { time: '', title: line }
})
const arrToLines = a => (Array.isArray(a) ? a : []).join('\n')
const agendaToLines = a => (Array.isArray(a) ? a : []).map(r => `${r.time ? r.time + ' - ' : ''}${r.title || ''}`).join('\n')
const dateRangeLabel = s => {
  if (!s?.session_date) return '—'
  if (s.end_date && s.end_date !== s.session_date) return `${formatDate(s.session_date)} - ${formatDate(s.end_date)}`
  return formatDate(s.session_date)
}
const daysBetweenInclusive = (start, end) => {
  if (!start || !end) return 0
  const startDate = new Date(`${start}T00:00:00`)
  const endDate = new Date(`${end}T00:00:00`)
  const diff = Math.round((endDate - startDate) / 86400000) + 1
  return Number.isFinite(diff) ? diff : 0
}
const durationFromDates = (start, end) => {
  const days = daysBetweenInclusive(start, end)
  if (days <= 1) return 'One day'
  return `${days} days`
}

function SelectableSignupLink({ url }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      className="block select-all break-all font-mono text-xs font-medium text-red-600 hover:underline"
    >
      {url}
    </a>
  )
}

export default function Training() {
  const { profile } = useAuth()
  const canManageTraining = hasAdminAccess(profile?.role_id)
  const canViewParticipants = canManageTraining || Number(profile?.role_id) === ROLE_SALES
  const [sessions, setSessions] = useState([])
  const [trainerLinks, setTrainerLinks] = useState([])   // {session_id, user_id, users}
  const [regCounts, setRegCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [activeUsers, setActiveUsers] = useState([])
  const [editing, setEditing] = useState(null)            // session obj | {} (new) | null
  const [referralCode, setReferralCode] = useState('')
  const [copiedReferralSessionId, setCopiedReferralSessionId] = useState('')

  const loadList = useCallback(async () => {
    setLoading(true)
    const queries = [
      supabase.from('training_sessions').select('*').order('session_date', { ascending: false }),
      supabase.from('training_session_trainers').select('session_id, user_id, users(first_name,last_name)'),
    ]
    if (canViewParticipants) queries.push(supabase.from('training_registrations').select('id, session_id'))
    const [{ data: sess }, { data: links }, regsResult] = await Promise.all(queries)
    setSessions(sess || [])
    setTrainerLinks(links || [])
    const counts = {}
    ;(regsResult?.data || []).forEach(r => { counts[r.session_id] = (counts[r.session_id] || 0) + 1 })
    setRegCounts(counts)
    setLoading(false)
  }, [canViewParticipants])

  useEffect(() => { loadList() }, [loadList])
  useEffect(() => {
    if (!canManageTraining) return
    supabase.from('users').select('id, first_name, last_name, status, is_trainer').eq('status', 'Active').eq('is_trainer', true).order('first_name')
      .then(({ data }) => setActiveUsers(data || []))
  }, [canManageTraining])
  useEffect(() => {
    if (!profile?.id) return
    supabase.from('training_referral_codes').select('referral_code').eq('user_id', profile.id).eq('is_active', true).maybeSingle()
      .then(({ data }) => setReferralCode(data?.referral_code || ''))
  }, [profile?.id])

  const trainersFor = id => trainerLinks.filter(t => t.session_id === id)
  const cloneSession = (session) => {
    const baseSlug = session.slug || slugify(session.title)
    const suffix = Date.now().toString(36).slice(-6)
    setEditing({
      ...session,
      id: null,
      title: session.title || '',
      slug: `${baseSlug.slice(0, 41)}-${suffix}`,
      trainerIds: trainersFor(session.id).map(t => t.user_id),
      cloneSource: session.id,
    })
  }

  if (selectedId) {
    return <SessionDetail
      sessionId={selectedId}
      activeUsers={activeUsers}
      profile={profile}
      canManageTraining={canManageTraining}
      canViewParticipants={canViewParticipants}
      referralCode={referralCode}
      onBack={() => { setSelectedId(null); loadList() }}
    />
  }

  const upcoming = sessions.filter(s => s.session_date && s.session_date >= new Date().toISOString().slice(0, 10)).length
  const totalRegs = Object.values(regCounts).reduce((a, b) => a + b, 0)
  const copyReferralLink = (session) => {
    if (!referralCode) return
    navigator.clipboard?.writeText(signupUrl(session.slug, referralCode))
    setCopiedReferralSessionId(session.id)
    setTimeout(() => setCopiedReferralSessionId(''), 1200)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Training Sessions</h1>
          <p className="text-sm text-gray-500 mt-1">{canManageTraining ? 'Create sessions, share signup links, and manage attendees & HRD claim status.' : 'View upcoming sessions and share your own tracked referral links.'}</p>
        </div>
        {canManageTraining && (
          <button onClick={() => setEditing({})}
            className="ml-auto inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <Plus size={15} /> New Session
          </button>
        )}
      </div>

      {!canManageTraining && (
        <div className="bg-white border border-red-100 rounded-xl p-4 mb-6 flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><Link2 size={18} /></div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">Your referral code</div>
            <div className="text-xs text-gray-500">Share a session link from the table below. New signups will be tracked under your name.</div>
          </div>
          <div className="ml-auto rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 font-mono text-sm font-semibold text-gray-700">
            {referralCode || 'Preparing...'}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Stat icon={GraduationCap} tone="red" n={sessions.length} l="Total sessions" />
        <Stat icon={Calendar} tone="blue" n={upcoming} l="Upcoming" />
        {canViewParticipants ? (
          <>
            <Stat icon={Users} tone="green" n={totalRegs} l="Total registrations" />
            {canManageTraining ? <Stat icon={Users} tone="indigo" n={activeUsers.length} l="Training trainers" /> : <Stat icon={Users} tone="indigo" n="View" l="Participants" />}
          </>
        ) : (
          <>
            <Stat icon={Link2} tone="green" n={referralCode ? 'Ready' : '—'} l="Referral link" />
            <Stat icon={Users} tone="indigo" n="View" l="Access mode" />
          </>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-semibold">Session</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Trainers</th>
                {canViewParticipants && <th className="px-4 py-3 font-semibold">Registered</th>}
                <th className="px-4 py-3 font-semibold">{canManageTraining ? 'Signup link' : 'Your referral link'}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={canViewParticipants ? 6 : 5} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>}
              {!loading && sessions.length === 0 && (
                <tr><td colSpan={canViewParticipants ? 6 : 5} className="px-4 py-10 text-center text-gray-400">{canManageTraining ? 'No sessions yet. Click “New Session” to create one.' : 'No sessions available yet.'}</td></tr>
              )}
              {sessions.map(s => {
                const trs = trainersFor(s.id)
                const trackedUrl = signupUrl(s.slug, canManageTraining ? '' : referralCode)
                return (
                  <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedId(s.id)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{s.title}</div>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{s.location || '—'}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${s.is_open ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {s.is_open ? 'Open' : 'Closed'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{dateRangeLabel(s)}<div className="text-xs text-gray-400">{s.start_time || ''}</div></td>
                    <td className="px-4 py-3">
                      {trs.length ? trs.slice(0, 2).map(t => (
                        <span key={t.user_id} className="inline-block mr-1 mb-1 rounded bg-blue-50 text-blue-700 px-2 py-0.5 text-xs font-medium">{userName(t.users)}</span>
                      )) : <span className="text-xs text-gray-400">None</span>}
                      {trs.length > 2 && <span className="rounded bg-gray-100 text-gray-500 px-2 py-0.5 text-xs">+{trs.length - 2}</span>}
                    </td>
                    {canViewParticipants && <td className="px-4 py-3"><b>{regCounts[s.id] || 0}</b><span className="text-gray-400"> / {s.capacity || 0}</span></td>}
                    <td className="px-4 py-3 max-w-[320px]" onClick={e => e.stopPropagation()}>
                      <SelectableSignupLink url={trackedUrl} />
                    </td>
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      {canManageTraining ? (
                        <>
                          <button onClick={() => cloneSession(s)} className="inline-flex items-center gap-1 border border-gray-200 hover:bg-gray-100 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 mr-2">
                            <Copy size={13} /> Clone
                          </button>
                          <button onClick={() => setSelectedId(s.id)} className="inline-flex items-center gap-1 border border-gray-200 hover:bg-gray-100 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700">
                            Manage <ArrowRight size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button disabled={!referralCode} onClick={() => copyReferralLink(s)} className="inline-flex items-center gap-1 border border-gray-200 hover:bg-gray-100 disabled:opacity-50 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 mr-2">
                            {copiedReferralSessionId === s.id ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy link</>}
                          </button>
                          <button onClick={() => setSelectedId(s.id)} className="inline-flex items-center gap-1 border border-gray-200 hover:bg-gray-100 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700">
                            View <ArrowRight size={13} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {canManageTraining && editing && <SessionModal session={editing} profile={profile} activeUsers={activeUsers} onClose={saved => { setEditing(null); if (saved) loadList() }} />}
    </div>
  )
}

function Stat({ icon: Icon, tone, n, l }) {
  const tones = { red: 'bg-red-50 text-red-600', blue: 'bg-blue-50 text-blue-600', green: 'bg-green-50 text-green-600', indigo: 'bg-indigo-50 text-indigo-600' }
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${tones[tone]}`}><Icon size={19} /></div>
      <div><div className="text-2xl font-bold leading-none">{n}</div><div className="text-xs text-gray-500 mt-1">{l}</div></div>
    </div>
  )
}

// ───────────────────────── Session detail ─────────────────────────
function SessionDetail({ sessionId, activeUsers, profile, canManageTraining, canViewParticipants, referralCode, onBack }) {
  const [session, setSession] = useState(null)
  const [regs, setRegs] = useState([])
  const [trainers, setTrainers] = useState([])
  const [docs, setDocs] = useState([])
  const [tab, setTab] = useState('attendees')
  const [editing, setEditing] = useState(false)
  const [addingAtt, setAddingAtt] = useState(false)
  const [detailRegId, setDetailRegId] = useState(null)
  const [deleteReg, setDeleteReg] = useState(null)
  const [deletingReg, setDeletingReg] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const queries = [
      supabase.from('training_sessions').select('*').eq('id', sessionId).single(),
      supabase.from('training_session_trainers').select('id, user_id, users(first_name,last_name)').eq('session_id', sessionId),
    ]
    if (canViewParticipants) {
      queries.push(supabase.from('training_registrations').select('*').eq('session_id', sessionId).order('created_at'))
    }
    if (canManageTraining) {
      queries.push(
        supabase.from('training_attendance_docs').select('*').eq('session_id', sessionId).order('created_at', { ascending: false })
      )
    }
    const [sessionResult, trainersResult, regsResult, docsResult] = await Promise.all(queries)
    setSession(sessionResult.data)
    setTrainers(trainersResult.data || [])
    setRegs(regsResult?.data || [])
    setDocs(docsResult?.data || [])
  }, [canManageTraining, canViewParticipants, sessionId])
  useEffect(() => { load() }, [load])

  if (!session) return <div className="p-6 text-sm text-gray-400">Loading…</div>
  const url = signupUrl(session.slug, canManageTraining ? '' : referralCode)
  // Resolve the open attendee from live state so status toggles reflect instantly.
  const detailReg = detailRegId ? regs.find(x => x.id === detailRegId) : null

  const toggleStatus = async (reg, key) => {
    const next = reg[key] ? null : new Date().toISOString()
    setRegs(prev => prev.map(x => x.id === reg.id ? { ...x, [key]: next } : x))
    await supabase.from('training_registrations').update({ [key]: next }).eq('id', reg.id)
  }
  const addTrainer = async (userId) => {
    if (!userId) return
    const { error } = await supabase.from('training_session_trainers').insert({ session_id: sessionId, user_id: userId })
    if (!error) load()
  }
  const removeTrainer = async (id) => { await supabase.from('training_session_trainers').delete().eq('id', id); load() }

  const uploadDoc = async (file) => {
    if (!file) return
    const path = `training/${sessionId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: upErr } = await supabase.storage.from('crm-uploads').upload(path, file, { upsert: true })
    if (upErr) { alert('Upload failed: ' + upErr.message); return }
    const sizeKb = file.size > 1024 * 1024 ? (file.size / 1024 / 1024).toFixed(1) + ' MB' : Math.round(file.size / 1024) + ' KB'
    await supabase.from('training_attendance_docs').insert({
      session_id: sessionId, file_path: path, file_name: file.name, file_size: sizeKb, uploaded_by: profile?.id || null,
    })
    logActivity({ module: 'training', action: 'upload', recordTable: 'training_attendance_docs', recordId: sessionId, summary: `Uploaded attendance doc for ${session.title}` })
    load()
  }
  const removeDoc = async (doc) => {
    await supabase.storage.from('crm-uploads').remove([doc.file_path]).catch(() => {})
    await supabase.from('training_attendance_docs').delete().eq('id', doc.id)
    load()
  }
  const removeRegistration = async () => {
    if (!deleteReg?.id) return
    setDeletingReg(true)
    const { error } = await supabase.from('training_registrations').delete().eq('id', deleteReg.id)
    if (error) {
      setDeletingReg(false)
      alert(error.message)
      return
    }
    logActivity({
      module: 'training',
      action: 'delete',
      recordTable: 'training_registrations',
      recordId: deleteReg.id,
      recordLabel: deleteReg.participant_name || '',
      summary: `Deleted training participant ${deleteReg.participant_name || deleteReg.email || deleteReg.id} from ${session.title}`,
      metadata: { session_id: sessionId, registration_id: deleteReg.id },
    })
    setDeleteReg(null)
    setDeletingReg(false)
    load()
  }
  const copyLink = () => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1200) }

  const paidCount = regs.filter(r => r.paid_at).length
  const hrdCount = regs.filter(r => r.hrd_claim).length

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft size={15} /> All sessions
      </button>

      <div className="flex flex-wrap items-start gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{session.title}</h1>
          <div className="flex flex-wrap gap-2 mt-3 text-sm text-gray-700">
            <Meta icon={Calendar}>{dateRangeLabel(session)}</Meta>
            <Meta icon={Clock}>{session.start_time || '—'}</Meta>
            <Meta icon={MapPin}>{session.location || '—'}</Meta>
            <Meta icon={CreditCard}>RM {Number(session.fee || 0).toLocaleString()}</Meta>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {canManageTraining && <button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium text-gray-700">Edit details</button>}
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium"><Link2 size={15} /> View signup page</a>
        </div>
      </div>

      {canViewParticipants ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Stat icon={Users} tone="green" n={`${regs.length} / ${session.capacity || 0}`} l="Registered" />
          {canManageTraining ? <Stat icon={CreditCard} tone="blue" n={paidCount} l="Paid" /> : <Stat icon={Link2} tone="blue" n={referralCode ? 'Ready' : '—'} l="Your tracking" />}
          <Stat icon={Sparkles} tone="indigo" n={canManageTraining ? hrdCount : (session.hrd_claimable ? 'Yes' : 'No')} l={canManageTraining ? 'HRD claims' : 'HRD claimable'} />
          <Stat icon={FileText} tone="red" n={canManageTraining ? docs.length : (session.certificate ? 'Yes' : 'No')} l={canManageTraining ? 'Attendance docs' : 'Certificate'} />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Stat icon={Users} tone="green" n={session.capacity || '—'} l="Capacity" />
          <Stat icon={Link2} tone="blue" n={referralCode ? 'Ready' : '—'} l="Your tracking" />
          <Stat icon={Sparkles} tone="indigo" n={session.hrd_claimable ? 'Yes' : 'No'} l="HRD claimable" />
          <Stat icon={FileText} tone="red" n={session.certificate ? 'Yes' : 'No'} l="Certificate" />
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-6 flex items-center gap-3 max-w-2xl">
        <Link2 size={15} className="text-gray-400 shrink-0" />
        <span className="text-xs font-semibold text-gray-500 shrink-0">{canManageTraining ? 'Signup link' : 'Your referral link'}</span>
        <span className="min-w-0 flex-1">
          <SelectableSignupLink url={url} />
        </span>
        <button onClick={copyLink} disabled={!canManageTraining && !referralCode} className="inline-flex items-center gap-1 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700">
          {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
        </button>
      </div>

      {!canManageTraining && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-2xl">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Info size={17} /></span>
            <div>
              <h2 className="font-semibold text-gray-900">Referral tracking is automatic</h2>
              <p className="text-sm text-gray-500 mt-1">Share your referral link above. When a customer signs up through it, the registration will be captured under your name for admin follow-up.</p>
            </div>
          </div>
        </div>
      )}

      {canManageTraining && <div className="inline-flex gap-1 bg-gray-100 p-1 rounded-xl mb-5">
        {[['attendees', `Attendees · ${regs.length}`], ['trainers', `Trainers · ${trainers.length}`], ['docs', `Attendance Docs · ${docs.length}`]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>{label}</button>
        ))}
      </div>}

      {canViewParticipants && (!canManageTraining || tab === 'attendees') && (
        <>
          <div className="flex items-center mb-3">
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <Info size={13} /> {canManageTraining ? 'Click View on any attendee to see full details and update payment / HRD status.' : 'Participant registrations are view-only for Sales users.'}
            </p>
            {canManageTraining && <button onClick={() => setAddingAtt(true)} className="ml-auto inline-flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700"><Plus size={13} /> Add attendee</button>}
          </div>
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-200">
                  <th className="px-4 py-3 font-semibold">Participant</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">HRD</th>
                  <th className="px-4 py-3 font-semibold">Progress</th>
                  <th className="px-4 py-3 font-semibold text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {regs.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">No registrations yet. Share the signup link above.</td></tr>}
                {regs.map(r => (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-white flex items-center justify-center text-xs font-bold shrink-0">{initials(r.participant_name)}</div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">{r.participant_name || '—'}</div>
                          <div className="text-[11px] text-gray-400 truncate">{r.company || 'No company'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700 truncate max-w-[220px]">{r.email || '—'}</div>
                      <div className="text-[11px] text-gray-400">{r.phone || ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      {r.hrd_claim
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[11px] font-semibold"><Sparkles size={11} /> HRD</span>
                        : <span className="rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-[11px]">No</span>}
                    </td>
                    <td className="px-4 py-3"><StatusSummary reg={r} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailRegId(r.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-white hover:border-gray-300"
                        >
                          <Eye size={13} /> View
                        </button>
                        {canManageTraining && (
                          <button
                            type="button"
                            onClick={() => setDeleteReg(r)}
                            title="Delete participant"
                            className="inline-flex items-center justify-center rounded-lg border border-red-100 p-1.5 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {canManageTraining && tab === 'trainers' && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-xl">
          <label className="block text-xs font-semibold text-gray-600 mb-2">Assigned trainers</label>
          <div className="mb-5">
            {trainers.length ? trainers.map(t => (
              <span key={t.id} className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-800 rounded-full pl-1 pr-2 py-1 text-sm font-medium mr-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">{initials(userName(t.users))}</span>
                {userName(t.users)}
                <button onClick={() => removeTrainer(t.id)} className="opacity-50 hover:opacity-100"><X size={13} /></button>
              </span>
            )) : <span className="text-sm text-gray-400">No trainers assigned yet.</span>}
          </div>
          <label className="block text-xs font-semibold text-gray-600 mb-2">Add a trainer</label>
          <div className="flex gap-2">
            <select id="trainerPick" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm">
              {activeUsers.filter(u => !trainers.some(t => t.user_id === u.id)).map(u => (
                <option key={u.id} value={u.id}>{userName(u)}</option>
              ))}
            </select>
            <button onClick={() => addTrainer(document.getElementById('trainerPick').value)}
              className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium"><Plus size={14} /> Add</button>
          </div>
          <p className="text-xs text-gray-400 mt-4 flex items-center gap-1.5"><Info size={13} /> Manage this trainer list in Settings → Training.</p>
        </div>
      )}

      {canManageTraining && tab === 'docs' && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-2xl">
          <label className="block text-xs font-semibold text-gray-600 mb-3">Signed attendance documents</label>
          <div className="mb-4 space-y-2">
            {docs.length ? docs.map(d => (
              <div key={d.id} className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3">
                <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0"><FileText size={18} /></div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{d.file_name}</div>
                  <div className="text-xs text-gray-400">{d.file_size || ''} · {formatDate(d.created_at)}</div>
                </div>
                <SignedFileLink path={d.file_path} label="Open" className="text-xs text-red-600 font-medium" />
                <button onClick={() => removeDoc(d)} className="text-gray-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            )) : <div className="text-sm text-gray-400">No documents uploaded yet.</div>}
          </div>
          <label className="block border-2 border-dashed border-gray-300 rounded-xl p-7 text-center text-gray-500 hover:border-red-500 hover:text-red-600 cursor-pointer transition">
            <Upload size={28} className="mx-auto mb-2" />
            <div className="font-medium text-gray-700">Click to upload signed attendance sheet</div>
            <div className="text-xs mt-1">PDF, JPG or PNG · multiple files supported</div>
            <input type="file" className="hidden" onChange={e => { uploadDoc(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </div>
      )}

      {detailReg && (
        <AttendeeDetailModal
          reg={detailReg}
          canManage={canManageTraining}
          onToggle={toggleStatus}
          onClose={() => setDetailRegId(null)}
          onDelete={canManageTraining ? () => { setDeleteReg(detailReg); setDetailRegId(null) } : null}
        />
      )}
      {canManageTraining && editing && <SessionModal session={{ ...session, trainerIds: trainers.map(t => t.user_id) }} profile={profile} activeUsers={activeUsers} onClose={saved => { setEditing(false); if (saved) load() }} />}
      {canManageTraining && addingAtt && <AddAttendeeModal sessionId={sessionId} onClose={saved => { setAddingAtt(false); if (saved) load() }} />}
      {canManageTraining && deleteReg && (
        <Modal
          title="Delete participant?"
          subtitle="This removes the signup record from this training session."
          onClose={() => setDeleteReg(null)}
          footer={<>
            <button onClick={() => setDeleteReg(null)} disabled={deletingReg} className="border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 disabled:opacity-50">Cancel</button>
            <button onClick={removeRegistration} disabled={deletingReg} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">{deletingReg ? 'Deleting...' : 'Delete participant'}</button>
          </>}
        >
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
            <div className="font-semibold">{deleteReg.participant_name || 'Unnamed participant'}</div>
            <div className="mt-1 text-red-700">{deleteReg.company || 'No company'}{deleteReg.email ? ` · ${deleteReg.email}` : ''}</div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Meta({ icon: Icon, children }) {
  return <span className="inline-flex items-center gap-1.5 bg-gray-100 rounded-lg px-3 py-1.5">{Icon && <Icon size={14} className="text-red-600" />}{children}</span>
}

function StatusTracks({ reg, onToggle, readOnly = false }) {
  return (
    <div className="space-y-2">
      {STATUS_GROUPS.map(g => {
        const dim = g.tone === 'indigo' && !reg.hrd_claim
        const green = g.tone === 'green'
        return (
          <div key={g.label} className={`flex items-start gap-2 ${dim ? 'opacity-40' : ''}`}>
            <span className="w-16 shrink-0 pt-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{g.label}</span>
            <div className="flex flex-wrap gap-1.5">
              {g.steps.map(st => {
                const on = !!reg[st.key]
                const cls = `inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold transition
                  ${on ? (green ? 'border-green-200 bg-green-50 text-green-700' : 'border-indigo-200 bg-indigo-50 text-indigo-700')
                        : 'border-gray-200 bg-white text-gray-500'}`
                const content = (
                  <>
                    <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border
                      ${on ? (green ? 'border-green-600 bg-green-600' : 'border-indigo-600 bg-indigo-600') : 'border-gray-300'}`}>
                      {on && <Check size={9} className="text-white" />}
                    </span>
                    {st.label}{on && <span className="font-normal opacity-70">{fmtShort(reg[st.key])}</span>}
                  </>
                )
                if (readOnly) {
                  return <span key={st.key} className={cls}>{content}</span>
                }
                return (
                  <button key={st.key} onClick={() => onToggle(reg, st.key)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold transition
                      ${on ? (green ? 'border-green-200 bg-green-50 text-green-700' : 'border-indigo-200 bg-indigo-50 text-indigo-700')
                            : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                    {content}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Compact at-a-glance progress for the attendee table: one row per status group
// with a filled pill per completed milestone and an n/total count.
function StatusSummary({ reg }) {
  return (
    <div className="space-y-1.5">
      {STATUS_GROUPS.map(g => {
        const dim = g.tone === 'indigo' && !reg.hrd_claim
        const green = g.tone === 'green'
        const done = g.steps.filter(s => reg[s.key]).length
        return (
          <div key={g.label} className={`flex items-center gap-2 ${dim ? 'opacity-40' : ''}`}>
            <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-400">{g.label}</span>
            <div className="flex gap-1">
              {g.steps.map(s => (
                <span key={s.key} title={`${s.label}${reg[s.key] ? ` · ${fmtShort(reg[s.key])}` : ''}`}
                  className={`h-2 w-5 rounded-full ${reg[s.key] ? (green ? 'bg-green-500' : 'bg-indigo-500') : 'bg-gray-200'}`} />
              ))}
            </div>
            <span className="text-[10px] font-semibold text-gray-400">{done}/{g.steps.length}</span>
          </div>
        )
      })}
    </div>
  )
}

// Full attendee detail in a modal, opened from the table's View button. Managers
// can toggle payment / HRD milestones here; viewers see them read-only.
function AttendeeDetailModal({ reg, canManage, onToggle, onClose, onDelete }) {
  const DetailRow = ({ icon: Icon, label, value, mono }) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <Icon size={15} className="text-gray-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
        <div className={`text-sm text-gray-800 break-words ${mono ? 'font-mono' : ''}`}>{value || '—'}</div>
      </div>
    </div>
  )
  return (
    <Modal
      title={reg.participant_name || 'Attendee'}
      subtitle={reg.company || 'No company'}
      onClose={onClose}
      footer={<>
        {onDelete && <button onClick={onDelete} className="mr-auto inline-flex items-center gap-1.5 border border-red-100 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg text-sm font-medium"><Trash2 size={14} /> Delete</button>}
        <button onClick={onClose} className="border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium text-gray-700">Close</button>
      </>}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        <DetailRow icon={User} label="Participant" value={`${reg.participant_name || '—'}${reg.existing_user ? ' · Existing user' : ' · New user'}`} />
        <DetailRow icon={CreditCard} label="NRIC" value={reg.nric} />
        <DetailRow icon={Building2} label="Company" value={reg.company} />
        <DetailRow icon={Building2} label="Industry" value={reg.industry} />
        <DetailRow icon={Mail} label="Email" value={reg.email} />
        <DetailRow icon={Phone} label="Phone" value={reg.phone} />
        <DetailRow icon={Users} label="Invited by" value={reg.invited_by_name_snapshot} />
        <DetailRow icon={Link2} label="Referral code" value={reg.referral_code} mono />
        <DetailRow icon={Sparkles} label="HRD claim" value={reg.hrd_claim ? 'Yes' : 'No'} />
        {reg.hrd_claim && <DetailRow icon={Mail} label="HR email" value={reg.hr_email} />}
      </div>
      <div className="mt-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Customer status</div>
        {canManage && <p className="text-[11px] text-gray-400 mb-2.5 flex items-center gap-1.5"><Info size={12} /> Click a milestone to toggle it — the date is recorded automatically.</p>}
        <StatusTracks reg={reg} onToggle={onToggle} readOnly={!canManage} />
      </div>
    </Modal>
  )
}

// ───────────────────────── Modals ─────────────────────────
function Field({ label, req, children }) {
  return <div className="mb-4"><label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}{req && <span className="text-red-600"> *</span>}</label>{children}</div>
}
const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100'

function SessionModal({ session, profile, activeUsers = [], onClose }) {
  const isNew = !session?.id
  const initialEndDate = session?.end_date || session?.session_date || ''
  const initialIsOneDay = !session?.end_date || session.end_date === session?.session_date || String(session?.duration || '').toLowerCase() === 'one day'
  const [f, setF] = useState({
    title: session?.title || '', slug: session?.slug || '', session_date: session?.session_date || '', end_date: initialEndDate,
    is_one_day: initialIsOneDay,
    start_time: session?.start_time || '09:00', location: session?.location || '', capacity: session?.capacity ?? 20,
    fee: session?.fee ?? 0, duration: session?.duration || '', level: session?.level || '', language: session?.language || '',
    certificate: session?.certificate ?? true, hrd_claimable: session?.hrd_claimable ?? true, is_open: session?.is_open ?? true,
    description: session?.description || '', overview: session?.overview || '',
    outcomes: arrToLines(session?.outcomes), audience: arrToLines(session?.audience),
    includes: arrToLines(session?.includes), agenda: agendaToLines(session?.agenda),
  })
  const [slugTouched, setSlugTouched] = useState(!!session?.slug)
  const [trainerIds, setTrainerIds] = useState((session?.trainerIds || []).map(String))
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))
  const toggleTrainer = userId => {
    const id = String(userId)
    setTrainerIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  const capacityOptions = CAPACITY_OPTIONS.includes(Number(f.capacity))
    ? CAPACITY_OPTIONS
    : [...CAPACITY_OPTIONS, Number(f.capacity)].filter(Boolean).sort((a, b) => a - b)
  const levelOptions = LEVEL_OPTIONS.includes(f.level) ? LEVEL_OPTIONS : [...LEVEL_OPTIONS, f.level]
  const languageOptions = LANGUAGE_OPTIONS.includes(f.language) ? LANGUAGE_OPTIONS : [...LANGUAGE_OPTIONS, f.language]
  const trainerOptions = [
    ...activeUsers,
    ...(session?.trainerIds || [])
      .filter(id => !activeUsers.some(user => String(user.id) === String(id)))
      .map(id => ({ id, first_name: 'Previously assigned', last_name: 'trainer', email: '', status: 'Active' })),
  ]

  const save = async () => {
    if (!f.title.trim()) { alert('Please enter a title'); return }
    if (!f.session_date) { alert('Please choose a start date'); return }
    if (!f.is_one_day && !f.end_date) { alert('Please choose an end date'); return }
    if (!f.is_one_day && f.end_date < f.session_date) { alert('End date cannot be before the start date'); return }
    setSaving(true)
    const endDate = f.is_one_day ? f.session_date : f.end_date
    const payload = {
      title: f.title.trim(), slug: (f.slug.trim() || slugify(f.title)),
      session_date: f.session_date || null, end_date: endDate || null, start_time: f.start_time, location: f.location.trim(),
      capacity: Number(f.capacity) || 0, fee: Number(f.fee) || 0, duration: durationFromDates(f.session_date, endDate),
      level: f.level.trim(), language: f.language.trim(), certificate: f.certificate, hrd_claimable: f.hrd_claimable,
      is_open: f.is_open,
      description: f.description.trim(), overview: f.overview.trim(),
      outcomes: linesToArr(f.outcomes), audience: linesToArr(f.audience),
      includes: linesToArr(f.includes), agenda: agendaToArr(f.agenda), updated_at: new Date().toISOString(),
    }
    let error, savedSession
    if (isNew) {
      payload.created_by = profile?.id || null
      ;({ data: savedSession, error } = await supabase.from('training_sessions').insert(payload).select('id').single())
    } else {
      ;({ data: savedSession, error } = await supabase.from('training_sessions').update(payload).eq('id', session.id).select('id').single())
    }
    if (error) {
      setSaving(false)
      alert(error.message.includes('duplicate') ? 'That signup link is already taken — choose another.' : error.message)
      return
    }
    const sessionId = savedSession?.id || session?.id
    if (sessionId) {
      const uniqueTrainerIds = [...new Set(trainerIds)].filter(Boolean)
      await supabase.from('training_session_trainers').delete().eq('session_id', sessionId)
      if (uniqueTrainerIds.length) {
        const { error: trainerError } = await supabase.from('training_session_trainers').insert(
          uniqueTrainerIds.map(userId => ({ session_id: sessionId, user_id: userId }))
        )
        if (trainerError) {
          setSaving(false)
          alert(`Training saved, but trainer assignment failed: ${trainerError.message}`)
          return
        }
      }
    }
    logActivity({ module: 'training', action: isNew ? 'create' : 'update', recordTable: 'training_sessions', recordLabel: payload.title, summary: `${isNew ? 'Created' : 'Updated'} training session ${payload.title}` })
    setSaving(false)
    onClose(true)
  }

  return (
    <Modal title={isNew ? 'New training session' : 'Edit session'} subtitle={isNew ? 'Set up a session and its public signup link.' : 'Update the session details.'} onClose={() => onClose(false)}
      footer={<><button onClick={() => onClose(false)} className="border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium text-gray-700">Cancel</button>
        <button onClick={save} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">{saving ? 'Saving…' : isNew ? 'Create session' : 'Save changes'}</button></>}>
      <Field label="Session title" req><input className={inputCls} value={f.title}
        onChange={e => { set('title', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value)) }} placeholder="e.g. Comprehensive Training on EML Locator" /></Field>
      <Field label="Signup link slug"><div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3">
        <span className="text-xs text-gray-400">/training/signup/</span>
        <input className="flex-1 bg-transparent py-2 text-sm focus:outline-none" value={f.slug} onChange={e => { setSlugTouched(true); set('slug', e.target.value) }} /></div></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start date" req><input type="date" className={inputCls} value={f.session_date} onChange={e => { set('session_date', e.target.value); if (f.is_one_day) set('end_date', e.target.value) }} /></Field>
        <Field label="Start time"><input type="time" className={inputCls} value={f.start_time} onChange={e => set('start_time', e.target.value)} /></Field>
      </div>
      <div className="mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={f.is_one_day} onChange={e => { set('is_one_day', e.target.checked); if (e.target.checked) set('end_date', f.session_date) }} /> One day
        </label>
      </div>
      {!f.is_one_day && (
        <Field label="End date" req><input type="date" className={inputCls} value={f.end_date} min={f.session_date || undefined} onChange={e => set('end_date', e.target.value)} /></Field>
      )}
      <Field label="Location"><input className={inputCls} value={f.location} onChange={e => set('location', e.target.value)} placeholder="Venue or 'Online (MS Teams)'" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Capacity"><select className={inputCls} value={f.capacity} onChange={e => set('capacity', e.target.value)}>
          {capacityOptions.map(n => <option key={n} value={n}>{n} pax</option>)}
        </select></Field>
        <Field label="Fee (RM)"><input type="number" className={inputCls} value={f.fee} onChange={e => set('fee', e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Duration"><input className={`${inputCls} bg-gray-50 text-gray-500`} value={durationFromDates(f.session_date, f.is_one_day ? f.session_date : f.end_date)} readOnly /></Field>
        <Field label="Level"><select className={inputCls} value={f.level} onChange={e => set('level', e.target.value)}>
          {levelOptions.map(v => <option key={v} value={v}>{v || 'Select level'}</option>)}
        </select></Field>
      </div>
      <Field label="Language"><select className={inputCls} value={f.language} onChange={e => set('language', e.target.value)}>
        {languageOptions.map(v => <option key={v} value={v}>{v || 'Select language'}</option>)}
      </select></Field>
      <Field label="Trainer name">
        <div className="grid sm:grid-cols-2 gap-2 max-h-36 overflow-auto rounded-lg border border-gray-200 p-2">
          {trainerOptions.length ? trainerOptions.map(u => {
            const id = String(u.id)
            return (
              <label key={u.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                <input type="checkbox" checked={trainerIds.includes(id)} onChange={() => toggleTrainer(id)} />
                <span className="truncate">{userName(u)}</span>
              </label>
            )
          }) : <span className="px-2 py-1 text-sm text-gray-400">No trainers selected in Settings.</span>}
        </div>
      </Field>
      <div className="flex gap-5 mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={f.is_open} onChange={e => set('is_open', e.target.checked)} /> Signup open</label>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={f.certificate} onChange={e => set('certificate', e.target.checked)} /> Certificate provided</label>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={f.hrd_claimable} onChange={e => set('hrd_claimable', e.target.checked)} /> HRD claimable</label>
      </div>
      <Field label="Short description (hero line)"><textarea rows={2} className={inputCls} value={f.description} onChange={e => set('description', e.target.value)} /></Field>
      <Field label="About this course (overview)"><textarea rows={3} className={inputCls} value={f.overview} onChange={e => set('overview', e.target.value)} /></Field>
      <Field label="What you'll learn (one per line)"><textarea rows={3} className={inputCls} value={f.outcomes} onChange={e => set('outcomes', e.target.value)} /></Field>
      <Field label="Who should attend (one per line)"><textarea rows={3} className={inputCls} value={f.audience} onChange={e => set('audience', e.target.value)} /></Field>
      <Field label="What's included (one per line)"><textarea rows={2} className={inputCls} value={f.includes} onChange={e => set('includes', e.target.value)} /></Field>
      <Field label="Agenda (one per line, e.g. 09:00 - Welcome)"><textarea rows={3} className={inputCls} value={f.agenda} onChange={e => set('agenda', e.target.value)} /></Field>
    </Modal>
  )
}

function AddAttendeeModal({ sessionId, onClose }) {
  const [f, setF] = useState({ participant_name: '', company: '', email: '', phone: '', nric: '', existing_user: false, hrd_claim: false, hr_email: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))
  const save = async () => {
    if (!f.participant_name.trim()) { alert('Name required'); return }
    setSaving(true)
    const { error } = await supabase.from('training_registrations').insert({ session_id: sessionId, source: 'manual', ...f, participant_name: f.participant_name.trim(), hr_email: f.hrd_claim ? f.hr_email.trim() : null })
    setSaving(false)
    if (error) { alert(error.message); return }
    onClose(true)
  }
  return (
    <Modal title="Add attendee" subtitle="Manually register a participant." onClose={() => onClose(false)}
      footer={<><button onClick={() => onClose(false)} className="border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium text-gray-700">Cancel</button>
        <button onClick={save} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">Add attendee</button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Participant name" req><input className={inputCls} value={f.participant_name} onChange={e => set('participant_name', e.target.value)} /></Field>
        <Field label="Company"><input className={inputCls} value={f.company} onChange={e => set('company', e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email"><input className={inputCls} value={f.email} onChange={e => set('email', e.target.value)} /></Field>
        <Field label="Contact number"><input className={inputCls} value={f.phone} onChange={e => set('phone', e.target.value)} /></Field>
      </div>
      <Field label="NRIC"><input className={inputCls} value={f.nric} onChange={e => set('nric', e.target.value)} placeholder="xxxxxx-xx-xxxx" /></Field>
      <div className="flex gap-5">
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={f.existing_user} onChange={e => set('existing_user', e.target.checked)} /> Existing EML user</label>
        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={f.hrd_claim} onChange={e => set('hrd_claim', e.target.checked)} /> Claiming HRD</label>
      </div>
      {f.hrd_claim && <Field label="Company HR email / person-in-charge for HRD grant"><input className={inputCls} value={f.hr_email} onChange={e => set('hr_email', e.target.value)} placeholder="hr@company.com" /></Field>}
    </Modal>
  )
}

function Modal({ title, subtitle, children, footer, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 sm:p-12 overflow-auto" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl">
        <div className="flex items-start justify-between p-5 pb-0">
          <div><h3 className="text-lg font-bold text-gray-900">{title}</h3>{subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}</div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center"><X size={16} /></button>
        </div>
        <div className="p-5 max-h-[65vh] overflow-auto">{children}</div>
        <div className="flex justify-end gap-2 p-4 border-t border-gray-100">{footer}</div>
      </div>
    </div>
  )
}
