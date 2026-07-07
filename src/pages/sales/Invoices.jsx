import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { getLegacyUserId } from '../../lib/legacyUsers'
import { isSalesRole } from '../../lib/roles'
import { logActivity } from '../../lib/activityLog'
import { applyTokenIlike, rankRowsBySearch } from '../../lib/searchUtils'
import { useAssignableUsers, usePaymentTerms, useTaxes } from '../../hooks/useLookups'
import salesDocumentLogo from '../../assets/sales-document-logo.png'
import PaginationControls from '../../components/PaginationControls'
import CustomerSearchSelect from '../../components/CustomerSearchSelect'
import PdfPreviewModal from '../../components/PdfPreviewModal'
import { downloadHtmlPdf, pdfFileName } from '../../lib/downloadPdf'
import {
  Plus, Search, Eye, Pencil, Trash2, ArrowLeft, Save,
  X, ChevronLeft, ChevronRight, FileText, Download, Bold, Underline, Copy, RefreshCw
} from 'lucide-react'

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtMoney = (n) => Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const markedRate = (baseRate, markup) => {
  const base = parseFloat(baseRate) || 0
  const pct = parseFloat(markup) || 0
  return base * (1 + pct / 100)
}
const PAGE_SIZE = 30
const CURRENCIES = ['MYR', 'USD', 'SGD', 'EUR', 'GBP']
const CUSTOMER_FORM_COLUMNS = 'id, company_name, assigned, assignto, address1, address2, city, state, zipcode, country'
const DEFAULT_INVOICE_NOTES = 'Thank you for your business. Please retain this invoice for your records.'
const DEFAULT_INVOICE_TERMS = `Payment is due according to the payment term stated above.
Goods and services supplied remain subject to RD-Palmer standard warranty and service conditions unless otherwise specified.
Please quote the invoice number for payment and account reference.`

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

function normalizedName(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function contactPhone(contact) {
  return contact?.mobile_number || contact?.phone || ''
}

async function resolveSalesContactNumber(salesPerson) {
  const targetName = normalizedName(salesPerson)
  if (!targetName) return ''
  const [{ data: users }, { data: legacyUsers }] = await Promise.all([
    supabase.from('users').select('first_name, last_name, phone'),
    supabase.from('legacy_users').select('first_name, last_name, phone'),
  ])
  const match = [...(users || []), ...(legacyUsers || [])].find(user => normalizedName(userDisplayName(user)) === targetName)
  return match?.phone || ''
}

function userDisplayName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim()
}

function catalogueItemLabel(item) {
  return [item?.sku, item?.name].filter(Boolean).join(' - ') || ''
}

// What the item search box shows once an item is picked: SKU only (falls back to
// name if the item has no SKU). The dropdown still uses catalogueItemLabel so
// users can search by both SKU and name.
function catalogueItemSku(item) {
  return String(item?.sku || item?.name || '').trim()
}


function finalItemAmount(item) {
  const qty = parseFloat(item?.qty) || 0
  const rate = parseFloat(item?.rate) || 0
  const amount = parseFloat(item?.amount)
  if (Number.isFinite(amount)) return amount
  return qty * rate
}

function finalItemRate(item) {
  const qty = parseFloat(item?.qty) || 0
  const rate = parseFloat(item?.rate) || 0
  const amount = finalItemAmount(item)
  if (qty > 0 && Math.abs(amount - qty * rate) > 0.01) return amount / qty
  return rate
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

function documentFileName(number, companyName, fallback = 'document') {
  return [number, companyName].map(value => String(value || '').trim()).filter(Boolean).join(' - ') || fallback
}

const SALES_PRINT_LINES_PER_PAGE = 32
const SALES_PRINT_DESC_CHARS = 64
// The notes/policy block renders full page width in a smaller font, so it wraps
// at far more characters per line than the narrow item description column.
const SALES_PRINT_TERMS_CHARS = 118

function wrapPrintableLine(value = '', maxChars = SALES_PRINT_DESC_CHARS) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return [{ text: '', title: false }]
  const words = text.split(' ')
  const lines = []
  let current = ''
  words.forEach(word => {
    if (!current) {
      current = word
    } else if ((current.length + word.length + 1) <= maxChars) {
      current += ` ${word}`
    } else {
      lines.push({ text: current, title: false })
      current = word
    }
  })
  if (current) lines.push({ text: current, title: false })
  return lines
}

function printableLineObjects(value = '', maxChars = SALES_PRINT_DESC_CHARS) {
  const text = cleanSalesText(value)
  if (!text) return []
  return text.split('\n').flatMap(line => wrapPrintableLine(line, maxChars))
}

function salesDocumentItemCode(item) {
  return String(item?.sku || '').trim()
}

function paginateSalesDocumentItems(items, getRate, getAmount) {
  const pages = [[]]
  let usedLines = 0
  const nextPage = () => {
    if (pages[pages.length - 1].length) pages.push([])
    usedLines = 0
  }

  items.forEach((item, idx) => {
    // The printed Description column shows only the description text — the item
    // name is intentionally omitted; the item is identified by SKU (Item Code).
    const lines = printableLineObjects(item.description || '')
    if (!lines.length) lines.push({ text: '-', title: false })

    let cursor = 0
    let firstFragment = true
    while (cursor < lines.length) {
      if (usedLines >= SALES_PRINT_LINES_PER_PAGE - 2) nextPage()
      const available = Math.max(1, SALES_PRINT_LINES_PER_PAGE - usedLines)
      const take = Math.min(lines.length - cursor, available)
      const fragmentLines = lines.slice(cursor, cursor + take)

      pages[pages.length - 1].push({
        item,
        number: idx + 1,
        code: salesDocumentItemCode(item),
        qty: item.qty || '',
        rate: getRate(item),
        amount: getAmount(item),
        lines: fragmentLines,
        firstFragment,
      })

      usedLines += Math.max(2, fragmentLines.length + 1)
      cursor += take
      firstFragment = false
      if (cursor < lines.length) nextPage()
    }
  })

  return pages.filter(page => page.length)
}

function renderSalesPrintRows(rows) {
  return rows.map(row => `
    <tr>
      <td class="no-col">${row.firstFragment ? escapeHtml(row.number) : ''}</td>
      <td class="code-col">${row.firstFragment ? escapeHtml(row.code) : ''}</td>
      <td class="description-col">
        ${row.lines.map(line => `<div class="${line.title ? 'line-title' : ''}">${line.text ? escapeHtml(line.text) : '&nbsp;'}</div>`).join('')}
      </td>
      <td class="qty-col">${row.firstFragment ? escapeHtml(row.qty) : ''}</td>
      <td class="price-col">${row.firstFragment ? fmtMoney(row.rate) : ''}</td>
      <td class="amount-col">${row.firstFragment ? fmtMoney(row.amount) : ''}</td>
    </tr>
  `).join('')
}

function salesPrintPageLineCount(rows = []) {
  return rows.reduce((total, row) => total + Math.max(2, row.lines.length + 1), 0)
}

function invoiceHtml(invoice, items, contactName, customer, contactMobile = '', salesContactNumber = '') {
  const billTo = addressLines(customer)
  const recipientHtml = (billTo.length ? billTo : [invoice.name || '-'])
    .map((line, index) => index === 0 ? `<strong>${escapeHtml(line)}</strong>` : escapeHtml(line))
    .join('<br>')
  const notes = sanitizeHtml(invoice.notes)
  const terms = printableText(invoice.term_condition, { dropConfirmation: true, dropSignature: true })
  const itemPages = paginateSalesDocumentItems(items, finalItemRate, finalItemAmount)
  // Keep the total + terms on the same page as the last items when there is
  // room, instead of always spilling onto a near-empty extra page. Reserve
  // lines for the total row and the terms/notes text, sized from their length.
  // Subtotal + Discount + Shipping Charges + Adjustment rows are always shown above the total.
  const breakdownRows = 4
  // Totals block: Subtotal + breakdown rows + grand-total band, in item-line units.
  const totalsReserve = 6 + breakdownRows
  // Notes/policy render full width in a smaller font: wrap at the real content
  // width (not the narrow item column) and weight each line a touch under one
  // item line. Wrapping at the item width over-counted ~2x and pushed the total
  // onto a near-empty extra page even when the last item page had plenty of room.
  const termsTextLines = printableLineObjects(htmlToText(notes), SALES_PRINT_TERMS_CHARS).length
    + printableLineObjects(htmlToText(terms), SALES_PRINT_TERMS_CHARS).length
  const termsReserve = termsTextLines ? Math.ceil(termsTextLines * 0.85) + 3 : 0
  const summaryReserveLines = totalsReserve + termsReserve
  const lastItemRows = itemPages[itemPages.length - 1] || []
  // The last page can physically hold a few more lines than the item-break
  // budget (which is deliberately conservative), since the summary reserve
  // over-estimates the small-font terms height.
  const lastPageCapacity = SALES_PRINT_LINES_PER_PAGE + 5
  const summaryFitsOnLastPage = itemPages.length > 0
    && (salesPrintPageLineCount(lastItemRows) + summaryReserveLines) <= lastPageCapacity
  const pages = itemPages.length === 0
    ? [{ rows: [], summary: true }]
    : summaryFitsOnLastPage
      ? itemPages.map((rows, index) => ({ rows, summary: index === itemPages.length - 1 }))
      : [...itemPages.map(rows => ({ rows, summary: false })), { rows: [], summary: true }]
  const totalPages = pages.length

  const renderHeader = (pageNumber) => `
    <div class="letterhead">
      <img class="brand-logo" src="${salesDocumentLogo}" alt="RD-Palmer">
      <div class="company">
        <strong>RD-PALMER TECHNOLOGY (M) SDN BHD</strong> <span>(Reg. 200301008311)</span><br>
        No. 63, Jalan Seri Utara 1, Kipark Sri Utara, 68100 Kuala Lumpur.<br>
        Tel: +(0)3 62502071 &nbsp; | &nbsp; Email: Info@rd-palmer.com<br>
        URL: www.rd-palmer.com
      </div>
    </div>
    <div class="document-head">
      <div class="recipient">
        <div class="label">Invoice To:</div>
        <div class="recipient-lines">${recipientHtml}</div>
        <div class="attention-row">
          <span>Attn : ${escapeHtml(contactName || '')}</span>
          <span>${contactMobile ? `Tel : ${escapeHtml(contactMobile)}` : ''}</span>
        </div>
      </div>
      <div class="document-meta">
        <div class="document-title">PROFORMA INVOICE</div>
        <div class="meta-row"><span>Invoice No</span><span>:</span><strong>${escapeHtml(invoice.invoice_number || '-')}</strong></div>
        <div class="meta-row"><span>Date</span><span>:</span><span>${fmt(invoice.date)}</span></div>
        <div class="meta-row"><span>PO/Order No</span><span>:</span><span>${escapeHtml(invoice.order_number || '-')}</span></div>
        <div class="meta-row"><span>Your Ref</span><span>:</span><span>${escapeHtml(invoice.quote_ref_number || '-')}</span></div>
        <div class="meta-row"><span>Terms</span><span>:</span><span>${escapeHtml(invoice.terms || '-')}</span></div>
        <div class="meta-row"><span>Salesperson</span><span>:</span><span>${escapeHtml(invoice.sales_person || '-')}</span></div>
        ${salesContactNumber ? `<div class="meta-row"><span>Sales Contact</span><span>:</span><span>${escapeHtml(salesContactNumber)}</span></div>` : ''}
        <div class="meta-row"><span>Page</span><span>:</span><span>${pageNumber} of ${totalPages}</span></div>
      </div>
    </div>
  `

  const subtotalVal = Number(invoice.subtotal ?? invoice.total ?? 0)
  const discountVal = Number(invoice.discount || 0)
  const shippingVal = Number(invoice.shiping_charge || 0)
  const adjustmentVal = Number(invoice.adjustment || 0)
  const discountLabel = invoice.discouttype === '%' && Number(invoice.discountvalue || 0) > 0
    ? `Discount (${invoice.discountvalue}%)`
    : 'Discount'

  const renderSummary = () => `
    <div class="inv-totals">
      <div class="inv-trow"><span>Subtotal</span><span class="v">${fmtMoney(subtotalVal)}</span></div>
      <div class="inv-trow"><span>${escapeHtml(discountLabel)}</span><span class="v">&minus; ${fmtMoney(discountVal)}</span></div>
      <div class="inv-trow"><span>Shipping Charges</span><span class="v">+ ${fmtMoney(shippingVal)}</span></div>
      <div class="inv-trow"><span>Adjustment</span><span class="v">${adjustmentVal < 0 ? '&minus; ' : '+ '}${fmtMoney(Math.abs(adjustmentVal))}</span></div>
      <div class="inv-trow inv-grand"><span>Total (RM)</span><span class="v">${fmtMoney(invoice.total)}</span></div>
    </div>
    <div class="terms-block">
      ${notes ? `<div class="section">${notes}</div>` : ''}
      ${terms ? `<div class="section">${terms}</div>` : ''}
    </div>
  `

  const renderPage = (page, pageIndex) => `
    <section class="pdf-page${page.summary && !page.rows.length ? ' summary-only' : ''}">
      ${renderHeader(pageIndex + 1)}
      <table class="report-table">
        <colgroup>
          <col class="no-col">
          <col class="code-col">
          <col class="description-col">
          <col class="qty-col">
          <col class="price-col">
          <col class="amount-col">
        </colgroup>
        <thead><tr><th class="no-col">No</th><th class="code-col">Item Code</th><th class="description-col">Description</th><th class="qty-col">Qty</th><th class="price-col">Price/Unit</th><th class="amount-col">Amount</th></tr></thead>
        <tbody>
          ${renderSalesPrintRows(page.rows)}
          ${page.summary ? '<tr class="blank-row"><td colspan="6"></td></tr>' : ''}
        </tbody>
      </table>
      ${page.summary ? renderSummary() : ''}
      <div class="page-footer">
        SYSTEM GENERATED DOCUMENT WITH NO SIGNATURE REQUIRED<br>
        Please contact Account Dept at +603 6250 2071 should you need any clarification
      </div>
    </section>
  `

  return `<!doctype html>
  <html>
    <head>
      <title>${escapeHtml(invoice.invoice_number || 'Invoice')}</title>
      <style>
        @page { size: A4; margin: 0; }
        body { margin: 0; background: #e5e7eb; color: #111; font-family: Arial, sans-serif; font-size: 11px; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
        .print-document { padding: 18px 0; }
        .pdf-page { width: 210mm; height: 297mm; margin: 0 auto 18px; padding: 13mm 8mm 13mm; box-sizing: border-box; background: #fff; position: relative; page-break-after: always; overflow: hidden; }
        .pdf-page:last-child { page-break-after: auto; margin-bottom: 0; }
        .letterhead { display: grid; grid-template-columns: 61mm 1fr; align-items: start; column-gap: 8mm; min-height: 29mm; }
        .brand-logo { width: 49mm; height: auto; display: block; margin-top: 3mm; }
        .company { font-size: 12px; line-height: 1.38; }
        .company strong { font-size: 14px; letter-spacing: .1px; }
        .company span { font-size: 11px; font-weight: 400; }
        .document-head { display: grid; grid-template-columns: 1.42fr .72fr; gap: 10mm; margin-top: 10mm; }
        .label { margin-bottom: 4mm; }
        .recipient-lines { line-height: 1.45; min-height: 20mm; }
        .recipient-lines strong, .recipient-lines b { font-weight: 700; }
        .attention-row { display: grid; grid-template-columns: auto auto; justify-content: start; gap: 12mm; margin-top: 1mm; }
        .document-title { text-align: center; font-size: 22px; line-height: 1; font-weight: 700; margin-bottom: 6mm; }
        .meta-row { display: grid; grid-template-columns: 27mm 4mm 1fr; gap: 2mm; line-height: 1.5; font-size: 12px; }
        .report-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 6mm; font-size: 12px; line-height: 1.33; }
        .report-table thead th { border-top: 1.5px solid #111; border-bottom: 1.1px solid #111; padding: 2mm 1.5mm; font-weight: 400; text-align: left; }
        .report-table td { padding: 1.15mm 1.5mm; vertical-align: top; }
        .report-table .no-col { width: 9mm; text-align: center; }
        .report-table .code-col { width: 31mm; overflow-wrap: anywhere; }
        .report-table .description-col { width: auto; }
        .report-table .qty-col { width: 16mm; text-align: right; white-space: nowrap; }
        .report-table .price-col { width: 28mm; text-align: right; white-space: nowrap; }
        .report-table .amount-col { width: 29mm; text-align: right; white-space: nowrap; }
        .line-title { text-transform: none; }
        .blank-row td { height: 5mm; border-bottom: 1.4px solid #111; }
        .summary-only .blank-row td { height: 40mm; }
        .inv-totals { width: 92mm; margin: 3mm 0 0 auto; font-size: 12px; }
        .inv-trow { display: grid; grid-template-columns: 1fr 34mm; gap: 5mm; padding: 0.6mm 0; align-items: baseline; }
        .inv-trow > span:first-child { white-space: nowrap; }
        .inv-trow .v { text-align: right; white-space: nowrap; }
        .inv-grand { border-top: 1px solid #111; border-bottom: 1px solid #111; padding: 1.6mm 0; margin-top: 1.2mm; font-weight: 700; }
        .inv-grand > span { font-weight: 700; }
        .terms-block { margin: 4mm 3mm 13mm; font-size: 11px; line-height: 1.22; }
        .terms-block .section { margin-bottom: 3mm; }
        .terms-block p, .terms-block div { margin-top: 0; margin-bottom: 1.5mm; }
        .terms-block strong, .terms-block b { font-weight: 700; }
        .terms-block u { text-underline-offset: 2px; }
        .page-footer { position: absolute; left: 8mm; right: 8mm; bottom: 6mm; text-align: center; font-size: 8px; line-height: 1.35; color: #555; }
        ul { margin: 1mm 0 2mm; padding-left: 6mm; }
        @media print {
          body { background: #fff; }
          .print-document { padding: 0; }
          .pdf-page { margin: 0; box-shadow: none; }
        }
        @media screen and (max-width: 800px) {
          body { background: #fff; }
          .print-document { padding: 0; overflow-x: auto; }
          .pdf-page { margin: 0; transform-origin: top left; }
        }
      </style>
    </head>
    <body><main class="print-document">${pages.map(renderPage).join('')}</main></body>
  </html>`
}

// ─── Auto-generate next invoice number ────────────────────────────────────────
async function getNextInvNumber() {
  const { data } = await supabase.from('invoice').select('id').order('id', { ascending: false }).limit(1)
  const lastId = data?.[0]?.id ?? 0
  return `INV${100 + lastId + 1}`
}

// ─── Line Item Row ─────────────────────────────────────────────────────────────
function LineItemRow({ item, idx, catalogueItems, taxes, onChange, onRemove }) {
  const selectedItem = catalogueItems.find(c => String(c.id) === String(item.itemid || ''))
  const [itemSearch, setItemSearch] = useState(selectedItem ? catalogueItemSku(selectedItem) : '')
  const [itemResults, setItemResults] = useState([])
  const [itemLoading, setItemLoading] = useState(false)
  const [showItemOptions, setShowItemOptions] = useState(false)
  const [itemDropdownStyle, setItemDropdownStyle] = useState({})
  const itemSearchRef = useRef(null)

  // Rate is edited as a raw string so partial/negative input (e.g. "-", "-1")
  // survives keystrokes — native number inputs report "-" as "" and snap the
  // value back to 0. Re-sync only when rate is changed programmatically
  // (catalogue pick, markup, reset), tracked via lastEmittedRate.
  const [rateInput, setRateInput] = useState(item.rate === 0 || item.rate == null || item.rate === '' ? '' : String(item.rate))
  const lastEmittedRate = useRef(Number(item.rate) || 0)
  useEffect(() => {
    const external = Number(item.rate) || 0
    if (external !== lastEmittedRate.current) {
      lastEmittedRate.current = external
      setRateInput(external === 0 ? '' : String(item.rate))
    }
  }, [item.rate])

  useEffect(() => {
    setItemSearch(selectedItem ? catalogueItemSku(selectedItem) : '')
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
    const baseRate = parseFloat(selected.price || 0)
    const rate = markedRate(baseRate, item.markup)
    const qty = item.qty || 1
    onChange(idx, { ...item, itemid: selected.id, item: selected.name, description: selected.description || '', base_rate: baseRate, rate, amount: qty * rate })
    setItemSearch(catalogueItemSku(selected))
    setShowItemOptions(false)
  }

  const handleItemSearch = (value) => {
    setItemSearch(value)
    setShowItemOptions(true)
    updateItemDropdownPosition()

    if (!value.trim() && item.itemid) {
      onChange(idx, { ...item, itemid: '', item: '', description: '', markup: '', base_rate: 0, rate: 0, amount: 0 })
    }
  }

  useEffect(() => {
    const term = itemSearch.trim()
    if (!showItemOptions || term.length < 2 || selectedItem && term === catalogueItemSku(selectedItem)) {
      setItemResults([])
      setItemLoading(false)
      return undefined
    }
    let cancelled = false
    setItemLoading(true)
    const timer = setTimeout(async () => {
      let skuQuery = supabase.from('goodsservices').select('id, sku, name, price, description').eq('is_archived', false).ilike('sku', `%${term}%`).limit(50)
      let nameQuery = supabase.from('goodsservices').select('id, sku, name, price, description').eq('is_archived', false).limit(50)
      nameQuery = applyTokenIlike(nameQuery, 'name', term)
      const [skuR, nameR] = await Promise.all([skuQuery, nameQuery])
      if (cancelled) return
      const map = new Map()
      ;[...(skuR.data || []), ...(nameR.data || [])].forEach(row => map.set(String(row.id), row))
      const ranked = rankRowsBySearch(
        Array.from(map.values()).map(row => ({ ...row, search_label: catalogueItemLabel(row) })),
        'search_label',
        term
      )
      setItemResults(ranked.slice(0, 20))
      setItemLoading(false)
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [itemSearch, selectedItem, showItemOptions])

  const handleQtyChange = (qty) => {
    const q = Math.max(1, parseFloat(qty) || 1)
    onChange(idx, { ...item, qty: q, amount: q * (parseFloat(item.rate) || 0) })
  }
  const handleRateChange = (raw) => {
    setRateInput(raw)
    const parsed = parseFloat(raw)
    const r = Number.isFinite(parsed) ? parsed : 0
    lastEmittedRate.current = r
    const pct = parseFloat(item.markup) || 0
    const baseRate = pct ? r / (1 + pct / 100) : r
    onChange(idx, { ...item, base_rate: baseRate, rate: r, amount: (parseFloat(item.qty) || 0) * r })
  }
  const handleMarkupChange = (markup) => {
    const baseRate = parseFloat(item.base_rate ?? item.rate) || 0
    const r = markedRate(baseRate, markup)
    onChange(idx, { ...item, markup, base_rate: baseRate, rate: r, amount: (parseFloat(item.qty) || 0) * r })
  }
  const handleTaxSelect = (e) => {
    const tax = taxes.find(t => String(t.id) === e.target.value)
    onChange(idx, { ...item, taxid: tax?.id || '', taxlbl: tax?.name || '', taxrate: tax ? parseFloat(tax.name.match(/[\d.]+/)?.[0] || 0) : 0 })
  }

  const inputCls = 'w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-400'
  const fieldLabelCls = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400'
  const filteredCatalogueItems = itemResults

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-gray-400">Line {idx + 1}</span>
        <button type="button" onClick={() => onRemove(idx)} className="text-gray-300 hover:text-red-500 transition-colors" title="Remove line item">
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <label className={fieldLabelCls}>Item</label>
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
            {showItemOptions && (itemLoading || filteredCatalogueItems.length > 0) && (
              <div
                className="fixed z-[1000] max-h-56 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg"
                style={itemDropdownStyle}
              >
                {itemLoading && <div className="px-3 py-2 text-xs text-gray-400">Searching items...</div>}
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
        </div>
        <div className="lg:col-span-8">
          <label className={fieldLabelCls}>Description</label>
          <textarea className={`${inputCls} min-h-20 resize-y`} placeholder="Description"
            value={item.description || ''} onChange={e => onChange(idx, { ...item, description: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 lg:col-span-12">
          <div>
            <label className={fieldLabelCls}>Qty</label>
            <input type="number" min="1" step="1" className={inputCls} value={item.qty} onChange={e => handleQtyChange(e.target.value)} />
          </div>
          <div>
            <label className={fieldLabelCls}>Rate</label>
            <input type="text" inputMode="decimal" className={inputCls} value={rateInput} onChange={e => handleRateChange(e.target.value)} />
          </div>
          <div>
            <label className={fieldLabelCls}>Markup %</label>
            <input type="number" min="0" step="1" className={inputCls} value={item.markup || ''} onChange={e => handleMarkupChange(e.target.value)} placeholder="%" />
          </div>
          <div>
            <label className={fieldLabelCls}>Tax</label>
            <select className={inputCls} value={item.taxid || ''} onChange={handleTaxSelect}>
              <option value="">No Tax</option>
              {taxes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className={fieldLabelCls}>Amount</label>
            <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5 text-right text-xs font-medium text-gray-800">
              {fmtMoney(item.amount)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Invoice Form (Add / Edit) ─────────────────────────────────────────────────
function InvoiceForm({ invoice, onSave, onCancel }) {
  const { profile } = useAuth()
  const isEdit = !!invoice?.id
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
  const salesUsersQuery = useAssignableUsers()
  const taxesQuery = useTaxes()
  const paymentTermsQuery = usePaymentTerms()

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
          description: cleanSalesText(i.description || ''),
          qty: i.qty || 1,
          markup: i.markup || '',
          base_rate: i.markup ? (parseFloat(i.rate) || 0) / (1 + (parseFloat(i.markup) || 0) / 100) : (i.rate || 0),
          rate: i.rate || 0,
          taxid: String(i.taxid || ''),
          taxlbl: i.taxlbl || '',
          taxrate: 0,
          amount: i.amount || 0,
        }))
      : [{ itemid: '', item: '', description: '', qty: 1, markup: '', base_rate: 0, rate: 0, taxid: '', taxlbl: '', taxrate: 0, amount: 0 }]
  )

  useEffect(() => { setSalesUsers(salesUsersQuery.data || []) }, [salesUsersQuery.data])
  useEffect(() => { setTaxes(taxesQuery.data || []) }, [taxesQuery.data])
  useEffect(() => { setPaymentTerms(paymentTermsQuery.data || []) }, [paymentTermsQuery.data])

  useEffect(() => {
    const load = async () => {
      if (invoice?.companyid) {
        const { data: currentCustomer } = await supabase
          .from('customer')
          .select(CUSTOMER_FORM_COLUMNS)
          .eq('id', invoice.companyid)
          .maybeSingle()
        if (currentCustomer) {
          setCustomers([currentCustomer])
        }
      }

      const itemIds = [...new Set((invoice?._items || []).map(item => item.itemid).filter(Boolean))]
      if (itemIds.length) {
        const { data: selectedItems } = await supabase
          .from('goodsservices')
          .select('id, sku, name, price, description')
          .in('id', itemIds)
        setCatalogueItems(selectedItems || [])
      }

      if (!invoice) {
        const [invNum, { data: tplData }] = await Promise.all([
          getNextInvNumber(),
          supabase.from('app_setting').select('key, value').in('key', ['invoice_notes', 'invoice_terms']),
        ])
        const tpl = {}
        ;(tplData || []).forEach(r => { tpl[r.key] = r.value || '' })
        setForm(f => ({
          ...f,
          invoice_number: invNum,
          notes: tpl.invoice_notes || DEFAULT_INVOICE_NOTES,
          term_condition: tpl.invoice_terms || DEFAULT_INVOICE_TERMS,
        }))
      }
    }
    load()
  }, [isEdit, invoice])

  useEffect(() => {
    if (form.companyid) {
      supabase.from('contact').select('id, Salutation, first_name, last_name, email').eq('company_id', parseInt(form.companyid))
        .then(({ data }) => setContacts(data || []))
      const cust = customers.find(c => String(c.id) === form.companyid)
      const assignedUser = salesUsers.find(user => String(user.id) === String(cust?.assignto || cust?.assigned))
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
  const selectedCustomer = customers.find(c => String(c.id) === String(form.companyid))
  const selectCustomer = async (customer) => {
    setError('')
    if (!customer) {
      setCustomers([])
      setForm(f => ({ ...f, companyid: '', name: '', contact_person: '' }))
      setContacts([])
      return
    }
    let customerRecord = customer
    const { data: fullCustomer } = await supabase
      .from('customer')
      .select(CUSTOMER_FORM_COLUMNS)
      .eq('id', customer.id)
      .maybeSingle()
    if (fullCustomer) customerRecord = fullCustomer
    setCustomers(prev => {
      const map = new Map(prev.map(row => [String(row.id), row]))
      map.set(String(customerRecord.id), { ...map.get(String(customerRecord.id)), ...customerRecord })
      return Array.from(map.values())
    })
    setF('companyid', String(customerRecord.id))
  }

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
  const addLine = () => setLineItems(prev => [...prev, { itemid: '', item: '', description: '', qty: 1, markup: '', base_rate: 0, rate: 0, taxid: '', taxlbl: '', taxrate: 0, amount: 0 }])
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
    if (!form.terms) { setError('Please select a payment term'); return }
    if (lineItems.every(i => !i.item.trim())) { setError('Add at least one line item'); return }
    setSaving(true); setError('')

    const payload = {
      user_id: invoice?.user_id || getLegacyUserId(profile),
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
      serial_number: invoice?.serial_number || '',
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
        user_id: invResult.data.user_id || getLegacyUserId(profile),
        invoiceid,
        item: i.item,
        description: i.description,
        qty: parseFloat(i.qty) || 1,
        rate: parseFloat(i.rate) || 0,
        tax: i.taxrate > 0 ? (parseFloat(i.amount) * i.taxrate / 100) : 0,
        amount: parseFloat(i.amount) || 0,
        markup: i.markup ? String(i.markup) : null,
        itemid: i.itemid ? parseInt(i.itemid) : null,
        taxid: i.taxid ? parseInt(i.taxid) : null,
        taxlbl: i.taxlbl || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
      await supabase.from('invoice_item').insert(itemPayload)
    }
    logActivity({
      module: 'invoices',
      action: isEdit ? 'update' : 'create',
      recordTable: 'invoice',
      recordId: invoiceid,
      recordLabel: invResult.data.invoice_number,
      summary: `${isEdit ? 'Updated' : 'Created'} invoice ${invResult.data.invoice_number || invoiceid}`,
      metadata: { companyid: form.companyid || null, total },
    })

    setSaving(false)
    onSave(invResult.data)
  }

  const inputCls = 'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500'
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1'
  const hasCurrentSalesOption = !form.sales_person || salesUsers.some(user => userDisplayName(user) === form.sales_person)
  const hasCurrentContactOption = !form.contact_person || contacts.some(contact => String(contact.id) === String(form.contact_person))
  const selectedCustomerAddress = addressLines(selectedCustomer).slice(1)

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
              <CustomerSearchSelect
                value={form.companyid}
                displayLabel={selectedCustomer?.company_name || form.name || ''}
                onSelect={selectCustomer}
                placeholder="Search customer name..."
                required
                className={inputCls}
              />
              {selectedCustomer && (
                <div className="mt-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  <div className="font-semibold text-gray-700">{selectedCustomer.company_name}</div>
                  {selectedCustomerAddress.length > 0 ? (
                    <div className="mt-1 leading-relaxed">{selectedCustomerAddress.map((line, idx) => <div key={`${line}-${idx}`}>{line}</div>)}</div>
                  ) : (
                    <div className="mt-1 text-gray-400">No address recorded for this customer.</div>
                  )}
                </div>
              )}
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
              <label className={labelCls}>Payment Terms <span className="text-red-500">*</span></label>
              <select className={inputCls} value={form.terms} onChange={e => setF('terms', e.target.value)} required>
                <option value="">Please Select</option>
                {paymentTerms.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>

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
          <div className="divide-y divide-gray-100">
            {lineItems.map((item, idx) => (
              <LineItemRow key={idx} item={item} idx={idx}
                catalogueItems={catalogueItems} taxes={taxes}
                onChange={updateLine} onRemove={removeLine} />
            ))}
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
                      <option value="fixed">RM</option>
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
              <RichTextEditor value={form.notes} onChange={value => setF('notes', value)} placeholder="Notes to customer..." />
            </div>
            <div>
              <label className={labelCls}>Terms & Conditions</label>
              <RichTextEditor value={form.term_condition} onChange={value => setF('term_condition', value)} placeholder="Terms and conditions..." />
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

// ─── Invoice Detail View ───────────────────────────────────────────────────────
function InvoiceDetail({ invoiceId, onBack, onEdit, onClone }) {
  const [invoice, setInvoice] = useState(null)
  const [items, setItems] = useState([])
  const [contact, setContact] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [salesContactNumber, setSalesContactNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [pdfDownloading, setPdfDownloading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: inv }, { data: ii }] = await Promise.all([
        supabase.from('invoice').select('*').eq('id', invoiceId).single(),
        supabase.from('invoice_item').select('*').eq('invoiceid', invoiceId).order('id'),
      ])
      // These lookups only depend on the invoice/items above — run in parallel
      // instead of serially to cut the detail-open latency.
      const itemIds = [...new Set((ii || []).map(item => item.itemid).filter(Boolean))]
      const [contactResult, customerResult, salesPhone, goodsResult] = await Promise.all([
        isNumericId(inv?.contact_person)
          ? supabase.from('contact').select('*').eq('id', parseInt(inv.contact_person)).maybeSingle()
          : Promise.resolve({ data: null }),
        inv?.companyid
          ? supabase.from('customer').select('*').eq('id', inv.companyid).maybeSingle()
          : Promise.resolve({ data: null }),
        resolveSalesContactNumber(inv?.sales_person),
        itemIds.length > 0
          ? supabase.from('goodsservices').select('id, sku').in('id', itemIds)
          : Promise.resolve({ data: [] }),
      ])
      const contactRow = contactResult.data || null
      const customerRow = customerResult.data || null
      const skuByItemId = Object.fromEntries((goodsResult.data || []).map(row => [String(row.id), row.sku || '']))
      setInvoice(inv)
      setItems((ii || []).map(item => ({ ...item, sku: skuByItemId[String(item.itemid)] || item.sku || '' })))
      setContact(contactRow)
      setCustomer(customerRow)
      setSalesContactNumber(salesPhone)
      setLoading(false)
    }
    load()
  }, [invoiceId])

  if (loading) return <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Loading...</div>
  if (!invoice) return <div className="text-gray-500 text-sm p-4">Invoice not found.</div>

  const isOverdue = invoice.due_date && new Date(invoice.due_date) < new Date()
  const contactName = resolvedContactName(invoice.contact_person, contact)
  const printableHtml = () => invoiceHtml(invoice, items, contactName, customer, contactPhone(contact), salesContactNumber)
  const openPreview = () => setPreviewHtml(printableHtml())
  const downloadPdf = async () => {
    if (pdfDownloading) return
    setPdfDownloading(true)
    try {
      await downloadHtmlPdf(printableHtml(), pdfFileName(documentFileName(invoice.invoice_number, customer?.company_name || invoice.name, 'proforma-invoice')))
    } catch (error) {
      alert(error.message || 'Unable to download PDF.')
    } finally {
      setPdfDownloading(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm">
            <ArrowLeft size={16} /> Back
          </button>
          <h1 className="text-xl font-semibold text-gray-900">{invoice.invoice_number}</h1>
          {isOverdue && <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-medium">Overdue</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          <button onClick={openPreview}
            className="flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap">
            <FileText size={14} /> Preview PDF
          </button>
          <button onClick={downloadPdf} disabled={pdfDownloading}
            className="flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap">
            {pdfDownloading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            {pdfDownloading ? 'Preparing PDF...' : 'Download PDF'}
          </button>
          <button onClick={onClone}
            className="flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap">
            <Copy size={14} /> Clone
          </button>
          <button onClick={onEdit}
            className="flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap">
            <Pencil size={14} /> Edit
          </button>
        </div>
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
                ['Contact Person', contactName],
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
                {['#', 'SKU', 'Item', 'Description', 'Qty', 'Rate', 'Tax', 'Amount'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-4 text-center text-gray-400 text-sm">No items</td></tr>
              ) : items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.sku || '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.item}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-xs"><HtmlBlock value={item.description || '—'} /></td>
                  <td className="px-4 py-3 text-gray-700">{item.qty}</td>
                  <td className="px-4 py-3 text-gray-700">{fmtMoney(finalItemRate(item))}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{item.taxlbl || '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{fmtMoney(finalItemAmount(item))}</td>
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
                <span>Discount {invoice.discouttype === '%' ? `(${invoice.discountvalue}%)` : '(RM)'}</span>
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
                <HtmlBlock value={invoice.notes} />
              </div>
            )}
            {invoice.term_condition && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Terms & Conditions</h3>
                <HtmlBlock value={invoice.term_condition} />
              </div>
            )}
          </div>
        </div>
      )}

      {previewHtml && (
        <PdfPreviewModal
          html={previewHtml}
          title={`Preview — ${invoice.invoice_number || 'Invoice'}`}
          onClose={() => setPreviewHtml(null)}
        />
      )}
    </div>
  )
}

// ─── Main Invoices Page ────────────────────────────────────────────────────────
export default function Invoices() {
  const { profile } = useAuth()
  const [view, setView] = useState('list')
  const [selectedId, setSelectedId] = useState(null)
  const [editInvoice, setEditInvoice] = useState(null)

  const [invoices, setInvoices] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState(null)

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('search_invoices', {
        p_search: submittedSearch.trim(),
        p_current_user_id: getLegacyUserId(profile) || null,
        p_restricted: isSalesRole(profile?.role_id),
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      })
      if (error) throw error
      const result = Array.isArray(data) ? data[0] : data
      const invoiceRows = Array.isArray(result?.rows) ? result.rows : []
      if (invoiceRows.length === 0) {
        setInvoices([])
      } else {
        const ids = invoiceRows.map(row => row.id).filter(Boolean)
        const { data: termRows } = await supabase.from('invoice').select('id, terms').in('id', ids)
        const termsById = new Map((termRows || []).map(row => [String(row.id), row.terms || '']))
        setInvoices(invoiceRows.map(row => ({ ...row, terms: row.terms || termsById.get(String(row.id)) || '' })))
      }
      setTotal(Number(result?.total_count || 0))
    } catch (error) {
      setInvoices([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [submittedSearch, page, profile])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])
  useEffect(() => { setPage(0) }, [submittedSearch])
  const runSearch = () => {
    setSubmittedSearch(search.trim())
    setPage(0)
  }
  const clearSearch = () => {
    setSearch('')
    setSubmittedSearch('')
    setPage(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handleDelete = async (id) => {
    await supabase.from('invoice_item').delete().eq('invoiceid', id)
    await supabase.from('invoice').delete().eq('id', id)
    logActivity({
      module: 'invoices',
      action: 'delete',
      recordTable: 'invoice',
      recordId: id,
      summary: `Deleted invoice #${id}`,
    })
    setDeleteId(null)
    fetchInvoices()
  }

  const handleSaved = () => { setView('list'); setEditInvoice(null); fetchInvoices() }

  const openEdit = async (inv) => {
    const invoiceId = inv?.id || selectedId
    const src = await supabase.from('invoice').select('*').eq('id', invoiceId).single().then(r => r.data)
    if (!src) return
    const { data: items } = await supabase.from('invoice_item').select('*').eq('invoiceid', invoiceId).order('id')
    setEditInvoice({ ...src, _items: items || [] })
    setView('form')
  }

  const openClone = async (inv) => {
    const invoiceId = inv?.id || selectedId
    const [src, { data: items }, nextNumber] = await Promise.all([
      supabase.from('invoice').select('*').eq('id', invoiceId).single().then(r => r.data),
      supabase.from('invoice_item').select('*').eq('invoiceid', invoiceId).order('id'),
      getNextInvNumber(),
    ])
    if (!src) return
    const today = new Date().toISOString().split('T')[0]
    setEditInvoice({
      ...src,
      id: undefined,
      invoice_number: nextNumber,
      date: today,
      _items: (items || []).map(({ id, invoiceid, created_at, updated_at, ...item }) => item),
    })
    setView('form')
  }

  if (view === 'form') {
    return <InvoiceForm invoice={editInvoice} onSave={handleSaved} onCancel={() => { setView('list'); setEditInvoice(null) }} />
  }

  if (view === 'detail') {
    return <InvoiceDetail invoiceId={selectedId} onBack={() => setView('list')} onEdit={() => openEdit(null)} onClone={() => openClone(null)} />
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Manage Invoices</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} invoice{total !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={() => { setEditInvoice(null); setView('form') }}
          className="flex w-full items-center justify-center gap-2 px-4 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700 sm:w-auto">
          <Plus size={16} /> New Invoice
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
            placeholder="Search by customer or invoice number..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runSearch() }} />
        </div>
        <button onClick={runSearch} className="flex items-center gap-1.5 px-3 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700">
          <Search size={14} /> Search
        </button>
        {(search || submittedSearch) && (
          <button onClick={clearSearch} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Sales</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Payment Term</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">First Item</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Quot. Ref.</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Total</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-400 text-sm">Loading...</td></tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-gray-400 text-sm">
                    {search ? 'No invoices match your search.' : 'No invoices yet. Click "New Invoice" to get started.'}
                  </td>
                </tr>
              ) : (
                invoices.map(inv => {
                  const isOverdue = inv.due_date && new Date(inv.due_date) < new Date()
                  return (
                    <tr key={inv.id}
                      onClick={() => { setSelectedId(inv.id); setView('detail') }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedId(inv.id)
                          setView('detail')
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`View invoice ${inv.invoice_number || ''}`}
                      className="hover:bg-gray-50 focus:bg-gray-50 focus:outline-none cursor-pointer">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 text-[#CC0000] font-medium text-sm">
                          <FileText size={13} />{inv.invoice_number}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-800 text-xs">{inv.name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{inv.sales_person || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{fmt(inv.date)}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{inv.terms || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-xs truncate">{inv.first_item || '—'}</td>
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
                      <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setSelectedId(inv.id); setView('detail') }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="View">
                            <Eye size={14} />
                          </button>
                          <button onClick={() => openEdit(inv)}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Edit">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => openClone(inv)}
                            className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded" title="Clone">
                            <Copy size={14} />
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

        <PaginationControls page={page} totalPages={totalPages} total={total} label="invoice" zeroBased onPageChange={setPage} className="px-4 py-3 border-t border-gray-200 bg-gray-50" />
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
