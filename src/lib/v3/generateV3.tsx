// Builds the v3 quote PDF from the reviewed quote, the sales agent and the clinic's photos.

import { Font, pdf } from '@react-pdf/renderer'
import { PDFDocument } from 'pdf-lib'
import type { QuoteData, AgentProfile, Brand } from '../../types'
import { asset } from '../env'
import { makeQuoteId, withUtm } from '../pdfOverlay'
import { shapedImage } from './images'
import { iconFor } from './icons'
import { QuoteDocV3, V3_BRAND, type V3Data, type V3Item, type V3Tile } from './QuoteDocV3'

let fontsReady = false
function registerFonts() {
  if (fontsReady) return
  const regular = asset('fonts/Montserrat-Regular.ttf')
  const semi = asset('fonts/Montserrat-SemiBold.ttf')
  const bold = asset('fonts/Montserrat-Bold.ttf')
  Font.register({
    family: 'Montserrat',
    fonts: [
      { src: regular, fontWeight: 400 },
      { src: regular, fontWeight: 500 },
      { src: semi, fontWeight: 600 },
      { src: bold, fontWeight: 700 },
      { src: bold, fontWeight: 800 },
    ],
  })
  // Keep words whole — no automatic hyphenation in names and treatments
  Font.registerHyphenationCallback((word) => [word])
  fontsReady = true
}

/** The brand logo with its transparent padding trimmed, so it lines up with the page margin. */
async function trimmedLogo(brand: Brand): Promise<string> {
  const url = asset(brand === 'DD' ? 'dd-logo.png' : 'md-logo.png')
  try {
    const bmp = await createImageBitmap(await (await fetch(url)).blob())
    const c = document.createElement('canvas')
    c.width = bmp.width
    c.height = bmp.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(bmp, 0, 0)
    const { data } = ctx.getImageData(0, 0, c.width, c.height)
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (data[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    }
    if (x1 <= x0 || y1 <= y0) return url
    const out = document.createElement('canvas')
    out.width = x1 - x0 + 1
    out.height = y1 - y0 + 1
    out.getContext('2d')!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
    return out.toDataURL('image/png')
  } catch {
    return url
  }
}

/**
 * Two photos for clinics whose sheet row has none (or only one): picked from their DD/MD profile pages
 * and shipped with the app as public/clinic-photos.json, keyed by profile URL.
 */
let clinicPhotos: Promise<Record<string, { clinic: string; second: string }>> | null = null
async function photosFor(quote: QuoteData): Promise<{ clinic: string | null; second: string | null }> {
  clinicPhotos ??= fetch(asset('clinic-photos.json')).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  const extra = quote.clinicProfileUrl ? (await clinicPhotos)[quote.clinicProfileUrl.trim()] : undefined
  const clinic = quote.clinicImageUrl || extra?.clinic || null
  const second = [quote.beforeAfterImageUrl, extra?.second, extra?.clinic].find((u) => u && u !== clinic) || null
  return { clinic, second }
}

const isNoDoctor = (n: string | null | undefined) => !n || !n.trim() || n.trim().toLowerCase() === 'no doctor'

export function formatPrice(price: number | null, currency: string): string {
  if (price == null) return currency || ''
  return `${currency} ${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

/** "Overlay x8 (teeth …): 60,000 MXN" → text + price. Lines without a trailing price stay whole. */
export function splitItem(line: string): V3Item {
  const t = line.replace(/^[-•·\s]+/, '').trim()
  const m = t.match(/^(.{3,}?):\s*([^:]{1,45})$/)
  if (m && /\d/.test(m[2]) && !/^\d+\s*(days?|nights?|weeks?|months?)\b/i.test(m[2])) return { text: m[1].trim(), price: m[2].trim() }
  return { text: t, price: null }
}

/** "Implants + Crowns (Stage 1 + Stage 2)" → ["Implants", "Crowns (Stage 1 + Stage 2)"]: a "+" inside brackets is not a split. */
function splitTopLevel(name: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (let i = 0; i < name.length; i++) {
    const ch = name[i]
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if (depth === 0 && ch === '+' && /\s/.test(name[i - 1] ?? '') && /\s/.test(name[i + 1] ?? '')) {
      parts.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  parts.push(cur.trim())
  return parts.filter(Boolean)
}

function tilesFrom(quote: QuoteData, items: V3Item[], fallbackIcon: string): V3Tile[] {
  // Clinic options listed inside the quote → one tile per option, with its price
  const options = items.filter((it) => /^option\s*\d+/i.test(it.text))
  if (options.length) {
    return options.map((it) => {
      const m = it.text.match(/^option\s*(\d+)\s*[–—:-]?\s*(.*)$/i)
      const label = (m?.[2] || it.text).replace(/\s*\(.*?\)\s*/g, ' ').trim()
      return { title: `Option ${m?.[1] ?? ''}: ${label}`.trim(), sub: it.price, icon: iconFor(label, fallbackIcon) }
    })
  }
  const name = (quote.treatmentName || 'Treatment').replace(/\s*[—–-]\s*\d+\s*options?\s*$/i, '').trim()
  const parts = splitTopLevel(name)
  return parts.map((p) => {
    const key = p.toLowerCase().slice(0, 12)
    const match = items.find((it) => it.price && it.text.toLowerCase().startsWith(key))
    return { title: p, sub: parts.length > 1 ? match?.price ?? null : null, icon: iconFor(p, fallbackIcon) }
  })
}

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

export async function generateQuotePDFv3(
  quote: QuoteData,
  agent: AgentProfile,
  brand: Brand,
): Promise<{ pdfBytes: Uint8Array; filename: string; quoteId: string }> {
  registerFonts()
  const quoteId = quote.quoteId ?? makeQuoteId(brand)
  const c = V3_BRAND[brand]
  const colors = { light: c.sky, dark: c.navy }
  const doctor = !isNoDoctor(quote.surgeonName)
  const photos = await photosFor(quote)
  const photo2Url = photos.second || photos.clinic

  // Agent headshot: a photo shipped with the app as public/agents/<email name>.jpg (until the Agents tab has a photo column)
  const emailName = (agent.email || '').split('@')[0].trim().toLowerCase()
  const [logo, hero, doctorPhoto, agentPhoto] = await Promise.all([
    trimmedLogo(brand),
    shapedImage(photos.clinic, 333, 396, 'hero', colors),
    doctor ? shapedImage(quote.doctorImageUrl, 84, 84, 'circle', colors) : Promise.resolve(null),
    emailName ? shapedImage(asset(`agents/${emailName}.jpg`), 56, 56, 'circle', colors) : Promise.resolve(null),
  ])
  // A doctor typed by hand (or one whose headshot won't load) shows clinic photo 2 in the circle instead of
  // an empty panel; photo 2 is then used up, so page 2 gets no photo
  const doctorHasPhoto = !!doctorPhoto?.isPhoto
  const [providerPhoto, photo2] = await Promise.all([
    doctorHasPhoto
      ? Promise.resolve(doctorPhoto!)
      : doctor
        ? shapedImage(photo2Url, 84, 84, 'circle', colors)
        : shapedImage(photo2Url, 96, 72, 'rounded', colors, 10),
    doctorHasPhoto ? shapedImage(photo2Url, 173, 130, 'rounded', colors, 13) : Promise.resolve(null),
  ])

  const items = (quote.inclusions ?? []).map(splitItem).filter((it) => it.text)
  const kind = brand === 'MD' ? 'SURGICAL' : 'TREATMENT'
  const location = quote.clinicLocation || ''
  const city = location.split(',')[0]?.trim() || location
  const digits = (agent.phone || '').replace(/\D/g, '')

  const data: V3Data = {
    brand,
    kind,
    logo,
    hero: hero.src,
    photo2: photo2?.src ?? null,
    providerPhoto: providerPhoto.src,
    providerIsDoctor: doctor,
    patient: quote.patientName || 'Patient',
    quoteDate: quote.quoteDate || '',
    quoteId,
    doctorName: doctor ? quote.surgeonName!.trim() : null,
    doctorCreds: doctor ? (quote.accreditations || '').replace(/;\s*/g, ' · ').trim() || null : null,
    clinicName: quote.clinicName || '',
    clinicLocation: location,
    clinicBlurb: `A vetted ${c.name} partner clinic${city ? ` in ${city}` : ''}.`,
    clinicUrl: quote.clinicProfileUrl ? withUtm(quote.clinicProfileUrl, brand, quoteId, quote.clinicName) : null,
    tiles: tilesFrom(quote, items, brand === 'DD' ? 'tooth' : 'body'),
    priceLabel: quote.pricePrefix ? quote.pricePrefix : 'Total quoted package price',
    priceText: formatPrice(quote.price, quote.currency),
    planLabel: quote.treatmentName || '',
    includes: items,
    excludes: (quote.exclusions ?? []).map((e) => e.replace(/^[-•·\s]+/, '').trim()).filter(Boolean),
    notes: (quote.importantNotes || '').split('\n').map((n) => n.replace(/^\s*[-•·]\s*/, '').trim()).filter(Boolean),
    agent: {
      name: agent.name || '',
      email: agent.email || '',
      phone: agent.phone || '',
      initials: initialsOf(agent.name || ''),
      whatsapp: digits ? `https://wa.me/${digits}` : `mailto:${agent.email}`,
      photo: agentPhoto?.isPhoto ? agentPhoto.src : null,
    },
  }

  // Layout rule: the quote shrinks step by step (spacing, text, photo and blocks on the detail pages) to stay on
  // 2 pages; only when even the smallest step doesn't fit does it keep full size and flow onto page 3
  const render = async (k: number) => new Uint8Array(await (await pdf(<QuoteDocV3 d={{ ...data, k }} />).toBlob()).arrayBuffer())
  let pdfBytes = await render(1)
  if ((await PDFDocument.load(pdfBytes)).getPageCount() > 2) {
    for (const k of [0.88, 0.78]) {
      const smaller = await render(k)
      if ((await PDFDocument.load(smaller)).getPageCount() <= 2) { pdfBytes = smaller; break }
    }
  }
  const filename = `${quote.patientName || 'Quote'} - ${quote.treatmentName || 'Treatment'} - ${quoteId}.pdf`
    .replace(/[\\/:*?"<>|]+/g, ' ')
  return { pdfBytes, filename, quoteId }
}
