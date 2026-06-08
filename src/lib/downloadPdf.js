export function pdfFileName(value = 'document') {
  const safe = String(value || 'document')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
  return `${safe || 'document'}.pdf`
}

function applyStyle(element, styles) {
  if (!element) return
  Object.assign(element.style, styles)
}

function applyPdfLayout(doc) {
  applyStyle(doc.body, {
    background: '#fff',
    fontFamily: 'Arial, sans-serif',
    fontSize: '11px',
    margin: '0',
  })

  const sheet = doc.querySelector('.sheet')
  applyStyle(sheet, {
    width: '794px',
    minHeight: '1123px',
    margin: '0 auto',
    padding: '76px 57px',
    boxSizing: 'border-box',
    background: '#fff',
  })

  const top = doc.querySelector('.top')
  applyStyle(top, {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '24px',
    paddingTop: '8px',
    marginBottom: '20px',
  })

  applyStyle(doc.querySelector('.brand-logo'), {
    display: 'block',
    width: '175px',
    maxWidth: '175px',
    height: 'auto',
    flex: '0 0 175px',
    marginTop: '0',
  })

  applyStyle(doc.querySelector('.company'), {
    flex: '1 1 auto',
    textAlign: 'right',
    lineHeight: '1.35',
    fontSize: '11px',
  })

  const intro = doc.querySelector('.intro')
  applyStyle(intro, {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '28px',
    marginBottom: '12px',
  })
  applyStyle(intro?.children?.[0], {
    flex: '1 1 auto',
    minWidth: '0',
  })
  applyStyle(intro?.children?.[1], {
    flex: '0 0 270px',
    minWidth: '270px',
  })

  applyStyle(doc.querySelector('.doc-title'), {
    textAlign: 'right',
    fontSize: '20px',
    fontWeight: '700',
    margin: '8px 0 10px',
  })
  applyStyle(doc.querySelector('.meta'), {
    width: '230px',
    marginLeft: 'auto',
  })
  doc.querySelectorAll('.meta-row').forEach(row => {
    applyStyle(row, {
      display: 'flex',
      justifyContent: 'space-between',
      gap: '8px',
      lineHeight: '1.35',
    })
    applyStyle(row.children?.[0], { flex: '0 0 90px' })
    applyStyle(row.querySelector('.value'), {
      flex: '1 1 auto',
      textAlign: 'right',
      fontWeight: '600',
    })
  })

  doc.querySelectorAll('table').forEach(table => {
    applyStyle(table, {
      width: '100%',
      tableLayout: 'fixed',
      borderCollapse: 'separate',
      borderSpacing: '0',
      margin: '18px 0 0',
      border: '1px solid #222',
      overflow: 'hidden',
      fontSize: '11px',
    })
  })
  doc.querySelectorAll('th').forEach(th => {
    applyStyle(th, {
      padding: '7px 8px',
      textAlign: 'left',
      verticalAlign: 'top',
      borderBottom: '1px solid #e5e5e5',
      background: '#d4d4d4',
      color: '#111',
      fontWeight: '700',
    })
  })
  doc.querySelectorAll('td').forEach(td => {
    applyStyle(td, {
      padding: '7px 8px',
      textAlign: 'left',
      verticalAlign: 'top',
      borderBottom: '1px solid #e5e5e5',
    })
  })
  doc.querySelectorAll('tr > :nth-child(1)').forEach(cell => applyStyle(cell, { width: '28px', textAlign: 'center' }))
  doc.querySelectorAll('tr > :nth-child(2)').forEach(cell => applyStyle(cell, { width: 'auto', overflowWrap: 'anywhere' }))
  doc.querySelectorAll('tr > :nth-child(3)').forEach(cell => applyStyle(cell, { width: '42px', textAlign: 'right', whiteSpace: 'nowrap' }))
  doc.querySelectorAll('tr > :nth-child(4)').forEach(cell => applyStyle(cell, { width: '74px', textAlign: 'right', whiteSpace: 'nowrap' }))
  doc.querySelectorAll('tr > :nth-child(5)').forEach(cell => applyStyle(cell, { width: '50px', textAlign: 'right', whiteSpace: 'nowrap' }))
  doc.querySelectorAll('tr > :nth-child(6)').forEach(cell => applyStyle(cell, { width: '86px', textAlign: 'right', whiteSpace: 'nowrap' }))

  const belowTable = doc.querySelector('.below-table')
  applyStyle(belowTable, {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '28px',
    marginTop: '6px',
  })
  applyStyle(belowTable?.children?.[0], {
    flex: '1 1 auto',
    minWidth: '0',
  })
  applyStyle(doc.querySelector('.totals'), {
    flex: '0 0 250px',
    width: '250px',
    marginLeft: 'auto',
    borderTop: '1px solid #aaa',
    paddingTop: '8px',
  })
  doc.querySelectorAll('.totals div').forEach(row => {
    applyStyle(row, {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '4px 0',
    })
  })
  applyStyle(doc.querySelector('.total'), {
    borderTop: '1px solid #111',
    marginTop: '4px',
    fontWeight: '700',
    fontSize: '13px',
  })

  applyStyle(doc.querySelector('.text-column'), {
    width: 'calc(100% - 278px)',
  })
  doc.querySelectorAll('.section, .section *').forEach(node => {
    applyStyle(node, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '11px',
      lineHeight: '1.35',
    })
  })

  const signature = doc.querySelector('.document-signature')
  applyStyle(signature, {
    display: 'flex',
    gap: '48px',
    alignItems: 'flex-start',
    marginTop: '28px',
  })
  doc.querySelectorAll('.signature-line').forEach(line => {
    applyStyle(line, {
      flex: '0 0 270px',
      borderTop: '1px dotted #111',
      paddingTop: '10px',
      fontStyle: 'italic',
      minHeight: '64px',
      lineHeight: '1.45',
    })
  })
}

export async function downloadHtmlPdf(html, filename) {
  const { default: html2pdf } = await import('html2pdf.js')
  const renderWidth = 1024
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-10000px'
  iframe.style.top = '0'
  iframe.style.width = `${renderWidth}px`
  iframe.style.height = '1400px'
  iframe.style.opacity = '0'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)

  try {
    const doc = iframe.contentDocument
    if (!doc) throw new Error('Unable to prepare PDF document.')
    doc.open()
    doc.write(html)
    doc.close()

    applyPdfLayout(doc)

    await new Promise(resolve => {
      if (iframe.contentWindow?.document?.readyState === 'complete') resolve()
      else iframe.onload = resolve
    })

    const images = Array.from(doc.images || [])
    await Promise.all(images.map(img => {
      if (img.complete) return Promise.resolve()
      return new Promise(resolve => {
        img.onload = resolve
        img.onerror = resolve
      })
    }))

    const sheet = doc.querySelector('.sheet') || doc.body
    await html2pdf()
      .set({
        filename,
        margin: 0,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          windowWidth: renderWidth,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      })
      .from(sheet)
      .save()
  } finally {
    iframe.remove()
  }
}
