import { useEffect, useState } from 'react'
import { Building2, Ticket, FileText, Receipt } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ customers: 0, tickets: 0, quotations: 0, invoices: 0 })

  useEffect(() => {
    async function load() {
      const [c, t, q, i] = await Promise.all([
        supabase.from('customer').select('*', { count: 'exact', head: true }),
        supabase.from('ticket').select('*', { count: 'exact', head: true }),
        supabase.from('quotation').select('*', { count: 'exact', head: true }),
        supabase.from('invoice').select('*', { count: 'exact', head: true }),
      ])
      setStats({ customers: c.count||0, tickets: t.count||0, quotations: q.count||0, invoices: i.count||0 })
    }
    load()
  }, [])

  const cards = [
    { label: 'Customers', value: stats.customers, icon: Building2, color: '#2563EB', bg: '#EFF6FF' },
    { label: 'Open Tickets', value: stats.tickets, icon: Ticket, color: '#D97706', bg: '#FFFBEB' },
    { label: 'Quotations', value: stats.quotations, icon: FileText, color: '#7C3AED', bg: '#F5F3FF' },
    { label: 'Invoices', value: stats.invoices, icon: Receipt, color: '#059669', bg: '#ECFDF5' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-[#111111]">Good day, {profile?.first_name}!</h2>
        <p className="text-gray-400 text-sm mt-0.5">Here's your business overview.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map(c => {
          const Icon = c.icon
          return (
            <div key={c.label} className="bg-white border border-[#E0E0E0] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">{c.label}</span>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: c.bg }}>
                  <Icon size={15} style={{ color: c.color }} />
                </div>
              </div>
              <div className="text-3xl font-bold text-[#111111]">{c.value}</div>
            </div>
          )
        })}
      </div>
      <div className="bg-white border border-[#E0E0E0] rounded-xl p-5">
        <h3 className="font-semibold text-[#111111] text-sm mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '+ New Quotation', href: '/quotations' },
            { label: '+ New Invoice', href: '/invoices' },
            { label: '+ New Ticket', href: '/tickets' },
            { label: '+ New Customer', href: '/customers' },
          ].map(a => (
            <a key={a.label} href={a.href}
              className="border border-[#E0E0E0] rounded-lg px-4 py-3 text-sm font-medium text-[#111111] hover:border-[#CC0000] hover:text-[#CC0000] transition-colors text-center">
              {a.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
