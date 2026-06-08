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
