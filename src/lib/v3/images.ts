// Photos for the v3 quote, prepared in the browser as PNG data URLs already cut to their shape
// (the curved page-1 hero, circles, rounded boxes). A missing or broken photo becomes a brand-colour
// panel of the same shape — never a grey box or an error on the quote.

import { proxiedUrl } from '../imagePrep'

const SCALE = 2.2 // raster pixels per PDF point

export type Shape = 'hero' | 'circle' | 'rounded'

async function loadBitmap(url: string | null | undefined): Promise<ImageBitmap | null> {
  if (!url) return null
  try {
    // Files shipped with the app (e.g. agent photos) load directly; Drive and DD/MD photos go through the proxy
    const res = await fetch(/^https?:/i.test(url) ? proxiedUrl(url) : url)
    if (!res.ok) return null
    return await createImageBitmap(await res.blob())
  } catch {
    return null
  }
}

function clipShape(ctx: CanvasRenderingContext2D, shape: Shape, w: number, h: number, r: number) {
  ctx.beginPath()
  if (shape === 'hero') {
    // Ellipse centred on the top-right corner: the photo curves away towards the bottom-left
    ctx.ellipse(w, 0, w, h, 0, 0, Math.PI * 2)
  } else if (shape === 'circle') {
    ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2)
  } else {
    ctx.roundRect(0, 0, w, h, r)
  }
  ctx.closePath()
  ctx.clip()
}

/**
 * Returns a PNG data URL of `url` cover-fitted into wPt × hPt and cut to `shape`.
 * Without a usable photo, fills the shape with a gradient in the brand colours.
 */
export async function shapedImage(
  url: string | null | undefined,
  wPt: number,
  hPt: number,
  shape: Shape,
  colors: { light: string; dark: string },
  radiusPt = 0,
): Promise<{ src: string; isPhoto: boolean }> {
  const w = Math.round(wPt * SCALE)
  const h = Math.round(hPt * SCALE)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  clipShape(ctx, shape, w, h, radiusPt * SCALE)

  const bitmap = await loadBitmap(url)
  if (bitmap) {
    const scale = Math.max(w / bitmap.width, h / bitmap.height)
    const dw = bitmap.width * scale
    const dh = bitmap.height * scale
    // Faces and buildings sit in the upper part of most photos, so crop from a little above centre
    ctx.drawImage(bitmap, (w - dw) / 2, (h - dh) * 0.35, dw, dh)
    bitmap.close()
  } else {
    const g = ctx.createLinearGradient(w, 0, 0, h)
    g.addColorStop(0, colors.light)
    g.addColorStop(0.8, colors.dark)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  return { src: canvas.toDataURL('image/png'), isPhoto: !!bitmap }
}
