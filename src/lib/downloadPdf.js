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
  const fontStyle = doc.createElement('style')
  fontStyle.textContent = `
    .sheet,
    .sheet * {
      font-family: Arial, sans-serif !important;
      font-synthesis: none;
      -webkit-font-smoothing: antialiased;
      text-rendering: geometricPrecision;
    }
    .sheet {
      font-size: 11px !important;
      font-weight: 400 !important;
      line-height: 1.35 !important;
    }
    .company,
    .company * {
      font-size: 10px !important;
      line-height: 1.3 !important;
    }
    .company strong {
      font-size: 10.5px !important;
      font-weight: 700 !important;
    }
    .doc-title {
      font-size: 20px !important;
      line-height: 1.2 !important;
      font-weight: 700 !important;
    }
    .bill-title,
    .bill-lines,
    .meta-row,
    .meta-row *,
    table,
    th,
    td,
    .desc,
    .totals,
    .totals *,
    .section,
    .section *,
    .signature-line,
    .signature-line * {
      font-size: 11px !important;
      line-height: 1.35 !important;
    }
    th,
    strong,
    .meta-row .value,
    .section h2,
    .section h2 *,
    .total,
    .total * {
      font-weight: 700 !important;
    }
    .section p,
    .section div {
      margin-top: 0 !important;
      margin-bottom: 4px !important;
    }
  `
  doc.head.appendChild(fontStyle)

  applyStyle(doc.body, {
    background: '#fff',
  })

  const sheet = doc.querySelector('.sheet')
  applyStyle(sheet, {
    minHeight: '0',
  })

  const signature = doc.querySelector('.document-signature')
  applyStyle(signature, {
    breakInside: 'auto',
    pageBreakInside: 'auto',
  })
  doc.querySelectorAll('.signature-line').forEach(line => {
    applyStyle(line, {
      borderTop: '1px dotted #111',
      paddingTop: '10px',
      fontStyle: 'italic',
      minHeight: '64px',
      lineHeight: '1.45',
      breakInside: 'auto',
      pageBreakInside: 'auto',
    })
  })
}

export async function downloadHtmlPdf(html, filename) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])
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
    const canvas = await html2canvas(sheet, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: renderWidth,
    })

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pageWidth = 210
    const pageHeight = 297
    const imageData = canvas.toDataURL('image/jpeg', 0.98)
    const imageHeight = (canvas.height * pageWidth) / canvas.width
    const fittedHeight = imageHeight > pageHeight && imageHeight <= pageHeight * 1.08 ? pageHeight : imageHeight

    if (fittedHeight <= pageHeight) {
      pdf.addImage(imageData, 'JPEG', 0, 0, pageWidth, fittedHeight)
    } else {
      let remainingHeight = fittedHeight
      let position = 0
      pdf.addImage(imageData, 'JPEG', 0, position, pageWidth, fittedHeight)
      remainingHeight -= pageHeight
      while (remainingHeight > 0) {
        position -= pageHeight
        pdf.addPage()
        pdf.addImage(imageData, 'JPEG', 0, position, pageWidth, fittedHeight)
        remainingHeight -= pageHeight
      }
    }

    pdf.save(filename)
  } finally {
    iframe.remove()
  }
}
