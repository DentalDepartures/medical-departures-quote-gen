import { PDFDocument, PDFString, rgb, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { QuoteData, AgentProfile, Brand } from '../types'
import { NO_DOCTOR } from '../types'

// ── Colors ────────────────────────────────────────────────────────────────────
const WHITE = rgb(1, 1, 1)
const DARK  = rgb(0.22, 0.22, 0.22)                 // #383838
const GRAY  = rgb(88 / 255, 88 / 255, 89 / 255)     // #585859 — agent subtext
const BLACK = rgb(0, 0, 0)
const CARD  = rgb(228 / 255, 228 / 255, 228 / 255)  // #e4e4e4 — doctor card

const BRAND = {
  DD: { accent: rgb(82 / 255, 189 / 255, 236 / 255), title: rgb(229 / 255, 27 / 255, 36 / 255) },  // header #52bdec, procedure title red
  MD: { accent: rgb(229 / 255, 27 / 255, 36 / 255),  title: rgb(229 / 255, 27 / 255, 36 / 255) },  // header #e51b24
} as const

// ── Coordinate map ────────────────────────────────────────────────────────────
// Both brand templates share one layout (Canva page 794×1123 px → 595.5×842.25 pt, ×0.75).
// The exported PDF's media box starts at y = 7.83, so the page TOP is at y = 850.08.
// `T(px)` converts a Canva element's `top` (px) to the PDF y of that element's top edge.
const PAGE_TOP = 850.08
const PX = 0.75
const T = (px: number) => PAGE_TOP - px * PX

export const COORD = {
  // Header (both pages)
  clinicName: { x: 34.6, top: T(21.9), maxWidth: 222, size: 22, minSize: 13, lineH: 1.2 },
  location:   { x: 34.6, top: T(99.8), maxWidth: 210, size: 10.5 },
  headerCover: { x: 20, y: T(136), w: 280, h: PAGE_TOP - T(136) },   // only used over legacy templates
  // Right-hand photo (page 1 = clinic photo, page 2 = before/after photo)
  photo: { x: 425.1 * PX, top: T(-7), w: 381.65 * PX, h: 344.2 * PX, radius: 22 },
  // Page 1 body (baselines, from the May 2026 calibration)
  procedureName: { x: 29.8, startY: 701.7, lineH: 24, maxWidth: 224, size: 20.5, bottomY: 668 },
  price:         { x: 47.2, y: 610.2, maxWidth: 215, size: 20.5 },  // banner inner width — box ends at x≈277
  patientName:   { x: 130.1, y: 567.7, size: 12 },
  quoteDate:     { x: 130.1, y: 546.1, size: 10 },
  inclusions:    { checkX: 32.8, textX: 43.1, startY: 490.7, lineH: 15, maxWidth: 252, size: 11, stopY: 200 },
  exclusions:    { iconX: 307.2, textX: 318.2, startY: 490.0, lineH: 15, maxWidth: 237, size: 11, stopY: 386 }, // stop above IMPORTANT NOTES (heading top ≈ 382)
  notes:         { textX: 307.2, startY: 351.7, lineH: 12, maxWidth: 248, size: 10, stopY: 45 },
  // Page 2
  procedureName2: { x: 29.8, startY: 705.7, lineH: 24, maxWidth: 224, size: 20.5, bottomY: 668 },
  doctorCard:  { x: -37.55 * PX, top: T(451.2), w: 462.65 * PX, h: 118.8 * PX },
  doctorPhoto: { x: 311.9 * PX, top: T(464.5), size: 92.2 * PX, radius: 16 },
  doctorName:  { x: 33.3, top: T(496.6), maxWidth: 189, size: 10 },
  doctorCreds: { x: 33.3, top: T(518.8), maxWidth: 189, size: 9.5, lineH: 11.5, maxLines: 3 },
  agentName:   { x: 34.6, y: 338.0, size: 10 },
  agentEmail:  { x: 50.3, y: 323.0, size: 9 },
  agentPhone:  { x: 50.3, y: 308.3, size: 9 },
  // "View Clinic Page" button: Canva (425.1, 618.4, 323.5×37.6) px
  clinicLinkRect: [318, 357, 562, 387] as const,
} as const

// ── Dependencies the generator needs from its host (browser or Node test) ────
export interface OverlayDeps {
  /** Raw bytes of a same-origin asset or a proxied URL. */
  fetchBytes: (url: string) => Promise<Uint8Array>
  /**
   * Returns a PNG (with transparent rounded corners) of the image at `url`, cover-fitted to w×h points,
   * or null when the image cannot be loaded. `url` is a Drive link or a DD/MD image URL.
   */
  prepareImage: (url: string, wPt: number, hPt: number, radiusPt: number) => Promise<Uint8Array | null>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapText(text: string, widthOf: (s: string) => number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (widthOf(candidate) <= maxWidth) {
      line = candidate
    } else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function autoFitSize(text: string, widthOf: (t: string, s: number) => number, startSize: number, maxWidth: number, minSize = 10): number {
  let size = startSize
  while (size > minSize && widthOf(text, size) > maxWidth) size -= 0.5
  return size
}

/** Largest size (≥ minSize) at which `text` wraps into ≤ maxLines within maxWidth. */
function fitLines(
  text: string, widthOf: (t: string, s: number) => number,
  size: number, minSize: number, maxWidth: number, maxLines: number,
): { size: number; lines: string[] } {
  let s = size
  while (s >= minSize) {
    const lines = wrapText(text, (t) => widthOf(t, s), maxWidth)
    if (lines.length <= maxLines) return { size: s, lines }
    s -= 0.5
  }
  const lines = wrapText(text, (t) => widthOf(t, minSize), maxWidth).slice(0, maxLines)
  return { size: minSize, lines }
}

function fitProcedureName(
  text: string, widthOf: (s: string, sz: number) => number,
  cfg: { size: number; maxWidth: number; lineH: number; startY: number; bottomY: number }, minSize = 8,
): { size: number; lines: string[]; lineH: number } {
  const available = cfg.startY - cfg.bottomY
  let size = cfg.size
  while (size >= minSize) {
    const lines = wrapText(text, (s) => widthOf(s, size), cfg.maxWidth)
    const lh = cfg.lineH * (size / cfg.size)
    if (lines.length * lh <= available) return { size, lines, lineH: lh }
    size -= 0.5
  }
  const lines = wrapText(text, (s) => widthOf(s, minSize), cfg.maxWidth)
  return { size: minSize, lines, lineH: cfg.lineH * (minSize / cfg.size) }
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function makeQuoteId(brand: Brand, date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let rand = ''
  const buf = new Uint8Array(4)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(buf)
  else for (let i = 0; i < 4; i++) buf[i] = Math.floor(Math.random() * 256)
  for (let i = 0; i < 4; i++) rand += alphabet[buf[i] % alphabet.length]
  return `${brand}-${y}${m}${d}-${rand}`
}

/** Adds UTM parameters so a click from the PDF can be attributed in GA. */
export function withUtm(url: string, brand: Brand, quoteId: string, clinicName: string | null): string {
  try {
    const u = new URL(url)
    u.searchParams.set('utm_source', 'quote')
    u.searchParams.set('utm_medium', 'pdf')
    u.searchParams.set('utm_campaign', `${brand.toLowerCase()}_quote`)
    const slug = u.pathname.split('/').filter(Boolean).pop() || slugify(clinicName || 'clinic')
    u.searchParams.set('utm_content', slug)
    u.searchParams.set('utm_term', quoteId)
    return u.toString()
  } catch {
    return url
  }
}

function templatePath(brand: Brand, hasDoctor: boolean): string {
  return `/templates/${brand.toLowerCase()}_${hasDoctor ? 'doctor' : 'nodoctor'}.pdf`
}

function hasDoctor(quote: QuoteData): boolean {
  const n = (quote.surgeonName ?? '').trim()
  return n !== '' && n.toLowerCase() !== NO_DOCTOR.toLowerCase()
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateQuotePDFBytes(
  quote: QuoteData,
  agent: AgentProfile,
  brand: Brand,
  deps: OverlayDeps,
): Promise<{ pdfBytes: Uint8Array; filename: string; quoteId: string }> {
  const quoteId = quote.quoteId ?? makeQuoteId(brand)
  const doctor = hasDoctor(quote)
  const legacyTemplate = !!(quote.templatePdfUrl && quote.templatePdfUrl.trim())
  const colors = BRAND[brand]
  const c = COORD

  const [templateBytes, boldBytes, regularBytes, checkBytes, xBytes, brandBytes] = await Promise.all([
    legacyTemplate
      ? deps.fetchBytes(`/api/fetch-file?url=${encodeURIComponent(quote.templatePdfUrl!.trim())}`)
      : deps.fetchBytes(templatePath(brand, doctor)),
    deps.fetchBytes('/fonts/Montserrat-Bold.ttf'),
    deps.fetchBytes('/fonts/Montserrat-Regular.ttf'),
    deps.fetchBytes('/check.png'),
    deps.fetchBytes('/X.png'),
    // Old per-clinic templates differ from the brand layout in places; regions are patched from the brand template.
    legacyTemplate ? deps.fetchBytes(templatePath(brand, doctor)) : Promise.resolve(null),
  ])

  // Images are optional — a missing or broken image never blocks the quote.
  const [clinicImg, beforeAfterImg, doctorImg] = await Promise.all([
    quote.clinicImageUrl ? deps.prepareImage(quote.clinicImageUrl, c.photo.w, c.photo.h, c.photo.radius).catch(() => null) : null,
    quote.beforeAfterImageUrl ? deps.prepareImage(quote.beforeAfterImageUrl, c.photo.w, c.photo.h, c.photo.radius).catch(() => null) : null,
    doctor && quote.doctorImageUrl
      ? deps.prepareImage(quote.doctorImageUrl, c.doctorPhoto.size, c.doctorPhoto.size, c.doctorPhoto.radius).catch(() => null)
      : null,
  ])

  const pdfDoc = await PDFDocument.load(templateBytes)
  pdfDoc.registerFontkit(fontkit)
  const bold = await pdfDoc.embedFont(boldBytes)
  const regular = await pdfDoc.embedFont(regularBytes)
  const checkImg = await pdfDoc.embedPng(checkBytes)
  const xImg = await pdfDoc.embedPng(xBytes)
  const embedOpt = async (png: Uint8Array | null): Promise<PDFImage | null> => (png ? pdfDoc.embedPng(png) : null)
  const clinicPng = await embedOpt(clinicImg)
  const beforeAfterPng = await embedOpt(beforeAfterImg ?? clinicImg)   // fall back to the clinic photo on page 2
  const doctorPng = await embedOpt(doctorImg)

  const pages = pdfDoc.getPages()
  const page1 = pages[0]
  const page2 = pages[1] ?? pages[0]

  // Copies a rectangle of the brand template onto the same spot of the (legacy) page — same background art,
  // so the result is seamless. No-op when the page itself is the brand template.
  const brandDoc = brandBytes ? await PDFDocument.load(brandBytes) : null
  const patchFromBrand = async (page: PDFPage, pageIndex: number, box: { left: number; bottom: number; right: number; top: number }) => {
    if (!brandDoc) return
    const src = brandDoc.getPages()[pageIndex] ?? brandDoc.getPages()[0]
    const emb = await pdfDoc.embedPage(src, box)
    page.drawPage(emb, { x: box.left, y: box.bottom, width: box.right - box.left, height: box.top - box.bottom })
  }
  if (legacyTemplate) {
    // Page 1: the "IMPORTANT NOTES:" heading sits in different places on old templates — normalise it to the brand
    // position (right column, between the exclusions list and the notes) so the notes never print over it.
    await patchFromBrand(page1, 0, { left: 300, bottom: c.notes.startY - 2, right: 575, top: c.exclusions.stopY + 14 })
    // Both pages: the "YOUR EXCLUSIVE TREATMENT PRICE" label (old templates carry a typo) — inside the price box.
    for (const [pg, idx] of [[page1, 0], [page2, 1]] as const) {
      pg.drawRectangle({ x: 40, y: 634, width: 232, height: 20, color: colors.accent })
      await patchFromBrand(pg, idx, { left: 40, bottom: 634, right: 272, top: 654 })
    }
  }

  const boldW = (s: string, sz: number) => bold.widthOfTextAtSize(s, sz)
  const regularW = (s: string, sz: number) => regular.widthOfTextAtSize(s, sz)

  // ── Shared: header (clinic name + location) and right-hand photo ───────────
  const drawHeader = (page: PDFPage, photo: PDFImage | null) => {
    if (legacyTemplate) {
      // Old per-clinic templates carry typed (or placeholder) text here — paint over it in the brand colour.
      page.drawRectangle({ x: c.headerCover.x, y: c.headerCover.y, width: c.headerCover.w, height: c.headerCover.h, color: colors.accent })
    }
    const name = (quote.clinicName ?? '').trim()
    const { size, lines } = fitLines(name, boldW, c.clinicName.size, c.clinicName.minSize, c.clinicName.maxWidth, 2)
    const lineH = size * c.clinicName.lineH
    let y = c.clinicName.top - size * 0.92
    for (const line of lines) {
      page.drawText(line, { x: c.clinicName.x, y, font: bold, size, color: WHITE })
      y -= lineH
    }
    const loc = (quote.clinicLocation ?? '').trim()
    const locSize = autoFitSize(loc, boldW, c.location.size, c.location.maxWidth, 8)
    page.drawText(loc, { x: c.location.x, y: c.location.top - locSize * 0.92, font: bold, size: locSize, color: WHITE })

    if (photo) {
      page.drawImage(photo, { x: c.photo.x, y: c.photo.top - c.photo.h, width: c.photo.w, height: c.photo.h })
    }
  }

  const drawProcedure = (page: PDFPage, cfg: { x: number; startY: number; lineH: number; maxWidth: number; size: number; bottomY: number }) => {
    const { size, lines, lineH } = fitProcedureName(quote.treatmentName || '', boldW, cfg)
    let y = cfg.startY
    for (const line of lines) {
      page.drawText(line, { x: cfg.x, y, font: bold, size, color: colors.title })
      y -= lineH
    }
  }

  const priceStr = quote.price != null
    ? `${quote.pricePrefix ? quote.pricePrefix + ' ' : ''}${quote.price.toLocaleString('en-US')} ${quote.currency}`
    : (quote.pricePrefix || '')
  const drawPrice = (page: PDFPage) => {
    const size = autoFitSize(priceStr, boldW, c.price.size, c.price.maxWidth, 9)
    page.drawText(priceStr, { x: c.price.x, y: c.price.y, font: bold, size, color: WHITE })
  }

  // ═══════════════════════════ PAGE 1 ═══════════════════════════
  drawHeader(page1, clinicPng)
  drawProcedure(page1, c.procedureName)
  drawPrice(page1)

  page1.drawText(quote.patientName || '', { x: c.patientName.x, y: c.patientName.y, font: regular, size: c.patientName.size, color: DARK })
  page1.drawText(quote.quoteDate || '', { x: c.quoteDate.x, y: c.quoteDate.y, font: regular, size: c.quoteDate.size, color: DARK })

  const iconSize = 9
  const drawList = (
    items: string[], cfg: { textX: number; startY: number; lineH: number; maxWidth: number; size: number; stopY: number },
    icon: PDFImage, iconX: number,
  ) => {
    let y = cfg.startY
    for (const item of items) {
      if (y < cfg.stopY) break
      const wrapped = wrapText(item, (s) => regularW(s, cfg.size), cfg.maxWidth)
      page1.drawImage(icon, { x: iconX, y: y - 1, width: iconSize, height: iconSize })
      page1.drawText(wrapped[0], { x: cfg.textX, y, font: regular, size: cfg.size, color: DARK })
      y -= cfg.lineH
      for (let i = 1; i < wrapped.length; i++) {
        if (y < cfg.stopY) break
        page1.drawText(wrapped[i], { x: cfg.textX, y, font: regular, size: cfg.size, color: DARK })
        y -= cfg.lineH
      }
    }
  }
  drawList(quote.inclusions.filter((s) => s.trim()), c.inclusions, checkImg, c.inclusions.checkX)
  drawList(quote.exclusions.filter((s) => s.trim()), c.exclusions, xImg, c.exclusions.iconX)

  // Important notes — bullet list, continuation lines indented
  {
    const cfg = c.notes
    let y = cfg.startY
    const bullet = '• '
    const indent = regular.widthOfTextAtSize(bullet, cfg.size)
    const raw = (quote.importantNotes || '').trim()
    const lines = raw.includes('\n')
      ? raw.split('\n').filter((l) => l.trim())
      : raw.split(/(?<!\w)-\s+/).filter((l) => l.trim())
    for (const noteLine of lines) {
      if (y < cfg.stopY) break
      const clean = noteLine.replace(/^\s*[-•]\s*/, '')
      const wrapped = wrapText(clean, (s) => regularW(s, cfg.size), cfg.maxWidth - indent)
      page1.drawText(bullet + (wrapped[0] ?? ''), { x: cfg.textX, y, font: regular, size: cfg.size, color: DARK })
      y -= cfg.lineH
      for (let i = 1; i < wrapped.length; i++) {
        if (y < cfg.stopY) break
        page1.drawText(wrapped[i], { x: cfg.textX + indent, y, font: regular, size: cfg.size, color: DARK })
        y -= cfg.lineH
      }
    }
  }

  // ═══════════════════════════ PAGE 2 ═══════════════════════════
  drawHeader(page2, beforeAfterPng)
  drawProcedure(page2, c.procedureName2)
  drawPrice(page2)

  if (!doctor && legacyTemplate) {
    // "No doctor" on an old per-clinic template: the template may have been exported from the doctor
    // layout (card + placeholder text + headshot). Replace that area with the brand no-doctor page.
    await patchFromBrand(page2, 1, {
      left: 0, bottom: c.doctorCard.top - c.doctorCard.h - 8, right: c.doctorCard.x + c.doctorCard.w + 10, top: c.doctorCard.top + 8,
    })
  }

  if (doctor) {
    if (legacyTemplate) {
      // Old templates may carry typed doctor text — repaint the text area of the card.
      page2.drawRectangle({ x: 30, y: c.doctorCard.top - c.doctorCard.h + 4, width: 195, height: 60, color: CARD })
    }
    const name = (quote.surgeonName ?? '').trim()
    const nameSize = autoFitSize(name, boldW, c.doctorName.size, c.doctorName.maxWidth, 8)
    page2.drawText(name, { x: c.doctorName.x, y: c.doctorName.top - nameSize * 0.92, font: bold, size: nameSize, color: BLACK })

    const creds = (quote.accreditations ?? '').replace(/\s+/g, ' ').trim()
    if (creds) {
      const { size, lines } = fitLines(creds, regularW, c.doctorCreds.size, 8, c.doctorCreds.maxWidth, c.doctorCreds.maxLines)
      let y = c.doctorCreds.top - size * 0.92
      for (const line of lines) {
        page2.drawText(line, { x: c.doctorCreds.x, y, font: regular, size, color: BLACK })
        y -= c.doctorCreds.lineH * (size / c.doctorCreds.size)
      }
    }
    if (doctorPng) {
      page2.drawImage(doctorPng, {
        x: c.doctorPhoto.x, y: c.doctorPhoto.top - c.doctorPhoto.size, width: c.doctorPhoto.size, height: c.doctorPhoto.size,
      })
    }
  }

  page2.drawText(agent.name || '', { x: c.agentName.x, y: c.agentName.y, font: bold, size: c.agentName.size, color: DARK })
  page2.drawText(agent.email || '', { x: c.agentEmail.x, y: c.agentEmail.y, font: regular, size: c.agentEmail.size, color: GRAY })
  page2.drawText(agent.phone || '', { x: c.agentPhone.x, y: c.agentPhone.y, font: regular, size: c.agentPhone.size, color: GRAY })

  // Invisible link over the "View Clinic Page" button, with UTMs
  if (quote.clinicProfileUrl) {
    const [lx, ly, rx, ry] = c.clinicLinkRect
    const url = withUtm(quote.clinicProfileUrl, brand, quoteId, quote.clinicName)
    const linkAnnot = pdfDoc.context.register(
      pdfDoc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [lx, ly, rx, ry],
        Border: [0, 0, 0],
        A: pdfDoc.context.obj({ Type: 'Action', S: 'URI', URI: PDFString.of(url) }),
      }),
    )
    page2.node.addAnnot(linkAnnot)
  }

  pdfDoc.setTitle(`${brand === 'DD' ? 'Dental' : 'Medical'} Departures quote ${quoteId}`)
  pdfDoc.setSubject(quoteId)

  const pdfBytes = await pdfDoc.save()
  const filename = `${quote.patientName || 'Quote'} - ${quote.treatmentName || 'Treatment'} - ${quoteId}.pdf`
    .replace(/[\\/:*?"<>|]+/g, ' ')
  return { pdfBytes, filename, quoteId }
}

// Re-exported for callers that need the font measure for previews
export type { PDFFont }
