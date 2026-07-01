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
      margin-bottom: 7px !important;
    }
    .desc {
      display: block !important;
      padding-bottom: 8px !important;
    }
    .section {
      padding-bottom: 10px !important;
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

    // Modern sales documents (quotations/invoices) ship explicit A4 `.pdf-page`
    // sections with their own self-contained CSS that already matches the
    // reference layout. The legacy `applyPdfLayout` overrides target a different
    // `.sheet` template and would shrink the company header/meta rows, resize
    // table text and force bold headers — making the downloaded PDF diverge from
    // the on-screen preview. Only apply it for the legacy `.sheet` layout.
    const usesExplicitPages = doc.querySelectorAll('.pdf-page').length > 0
    if (!usesExplicitPages) applyPdfLayout(doc)

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
    const explicitPages = Array.from(doc.querySelectorAll('.pdf-page'))
    if (explicitPages.length) {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      for (let index = 0; index < explicitPages.length; index += 1) {
        const page = explicitPages[index]
        const canvas = await html2canvas(page, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          windowWidth: renderWidth,
        })
        if (index > 0) pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, 210, 297)
      }
      pdf.save(filename)
      return
    }

    const canvas = await html2canvas(sheet, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: renderWidth,
    })

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pageWidth = 210
    const pageHeight = 297
    const continuationMarginTop = 15
    const continuationMarginBottom = 15
    const imageHeight = (canvas.height * pageWidth) / canvas.width
    const fittedHeight = imageHeight > pageHeight && imageHeight <= pageHeight * 1.08 ? pageHeight : imageHeight
    const pxPerMm = canvas.width / pageWidth
    const canvasContext = canvas.getContext('2d')
    const canvasPixels = canvasContext.getImageData(0, 0, canvas.width, canvas.height).data

    const isMostlyBlankRow = (y) => {
      const row = Math.max(0, Math.min(canvas.height - 1, Math.round(y)))
      let samples = 0
      let ink = 0
      for (let x = 0; x < canvas.width; x += 8) {
        const index = ((row * canvas.width) + x) * 4
        const r = canvasPixels[index]
        const g = canvasPixels[index + 1]
        const b = canvasPixels[index + 2]
        const a = canvasPixels[index + 3]
        samples += 1
        if (a > 10 && (r < 245 || g < 245 || b < 245)) ink += 1
      }
      return ink / samples < 0.003
    }

    const findPageBreak = (targetY, minY, maxY) => {
      const low = Math.max(1, Math.floor(minY))
      const high = Math.min(canvas.height - 1, Math.ceil(maxY))
      const target = Math.max(low, Math.min(high, Math.round(targetY)))
      for (let offset = 0; offset <= Math.max(target - low, high - target); offset += 2) {
        const before = target - offset
        if (before >= low && isMostlyBlankRow(before) && isMostlyBlankRow(before - 3) && isMostlyBlankRow(before + 3)) return before
        const after = target + offset
        if (after <= high && isMostlyBlankRow(after) && isMostlyBlankRow(after - 3) && isMostlyBlankRow(after + 3)) return after
      }
      return target
    }

    const addCanvasSlice = (sourceY, sourceHeight, targetY = 0) => {
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = sourceHeight
      const context = slice.getContext('2d')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, slice.width, slice.height)
      context.drawImage(canvas, 0, sourceY, canvas.width, sourceHeight, 0, 0, slice.width, slice.height)
      const sliceHeightMm = sourceHeight / pxPerMm
      pdf.addImage(slice.toDataURL('image/jpeg', 0.98), 'JPEG', 0, targetY, pageWidth, sliceHeightMm)
    }

    if (fittedHeight <= pageHeight) {
      addCanvasSlice(0, canvas.height)
    } else {
      const firstTargetPx = Math.floor((pageHeight - 10) * pxPerMm)
      const firstPageHeightPx = Math.min(
        canvas.height,
        findPageBreak(firstTargetPx, firstTargetPx - Math.floor(18 * pxPerMm), firstTargetPx + Math.floor(4 * pxPerMm))
      )
      const continuationHeightPx = Math.floor((pageHeight - continuationMarginTop - continuationMarginBottom) * pxPerMm)
      addCanvasSlice(0, firstPageHeightPx)

      let sourceY = firstPageHeightPx
      while (sourceY < canvas.height) {
        pdf.addPage()
        const targetBreak = sourceY + continuationHeightPx
        const nextBreak = targetBreak < canvas.height
          ? findPageBreak(targetBreak, targetBreak - Math.floor(18 * pxPerMm), targetBreak + Math.floor(4 * pxPerMm))
          : canvas.height
        const sourceHeight = Math.min(nextBreak - sourceY, canvas.height - sourceY)
        addCanvasSlice(sourceY, sourceHeight, continuationMarginTop)
        sourceY += sourceHeight
      }
    }

    pdf.save(filename)
  } finally {
    iframe.remove()
  }
}
