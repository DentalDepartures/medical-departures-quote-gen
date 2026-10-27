// Reads the text layer of a clinic's PDF quote in the browser, so it can go through the same
// AI extraction as pasted text. pdf.js is loaded only when a PDF is chosen.

export interface PdfText {
  text: string
  pages: number
}

export async function readPdfText(file: File): Promise<PdfText> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    let line = ''
    const lines: string[] = []
    for (const item of content.items) {
      if (!('str' in item)) continue
      line += item.str
      if (item.hasEOL) { lines.push(line); line = '' } else if (item.str && !item.str.endsWith(' ')) line += ' '
    }
    if (line.trim()) lines.push(line)
    // Drop empty lines and lone page furniture such as tooth-chart numbers
    const kept = lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l && !/^\d{1,2}$/.test(l))
    if (kept.length) pages.push(`--- Page ${n} ---\n${kept.join('\n')}`)
  }
  await doc.destroy()
  return { text: pages.join('\n\n'), pages: doc.numPages }
}
