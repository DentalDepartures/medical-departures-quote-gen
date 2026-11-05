// Photos and scanned pages of a clinic quote, shrunk in the browser to the size the AI reads anyway
// (long edge 1568 px) so uploads stay small. The server then writes out their text.

export interface QuoteImage {
  mediaType: string
  data: string // base64, no data: prefix
}

const MAX_EDGE = 1568

function canvasToImage(canvas: HTMLCanvasElement): QuoteImage {
  return { mediaType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1] }
}

/** A JPEG/PNG/WebP photo → JPEG within MAX_EDGE. Fails for formats the browser can't open (e.g. iPhone HEIC). */
export async function photoToQuoteImage(file: File): Promise<QuoteImage> {
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file)
  } catch {
    throw new Error(`“${file.name}” can't be opened here — save it as JPEG or PNG and try again`)
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff' // transparent PNGs get a white page, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return canvasToImage(canvas)
}

/** The pages of a scanned PDF (no text layer) drawn as images, first `maxPages` pages only. */
export async function pdfPagesToQuoteImages(file: File, maxPages = 6): Promise<{ images: QuoteImage[]; pages: number }> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const images: QuoteImage[] = []
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
    const page = await doc.getPage(n)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: MAX_EDGE / Math.max(base.width, base.height) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // 'print' draws in one go; the default display mode waits on animation frames, which stall in a background tab
    await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise
    images.push(canvasToImage(canvas))
  }
  const pages = doc.numPages
  await doc.destroy()
  return { images, pages }
}
