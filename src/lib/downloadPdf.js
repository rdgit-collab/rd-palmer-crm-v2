export function pdfFileName(value = 'document') {
  const safe = String(value || 'document')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
  return `${safe || 'document'}.pdf`
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

    const pdfStyle = doc.createElement('style')
    pdfStyle.textContent = `
      @media screen {
        body { background: #fff !important; }
        .sheet {
          width: 794px !important;
          min-height: 1123px !important;
          margin: 0 auto !important;
          padding: 76px 57px !important;
          box-sizing: border-box !important;
        }
        .top {
          display: flex !important;
          align-items: flex-start !important;
          justify-content: space-between !important;
          gap: 24px !important;
          margin-bottom: 20px !important;
        }
        .brand-logo {
          width: 175px !important;
          max-width: 175px !important;
          flex: 0 0 175px !important;
        }
        .company {
          flex: 1 1 auto !important;
          text-align: right !important;
        }
        .intro {
          display: flex !important;
          align-items: flex-start !important;
          justify-content: space-between !important;
          gap: 28px !important;
        }
        .intro > div:first-child {
          flex: 1 1 auto !important;
          min-width: 0 !important;
        }
        .intro > div:last-child {
          flex: 0 0 270px !important;
          min-width: 270px !important;
        }
        .doc-title { text-align: right !important; }
        .meta {
          width: 230px !important;
          margin-left: auto !important;
        }
        .meta-row {
          display: flex !important;
          justify-content: space-between !important;
          gap: 8px !important;
        }
        .meta-row span:first-child {
          flex: 0 0 90px !important;
        }
        .meta-row .value {
          flex: 1 1 auto !important;
          text-align: right !important;
        }
        .below-table {
          display: flex !important;
          align-items: flex-start !important;
          gap: 28px !important;
        }
        .below-table > div:first-child {
          flex: 1 1 auto !important;
          min-width: 0 !important;
        }
        .totals {
          flex: 0 0 250px !important;
          width: 250px !important;
          margin-left: auto !important;
        }
        .text-column {
          width: calc(100% - 278px) !important;
        }
        .document-signature {
          display: flex !important;
          gap: 48px !important;
          align-items: flex-start !important;
        }
        .signature-line {
          flex: 0 0 270px !important;
        }
      }
    `
    doc.head.appendChild(pdfStyle)

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
