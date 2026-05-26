import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Plus, Search, Eye, Pencil, Trash2, ArrowLeft, Save,
  X, ChevronLeft, ChevronRight, FileText
} from 'lucide-react'

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtMoney = (n) => Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const PAGE_SIZE = 15
const CURRENCIES = ['MYR', 'USD', 'SGD', 'EUR', 'GBP']

// ─── Auto-generate next invoice number ────────────────────────────────────────
async function getNextInvNumber() {
  const { data } = await supabase.from('invoice').select('id').order('id', { ascending: false }).limit(1)
  const lastId = data?.[0]?.id ?? 0
  return `INV${100 + lastId + 1}`
}

// ─── Line Item Row ─────────────────────────────────────────────────────────────
function LineItemRow({ item, idx, catalogueItems, taxes, onChange, onRemove }) {
  const handleItemSelect = (e) => {
    const selected = catalogueItems.find(c => String(c.id) === e.target.value)
    if (selected) {
      const rate = parseFloat(selected.price || 0)
      const qty = item.qty || 1
      onChange(idx, { ...item, itemid: selected.id, item: selected.name, description: selected.description || '', rate, amount: qty * rate })
    } else {
      onChange(idx, { ...item, itemid: '', item: '', description: '', rate: 0, amount: 0 })
    }
  }
  const handleQtyChange = (qty) => {
    const q = parseFloat(qty) || 0
    onChange(idx, { ...item, qty: q, amount: q * (parseFloat(item.rate) || 0) })
  }
  const handleRateChange = (rate) => {
    const r = parseFloat(rate) || 0
    onChange(idx, { ...item, rate: r, amount: (parseFloat(item.qty) || 0) * r })
  }
  const handleTaxSelect = (e) => {
    const tax = taxes.find(t => String(t.id) === e.target.value)
    onChange(idx, { ...item, taxid: tax?.id || '', taxlbl: tax?.name || '', taxrate: tax ? parseFloat(tax.name.match(/[\d.]+/)?.[0] || 0) : 0 })
  }

  const tdCls = 'px-2 py-1.5'
  const inputCls = 'w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-400'

  return (
    <tr className="border-b border-gray-100">
      <td className={`${tdCls} text-center text-gray-400 text-xs w-8`}>{idx + 1}</td>
      <td className={`${tdCls} min-w-[180px]`}>
        <select className={inputCls} value={item.itemid || ''} onChange={handleItemSelect}>
          <option value="">Select item...</option>
          {catalogueItems.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {item.itemid === '' && (
          <input className={`${inputCls} mt-1`} placeholder="Or type item name"
            value={item.item || ''} onChange={e => onChange(idx, { ...item, item: e.target.value })} />
        )}
      </td>
      <td className={`${tdCls} min-w-[160px]`}>
        <textarea className={`${inputCls} resize-none h-12`} placeholder="Description"
          value={item.description || ''} onChange={e => onChange(idx, { ...item, description: e.target.value })} />
      </td>
      <td className={`${tdCls} w-20`}>
        <input type="number" min="0" step="0.01" className={inputCls} value={item.qty} onChange={e => handleQtyChange(e.target.value)} />
      </td>
      <td className={`${tdCls} w-28`}>
        <input type="number" min="0" step="0.01" className={inputCls} value={item.rate} onChange={e => handleRateChange(e.target.value)} />
      </td>
      <td className={`${tdCls} w-32`}>
        <select className={inputCls} value={item.taxid || ''} onChange={handleTaxSelect}>
          <option value="">No Tax</option>
          {taxes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </td>
      <td className={`${tdCls} w-28 text-right text-xs font-medium text-gray-800`}>{fmtMoney(item.amount)}</td>
      <td className={`${tdCls} w-8 text-center`}>
        <button type="button" onClick={() => onRemove(idx)} className="text-gray-300 hover:text-red-500 transition-colors">
          <X size={14} />
        </button>
      </td>
    </tr>
  )
}

// ─── Invoice Form (Add / Edit) ─────────────────────────────────────────────────
function InvoiceForm({ invoice, onSave, onCancel }) {
  const isEdit = !!invoice
  const [customers, setCustomers] = useState([])
  const [contacts, setContacts] = useState([])
  const [catalogueItems, setCatalogueItems] = useState([])
  const [taxes, setTaxes] = useState([])
  const [paymentTerms, setPaymentTerms] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    companyid: invoice?.companyid ? String(invoice.companyid) : '',
    name: invoice?.name || '',
    invoice_number: invoice?.invoice_number || '',
    order_number: invoice?.order_number || '',
    quote_ref_number: invoice?.quote_ref_number || '',
    date: invoice?.date || new Date().toISOString().split('T')[0],
    due_date: invoice?.due_date || '',
    terms: invoice?.terms || '',
    term_condition: invoice?.term_condition || '',
    sales_person: invoice?.sales_person || '',
    contact_person: invoice?.contact_person || '',
    serial_number: invoice?.serial_number || '',
    currency: invoice?.currency || 'MYR',
    notes: invoice?.notes || '',
    discounttype: invoice?.discouttype || '%',
    discountvalue: invoice?.discountvalue || '0',
    shipping: invoice?.shiping_charge || 0,
    adjustment: invoice?.adjustment || 0,
  })

  const [lineItems, setLineItems] = useState(
    invoice?._items?.length > 0
      ? invoice._items.map(i => ({
          id: i.id,
          itemid: String(i.itemid || ''),
          item: i.item || '',
          description: i.description || '',
          qty: i.qty || 1,
          rate: i.rate || 0,
          taxid: String(i.taxid || ''),
          taxlbl: i.taxlbl || '',
          taxrate: 0,
          amount: i.amount || 0,
        }))
      : [{ itemid: '', item: '', description: '', qty: 1, rate: 0, taxid: '', taxlbl: '', taxrate: 0, amount: 0 }]
  )

  useEffect(() => {
    const load = async () => {
      const [{ data: custs }, { data: cats }, { data: txs }, { data: pts }] = await Promise.all([
        supabase.from('customer').select('id, company_name, assigned').order('company_name'),
        supabase.from('goodsservices').select('id, name, price, description').order('name'),
        supabase.from('tax').select('id, name').order('name'),
        supabase.from('payment_term').select('id, name').order('name'),
      ])
      setCustomers(custs || [])
      setCatalogueItems(cats || [])
      setTaxes(txs || [])
      setPaymentTerms(pts || [])
      if (!isEdit) {
        const invNum = await getNextInvNumber()
        setForm(f => ({ ...f, invoice_number: invNum }))
      }
    }
    load()
  }, [isEdit])

  useEffect(() => {
    if (form.companyid) {
      supabase.from('contact').select('id, first_name, last_name').eq('company_id', parseInt(form.companyid))
        .then(({ data }) => setContacts(data || []))
      const cust = customers.find(c => String(c.id) === form.companyid)
      if (cust) setForm(f => ({ ...f, name: cust.company_name, sales_person: f.sales_person || cust.assigned || '' }))
    } else {
      setContacts([])
    }
  }, [form.companyid, customers])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const addLine = () => setLineItems(prev => [...prev, { itemid: '', item: '', description: '', qty: 1, rate: 0, taxid: '', taxlbl: '', taxrate: 0, amount: 0 }])
  const removeLine = (idx) => setLineItems(prev => prev.filter((_, i) => i !== idx))
  const updateLine = (idx, updated) => setLineItems(prev => prev.map((item, i) => i === idx ? updated : item))

  const subtotal = lineItems.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)
  const discountAmt = form.discounttype === '%' ? subtotal * (parseFloat(form.discountvalue) || 0) / 100 : parseFloat(form.discountvalue) || 0
  const shipping = parseFloat(form.shipping) || 0
  const adjustment = parseFloat(form.adjustment) || 0
  const total = subtotal - discountAmt + shipping + adjustment

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.companyid) { setError('Please select a customer'); return }
    if (!form.invoice_number.trim()) { setError('Invoice number is required'); return }
    if (lineItems.every(i => !i.item.trim())) { setError('Add at least one line item'); return }
    setSaving(true); setError('')

    const payload = {
      user_id: 1,
      companyid: parseInt(form.companyid),
      name: form.name,
      invoice_number: form.invoice_number,
      order_number: form.order_number,
      quote_ref_number: form.quote_ref_number,
      date: form.date,
      due_date: form.due_date || null,
      terms: form.terms,
      term_condition: form.term_condition,
      sales_person: form.sales_person,
      contact_person: form.contact_person,
      serial_number: form.serial_number,
      currency: form.currency,
      notes: form.notes,
      subtotal,
      discount: discountAmt,
      discouttype: form.discounttype,
      discountvalue: String(form.discountvalue),
      shiping_charge: shipping,
      tax: 0,
      adjustment,
      total,
      updated_at: new Date().toISOString(),
    }

    let invResult
    if (isEdit) {
      invResult = await supabase.from('invoice').update(payload).eq('id', invoice.id).select().single()
    } else {
      payload.created_at = new Date().toISOString()
      invResult = await supabase.from('invoice').insert(payload).select().single()
    }

    if (invResult.error) { setSaving(false); setError(invResult.error.message); return }

    const invoiceid = invResult.data.id
    if (isEdit) await supabase.from('invoice_item').delete().eq('invoiceid', invoiceid)

    const validItems = lineItems.filter(i => i.item.trim())
    if (validItems.length > 0) {
      const itemPayload = validItems.map(i => ({
        user_id: 1,
        invoiceid,
        item: i.item,
        description: i.description,
        qty: parseFloat(i.qty) || 1,
        rate: parseFloat(i.rate) || 0,
        tax: i.taxrate > 0 ? (parseFloat(i.amount) * i.taxrate / 100) : 0,
        amount: parseFloat(i.amount) || 0,
        itemid: i.itemid ? parseInt(i.itemid) : null,
        taxid: i.taxid ? parseInt(i.taxid) : null,
        taxlbl: i.taxlbl || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
      await supabase.from('invoice_item').insert(itemPayload)
    }

    setSaving(false)
    onSave(invResult.data)
  }

  const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onCancel} className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-xl font-semibold text-gray-900">{isEdit ? `Edit ${form.invoice_number}` : 'New Invoice'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">{error}</div>}

        {/* Header */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Invoice Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            <div className="md:col-span-2">
              <label className={labelCls}>Customer <span className="text-red-500">*</span></label>
              <select className={inputCls} value={form.companyid} onChange={e => setF('companyid', e.target.value)} required>
                <option value="">Select Customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>Currency</label>
              <select className={inputCls} value={form.currency} onChange={e => setF('currency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>Invoice No. <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.invoice_number} onChange={e => setF('invoice_number', e.target.value)} required />
            </div>

            <div>
              <label className={labelCls}>Order No.</label>
              <input className={inputCls} value={form.order_number} onChange={e => setF('order_number', e.target.value)} placeholder="PO / order number" />
            </div>

            <div>
              <label className={labelCls}>Quotation Ref.</label>
              <input className={inputCls} value={form.quote_ref_number} onChange={e => setF('quote_ref_number', e.target.value)} placeholder="e.g. QUO101" />
            </div>

            <div>
              <label className={labelCls}>Invoice Date <span className="text-red-500">*</span></label>
              <input type="date" className={inputCls} value={form.date} onChange={e => setF('date', e.target.value)} required />
            </div>

            <div>
              <label className={labelCls}>Due Date</label>
              <input type="date" className={inputCls} value={form.due_date} onChange={e => setF('due_date', e.target.value)} />
            </div>

            <div>
              <label className={labelCls}>Payment Terms</label>
              <select className={inputCls} value={form.terms} onChange={e => setF('terms', e.target.value)}>
                <option value="">Please Select</option>
                {paymentTerms.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>Sales Person</label>
              <input className={inputCls} value={form.sales_person} onChange={e => setF('sales_person', e.target.value)} placeholder="Sales person name" />
            </div>

            <div>
              <label className={labelCls}>Contact Person</label>
              {contacts.length > 0 ? (
                <select className={inputCls} value={form.contact_person} onChange={e => setF('contact_person', e.target.value)}>
                  <option value="">Please Select</option>
                  {contacts.map(c => <option key={c.id} value={`${c.first_name} ${c.last_name}`}>{c.first_name} {c.last_name}</option>)}
                </select>
              ) : (
                <input className={inputCls} value={form.contact_person} onChange={e => setF('contact_person', e.target.value)} placeholder="Contact person name" />
              )}
            </div>

            <div>
              <label className={labelCls}>Serial Number</label>
              <input className={inputCls} value={form.serial_number} onChange={e => setF('serial_number', e.target.value)} placeholder="Serial / batch number" />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Line Items</h2>
            <button type="button" onClick={addLine}
              className="flex items-center gap-1 text-xs text-[#CC0000] hover:text-red-700 font-medium">
              <Plus size={13} /> Add Row
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 w-8">#</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-400">Item</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-400">Description</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 w-20">Qty</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 w-28">Rate</th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 w-32">Tax</th>
                  <th className="px-2 py-2 text-right text-xs font-medium text-gray-400 w-28">Amount</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, idx) => (
                  <LineItemRow key={idx} item={item} idx={idx}
                    catalogueItems={catalogueItems} taxes={taxes}
                    onChange={updateLine} onRemove={removeLine} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="border-t border-gray-200 p-5">
            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span className="font-medium">{form.currency} {fmtMoney(subtotal)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 flex-1">Discount</span>
                  <div className="flex items-center gap-1">
                    <select className="border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none"
                      value={form.discounttype} onChange={e => setF('discounttype', e.target.value)}>
                      <option value="%">%</option>
                      <option value="fixed">Fixed</option>
                    </select>
                    <input type="number" min="0" step="0.01"
                      className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-red-400"
                      value={form.discountvalue} onChange={e => setF('discountvalue', e.target.value)} />
                  </div>
                  <span className="text-gray-500 w-24 text-right">− {fmtMoney(discountAmt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 flex-1">Shipping</span>
                  <input type="number" min="0" step="0.01"
                    className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-red-400"
                    value={form.shipping} onChange={e => setF('shipping', e.target.value)} />
                  <span className="text-gray-500 w-24 text-right">+ {fmtMoney(shipping)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 flex-1">Adjustment</span>
                  <input type="number" step="0.01"
                    className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-red-400"
                    value={form.adjustment} onChange={e => setF('adjustment', e.target.value)} />
                  <span className="text-gray-500 w-24 text-right">{adjustment >= 0 ? '+' : ''} {fmtMoney(adjustment)}</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between font-semibold text-gray-900">
                  <span>Total</span>
                  <span>{form.currency} {fmtMoney(total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Notes & Terms */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Notes</label>
              <textarea rows={4} className={`${inputCls} resize-none`} placeholder="Notes to customer..."
                value={form.notes} onChange={e => setF('notes', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Terms & Conditions</label>
              <textarea rows={4} className={`${inputCls} resize-none`} placeholder="Terms and conditions..."
                value={form.term_condition} onChange={e => setF('term_condition', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pb-6">
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700 disabled:opacity-50">
            <Save size={14} />
            {saving ? 'Saving...' : (isEdit ? 'Update Invoice' : 'Save Invoice')}
          </button>
        </div>
      </form>
    </>
  )
}

// ─── Invoice Detail View ───────────────────────────────────────────────────────
function InvoiceDetail({ invoiceId, onBack, onEdit }) {
  const [invoice, setInvoice] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: inv }, { data: ii }] = await Promise.all([
        supabase.from('invoice').select('*').eq('id', invoiceId).single(),
        supabase.from('invoice_item').select('*').eq('invoiceid', invoiceId).order('id'),
      ])
      setInvoice(inv)
      setItems(ii || [])
      setLoading(false)
    }
    load()
  }, [invoiceId])

  if (loading) return <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Loading...</div>
  if (!invoice) return <div className="text-gray-500 text-sm p-4">Invoice not found.</div>

  const isOverdue = invoice.due_date && new Date(invoice.due_date) < new Date()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm">
            <ArrowLeft size={16} /> Back
          </button>
          <h1 className="text-xl font-semibold text-gray-900">{invoice.invoice_number}</h1>
          {isOverdue && <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-medium">Overdue</span>}
        </div>
        <button onClick={onEdit}
          className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">
          <Pencil size={14} /> Edit
        </button>
      </div>

      {/* Header Info */}
      <div className="bg-white rounded-lg border border-gray-200 mb-4">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Invoice Information</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-10">
          <table className="text-sm w-full">
            <tbody>
              {[
                ['Customer', invoice.name || '—'],
                ['Invoice No.', invoice.invoice_number],
                ['Order No.', invoice.order_number || '—'],
                ['Quotation Ref.', invoice.quote_ref_number || '—'],
                ['Invoice Date', fmt(invoice.date)],
                ['Due Date', fmt(invoice.due_date)],
              ].map(([l, v]) => (
                <tr key={l} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-4 text-gray-500 font-medium w-36">{l}</td>
                  <td className="py-2 text-gray-800">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="text-sm w-full">
            <tbody>
              {[
                ['Payment Terms', invoice.terms || '—'],
                ['Currency', invoice.currency || 'MYR'],
                ['Sales Person', invoice.sales_person || '—'],
                ['Contact Person', invoice.contact_person || '—'],
                ['Serial Number', invoice.serial_number || '—'],
              ].map(([l, v]) => (
                <tr key={l} className="border-b border-gray-50 last:border-0">
                  <td className="py-2 pr-4 text-gray-500 font-medium w-36">{l}</td>
                  <td className="py-2 text-gray-800">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-white rounded-lg border border-gray-200 mb-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Line Items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['#', 'Item', 'Description', 'Qty', 'Rate', 'Tax', 'Amount'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-4 text-center text-gray-400 text-sm">No items</td></tr>
              ) : items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.item}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-xs">{item.description || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{item.qty}</td>
                  <td className="px-4 py-3 text-gray-700">{fmtMoney(item.rate)}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{item.taxlbl || '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{fmtMoney(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-gray-200 p-5 flex justify-end">
          <div className="w-64 space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{invoice.currency} {fmtMoney(invoice.subtotal)}</span>
            </div>
            {invoice.discount > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Discount {invoice.discouttype === '%' ? `(${invoice.discountvalue}%)` : '(Fixed)'}</span>
                <span>− {fmtMoney(invoice.discount)}</span>
              </div>
            )}
            {invoice.shiping_charge > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Shipping</span>
                <span>+ {fmtMoney(invoice.shiping_charge)}</span>
              </div>
            )}
            {invoice.adjustment != 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Adjustment</span>
                <span>{fmtMoney(invoice.adjustment)}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900 text-base">
              <span>Total</span>
              <span>{invoice.currency} {fmtMoney(invoice.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes & Terms */}
      {(invoice.notes || invoice.term_condition) && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {invoice.notes && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</h3>
                <p className="text-sm text-gray-600 whitespace-pre-line">{invoice.notes}</p>
              </div>
            )}
            {invoice.term_condition && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Terms & Conditions</h3>
                <p className="text-sm text-gray-600 whitespace-pre-line">{invoice.term_condition}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Invoices Page ────────────────────────────────────────────────────────
export default function Invoices() {
  const [view, setView] = useState('list')
  const [selectedId, setSelectedId] = useState(null)
  const [editInvoice, setEditInvoice] = useState(null)

  const [invoices, setInvoices] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState(null)

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('invoice').select('*', { count: 'exact' })
    if (search.trim()) q = q.ilike('name', `%${search.trim()}%`)
    q = q.order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    const { data, count, error } = await q
    if (!error) { setInvoices(data || []); setTotal(count || 0) }
    setLoading(false)
  }, [search, page])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])
  useEffect(() => { setPage(0) }, [search])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handleDelete = async (id) => {
    await supabase.from('invoice_item').delete().eq('invoiceid', id)
    await supabase.from('invoice').delete().eq('id', id)
    setDeleteId(null)
    fetchInvoices()
  }

  const handleSaved = () => { setView('list'); setEditInvoice(null); fetchInvoices() }

  const openEdit = async (inv) => {
    const src = inv || await supabase.from('invoice').select('*').eq('id', selectedId).single().then(r => r.data)
    if (!src) return
    const { data: items } = await supabase.from('invoice_item').select('*').eq('invoiceid', src.id).order('id')
    setEditInvoice({ ...src, _items: items || [] })
    setView('form')
  }

  if (view === 'form') {
    return <InvoiceForm invoice={editInvoice} onSave={handleSaved} onCancel={() => { setView('list'); setEditInvoice(null) }} />
  }

  if (view === 'detail') {
    return <InvoiceDetail invoiceId={selectedId} onBack={() => setView('list')} onEdit={() => openEdit(null)} />
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Manage Invoices</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} invoice{total !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={() => { setEditInvoice(null); setView('form') }}
          className="flex items-center gap-2 px-4 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700">
          <Plus size={16} /> New Invoice
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
            placeholder="Search by customer name..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {search && (
          <button onClick={() => setSearch('')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <X size={14} /> Clear
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Invoice No.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Due Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Quot. Ref.</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">Loading...</td></tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">
                    {search ? 'No invoices match your search.' : 'No invoices yet. Click "New Invoice" to get started.'}
                  </td>
                </tr>
              ) : (
                invoices.map(inv => {
                  const isOverdue = inv.due_date && new Date(inv.due_date) < new Date()
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button onClick={() => { setSelectedId(inv.id); setView('detail') }}
                          className="flex items-center gap-2 text-[#CC0000] hover:text-red-700 font-medium text-sm">
                          <FileText size={13} />{inv.invoice_number}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-800 text-xs">{inv.name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{fmt(inv.date)}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}>{fmt(inv.due_date)}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{inv.quote_ref_number || '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 text-xs">
                        {inv.currency} {fmtMoney(inv.total)}
                      </td>
                      <td className="px-4 py-3">
                        {isOverdue
                          ? <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">Overdue</span>
                          : <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">Active</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setSelectedId(inv.id); setView('detail') }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="View">
                            <Eye size={14} />
                          </button>
                          <button onClick={() => openEdit(inv)}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Edit">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setDeleteId(inv.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500">Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="p-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-gray-600 px-2">Page {page + 1} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="p-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Invoice</h3>
            <p className="text-sm text-gray-600 mb-4">Are you sure? All line items will also be deleted. This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)}
                className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
