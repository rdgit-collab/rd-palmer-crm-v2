import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAssignableUsers, getLegacyUserId } from '../../lib/legacyUsers'
import { fetchAllRows } from '../../lib/fetchAllRows'
import salesDocumentLogo from '../../assets/sales-document-logo.png'
import PaginationControls from '../../components/PaginationControls'
import {
  Plus, Search, Eye, Pencil, Trash2, ArrowLeft, Save,
  X, ChevronLeft, ChevronRight, FileText, RefreshCw, Download, Bold, Underline, Copy
} from 'lucide-react'

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtMoney = (n) => Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const PAGE_SIZE = 30
const CURRENCIES = ['MYR', 'USD', 'SGD', 'EUR', 'GBP']
const QUOTATION_LIST_COLUMNS = 'id, user_id, number, name, date, expiry_date, currency, total, isconvert, created_at'
const DEFAULT_QUOTATION_NOTES = 'Thank you for your interest in our product. Please feel free to contact us for further assistance.'
const DEFAULT_QUOTATION_TERMS = `Availability:
Validity: 30 days from quotation date.
Warranty: 12 months standard manufacturer warranty unless otherwise specified.
Prices quoted are EX-Work Kuala Lumpur, Malaysia unless other specified.

Please confirm your agreement to the terms and conditions stated therein by signing at the below.`

const emptyContactForm = {
  Salutation: '',
  first_name: '',
  last_name: '',
  position: '',
  mobile_number: '',
  email: '',
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
}

function sanitizeHtml(value = '') {
  const raw = String(value || '')
  if (!raw) return ''
  if (!/<\/?[a-z][\s\S]*>/i.test(raw)) return escapeHtml(raw).replace(/\n/g, '<br>')
  if (typeof window === 'undefined') return raw
  const doc = new DOMParser().parseFromString(raw, 'text/html')
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach(el => el.remove())
  doc.body.querySelectorAll('*').forEach(el => {
    ;[...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase()
      const val = attr.value || ''
      if (name.startsWith('on') || name === 'style' || (['href', 'src'].includes(name) && val.trim().toLowerCase().startsWith('javascript:'))) {
        el.removeAttribute(attr.name)
      }
    })
  })
  return doc.body.innerHTML
}

function htmlToText(value = '') {
  const raw = String(value || '')
  if (!raw) return ''
  if (typeof window === 'undefined' || !/<\/?[a-z][\s\S]*>/i.test(raw)) return raw
  const doc = new DOMParser().parseFromString(raw, 'text/html')
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach(el => el.remove())
  doc.body.querySelectorAll('br').forEach(el => el.replaceWith('\n'))
  doc.body.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6').forEach(el => el.append('\n'))
  return doc.body.textContent
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cleanSalesText(value = '', { dropPolicy = false, dropConfirmation = false, dropSignature = false } = {}) {
  let text = htmlToText(value)
  if (dropPolicy) {
    const policyIndex = text.search(/RD-?PALMER'?S SALES\s*&\s*SUPPORT POLICY/i)
    if (policyIndex >= 0) text = text.slice(0, policyIndex)
  }
  if (dropConfirmation) {
    text = text.replace(/Please confirm your agreement to the terms and conditions stated therein by signing at the below\.?/gi, '')
  }
  if (dropSignature) {
    text = text
      .replace(/[\s.\-_]{8,}\s*[\s\S]*$/i, '')
      .replace(/\(?Signature\)?[\s\S]*$/i, '')
  }
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

function printableText(value = '', options = {}) {
  return sanitizeHtml(cleanSalesText(value, options))
}

function toEditorHtml(value = '') {
  const raw = String(value || '')
  if (!raw) return ''
  if (/<\/?[a-z][\s\S]*>/i.test(raw)) return raw
  return escapeHtml(raw).replace(/\n/g, '<br>')
}

function HtmlBlock({ value }) {
  return <div className="text-sm text-gray-600 leading-6 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2" dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }} />
}

function RichTextEditor({ value, onChange, placeholder }) {
  const editorRef = useRef(null)

  useEffect(() => {
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

  return (
    <div className="border border-gray-200 rounded overflow-hidden focus-within:ring-1 focus-within:ring-red-400">
      <div className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1">
        <button type="button" title="Bold" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('bold')}
          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-white border border-transparent hover:border-gray-200 rounded">
          <Bold size={14} />
        </button>
        <button type="button" title="Underline" onMouseDown={e => e.preventDefault()} onClick={() => applyFormat('underline')}
          className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-white border border-transparent hover:border-gray-200 rounded">
          <Underline size={14} />
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={e => onChange(e.currentTarget.innerHTML)}
        className="min-h-[96px] w-full px-3 py-2 text-sm text-gray-800 focus:outline-none leading-6 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 [&_u]:underline [&_b]:font-bold [&_strong]:font-bold"
      />
    </div>
  )
}

function contactDisplayName(contact) {
  if (!contact) return ''
  return [contact.Salutation, contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || ''
}

function isNumericId(value) {
  return /^[0-9]+$/.test(String(value || '').trim())
}

function resolvedContactName(value, contact) {
  return isNumericId(value) ? (contactDisplayName(contact) || value || '-') : (value || '-')
}

function userDisplayName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
}

function catalogueItemLabel(item) {
  return [item?.sku, item?.name].filter(Boolean).join(' - ') || ''
}

function addressLines(customer) {
  if (!customer) return []
  return [
    customer.company_name,
    customer.address1,
    customer.address2,
    [customer.city, customer.state].filter(Boolean).join(', '),
    [customer.zipcode, customer.country].filter(Boolean).join(' '),
  ].filter(Boolean)
}

function quotationHtml(quotation, items, contactName, customer) {
  const billTo = addressLines(customer)
  const notes = sanitizeHtml(quotation.notes)
  const terms = printableText(quotation.terms, { dropConfirmation: true, dropSignature: true })
  const itemRows = items.map((item, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${escapeHtml(item.item || '')}</strong><div class="desc">${printableText(item.description || '')}</div></td>
      <td>${escapeHtml(item.qty || '')}</td>
      <td>${fmtMoney(item.rate)}</td>
      <td>${escapeHtml(item.taxlbl || '-')}</td>
      <td>${fmtMoney(item.amount)}</td>
    </tr>
  `).join('')
  return `<!doctype html>
  <html>
    <head>
      <title>${escapeHtml(quotation.number || 'Quotation')}</title>
      <style>
        @page { size: A4; margin: 0; }
        body { font-family: Arial, sans-serif; color: #111; margin: 0; background: #f3f4f6; font-size: 11px; }
        .sheet { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 20mm 15mm; box-sizing: border-box; }
        .top { display: grid; grid-template-columns: 1fr 1.6fr; gap: 20px; align-items: start; padding-top: 8px; margin-bottom: 20px; }
        .brand-logo { display: block; width: 175px; height: auto; margin-top: 0; }
        .company { text-align: right; line-height: 1.35; font-size: 11px; }
        .company strong { font-size: 12px; }
        .intro { display: grid; grid-template-columns: 1.1fr .9fr; gap: 28px; align-items: start; margin-bottom: 12px; }
        .bill-title { font-weight: 700; margin-bottom: 4px; }
        .bill-lines { line-height: 1.35; white-space: pre-line; }
        .doc-title { text-align: right; font-size: 20px; font-weight: 700; margin: 8px 0 10px; }
        .meta { margin-left: auto; width: 230px; }
        .meta-row { display: grid; grid-template-columns: 90px 1fr; gap: 8px; line-height: 1.35; }
        .meta-row .value { text-align: right; font-weight: 600; }
        table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; margin: 18px 0 0; border: 1px solid #222; border-radius: 3px; overflow: hidden; }
        th, td { padding: 7px 8px; text-align: left; vertical-align: top; border-bottom: 1px solid #e5e5e5; }
        th { background: #d4d4d4; color: #111; font-weight: 700; }
        td:nth-child(1), th:nth-child(1) { width: 28px; text-align: center; }
        td:nth-child(2), th:nth-child(2) { width: auto; }
        td:nth-child(3), th:nth-child(3) { text-align: right; width: 42px; white-space: nowrap; }
        td:nth-child(4), th:nth-child(4) { text-align: right; width: 74px; white-space: nowrap; }
        td:nth-child(5), th:nth-child(5) { text-align: right; width: 50px; white-space: nowrap; }
        td:nth-child(6), th:nth-child(6) { text-align: right; width: 86px; white-space: nowrap; }
        tr:last-child td { border-bottom: 0; }
        td:nth-child(2) { overflow-wrap: anywhere; hyphens: auto; }
        .desc { margin-top: 5px; line-height: 1.42; }
        tr, .totals, .section, .document-signature { break-inside: avoid; page-break-inside: avoid; }
        .below-table { display: grid; grid-template-columns: 1fr 250px; gap: 28px; align-items: start; margin-top: 6px; }
        .totals { width: 250px; margin-left: auto; border-top: 1px solid #aaa; padding-top: 8px; }
        .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
        .total { border-top: 1px solid #111; margin-top: 4px; font-weight: 700; font-size: 13px; }
        .section { margin-top: 10px; line-height: 1.35; }
        .section h2 { font-size: 11px; color: #111; text-transform: uppercase; margin-bottom: 6px; }
        .text-column { width: calc(100% - 278px); }
        .text-column .section, .below-table .section { text-align: justify; text-align-last: left; hyphens: auto; overflow-wrap: break-word; }
        .text-column .section h2, .below-table .section h2 { text-align: left; text-align-last: left; }
        .below-table .section { margin-top: 4px; }
        .document-signature { display: grid; grid-template-columns: 220px 220px; gap: 32px; margin-top: 18px; }
        .signature-line { border-top: 1px dotted #111; padding-top: 6px; font-style: italic; min-height: 42px; }
        ul { padding-left: 18px; margin-top: 4px; }
        @media print {
          body { background: #fff; }
          .sheet {
            width: auto;
            min-height: 0;
            margin: 0;
            padding: 15mm;
            box-decoration-break: clone;
            -webkit-box-decoration-break: clone;
          }
        }
      </style>
    </head>
    <body>
      <div class="sheet">
        <div class="top">
          <img class="brand-logo" src="${salesDocumentLogo}" alt="RD-Palmer">
          <div class="company">
            <strong>RD-PALMER TECHNOLOGY (M) SDN BHD</strong> (610731 W)<br>
            63, Jalan Seri Utara 1, Kipark Sri Utara, 68100 Kuala Lumpur<br>
            Tel: +603 6250 2071 | E-mail: info@rd-palmer.com<br>
            Website: www.rd-palmer.com
          </div>
        </div>
        <div class="intro">
          <div>
            <div class="bill-title">Bill To</div>
            <div class="bill-lines">${billTo.map(escapeHtml).join('<br>') || escapeHtml(quotation.name || '-')}</div>
            <div style="margin-top:12px;">Attn: ${escapeHtml(contactName || '-')}</div>
          </div>
          <div>
            <div class="doc-title">Quotation</div>
            <div class="meta">
              <div class="meta-row"><span>Quote No.:</span><span class="value">${escapeHtml(quotation.number || '-')}</span></div>
              <div class="meta-row"><span>Date:</span><span class="value">${fmt(quotation.date)}</span></div>
              <div class="meta-row"><span>Sales Person:</span><span class="value">${escapeHtml(quotation.sales_person || '-')}</span></div>
              <div class="meta-row"><span>Payment Term:</span><span class="value">${escapeHtml(quotation.payment_term || '-')}</span></div>
              <div class="meta-row"><span>Currency:</span><span class="value">${escapeHtml(quotation.currency || 'MYR')}</span></div>
              <div class="meta-row"><span>Expiry Date:</span><span class="value">${fmt(quotation.expiry_date)}</span></div>
            </div>
          </div>
        </div>
        <table>
          <thead><tr><th>#</th><th>Item & Description</th><th>Qty</th><th>Rate</th><th>Tax</th><th>Amount</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
        <div class="below-table">
          <div>${notes ? `<div class="section"><h2>Notes</h2>${notes}</div>` : ''}</div>
          <div class="totals">
            <div><span>Sub Total</span><span>${fmtMoney(quotation.subtotal)}</span></div>
            <div><span>Discount</span><span>${fmtMoney(quotation.discount)}</span></div>
            <div><span>Shipping charge</span><span>${fmtMoney(quotation.shiping_charge)}</span></div>
            <div><span>Adjustment</span><span>${fmtMoney(quotation.adjustment)}</span></div>
            <div class="total"><span>Total</span><span>${escapeHtml(quotation.currency || 'MYR')} ${fmtMoney(quotation.total)}</span></div>
          </div>
        </div>
        <div class="text-column">
          ${terms ? `<div class="section"><h2>Terms & Conditions</h2>${terms}</div>` : ''}
          <div class="document-signature">
            <div class="signature-line">(Signature)<br>Name:<br>Position:<br>Date:</div>
            <div class="signature-line">(Co. Stamp)</div>
          </div>
        </div>
      </div>
    </body>
  </html>`
}

function openPrintable(html, autoPrint = false) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  if (autoPrint) {
    win.onload = () => { win.focus(); win.print() }
  }
}

// ─── Generate next quotation number ───────────────────────────────────────────
async function getNextQNumber() {
  const { data } = await supabase.from('quotation').select('id').order('id', { ascending: false }).limit(1)
  const lastId = data?.[0]?.id ?? 0
  return `QUO${100 + lastId + 1}`
}

async function getNextInvoiceNumber() {
  const { data } = await supabase.from('invoice').select('id').order('id', { ascending: false }).limit(1)
  const lastId = data?.[0]?.id ?? 0
  return `INV${100 + lastId + 1}`
}

// ─── Line Item Row ─────────────────────────────────────────────────────────────
function LineItemRow({ item, idx, catalogueItems, taxes, onChange, onRemove }) {
  const selectedItem = catalogueItems.find(c => String(c.id) === String(item.itemid || ''))
  const [itemSearch, setItemSearch] = useState(selectedItem ? catalogueItemLabel(selectedItem) : '')
  const [showItemOptions, setShowItemOptions] = useState(false)
  const [itemDropdownStyle, setItemDropdownStyle] = useState({})
  const itemSearchRef = useRef(null)

  useEffect(() => {
    setItemSearch(selectedItem ? catalogueItemLabel(selectedItem) : '')
  }, [selectedItem?.id, selectedItem?.sku, selectedItem?.name])

  const updateItemDropdownPosition = useCallback(() => {
    if (!itemSearchRef.current) return
    const rect = itemSearchRef.current.getBoundingClientRect()
    setItemDropdownStyle({
      left: rect.left,
      top: rect.bottom + 4,
      width: rect.width,
    })
  }, [])

  useEffect(() => {
    if (!showItemOptions) return undefined
    updateItemDropdownPosition()
    window.addEventListener('resize', updateItemDropdownPosition)
    window.addEventListener('scroll', updateItemDropdownPosition, true)
    return () => {
      window.removeEventListener('resize', updateItemDropdownPosition)
      window.removeEventListener('scroll', updateItemDropdownPosition, true)
    }
  }, [showItemOptions, updateItemDropdownPosition])

  const applyCatalogueItem = (selected) => {
    const rate = parseFloat(selected.price || 0)
    const qty = item.qty || 1
    onChange(idx, {
      ...item,
      itemid: selected.id,
      item: selected.name,
      description: selected.description || '',
      rate,
      amount: qty * rate,
    })
    setItemSearch(catalogueItemLabel(selected))
    setShowItemOptions(false)
  }

  const handleItemSearch = (value) => {
    setItemSearch(value)
    setShowItemOptions(true)
    updateItemDropdownPosition()

    if (!value.trim() && item.itemid) {
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
    onChange(idx, {
      ...item,
      taxid: tax?.id || '',
      taxlbl: tax?.name || '',
      taxrate: tax ? parseFloat(tax.name.match(/[\d.]+/)?.[0] || 0) : 0,
    })
  }

  const tdCls = 'px-2 py-1.5'
  const inputCls = 'w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-400'
  const searchNeedle = itemSearch.trim().toLowerCase()
  const filteredCatalogueItems = (searchNeedle
    ? catalogueItems.filter(c => {
      const sku = String(c.sku || '').toLowerCase()
      const name = String(c.name || '').toLowerCase()
      const label = catalogueItemLabel(c).toLowerCase()
      return sku.includes(searchNeedle) || name.includes(searchNeedle) || label.includes(searchNeedle)
    })
    : catalogueItems
  ).slice(0, 20)

  return (
    <tr className="border-b border-gray-100">
      <td className={`${tdCls} text-center text-gray-400 text-xs w-8`}>{idx + 1}</td>
      <td className={`${tdCls} min-w-[180px]`}>
        <div className="relative">
          <input
            ref={itemSearchRef}
            className={inputCls}
            placeholder="Search SKU or item name..."
            value={itemSearch}
            onChange={e => handleItemSearch(e.target.value)}
            onFocus={() => {
              setShowItemOptions(true)
              updateItemDropdownPosition()
            }}
            onBlur={() => setTimeout(() => setShowItemOptions(false), 120)}
          />
          {showItemOptions && filteredCatalogueItems.length > 0 && (
            <div
              className="fixed z-[1000] max-h-56 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg"
              style={itemDropdownStyle}
            >
              {filteredCatalogueItems.map(c => (
                <button
                  key={c.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-red-50 hover:text-red-700"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => applyCatalogueItem(c)}
                >
                  <span className="font-medium">{c.sku || '-'}</span>
                  <span className="text-gray-400"> - </span>
                  <span>{c.name || '-'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {item.itemid === '' && (
          <input className={`${inputCls} mt-1`} placeholder="Or type item name"
            value={item.item || ''} onChange={e => onChange(idx, { ...item, item: e.target.value })} />
        )}
      </td>
      <td className={`${tdCls} min-w-[420px]`}>
        <textarea className={`${inputCls} resize-y h-12 min-h-12`} placeholder="Description"
          value={item.description || ''} onChange={e => onChange(idx, { ...item, description: e.target.value })} />
      </td>
      <td className={`${tdCls} w-20`}>
        <input type="number" min="0" step="0.01" className={inputCls} value={item.qty}
          onChange={e => handleQtyChange(e.target.value)} />
      </td>
      <td className={`${tdCls} w-28`}>
        <input type="number" min="0" step="0.01" className={inputCls} value={item.rate}
          onChange={e => handleRateChange(e.target.value)} />
      </td>
      <td className={`${tdCls} w-32`}>
        <select className={inputCls} value={item.taxid || ''} onChange={handleTaxSelect}>
          <option value="">No Tax</option>
          {taxes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </td>
      <td className={`${tdCls} w-28 text-right text-xs font-medium text-gray-800`}>
        {fmtMoney(item.amount)}
      </td>
      <td className={`${tdCls} w-8 text-center`}>
        <button type="button" onClick={() => onRemove(idx)}
          className="text-gray-300 hover:text-red-500 transition-colors">
          <X size={14} />
        </button>
      </td>
    </tr>
  )
}

// ─── Quotation Form (Add / Edit) ───────────────────────────────────────────────
function QuotationForm({ quotation, onSave, onCancel }) {
  const { profile } = useAuth()
  const isEdit = !!quotation?.id

  const [customers, setCustomers] = useState([])
  const [contacts, setContacts] = useState([])
  const [catalogueItems, setCatalogueItems] = useState([])
  const [salesUsers, setSalesUsers] = useState([])
  const [taxes, setTaxes] = useState([])
  const [paymentTerms, setPaymentTerms] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showContactForm, setShowContactForm] = useState(false)
  const [contactForm, setContactForm] = useState(emptyContactForm)
  const [contactSaving, setContactSaving] = useState(false)
  const [contactError, setContactError] = useState('')

  // Header fields
  const [form, setForm] = useState({
    companyid: quotation?.companyid ? String(quotation.companyid) : '',
    name: quotation?.name || '',
    number: quotation?.number || '',
    reference: quotation?.reference || '',
    date: quotation?.date || new Date().toISOString().split('T')[0],
    expiry_date: quotation?.expiry_date || '',
    sales_person: quotation?.sales_person || '',
    contact_person: quotation?.contact_person || '',
    estimat_delivery_date: quotation?.estimat_delivery_date || '',
    payment_term: quotation?.payment_term || '',
    currency: quotation?.currency || 'MYR',
    notes: quotation?.notes || '',
    terms: quotation?.terms || '',
    // Totals
    discounttype: quotation?.discouttype || '%',
    discountvalue: quotation?.discountvalue || '0',
    shipping: quotation?.shiping_charge || 0,
    adjustment: quotation?.adjustment || 0,
  })

  const [lineItems, setLineItems] = useState(
    quotation?._items?.length > 0
      ? quotation._items.map(i => ({
          id: i.id,
          itemid: String(i.itemid || ''),
          item: i.item || '',
          description: cleanSalesText(i.description || ''),
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
      const [
        custs, cats, users, { data: txs }, { data: pts }
      ] = await Promise.all([
        fetchAllRows('customer', 'id, company_name, assigned', 'company_name'),
        fetchAllRows('goodsservices', 'id, sku, name, price, description', 'name'),
        fetchAssignableUsers(supabase),
        supabase.from('tax').select('id, name').order('name'),
        supabase.from('payment_term').select('id, name').order('name'),
      ])
      setCustomers(custs || [])
      setCatalogueItems(cats || [])
      setSalesUsers(users || [])
      setTaxes(txs || [])
      setPaymentTerms(pts || [])

      if (!quotation) {
        const [qnum, { data: tplData }] = await Promise.all([
          getNextQNumber(),
          supabase.from('app_setting').select('key, value').in('key', ['quotation_notes', 'quotation_terms']),
        ])
        const tpl = {}
        ;(tplData || []).forEach(r => { tpl[r.key] = r.value || '' })
        setForm(f => ({
          ...f,
          number: qnum,
          notes: tpl.quotation_notes || DEFAULT_QUOTATION_NOTES,
          terms: tpl.quotation_terms || DEFAULT_QUOTATION_TERMS,
        }))
      }
    }
    load()
  }, [isEdit, quotation])

  // Load contacts when customer changes
  useEffect(() => {
    if (form.companyid) {
      supabase.from('contact').select('id, Salutation, first_name, last_name, email').eq('company_id', parseInt(form.companyid))
        .then(({ data }) => setContacts(data || []))
      const cust = customers.find(c => String(c.id) === form.companyid)
      const assignedUser = salesUsers.find(user => String(user.id) === String(cust?.assigned))
      if (cust) setForm(f => ({
        ...f,
        name: cust.company_name,
        sales_person: f.sales_person || userDisplayName(assignedUser) || '',
      }))
    } else {
      setContacts([])
    }
  }, [form.companyid, customers, salesUsers])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setContact = (k, v) => setContactForm(f => ({ ...f, [k]: v }))

  const openContactForm = () => {
    if (!form.companyid) { setError('Please select a customer before adding a contact'); return }
    setContactForm(emptyContactForm)
    setContactError('')
    setShowContactForm(true)
  }

  const saveContact = async (e) => {
    e.preventDefault()
    if (!form.companyid) { setContactError('Please select a customer first'); return }
    if (!contactForm.first_name.trim()) { setContactError('First name is required'); return }
    setContactSaving(true)
    setContactError('')
    const payload = {
      company_id: parseInt(form.companyid),
      Salutation: contactForm.Salutation,
      first_name: contactForm.first_name,
      last_name: contactForm.last_name,
      position: contactForm.position,
      mobile_number: contactForm.mobile_number,
      email: contactForm.email,
      user_id: getLegacyUserId(profile),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const { data, error: err } = await supabase.from('contact').insert(payload).select('id, Salutation, first_name, last_name, email').single()
    setContactSaving(false)
    if (err) { setContactError(err.message); return }
    setContacts(prev => [...prev, data])
    setForm(f => ({ ...f, contact_person: String(data.id) }))
    setShowContactForm(false)
  }

  const addLine = () => setLineItems(prev => [...prev, { itemid: '', item: '', description: '', qty: 1, rate: 0, taxid: '', taxlbl: '', taxrate: 0, amount: 0 }])
  const removeLine = (idx) => setLineItems(prev => prev.filter((_, i) => i !== idx))
  const updateLine = (idx, updated) => setLineItems(prev => prev.map((item, i) => i === idx ? updated : item))

  // Computed totals
  const subtotal = lineItems.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)
  const discountAmt = form.discounttype === '%'
    ? subtotal * (parseFloat(form.discountvalue) || 0) / 100
    : parseFloat(form.discountvalue) || 0
  const shipping = parseFloat(form.shipping) || 0
  const adjustment = parseFloat(form.adjustment) || 0
  const total = subtotal - discountAmt + shipping + adjustment

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.companyid) { setError('Please select a customer'); return }
    if (!form.number.trim()) { setError('Quotation number is required'); return }
    if (lineItems.every(i => !i.item.trim())) { setError('Add at least one line item'); return }
    setSaving(true); setError('')

    const payload = {
      user_id: quotation?.user_id || getLegacyUserId(profile),
      name: form.name,
      number: form.number,
      reference: form.reference,
      date: form.date,
      expiry_date: form.expiry_date || null,
      sales_person: form.sales_person,
      contact_person: form.contact_person,
      estimat_delivery_date: form.estimat_delivery_date || null,
      payment_term: form.payment_term,
      currency: form.currency,
      notes: form.notes,
      terms: form.terms,
      subtotal,
      discount: discountAmt,
      discouttype: form.discounttype,
      discountvalue: String(form.discountvalue),
      shiping_charge: shipping,
      tax: 0,
      adjustment,
      total,
      companyid: parseInt(form.companyid),
      isconvert: 0,
      updated_at: new Date().toISOString(),
    }

    let qResult
    if (isEdit) {
      qResult = await supabase.from('quotation').update(payload).eq('id', quotation.id).select().single()
    } else {
      payload.created_at = new Date().toISOString()
      qResult = await supabase.from('quotation').insert(payload).select().single()
    }

    if (qResult.error) { setSaving(false); setError(qResult.error.message); return }

    const qid = qResult.data.id
    // Delete old items if editing
    if (isEdit) await supabase.from('quotation_item').delete().eq('qid', qid)

    // Insert line items
    const validItems = lineItems.filter(i => i.item.trim())
    if (validItems.length > 0) {
      const itemPayload = validItems.map(i => ({
        user_id: qResult.data.user_id || getLegacyUserId(profile),
        qid,
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
      await supabase.from('quotation_item').insert(itemPayload)
    }

    setSaving(false)
    onSave(qResult.data)
  }

  const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'
  const hasCurrentSalesOption = !form.sales_person || salesUsers.some(user => userDisplayName(user) === form.sales_person)
  const hasCurrentContactOption = !form.contact_person || contacts.some(contact => String(contact.id) === String(form.contact_person))

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onCancel} className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-xl font-semibold text-gray-900">{isEdit ? `Edit ${form.number}` : 'New Quotation'}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">{error}</div>}

        {/* Header Card */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Quotation Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* Customer */}
            <div className="md:col-span-2">
              <label className={labelCls}>Customer <span className="text-red-500">*</span></label>
              <select className={inputCls} value={form.companyid} onChange={e => setF('companyid', e.target.value)} required>
                <option value="">Select Customer</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>

            {/* Currency */}
            <div>
              <label className={labelCls}>Currency</label>
              <select className={inputCls} value={form.currency} onChange={e => setF('currency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Quotation Number */}
            <div>
              <label className={labelCls}>Quotation No. <span className="text-red-500">*</span></label>
              <input className={inputCls} value={form.number} onChange={e => setF('number', e.target.value)} required />
            </div>

            {/* Reference */}
            <div>
              <label className={labelCls}>Reference</label>
              <input className={inputCls} value={form.reference} onChange={e => setF('reference', e.target.value)} placeholder="PO / reference number" />
            </div>

            {/* Payment Term */}
            <div>
              <label className={labelCls}>Payment Terms</label>
              <select className={inputCls} value={form.payment_term} onChange={e => setF('payment_term', e.target.value)}>
                <option value="">Please Select</option>
                {paymentTerms.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className={labelCls}>Date <span className="text-red-500">*</span></label>
              <input type="date" className={inputCls} value={form.date} onChange={e => setF('date', e.target.value)} required />
            </div>

            {/* Expiry Date */}
            <div>
              <label className={labelCls}>Expiry Date</label>
              <input type="date" className={inputCls} value={form.expiry_date} onChange={e => setF('expiry_date', e.target.value)} />
            </div>

            {/* Est Delivery Date */}
            <div>
              <label className={labelCls}>Est. Delivery Date</label>
              <input type="date" className={inputCls} value={form.estimat_delivery_date} onChange={e => setF('estimat_delivery_date', e.target.value)} />
            </div>

            {/* Sales Person */}
            <div>
              <label className={labelCls}>Sales Person</label>
              <select className={inputCls} value={form.sales_person} onChange={e => setF('sales_person', e.target.value)}>
                <option value="">Please Select</option>
                {!hasCurrentSalesOption && <option value={form.sales_person}>{form.sales_person}</option>}
                {salesUsers.map(user => {
                  const name = userDisplayName(user)
                  return <option key={user.id} value={name}>{name}</option>
                })}
              </select>
            </div>

            {/* Contact Person */}
            <div>
              <label className={labelCls}>Contact Person</label>
              <div className="flex gap-2">
                <select className={`${inputCls} flex-1`} value={form.contact_person} onChange={e => setF('contact_person', e.target.value)}>
                  <option value="">Please Select</option>
                  {!hasCurrentContactOption && <option value={form.contact_person}>{form.contact_person}</option>}
                  {contacts.map(c => <option key={c.id} value={c.id}>{contactDisplayName(c)}</option>)}
                </select>
                <button type="button" onClick={openContactForm} title="Add contact" className="px-3 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 hover:text-red-600">
                  <Plus size={16} />
                </button>
              </div>
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
            <table className="w-full min-w-[1120px]">
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
                  <LineItemRow
                    key={idx} item={item} idx={idx}
                    catalogueItems={catalogueItems} taxes={taxes}
                    onChange={updateLine} onRemove={removeLine}
                  />
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

                {/* Discount */}
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 flex-1">Discount</span>
                  <div className="flex items-center gap-1">
                    <select
                      className="border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-400"
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

                {/* Shipping */}
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 flex-1">Shipping</span>
                  <input type="number" min="0" step="0.01"
                    className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-red-400"
                    value={form.shipping} onChange={e => setF('shipping', e.target.value)} />
                  <span className="text-gray-500 w-24 text-right">+ {fmtMoney(shipping)}</span>
                </div>

                {/* Adjustment */}
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
              <RichTextEditor value={form.notes} onChange={value => setF('notes', value)} placeholder="Notes to customer..." />
            </div>
            <div>
              <label className={labelCls}>Terms & Conditions</label>
              <RichTextEditor value={form.terms} onChange={value => setF('terms', value)} placeholder="Terms and conditions..." />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pb-6">
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700 disabled:opacity-50">
            <Save size={14} />
            {saving ? 'Saving...' : (isEdit ? 'Update Quotation' : 'Save Quotation')}
          </button>
        </div>
      </form>

      {showContactForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form onSubmit={saveContact} className="bg-white w-full max-w-lg rounded-lg shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Add Contact</h2>
              <button type="button" onClick={() => setShowContactForm(false)} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
            </div>
            {contactError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">{contactError}</div>}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Salutation</label>
                <input className={inputCls} value={contactForm.Salutation} onChange={e => setContact('Salutation', e.target.value)} placeholder="Mr / Ms" />
              </div>
              <div>
                <label className={labelCls}>First Name <span className="text-red-500">*</span></label>
                <input className={inputCls} value={contactForm.first_name} onChange={e => setContact('first_name', e.target.value)} required />
              </div>
              <div>
                <label className={labelCls}>Last Name</label>
                <input className={inputCls} value={contactForm.last_name} onChange={e => setContact('last_name', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Position</label>
                <input className={inputCls} value={contactForm.position} onChange={e => setContact('position', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Mobile Number</label>
                <input className={inputCls} value={contactForm.mobile_number} onChange={e => setContact('mobile_number', e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" className={inputCls} value={contactForm.email} onChange={e => setContact('email', e.target.value)} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowContactForm(false)} className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={contactSaving} className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-60">{contactSaving ? 'Saving...' : 'Save Contact'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

// ─── Quotation Detail View ─────────────────────────────────────────────────────
function QuotationDetail({ quotationId, onBack, onEdit, onClone, onConverted }) {
  const [quotation, setQuotation] = useState(null)
  const [items, setItems] = useState([])
  const [contact, setContact] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [converting, setConverting] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: q }, { data: qi }] = await Promise.all([
        supabase.from('quotation').select('*').eq('id', quotationId).single(),
        supabase.from('quotation_item').select('*').eq('qid', quotationId).order('id'),
      ])
      let contactRow = null
      if (isNumericId(q?.contact_person)) {
        const { data } = await supabase.from('contact').select('*').eq('id', parseInt(q.contact_person)).maybeSingle()
        contactRow = data || null
      }
      let customerRow = null
      if (q?.companyid) {
        const { data } = await supabase.from('customer').select('*').eq('id', q.companyid).maybeSingle()
        customerRow = data || null
      }
      setQuotation(q)
      setItems(qi || [])
      setContact(contactRow)
      setCustomer(customerRow)
      setLoading(false)
    }
    load()
  }, [quotationId])

  const handleConvert = async () => {
    if (!window.confirm('Convert this quotation to an invoice? The quotation will be marked as converted.')) return
    setConverting(true)
    const invoiceNumber = await getNextInvoiceNumber()
    const now = new Date().toISOString()
    const invoicePayload = {
      user_id: quotation.user_id || 1,
      companyid: quotation.companyid,
      name: quotation.name,
      invoice_number: invoiceNumber,
      order_number: quotation.reference || null,
      quote_ref_number: quotation.number,
      date: new Date().toISOString().split('T')[0],
      due_date: quotation.expiry_date || null,
      terms: quotation.payment_term,
      term_condition: quotation.terms,
      sales_person: quotation.sales_person,
      contact_person: quotation.contact_person,
      currency: quotation.currency || 'MYR',
      notes: quotation.notes,
      subtotal: quotation.subtotal,
      discount: quotation.discount,
      discouttype: quotation.discouttype,
      discountvalue: quotation.discountvalue,
      shiping_charge: quotation.shiping_charge,
      tax: quotation.tax || 0,
      adjustment: quotation.adjustment,
      total: quotation.total,
      created_at: now,
      updated_at: now,
    }
    const { data: invoice, error: invoiceErr } = await supabase.from('invoice').insert(invoicePayload).select().single()
    if (invoiceErr) {
      alert(invoiceErr.message)
      setConverting(false)
      return
    }
    if (items.length > 0) {
      const invoiceItems = items.map(item => ({
        user_id: item.user_id || 1,
        invoiceid: invoice.id,
        item: item.item,
        description: item.description,
        qty: item.qty,
        rate: item.rate,
        tax: item.tax,
        amount: item.amount,
        itemid: item.itemid,
        taxid: item.taxid,
        taxlbl: item.taxlbl,
        created_at: now,
        updated_at: now,
      }))
      const { error: itemErr } = await supabase.from('invoice_item').insert(invoiceItems)
      if (itemErr) {
        alert(itemErr.message)
        setConverting(false)
        return
      }
    }
    await supabase.from('quotation').update({ isconvert: 1 }).eq('id', quotationId)
    setConverting(false)
    onConverted()
  }

  if (loading) return <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Loading...</div>
  if (!quotation) return <div className="text-gray-500 text-sm p-4">Quotation not found.</div>

  const isConverted = quotation.isconvert === 1
  const contactName = resolvedContactName(quotation.contact_person, contact)
  const printableHtml = () => quotationHtml(quotation, items, contactName, customer)
  const openPreview = () => openPrintable(printableHtml())
  const downloadPdf = () => openPrintable(printableHtml(), true)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm">
            <ArrowLeft size={16} /> Back
          </button>
          <h1 className="text-xl font-semibold text-gray-900">{quotation.number}</h1>
          {isConverted && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">Converted to Invoice</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openPreview}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">
            <FileText size={14} /> Preview PDF
          </button>
          <button onClick={downloadPdf}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">
            <Download size={14} /> Download PDF
          </button>
          <button onClick={onClone}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">
            <Copy size={14} /> Clone
          </button>
          {!isConverted && (
            <>
              <button onClick={onEdit}
                className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">
                <Pencil size={14} /> Edit
              </button>
              <button onClick={handleConvert} disabled={converting}
                className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50">
                <RefreshCw size={14} /> {converting ? 'Converting...' : 'Convert to Invoice'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Header Info */}
      <div className="bg-white rounded-lg border border-gray-200 mb-4">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Quotation Information</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-10">
          <table className="text-sm w-full">
            <tbody>
              {[
                ['Customer', quotation.name || '—'],
                ['Quotation No.', quotation.number],
                ['Reference', quotation.reference || '—'],
                ['Date', fmt(quotation.date)],
                ['Expiry Date', fmt(quotation.expiry_date)],
                ['Est. Delivery', fmt(quotation.estimat_delivery_date)],
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
                ['Payment Terms', quotation.payment_term || '—'],
                ['Currency', quotation.currency || 'MYR'],
                ['Sales Person', quotation.sales_person || '—'],
                ['Contact Person', contactName],
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
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-xs"><HtmlBlock value={item.description || '—'} /></td>
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
              <span>{quotation.currency} {fmtMoney(quotation.subtotal)}</span>
            </div>
            {quotation.discount > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Discount {quotation.discouttype === '%' ? `(${quotation.discountvalue}%)` : '(Fixed)'}</span>
                <span>− {fmtMoney(quotation.discount)}</span>
              </div>
            )}
            {quotation.shiping_charge > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Shipping</span>
                <span>+ {fmtMoney(quotation.shiping_charge)}</span>
              </div>
            )}
            {quotation.adjustment !== 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Adjustment</span>
                <span>{fmtMoney(quotation.adjustment)}</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900 text-base">
              <span>Total</span>
              <span>{quotation.currency} {fmtMoney(quotation.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes & Terms */}
      {(quotation.notes || quotation.terms) && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {quotation.notes && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</h3>
                <HtmlBlock value={quotation.notes} />
              </div>
            )}
            {quotation.terms && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Terms & Conditions</h3>
                <HtmlBlock value={quotation.terms} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Quotations Page ──────────────────────────────────────────────────────
export default function Quotations() {
  const { profile } = useAuth()
  const [view, setView] = useState('list')
  const [selectedId, setSelectedId] = useState(null)
  const [editQuotation, setEditQuotation] = useState(null)

  const [quotations, setQuotations] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState(null)

  const fetchQuotations = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('quotation').select(QUOTATION_LIST_COLUMNS, { count: 'exact' })
    if (profile?.role_id === 2) q = q.eq('user_id', getLegacyUserId(profile))
    if (search.trim()) {
      const term = search.trim()
      q = q.or(`name.ilike.%${term}%,number.ilike.%${term}%`)
    }
    q = q.order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    const { data, count, error } = await q
    if (!error) {
      const rows = data || []
      if (rows.length > 0) {
        const { data: itemRows } = await supabase
          .from('quotation_item')
          .select('qid, item')
          .in('qid', rows.map(row => row.id))
          .order('id')
        const firstItemByQid = {}
        ;(itemRows || []).forEach(item => {
          if (!firstItemByQid[item.qid]) firstItemByQid[item.qid] = item.item
        })
        setQuotations(rows.map(row => ({ ...row, first_item: firstItemByQid[row.id] || '' })))
      } else {
        setQuotations([])
      }
      setTotal(count || 0)
    }
    setLoading(false)
  }, [search, page, profile])

  useEffect(() => { fetchQuotations() }, [fetchQuotations])
  useEffect(() => { setPage(0) }, [search])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handleDelete = async (id) => {
    await supabase.from('quotation_item').delete().eq('qid', id)
    await supabase.from('quotation').delete().eq('id', id)
    setDeleteId(null)
    fetchQuotations()
  }

  const handleSaved = () => { setView('list'); setEditQuotation(null); fetchQuotations() }

  const openEdit = async (q) => {
    const quotationId = q?.id || selectedId
    const [{ data: q2 }, { data: items }] = await Promise.all([
      supabase.from('quotation').select('*').eq('id', quotationId).single(),
      supabase.from('quotation_item').select('*').eq('qid', quotationId).order('id'),
    ])
    if (q2) { setEditQuotation({ ...q2, _items: items || [] }); setView('form') }
  }

  const openClone = async (q) => {
    const quotationId = q?.id || selectedId
    const [{ data: source }, { data: items }, nextNumber] = await Promise.all([
      supabase.from('quotation').select('*').eq('id', quotationId).single(),
      supabase.from('quotation_item').select('*').eq('qid', quotationId).order('id'),
      getNextQNumber(),
    ])
    if (!source) return
    const today = new Date().toISOString().split('T')[0]
    setEditQuotation({
      ...source,
      id: undefined,
      number: nextNumber,
      date: today,
      isconvert: 0,
      _items: (items || []).map(({ id, qid, created_at, updated_at, ...item }) => item),
    })
    setView('form')
  }

  if (view === 'form') {
    return <QuotationForm quotation={editQuotation} onSave={handleSaved} onCancel={() => { setView('list'); setEditQuotation(null) }} />
  }

  if (view === 'detail') {
    return (
      <QuotationDetail
        quotationId={selectedId}
        onBack={() => setView('list')}
        onEdit={() => openEdit(null)}
        onClone={() => openClone(null)}
        onConverted={() => { setView('list'); fetchQuotations() }}
      />
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Manage Quotations</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} quotation{total !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={() => { setEditQuotation(null); setView('form') }}
          className="flex items-center gap-2 px-4 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700">
          <Plus size={16} /> New Quotation
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
            placeholder="Search by customer or quotation number..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {search && (
          <button onClick={() => setSearch('')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Quot. No.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Expiry</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">First Item</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">Loading...</td></tr>
              ) : quotations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">
                    {search ? 'No quotations match your search.' : 'No quotations yet. Click "New Quotation" to get started.'}
                  </td>
                </tr>
              ) : (
                quotations.map(q => (
                  <tr key={q.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button onClick={() => { setSelectedId(q.id); setView('detail') }}
                        className="flex items-center gap-2 text-[#CC0000] hover:text-red-700 font-medium text-sm">
                        <FileText size={13} />
                        {q.number}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-800 text-xs">{q.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{fmt(q.date)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{fmt(q.expiry_date)}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs max-w-xs truncate">{q.first_item || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900 text-xs">
                      {q.currency} {fmtMoney(q.total)}
                    </td>
                    <td className="px-4 py-3">
                      {q.isconvert === 1
                        ? <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Converted</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">Pending</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setSelectedId(q.id); setView('detail') }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="View">
                          <Eye size={14} />
                        </button>
                        {q.isconvert !== 1 && (
                          <button onClick={() => openEdit(q)}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Edit">
                            <Pencil size={14} />
                          </button>
                        )}
                        <button onClick={() => openClone(q)}
                          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded" title="Clone">
                          <Copy size={14} />
                        </button>
                        <button onClick={() => setDeleteId(q.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls page={page} totalPages={totalPages} total={total} label="quotation" zeroBased onPageChange={setPage} className="px-4 py-3 border-t border-gray-200 bg-gray-50" />
      </div>

      {/* Delete Confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Quotation</h3>
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
