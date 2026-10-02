// Browser-side image preparation for the PDF overlay.
// Loads an image through the same-origin proxy, cover-fits it into a box and rounds the corners,
// returning PNG bytes (transparent corners) ready for pdf-lib's embedPng.

const SCALE = 2 // raster pixels per PDF point — crisp on screen and print without huge files

export function proxiedUrl(url: string): string {
  return `/api/fetch-file?url=${encodeURIComponent(url)}`
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) {
    let msg = res.statusText
    try { msg = ((await res.json()) as { error?: string }).error ?? msg } catch { /* not json */ }
    throw new Error(`Failed to fetch ${url}: ${msg}`)
  }
  return new Uint8Array(await res.arrayBuffer())
}

export async function prepareImage(url: string, wPt: number, hPt: number, radiusPt: number): Promise<Uint8Array | null> {
  const res = await fetch(proxiedUrl(url))
  if (!res.ok) return null
  const blob = await res.blob()
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    return null
  }

  const w = Math.round(wPt * SCALE)
  const h = Math.round(hPt * SCALE)
  const r = radiusPt * SCALE
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // Rounded-rect clip
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(w - r, 0)
  ctx.quadraticCurveTo(w, 0, w, r)
  ctx.lineTo(w, h - r)
  ctx.quadraticCurveTo(w, h, w - r, h)
  ctx.lineTo(r, h)
  ctx.quadraticCurveTo(0, h, 0, h - r)
  ctx.lineTo(0, r)
  ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.closePath()
  ctx.clip()

  // Cover fit, centred
  const scale = Math.max(w / bitmap.width, h / bitmap.height)
  const dw = bitmap.width * scale
  const dh = bitmap.height * scale
  ctx.drawImage(bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh)
  bitmap.close()

  const png: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!png) return null
  return new Uint8Array(await png.arrayBuffer())
}
