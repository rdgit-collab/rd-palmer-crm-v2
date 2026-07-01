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
import { downloadHtmlPdf, pdfFileName } from '../../lib/downloadPdf'
import {
  Plus, Search, Pencil, Trash2, ArrowLeft, Save,
  X, ChevronLeft, ChevronRight, FileText, RefreshCw, Download, Bold, Underline, Copy
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
const PAYMENT_MILESTONE_OPTIONS = [
  'Deposit',
  'Progress Payment',
  'Final Payment',
  'Balance Payment',
  'Custom Payment',
]
const DEFAULT_QUOTATION_NOTES = 'Thank you for your interest in our product. Please feel free to contact us for further assistance.'
const DEFAULT_QUOTATION_TERMS = `Availability:
Validity: 30 days from quotation date.
Warranty: 12 months standard manufacturer warranty unless otherwise specified.
Prices quoted are EX-Work Kuala Lumpur, Malaysia unless other specified.

Please confirm your agreement to the terms and conditions stated therein by signing at the below.`
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

function salesDocumentSkuTitle(item) {
  const sku = String(item?.sku || '').trim()
  const name = String(item?.item || '').trim()
  return sku || name
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

function moneyValue(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

function roundMoney(value) {
  return Math.round(moneyValue(value) * 100) / 100
}

function paymentInvoiceLabel(type, quotationNumber) {
  const label = String(type || '').trim() || 'Partial Payment'
  return `${label} for quotation ${quotationNumber || ''}`.trim()
}

const SALES_PRINT_LINES_PER_PAGE = 34
const SALES_PRINT_DESC_CHARS = 64
const SALES_PRINT_TITLE_CHARS = 54

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

function printableLineObjects(value = '') {
  const text = cleanSalesText(value)
  if (!text) return []
  return text.split('\n').flatMap(line => wrapPrintableLine(line, SALES_PRINT_DESC_CHARS))
}

function salesDocumentItemCode(item) {
  return String(item?.sku || '').trim()
}

function salesDocumentDescriptionTitle(item) {
  return String(item?.item || item?.name || '').trim() || salesDocumentSkuTitle(item)
}

function paginateSalesDocumentItems(items, getRate, getAmount) {
  const pages = [[]]
  let usedLines = 0
  const nextPage = () => {
    if (pages[pages.length - 1].length) pages.push([])
    usedLines = 0
  }

  items.forEach((item, idx) => {
    const titleLines = wrapPrintableLine(salesDocumentDescriptionTitle(item), SALES_PRINT_TITLE_CHARS)
      .map(line => ({ ...line, title: true }))
    const lines = [...titleLines, ...printableLineObjects(item.description || '')]
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

function quotationHtml(quotation, items, contactName, customer, contactMobile = '', salesContactNumber = '') {
  const billTo = addressLines(customer)
  const notes = sanitizeHtml(quotation.notes)
  const terms = printableText(quotation.terms, { dropConfirmation: true, dropSignature: true })
  const itemPages = paginateSalesDocumentItems(items, item => item.rate, item => item.amount)
  // Keep the total + terms + signature on the same page as the last items when
  // there is room, instead of always spilling onto a near-empty extra page.
  // Reserve enough lines for the summary block (total row, terms/notes text,
  // confirmation line and signature), sized from the actual terms length.
  // Subtotal + Discount + Shipping Charges + Adjustment rows are always shown above the total.
  const breakdownRows = 4
  const summaryReserveLines = 9 + breakdownRows
    + printableLineObjects(htmlToText(notes)).length
    + printableLineObjects(htmlToText(terms)).length
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
        <strong>RD-PALMER TECHNOLOGY (M) SDN BHD</strong> <span>(Co. Reg. 200301008311)</span><br>
        No. 63, Jalan Seri Utara 1, Sri Utara Kipark, 68100 Kuala Lumpur.<br>
        Tel: +603 6250 2071 <span class="red">|</span> Email: info@rd-palmer.com <span class="red">|</span> www.rd-palmer.com
      </div>
    </div>
    <div class="document-head">
      <div class="recipient">
        <div class="label">Quote to:</div>
        <div class="recipient-lines">${billTo.map(escapeHtml).join('<br>') || escapeHtml(quotation.name || '-')}</div>
        <div class="attention-row">
          <span>Attn : ${escapeHtml(contactName || '')}</span>
          <span>${contactMobile ? `Tel: ${escapeHtml(contactMobile)}` : ''}</span>
        </div>
      </div>
      <div class="document-meta">
        <div class="document-title">QUOTATION</div>
        <div class="meta-row"><span>Quote No</span><span>:</span><strong>${escapeHtml(quotation.number || '-')}</strong></div>
        <div class="meta-row"><span>Date</span><span>:</span><span>${fmt(quotation.date)}</span></div>
        <div class="meta-row"><span>Payment Term</span><span>:</span><span>${escapeHtml(quotation.payment_term || '-')}</span></div>
        <div class="meta-row"><span>Salesperson</span><span>:</span><span>${escapeHtml(quotation.sales_person || '----')}</span></div>
        ${salesContactNumber ? `<div class="meta-row"><span>Sales Contact</span><span>:</span><span>${escapeHtml(salesContactNumber)}</span></div>` : ''}
        <div class="meta-row"><span>Page</span><span>:</span><span>${pageNumber} of ${totalPages}</span></div>
      </div>
    </div>
    <div class="opening-note">Thank you for your inquiry. We are pleased to submit our quote as follows:</div>
  `

  const subtotalVal = Number(quotation.subtotal ?? quotation.total ?? 0)
  const discountVal = Number(quotation.discount || 0)
  const shippingVal = Number(quotation.shiping_charge || 0)
  const adjustmentVal = Number(quotation.adjustment || 0)
  const discountLabel = quotation.discouttype === '%' && Number(quotation.discountvalue || 0) > 0
    ? `Discount (${quotation.discountvalue}%)`
    : 'Discount'

  const renderSummary = () => `
    <div class="totals-block">
      <div class="totals-row"><span class="t-label">Subtotal</span><span class="t-value">${fmtMoney(subtotalVal)}</span></div>
      <div class="totals-row"><span class="t-label">${escapeHtml(discountLabel)}</span><span class="t-value">&minus; ${fmtMoney(discountVal)}</span></div>
      <div class="totals-row"><span class="t-label">Shipping Charges</span><span class="t-value">+ ${fmtMoney(shippingVal)}</span></div>
      <div class="totals-row"><span class="t-label">Adjustment</span><span class="t-value">${adjustmentVal < 0 ? '&minus; ' : '+ '}${fmtMoney(Math.abs(adjustmentVal))}</span></div>
      <div class="totals-row totals-grand"><span class="t-label">Total (RM)</span><span class="t-value">${fmtMoney(quotation.total)}</span></div>
    </div>
    <div class="terms-block">
      ${notes ? `<div class="section">${notes}</div>` : ''}
      ${terms ? `<div class="section">${terms}</div>` : ''}
      <p>We confirm the order by accepting the terms &amp; conditions stated above.</p>
    </div>
    <div class="quote-signature">
      <div class="signature-rule"></div>
      <em>Signature &amp; Co. Stamp</em><br>
      Name:<br>
      Date:
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
        <thead><tr><th>#</th><th>Item Code</th><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
        <tbody>
          ${renderSalesPrintRows(page.rows)}
          ${page.summary ? '<tr class="blank-row"><td colspan="6"></td></tr>' : ''}
        </tbody>
      </table>
      ${page.summary ? renderSummary() : ''}
      <div class="page-footer">System generated document with no signature required.</div>
    </section>
  `

  return `<!doctype html>
  <html>
    <head>
      <title>${escapeHtml(quotation.number || 'Quotation')}</title>
      <style>
        @page { size: A4; margin: 0; }
        body { margin: 0; background: #e5e7eb; color: #111; font-family: Arial, sans-serif; font-size: 11px; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
        .print-document { padding: 18px 0; }
        .pdf-page { width: 210mm; height: 297mm; margin: 0 auto 18px; padding: 18mm 10mm 12mm; box-sizing: border-box; background: #fff; position: relative; page-break-after: always; overflow: hidden; }
        .pdf-page:last-child { page-break-after: auto; margin-bottom: 0; }
        .letterhead { display: grid; grid-template-columns: 62mm 1fr; align-items: start; column-gap: 10mm; min-height: 24mm; }
        .brand-logo { width: 50mm; height: auto; display: block; margin-top: 1mm; }
        .company { font-size: 12px; line-height: 1.38; }
        .company strong { font-size: 14px; letter-spacing: .2px; }
        .company span { font-size: 11px; font-weight: 400; }
        .red { color: #d40000; font-weight: 700; }
        .document-head { display: grid; grid-template-columns: 1.25fr .95fr; gap: 12mm; margin-top: 10mm; }
        .label { font-weight: 700; margin-bottom: 3mm; }
        .recipient-lines { margin-left: 8mm; line-height: 1.45; min-height: 16mm; }
        .attention-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; margin-top: 4mm; }
        .document-title { text-align: center; font-size: 21px; line-height: 1; font-weight: 700; margin-bottom: 5mm; }
        .meta-row { display: grid; grid-template-columns: 31mm 4mm 1fr; gap: 2mm; line-height: 1.5; font-size: 12px; }
        .opening-note { margin: 5mm 0 3mm 2mm; }
        .report-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; line-height: 1.38; }
        .report-table thead th { border-top: 1.4px solid #111; border-bottom: 1.2px solid #111; padding: 2mm 1.5mm; font-weight: 400; text-align: left; }
        .report-table td { padding: 1.35mm 1.5mm; vertical-align: top; }
        .report-table .no-col { width: 8mm; text-align: center; }
        .report-table .code-col { width: 30mm; }
        .report-table .description-col { width: auto; }
        .report-table .qty-col { width: 16mm; text-align: right; white-space: nowrap; }
        .report-table .price-col { width: 27mm; text-align: right; white-space: nowrap; }
        .report-table .amount-col { width: 29mm; text-align: right; white-space: nowrap; }
        .line-title { text-transform: uppercase; }
        .blank-row td { height: 5mm; border-bottom: 1.2px solid #111; }
        .summary-only .blank-row td { height: 40mm; }
        .totals-block { width: 92mm; margin: 3mm 0 0 auto; font-size: 12px; }
        .totals-row { display: grid; grid-template-columns: 1fr 34mm; gap: 5mm; padding: 0.6mm 0; align-items: baseline; }
        .totals-row .t-value { text-align: right; white-space: nowrap; }
        .totals-grand { border-top: 1px solid #111; border-bottom: 1px solid #111; padding: 1.6mm 0; margin-top: 1.2mm; font-weight: 700; }
        .terms-block { margin: 5mm 2mm 8mm; font-size: 11px; line-height: 1.25; }
        .terms-block .section { margin-bottom: 4mm; }
        .terms-block p, .terms-block div { margin-top: 0; margin-bottom: 2mm; }
        .terms-block strong, .terms-block b { font-weight: 700; }
        .terms-block u { text-underline-offset: 2px; }
        .quote-signature { margin: 14mm 2mm 0; width: 74mm; font-size: 12px; line-height: 1.6; }
        .signature-rule { border-top: 1px solid #111; margin-bottom: 1mm; }
        .page-footer { position: absolute; left: 10mm; right: 10mm; bottom: 8mm; text-align: center; font-size: 8px; color: #555; }
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

function openPrintable(html, autoPrint = false) {
  const win = window.open('', '_blank')
  if (!win) {
    alert('Please allow popups for this site to open the document.')
    return
  }
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
  const [itemResults, setItemResults] = useState([])
  const [itemLoading, setItemLoading] = useState(false)
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
    const baseRate = parseFloat(selected.price || 0)
    const rate = markedRate(baseRate, item.markup)
    const qty = item.qty || 1
    onChange(idx, {
      ...item,
      itemid: selected.id,
      item: selected.name,
      description: selected.description || '',
      base_rate: baseRate,
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
      onChange(idx, { ...item, itemid: '', item: '', description: '', markup: '', base_rate: 0, rate: 0, amount: 0 })
    }
  }

  useEffect(() => {
    const term = itemSearch.trim()
    if (!showItemOptions || term.length < 2 || selectedItem && term === catalogueItemLabel(selectedItem)) {
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

  const handleRateChange = (rate) => {
    const r = parseFloat(rate) || 0
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
    onChange(idx, {
      ...item,
      taxid: tax?.id || '',
      taxlbl: tax?.name || '',
      taxrate: tax ? parseFloat(tax.name.match(/[\d.]+/)?.[0] || 0) : 0,
    })
  }

  const inputCls = 'w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-400'
  const fieldLabelCls = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400'
  const filteredCatalogueItems = itemResults

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-gray-400">Line {idx + 1}</span>
        <button type="button" onClick={() => onRemove(idx)}
          className="text-gray-300 hover:text-red-500 transition-colors" title="Remove line item">
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
            <input type="number" min="1" step="1" className={inputCls} value={item.qty}
              onChange={e => handleQtyChange(e.target.value)} />
          </div>
          <div>
            <label className={fieldLabelCls}>Rate</label>
            <input type="number" step="1" className={inputCls} value={item.rate}
              onChange={e => handleRateChange(e.target.value)} />
          </div>
          <div>
            <label className={fieldLabelCls}>Markup %</label>
            <input type="number" min="0" step="1" className={inputCls} value={item.markup || ''}
              onChange={e => handleMarkupChange(e.target.value)} placeholder="%" />
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
  const salesUsersQuery = useAssignableUsers()
  const taxesQuery = useTaxes()
  const paymentTermsQuery = usePaymentTerms()

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
      if (quotation?.companyid) {
        const { data: currentCustomer } = await supabase
          .from('customer')
          .select(CUSTOMER_FORM_COLUMNS)
          .eq('id', quotation.companyid)
          .maybeSingle()
        if (currentCustomer) {
          setCustomers([currentCustomer])
        }
      }

      const itemIds = [...new Set((quotation?._items || []).map(item => item.itemid).filter(Boolean))]
      if (itemIds.length) {
        const { data: selectedItems } = await supabase
          .from('goodsservices')
          .select('id, sku, name, price, description')
          .in('id', itemIds)
        setCatalogueItems(selectedItems || [])
      }

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
        markup: i.markup ? String(i.markup) : null,
        itemid: i.itemid ? parseInt(i.itemid) : null,
        taxid: i.taxid ? parseInt(i.taxid) : null,
        taxlbl: i.taxlbl || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
      await supabase.from('quotation_item').insert(itemPayload)
    }
    logActivity({
      module: 'quotations',
      action: isEdit ? 'update' : 'create',
      recordTable: 'quotation',
      recordId: qid,
      recordLabel: qResult.data.number,
      summary: `${isEdit ? 'Updated' : 'Created'} quotation ${qResult.data.number}`,
      metadata: { companyid: form.companyid || null, total },
    })

    setSaving(false)
    onSave(qResult.data)
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
          <div className="divide-y divide-gray-100">
            {lineItems.map((item, idx) => (
              <LineItemRow
                key={idx} item={item} idx={idx}
                catalogueItems={catalogueItems} taxes={taxes}
                onChange={updateLine} onRemove={removeLine}
              />
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

                {/* Discount */}
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 flex-1">Discount</span>
                  <div className="flex items-center gap-1">
                    <select
                      className="border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-400"
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
  const { profile } = useAuth()
  const [quotation, setQuotation] = useState(null)
  const [items, setItems] = useState([])
  const [linkedInvoices, setLinkedInvoices] = useState([])
  const [contact, setContact] = useState(null)
  const [customer, setCustomer] = useState(null)
  const [salesContactNumber, setSalesContactNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [converting, setConverting] = useState(false)
  const [showConvertDialog, setShowConvertDialog] = useState(false)
  const [convertMode, setConvertMode] = useState('full')
  const [paymentType, setPaymentType] = useState('Deposit')
  const [paymentPercent, setPaymentPercent] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [convertError, setConvertError] = useState('')
  const [pdfDownloading, setPdfDownloading] = useState(false)

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
      const salesPhone = await resolveSalesContactNumber(q?.sales_person)
      const itemIds = [...new Set((qi || []).map(item => item.itemid).filter(Boolean))]
      let skuByItemId = {}
      if (itemIds.length > 0) {
        const { data: goodsRows } = await supabase.from('goodsservices').select('id, sku').in('id', itemIds)
        skuByItemId = Object.fromEntries((goodsRows || []).map(row => [String(row.id), row.sku || '']))
      }
      let invoices = []
      if (q?.number) {
        const { data } = await supabase
          .from('invoice')
          .select('id, invoice_number, date, total, currency, quote_ref_number')
          .eq('quote_ref_number', q.number)
          .order('id', { ascending: true })
        invoices = data || []
      }
      setQuotation(q)
      setItems((qi || []).map(item => ({ ...item, sku: skuByItemId[String(item.itemid)] || item.sku || '' })))
      setLinkedInvoices(invoices)
      setContact(contactRow)
      setCustomer(customerRow)
      setSalesContactNumber(salesPhone)
      setLoading(false)
    }
    load()
  }, [quotationId])

  const quotationTotal = roundMoney(quotation?.total)
  const invoicedTotal = roundMoney(linkedInvoices.reduce((sum, invoice) => sum + moneyValue(invoice.total), 0))
  const remainingTotal = Math.max(0, roundMoney(quotationTotal - invoicedTotal))
  const partialAmount = roundMoney(paymentAmount || (quotationTotal * (moneyValue(paymentPercent) / 100)))
  const targetInvoiceAmount = convertMode === 'full' ? remainingTotal : partialAmount
  const hasInvoiceBalance = remainingTotal > 0.009

  const openConvertDialog = () => {
    setConvertMode('full')
    setPaymentType(linkedInvoices.length > 0 ? 'Balance Payment' : 'Deposit')
    setPaymentPercent('')
    setPaymentAmount(remainingTotal ? String(remainingTotal.toFixed(2)) : '')
    setConvertError('')
    setShowConvertDialog(true)
  }

  const handleConvert = async () => {
    if (!quotation) return
    const amount = roundMoney(targetInvoiceAmount)
    if (amount <= 0) {
      setConvertError('There is no remaining amount to invoice.')
      return
    }
    if (amount - remainingTotal > 0.009) {
      setConvertError(`Invoice amount cannot be more than the remaining balance of ${quotation.currency || 'MYR'} ${fmtMoney(remainingTotal)}.`)
      return
    }
    const milestoneLabel = convertMode === 'full'
      ? (linkedInvoices.length > 0 ? 'Balance Payment' : 'Full Invoice')
      : paymentType
    const shouldCopyQuotationItems = convertMode === 'full' && linkedInvoices.length === 0
    setConverting(true)
    const [invoiceNumber, { data: tplData }] = await Promise.all([
      getNextInvoiceNumber(),
      supabase.from('app_setting').select('key, value').in('key', ['invoice_notes', 'invoice_terms']),
    ])
    const invoiceTemplate = {}
    ;(tplData || []).forEach(row => { invoiceTemplate[row.key] = row.value || '' })
    const now = new Date().toISOString()
    const invoicePayload = {
      user_id: quotation.user_id || getLegacyUserId(profile),
      companyid: quotation.companyid,
      name: quotation.name,
      invoice_number: invoiceNumber,
      order_number: quotation.reference || null,
      quote_ref_number: quotation.number,
      date: new Date().toISOString().split('T')[0],
      due_date: quotation.expiry_date || null,
      terms: quotation.payment_term,
      term_condition: invoiceTemplate.invoice_terms || DEFAULT_INVOICE_TERMS,
      sales_person: quotation.sales_person,
      contact_person: quotation.contact_person,
      currency: quotation.currency || 'MYR',
      notes: invoiceTemplate.invoice_notes || DEFAULT_INVOICE_NOTES,
      subtotal: shouldCopyQuotationItems ? quotation.subtotal : amount,
      discount: shouldCopyQuotationItems ? quotation.discount : 0,
      discouttype: shouldCopyQuotationItems ? quotation.discouttype : '%',
      discountvalue: shouldCopyQuotationItems ? quotation.discountvalue : '0',
      shiping_charge: shouldCopyQuotationItems ? quotation.shiping_charge : 0,
      tax: quotation.tax || 0,
      adjustment: shouldCopyQuotationItems ? quotation.adjustment : 0,
      total: amount,
      created_at: now,
      updated_at: now,
    }
    const { data: invoice, error: invoiceErr } = await supabase.from('invoice').insert(invoicePayload).select().single()
    if (invoiceErr) {
      alert(invoiceErr.message)
      setConverting(false)
      return
    }
    const label = paymentInvoiceLabel(milestoneLabel, quotation.number)
    const balanceAfterInvoice = Math.max(0, roundMoney(remainingTotal - amount))
    const description = `${label}${quotation.name ? `\nCustomer: ${quotation.name}` : ''}${quotation.total ? `\nQuotation total: ${quotation.currency || 'MYR'} ${fmtMoney(quotation.total)}` : ''}\nBalance after this invoice: ${quotation.currency || 'MYR'} ${fmtMoney(balanceAfterInvoice)}`
    const invoiceItems = shouldCopyQuotationItems
      ? items.map(item => ({
        user_id: item.user_id || quotation.user_id || getLegacyUserId(profile),
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
        markup: item.markup || null,
        created_at: now,
        updated_at: now,
      }))
      : [{
        user_id: quotation.user_id || getLegacyUserId(profile),
        invoiceid: invoice.id,
        item: label,
        description,
        qty: 1,
        rate: amount,
        tax: 0,
        amount,
        itemid: null,
        taxid: null,
        taxlbl: null,
        markup: null,
        created_at: now,
        updated_at: now,
      }]
    if (invoiceItems.length > 0) {
      const { error: itemErr } = await supabase.from('invoice_item').insert(invoiceItems)
      if (itemErr) {
        await supabase.from('invoice').delete().eq('id', invoice.id)
        alert(itemErr.message)
        setConverting(false)
        return
      }
    }
    const newInvoicedTotal = roundMoney(invoicedTotal + amount)
    const fullyInvoiced = newInvoicedTotal + 0.009 >= quotationTotal
    await supabase.from('quotation').update({ isconvert: fullyInvoiced ? 1 : 0 }).eq('id', quotationId)
    logActivity({
      module: 'quotations',
      action: 'convert',
      recordTable: 'quotation',
      recordId: quotationId,
      recordLabel: quotation.number,
      summary: `${fullyInvoiced ? 'Converted' : 'Partially invoiced'} quotation ${quotation.number} to invoice ${invoice.invoice_number || invoice.id}`,
      metadata: { invoice_id: invoice.id, amount, fully_invoiced: fullyInvoiced },
    })
    setConverting(false)
    setShowConvertDialog(false)
    onConverted()
  }

  if (loading) return <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Loading...</div>
  if (!quotation) return <div className="text-gray-500 text-sm p-4">Quotation not found.</div>

  const isConverted = quotation.isconvert === 1
  const isPartiallyInvoiced = !isConverted && invoicedTotal > 0
  const contactName = resolvedContactName(quotation.contact_person, contact)
  const printableHtml = () => quotationHtml(quotation, items, contactName, customer, contactPhone(contact), salesContactNumber)
  const openPreview = () => openPrintable(printableHtml())
  const downloadPdf = async () => {
    if (pdfDownloading) return
    setPdfDownloading(true)
    try {
      await downloadHtmlPdf(printableHtml(), pdfFileName(documentFileName(quotation.number, customer?.company_name || quotation.name, 'quotation')))
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
          <h1 className="text-xl font-semibold text-gray-900">{quotation.number}</h1>
          {isConverted && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">Converted to Invoice</span>
          )}
          {isPartiallyInvoiced && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 font-medium">Partially Invoiced</span>
          )}
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
          {!isConverted && (
            <>
              <button onClick={onEdit}
                className="flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap">
                <Pencil size={14} /> Edit
              </button>
              <button onClick={openConvertDialog} disabled={converting || !hasInvoiceBalance}
                className="col-span-2 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50 whitespace-nowrap sm:col-span-1">
                <RefreshCw size={14} /> {converting ? 'Converting...' : 'Convert to Invoice'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Invoice Progress */}
      <div className="bg-white rounded-lg border border-gray-200 mb-4">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Invoice Progress</h2>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="border border-gray-100 rounded p-3 bg-gray-50">
              <p className="text-xs text-gray-500">Quotation Total</p>
              <p className="text-sm font-semibold text-gray-900">{quotation.currency || 'MYR'} {fmtMoney(quotationTotal)}</p>
            </div>
            <div className="border border-gray-100 rounded p-3 bg-gray-50">
              <p className="text-xs text-gray-500">Invoiced</p>
              <p className="text-sm font-semibold text-gray-900">{quotation.currency || 'MYR'} {fmtMoney(invoicedTotal)}</p>
            </div>
            <div className="border border-gray-100 rounded p-3 bg-gray-50">
              <p className="text-xs text-gray-500">Balance</p>
              <p className="text-sm font-semibold text-gray-900">{quotation.currency || 'MYR'} {fmtMoney(remainingTotal)}</p>
            </div>
          </div>
          {linkedInvoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500">
                    <th className="py-2 pr-4 text-left font-medium">Invoice No.</th>
                    <th className="py-2 pr-4 text-left font-medium">Date</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedInvoices.map(invoice => (
                    <tr key={invoice.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-4 text-red-600 font-medium">{invoice.invoice_number || invoice.id}</td>
                      <td className="py-2 pr-4 text-gray-600">{fmt(invoice.date)}</td>
                      <td className="py-2 text-right text-gray-900 font-medium">{invoice.currency || quotation.currency || 'MYR'} {fmtMoney(invoice.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No invoice created from this quotation yet.</p>
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
                <span>Discount {quotation.discouttype === '%' ? `(${quotation.discountvalue}%)` : '(RM)'}</span>
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

      {showConvertDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-3 py-4">
          <div className="w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto bg-white rounded-lg shadow-xl">
            <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Convert Quotation to Invoice</h3>
                <p className="text-xs text-gray-500 mt-0.5">{quotation.number} · Balance {quotation.currency || 'MYR'} {fmtMoney(remainingTotal)}</p>
              </div>
              <button type="button" onClick={() => setShowConvertDialog(false)} className="p-1.5 text-gray-400 hover:text-gray-700">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setConvertMode('full'); setConvertError(''); setPaymentAmount(String(remainingTotal.toFixed(2))) }}
                  className={`border rounded px-4 py-3 text-left ${convertMode === 'full' ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <span className="block text-sm font-semibold">Full / Balance</span>
                  <span className="block text-xs text-gray-500 mt-1">Invoice the remaining quotation balance.</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setConvertMode('partial'); setPaymentAmount(''); setPaymentPercent(''); setConvertError('') }}
                  className={`border rounded px-4 py-3 text-left ${convertMode === 'partial' ? 'border-green-500 bg-green-50 text-green-800' : 'border-gray-200 hover:bg-gray-50'}`}
                >
                  <span className="block text-sm font-semibold">Partial / Progress</span>
                  <span className="block text-xs text-gray-500 mt-1">Create deposit or progress invoice.</span>
                </button>
              </div>

              {convertMode === 'partial' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Payment Type</label>
                    <select
                      value={paymentType}
                      onChange={event => setPaymentType(event.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                    >
                      {PAYMENT_MILESTONE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Percentage</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={paymentPercent}
                        onChange={event => {
                          const next = event.target.value
                          setPaymentPercent(next)
                          const percentAmount = quotationTotal * (moneyValue(next) / 100)
                          setPaymentAmount(next ? String(roundMoney(percentAmount).toFixed(2)) : '')
                          setConvertError('')
                        }}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                        placeholder="e.g. 30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={paymentAmount}
                        onChange={event => { setPaymentAmount(event.target.value); setPaymentPercent(''); setConvertError('') }}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Quotation Total</span>
                  <span>{quotation.currency || 'MYR'} {fmtMoney(quotationTotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600 mt-1">
                  <span>Already Invoiced</span>
                  <span>{quotation.currency || 'MYR'} {fmtMoney(invoicedTotal)}</span>
                </div>
                <div className="flex justify-between text-gray-900 font-semibold mt-2 pt-2 border-t border-gray-200">
                  <span>This Invoice</span>
                  <span>{quotation.currency || 'MYR'} {fmtMoney(targetInvoiceAmount)}</span>
                </div>
              </div>

              {convertError && <p className="text-sm text-red-600">{convertError}</p>}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConvertDialog(false)}
                className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConvert}
                disabled={converting || targetInvoiceAmount <= 0}
                className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {converting ? 'Creating Invoice...' : 'Create Invoice'}
              </button>
            </div>
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
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState(null)

  const fetchQuotations = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('search_quotations', {
        p_search: submittedSearch.trim(),
        p_current_user_id: getLegacyUserId(profile) || null,
        p_restricted: isSalesRole(profile?.role_id),
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      })
      if (error) throw error
      const result = Array.isArray(data) ? data[0] : data
      setQuotations(Array.isArray(result?.rows) ? result.rows : [])
      setTotal(Number(result?.total_count || 0))
    } catch (error) {
      setQuotations([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [submittedSearch, page, profile])

  useEffect(() => { fetchQuotations() }, [fetchQuotations])
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
    await supabase.from('quotation_item').delete().eq('qid', id)
    await supabase.from('quotation').delete().eq('id', id)
    logActivity({
      module: 'quotations',
      action: 'delete',
      recordTable: 'quotation',
      recordId: id,
      summary: `Deleted quotation #${id}`,
    })
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Manage Quotations</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} quotation{total !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={() => { setEditQuotation(null); setView('form') }}
          className="flex w-full items-center justify-center gap-2 px-4 py-2 bg-[#CC0000] text-white rounded text-sm hover:bg-red-700 sm:w-auto">
          <Plus size={16} /> New Quotation
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
            placeholder="Search by customer or quotation number..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') runSearch() }} />
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

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Quot. No.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Sales</th>
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
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">Loading...</td></tr>
              ) : quotations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">
                    {search ? 'No quotations match your search.' : 'No quotations yet. Click "New Quotation" to get started.'}
                  </td>
                </tr>
              ) : (
                quotations.map(q => (
                  <tr
                    key={q.id}
                    onClick={() => { setSelectedId(q.id); setView('detail') }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedId(q.id)
                        setView('detail')
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`View quotation ${q.number || ''}`}
                    className="hover:bg-gray-50 focus:bg-gray-50 focus:outline-none cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 text-[#CC0000] font-medium text-sm">
                        <FileText size={13} />
                        {q.number}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-800 text-xs">{q.name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{q.sales_person || '—'}</td>
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
                    <td
                      className="px-4 py-3"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
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
