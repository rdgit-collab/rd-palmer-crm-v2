import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Calendar, Clock, MapPin, GraduationCap, Check, Info, Plus, X, ArrowRight,
  Sparkles, Users, FileText, TrendingUp, User,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/dateFormat'

const blankPart = () => ({ participant_name: '', email: '', phone: '', nric: '', existing_user: null })

export default function TrainingSignup() {
  const { slug } = useParams()
  const [session, setSession] = useState(undefined) // undefined=loading, null=not found
  const [company, setCompany] = useState('')
  const [industry, setIndustry] = useState('')
  const [hrd, setHrd] = useState(null)
  const [hrEmail, setHrEmail] = useState('')
  const [parts, setParts] = useState([blankPart()])
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(0) // count registered

  useEffect(() => {
    supabase.from('training_sessions').select('*').eq('slug', slug).maybeSingle()
      .then(({ data }) => setSession(data || null))
  }, [slug])

  if (session === undefined) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading…</div>
  if (session === null) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f7fa] px-4">
      <div className="text-center"><GraduationCap className="mx-auto text-gray-300 mb-3" size={40} />
        <h1 className="text-lg font-bold text-gray-800">Training not found</h1>
        <p className="text-sm text-gray-500 mt-1">This signup link is invalid or the session has been removed.</p></div>
    </div>
  )

  const outcomes = Array.isArray(session.outcomes) ? session.outcomes : []
  const audience = Array.isArray(session.audience) ? session.audience : []
  const includes = Array.isArray(session.includes) ? session.includes : []
  const agenda = Array.isArray(session.agenda) ? session.agenda : []
  const trainersText = '' // names omitted on public page for privacy unless desired

  const setPart = (i, k, v) => setParts(prev => prev.map((p, idx) => idx === i ? { ...p, [k]: v } : p))
  const addPart = () => setParts(prev => [...prev, blankPart()])
  const rmPart = (i) => setParts(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev)

  const submit = async () => {
    if (!company.trim()) { alert('Please enter your company name.'); return }
    if (!hrd) { alert('Please indicate whether you are claiming HRD fund.'); return }
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      if (!p.participant_name.trim() || !p.email.trim() || !p.phone.trim() || !p.nric.trim() || p.existing_user === null) {
        alert(`Please complete all required (*) fields for Participant ${i + 1}.`); return
      }
    }
    setSubmitting(true)
    const rows = parts.map(p => ({
      session_id: session.id, source: 'public',
      participant_name: p.participant_name.trim(), company: company.trim(), email: p.email.trim(),
      phone: p.phone.trim(), nric: p.nric.trim(), industry: industry.trim(),
      existing_user: p.existing_user === 'Yes', hrd_claim: hrd === 'Yes', hr_email: hrEmail.trim(),
    }))
    const { error } = await supabase.from('training_registrations').insert(rows)
    setSubmitting(false)
    if (error) { alert('Something went wrong: ' + error.message); return }
    setDone(rows.length)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scrollToForm = () => document.getElementById('register')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div className="min-h-screen bg-[#f5f7fa]">
      {/* hero */}
      <div className="relative overflow-hidden text-center px-5 pt-14 pb-32"
        style={{ background: 'radial-gradient(820px 380px at 50% -28%, #ffe5e7 0%, #fff4f4 40%, #f5f7fa 74%)' }}>
        <div className="absolute left-0 right-0 top-0 h-1 bg-gradient-to-r from-red-600 to-rose-400" />
        <div className="relative max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-white border border-gray-200 text-red-600 rounded-full pl-2 pr-3.5 py-1.5 text-xs font-bold mb-6 shadow-sm">
            <span className="w-6 h-6 rounded-md bg-red-600 text-white flex items-center justify-center text-[10px] font-extrabold">RD</span>
            RD Palmer · Professional Training
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 leading-tight">{session.title}</h1>
          {session.description && <p className="text-gray-500 mt-3 max-w-xl mx-auto leading-relaxed">{session.description}</p>}
          <div className="flex flex-wrap gap-2.5 justify-center mt-6">
            <HeroChip icon={Calendar}>{session.session_date ? formatDate(session.session_date) : 'TBA'}</HeroChip>
            {session.start_time && <HeroChip icon={Clock}>{session.start_time}</HeroChip>}
            {session.location && <HeroChip icon={MapPin}>{session.location}</HeroChip>}
          </div>
        </div>
      </div>

      {/* content shell */}
      <div className="max-w-5xl mx-auto px-4 grid lg:grid-cols-[1fr_340px] gap-6 -mt-20 relative">
        <div className="flex flex-col gap-4 min-w-0 order-2 lg:order-1">
          {(session.overview || session.description) && (
            <InfoCard icon={Info} title="About this course"><p className="text-gray-600 leading-relaxed">{session.overview || session.description}</p></InfoCard>
          )}
          {outcomes.length > 0 && (
            <InfoCard icon={Sparkles} title="What you'll learn">
              <div className="grid sm:grid-cols-2 gap-3">
                {outcomes.map((o, i) => (
                  <div key={i} className="flex gap-2.5 text-sm text-gray-600">
                    <span className="w-5 h-5 rounded-md bg-green-50 text-green-600 flex items-center justify-center shrink-0 mt-0.5"><Check size={12} /></span>{o}
                  </div>
                ))}
              </div>
            </InfoCard>
          )}
          {audience.length > 0 && (
            <InfoCard icon={Users} title="Who should attend">
              <div className="space-y-2.5">{audience.map((a, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-gray-600"><span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />{a}</div>
              ))}</div>
            </InfoCard>
          )}
          {agenda.length > 0 && (
            <InfoCard icon={Clock} title="Course agenda">
              <div className="space-y-0">{agenda.map((r, i) => (
                <div key={i} className="flex gap-4">
                  <div className="w-16 shrink-0 text-xs font-bold text-red-600 pt-0.5">{r.time}</div>
                  <div className="relative shrink-0 w-3">
                    <div className="w-3 h-3 rounded-full border-2 border-red-600 bg-white mt-1" />
                    {i < agenda.length - 1 && <div className="absolute left-[5px] top-4 bottom-0 w-0.5 bg-gray-200" />}
                  </div>
                  <div className="text-sm text-gray-800 font-medium pb-4">{r.title}</div>
                </div>
              ))}</div>
            </InfoCard>
          )}
          {includes.length > 0 && (
            <InfoCard icon={GraduationCap} title="What's included">
              <div className="grid sm:grid-cols-2 gap-3">{includes.map((it, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-gray-600">
                  <span className="w-8 h-8 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center shrink-0"><FileText size={15} /></span>{it}
                </div>
              ))}</div>
            </InfoCard>
          )}
        </div>

        {/* summary */}
        <div className="order-1 lg:order-2">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden lg:sticky lg:top-6">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5 text-xs font-extrabold uppercase tracking-wide text-gray-900">
                <span className="w-6 h-6 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><Info size={14} /></span>Course details
              </div>
              <div className="flex gap-2 flex-wrap mt-3">
                {session.certificate && <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-green-50 text-green-700"><GraduationCap size={13} /> Certificate</span>}
                {session.hrd_claimable && <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700"><Sparkles size={13} /> HRD claimable</span>}
              </div>
            </div>
            <div className="px-5 py-2">
              <Fact icon={Calendar} label="Date" value={session.session_date ? formatDate(session.session_date) : 'TBA'} />
              <Fact icon={Clock} label="Time" value={session.start_time || '—'} />
              {session.duration && <Fact icon={Clock} label="Duration" value={session.duration} />}
              <Fact icon={MapPin} label="Venue" value={session.location || '—'} />
              {session.level && <Fact icon={TrendingUp} label="Level" value={session.level} />}
              {session.language && <Fact icon={User} label="Language" value={session.language} />}
            </div>
            <div className="px-5 pb-5 pt-3">
              <button onClick={scrollToForm} className="w-full inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-xl font-semibold transition">Register now <ArrowRight size={16} /></button>
              <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500 mt-3"><Check size={13} className="text-green-600" /> We'll confirm your booking by email</div>
            </div>
          </div>
        </div>
      </div>

      {/* register */}
      <div id="register" className="max-w-2xl mx-auto px-4 mt-10">
        {done > 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-lg text-center py-14 px-6">
            <div className="w-18 h-18 rounded-full bg-green-50 text-green-600 flex items-center justify-center mx-auto mb-5" style={{ width: 72, height: 72 }}><Check size={36} /></div>
            <h2 className="text-2xl font-extrabold text-gray-900 mb-2">{done > 1 ? `${done} participants registered!` : "You're registered!"}</h2>
            <p className="text-gray-500 max-w-md mx-auto">Thanks! {done > 1 ? `All ${done} participants from ` : ''}<b>{company}</b> {done > 1 ? 'are' : 'is'} confirmed for <b>{session.title}</b>{session.session_date ? ` on ${formatDate(session.session_date)}` : ''}. We'll email payment & HRD details shortly.</p>
            <button onClick={() => { setDone(0); setParts([blankPart()]); setCompany(''); setIndustry(''); setHrd(null); setHrEmail('') }}
              className="mt-6 border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium text-gray-700">New registration</button>
          </div>
        ) : (
          <>
            <div className="text-center mb-5">
              <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">Register for this course</h2>
              <p className="text-gray-500 text-sm mt-1.5">Enter your company details once, then add everyone attending. Fields marked <span className="text-red-600">*</span> are required.</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl shadow-lg p-6">
              <SectionLabel>Company details</SectionLabel>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Company name" req><input className={inp} value={company} onChange={e => setCompany(e.target.value)} placeholder="Your company" /></Field>
                <Field label="Industry"><input className={inp} value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. Oil & Gas, Construction" /></Field>
              </div>
              <Field label="Are you planning to claim HRD fund for this course?" req>
                <Radio value={hrd} onChange={setHrd} />
              </Field>
              {hrd === 'Yes' && <Field label="Company HR email / person-in-charge for HRD grant"><input className={inp} value={hrEmail} onChange={e => setHrEmail(e.target.value)} placeholder="hr@company.com" /></Field>}

              <SectionLabel className="mt-6">Participants <span className="ml-1 text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 normal-case tracking-normal">{parts.length} {parts.length > 1 ? 'people' : 'person'}</span></SectionLabel>
              {parts.map((p, i) => (
                <div key={i} className="border border-gray-200 rounded-xl p-4 mb-3.5 hover:border-gray-300 transition">
                  <div className="flex items-center justify-between mb-3.5">
                    <div className="flex items-center gap-2.5 font-bold text-sm text-gray-800"><span className="w-6 h-6 rounded-lg bg-red-50 text-red-600 flex items-center justify-center text-xs font-extrabold">{i + 1}</span> Participant {i + 1}</div>
                    {parts.length > 1 && <button onClick={() => rmPart(i)} className="text-xs text-gray-400 hover:text-red-600 font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50"><X size={13} /> Remove</button>}
                  </div>
                  <Field label="Full name (as per NRIC)" req><input className={inp} value={p.participant_name} onChange={e => setPart(i, 'participant_name', e.target.value)} placeholder="Participant name" /></Field>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="Email" req><input className={inp} value={p.email} onChange={e => setPart(i, 'email', e.target.value)} placeholder="name@email.com" /></Field>
                    <Field label="Contact number" req><input className={inp} value={p.phone} onChange={e => setPart(i, 'phone', e.target.value)} placeholder="01x-xxxxxxx" /></Field>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="NRIC" req><input className={inp} value={p.nric} onChange={e => setPart(i, 'nric', e.target.value)} placeholder="xxxxxx-xx-xxxx" /></Field>
                    <Field label="Existing EML Locator user?" req><Radio value={p.existing_user} onChange={v => setPart(i, 'existing_user', v)} /></Field>
                  </div>
                </div>
              ))}
              <button onClick={addPart} className="w-full border-[1.5px] border-dashed border-gray-300 rounded-xl py-3 text-sm font-semibold text-gray-700 hover:border-red-500 hover:text-red-600 hover:bg-white transition flex items-center justify-center gap-2 mb-5"><Plus size={16} /> Add another participant</button>

              <button onClick={submit} disabled={submitting} className="w-full inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-3.5 rounded-xl font-semibold transition disabled:opacity-50">
                {submitting ? 'Submitting…' : <>Submit registration <ArrowRight size={16} /></>}
              </button>
            </div>
          </>
        )}
        <div className="text-center text-xs text-gray-400 py-10 leading-relaxed">RD Palmer (M) Sdn Bhd · Need help? Email training@rd-palmer.my</div>
      </div>
    </div>
  )
}

const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100'
function HeroChip({ icon: Icon, children }) { return <span className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-700 shadow-sm"><Icon size={15} className="text-red-600" />{children}</span> }
function InfoCard({ icon: Icon, title, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
      <div className="flex items-center gap-2.5 text-base font-extrabold tracking-tight text-gray-900 mb-4">
        <span className="w-7 h-7 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><Icon size={16} /></span>{title}
      </div>{children}
    </div>
  )
}
function Fact({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 last:border-0 text-sm">
      <Icon size={16} className="text-gray-400 shrink-0" /><span className="text-xs text-gray-400 w-16 shrink-0">{label}</span><span className="font-semibold text-gray-800">{value}</span>
    </div>
  )
}
function SectionLabel({ children, className = '' }) {
  return <div className={`flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-3.5 ${className}`}><span>{children}</span><span className="flex-1 h-px bg-gray-100" /></div>
}
function Field({ label, req, children }) {
  return <div className="mb-4"><label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}{req && <span className="text-red-600"> *</span>}</label>{children}</div>
}
function Radio({ value, onChange }) {
  return (
    <div className="flex gap-2.5">
      {['Yes', 'No'].map(opt => (
        <button key={opt} type="button" onClick={() => onChange(opt)}
          className={`flex-1 inline-flex items-center justify-center gap-2 border-[1.5px] rounded-xl py-2.5 text-sm font-semibold transition
            ${value === opt ? 'border-red-500 bg-red-50 text-red-600' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}>
          <span className={`w-4 h-4 rounded-full border-[1.5px] ${value === opt ? 'border-red-500 bg-red-500 ring-2 ring-inset ring-white' : 'border-gray-300'}`} />{opt}
        </button>
      ))}
    </div>
  )
}
