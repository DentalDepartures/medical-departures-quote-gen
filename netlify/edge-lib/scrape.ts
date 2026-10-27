// Pure HTML parsing for DD/MD clinic profile pages (no Deno APIs — unit-testable in Node).

type Brand = 'DD' | 'MD'

export function brandFromUrl(url: string): Brand | null {
  try {
    const { hostname } = new URL(url)
    if (hostname.endsWith('dentaldepartures.com')) return 'DD'
    if (hostname.endsWith('medicaldepartures.com')) return 'MD'
  } catch { /* fallthrough */ }
  return null
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<!--.*?-->/gs, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

/** Normalises an image URL; returns null for placeholders (bare host, no path) and non-http values. */
function cleanImageUrl(u: string): string | null {
  try {
    const url = new URL(u.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    // The site renders "https://static.dentaldepartures.com/" when a clinic/doctor has no photo
    if (url.pathname === '/' || url.pathname === '') return null
    url.searchParams.delete('width')
    return url.toString()
  } catch {
    return null
  }
}

/** Returns the HTML of the first element with the given class, including nested elements (depth-aware, div-based). */
function sectionByClass(html: string, className: string, startFrom = 0): { html: string; end: number } | null {
  const re = new RegExp(`<(div|section)[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, 'g')
  re.lastIndex = startFrom
  const m = re.exec(html)
  if (!m) return null
  const tag = m[1]
  let depth = 1
  let i = re.lastIndex
  const open = new RegExp(`<${tag}\\b`, 'g')
  const close = new RegExp(`</${tag}>`, 'g')
  while (depth > 0 && i < html.length) {
    open.lastIndex = i
    close.lastIndex = i
    const o = open.exec(html)
    const c = close.exec(html)
    if (!c) break
    if (o && o.index < c.index) { depth++; i = o.index + 1 } else { depth--; i = c.index + c[0].length }
  }
  return { html: html.slice(m.index, i), end: i }
}

export function parseClinic(html: string, profileUrl: string, brand: Brand) {
  // Name: JSON-LD MedicalClinic name, else <h1>
  let name = ''
  const ld = html.match(/<script type="application\/ld\+json"[^>]*>\s*(\{.*?\})\s*<\/script>/s)
  if (ld) {
    try {
      const obj = JSON.parse(ld[1]) as { name?: string }
      if (obj.name) name = obj.name.trim()
    } catch { /* ignore */ }
  }
  if (!name) {
    const h1 = html.match(/<h1[^>]*>(.*?)<\/h1>/s)
    if (h1) name = stripTags(h1[1]).replace(/\s*(Dental|Medical) Departures Verified.*$/i, '').trim()
  }

  // Location: <div class="location"><span>City , Country</span>
  let location = ''
  const loc = html.match(/class="location"[^>]*>\s*<span[^>]*>(.*?)<\/span>/s)
  if (loc) {
    location = stripTags(loc[1]).replace(/\s*,\s*/g, ', ').trim()
  }

  // Gallery: .clinic-gallery .images-slides background-image
  const galleryImages: string[] = []
  const gallery = sectionByClass(html, 'clinic-gallery')
  if (gallery) {
    for (const m of gallery.html.matchAll(/background-image:\s*url\((['"]?)([^'")]+)\1\)/g)) {
      const u = cleanImageUrl(m[2])
      if (u) galleryImages.push(u)
    }
  }

  // Before/after: .before-after background-image (the strip of thumbnails)
  const beforeAfterImages: string[] = []
  for (const m of html.matchAll(/class="before-after[^"]*"[^>]*style="[^"]*background-image:\s*url\((['"]?)([^'")]+)\1\)/g)) {
    const u = cleanImageUrl(m[2])
    if (u) beforeAfterImages.push(u)
  }

  // Doctors: each .doctor-card
  const doctors: { name: string; credentials: string; imageUrl: string | null }[] = []
  let cursor = 0
  for (let guard = 0; guard < 40; guard++) {
    const card = sectionByClass(html, 'doctor-card', cursor)
    if (!card) break
    cursor = card.end
    const c = card.html
    const docName = (() => {
      const m = c.match(/class="doc-name"[^>]*>(.*?)<\/div>/s)
      return m ? stripTags(m[1]) : ''
    })()
    if (!docName) continue
    const img = c.match(/class="doctor-image"[^>]*>\s*<img[^>]*src="([^"]+)"/s)
    const years = (() => {
      const m = c.match(/class="practice"[^>]*>(.*?)<\/div>/s)
      if (!m) return ''
      const t = stripTags(m[1])
      const n = t.match(/(\d+)/)
      return n ? `${n[1]} Years of Practice` : ''
    })()
    const associations = (() => {
      const m = c.match(/Associations:.*?<ul[^>]*>(.*?)<\/ul>/s)
      if (!m) return [] as string[]
      return Array.from(m[1].matchAll(/<li[^>]*>(.*?)<\/li>/gs))
        .map((x) => stripTags(x[1]).replace(/^[•·\-\s]+/, '').replace(/\s*•\s*/g, '; ').trim())
        .filter(Boolean)
    })()
    const credentials = [years, ...associations.slice(0, 2)].filter(Boolean).join('; ')
    // Same doctor can appear twice in the markup (mobile + desktop layouts)
    if (doctors.some((d) => d.name.toLowerCase() === docName.toLowerCase())) continue
    doctors.push({ name: docName, credentials, imageUrl: img ? cleanImageUrl(img[1]) : null })
  }

  return {
    brand,
    profileUrl,
    name,
    location,
    galleryImages: unique(galleryImages).slice(0, 30),
    beforeAfterImages: unique(beforeAfterImages).slice(0, 30),
    doctors,
  }
}

/** The slug of a medicaldepartures.com /clinic/<slug> profile URL, or null. */
export function mdClinicSlug(url: string): string | null {
  try {
    const m = new URL(url).pathname.match(/^\/clinic\/([^/?#]+)/)
    return m ? decodeURIComponent(m[1]) : null
  } catch {
    return null
  }
}

interface MdApiClinic {
  name?: string
  location?: { city?: { name?: string } | null; country?: { name?: string } | null } | null
  photos?: {
    clinic_photos?: { image?: string }[]
    before_after_photos?: { combined_image?: string; before_image?: string; after_image?: string }[]
  } | null
  doctors?: { name?: string; photo?: string | null; years_of_practicing?: number | null; associations?: string[] | null }[]
}

/**
 * Same result as parseClinic, built from the JSON the MD site's own pages load from
 * api.medicaldepartures.com/core/v1/clinics/<slug>. Used when a profile URL opened directly comes back
 * as the site's "page not found" shell even though the clinic is live (the page only renders when
 * reached from the site's own links).
 */
export function parseMdApiClinic(data: MdApiClinic, profileUrl: string) {
  const city = data.location?.city?.name?.trim() ?? ''
  const country = data.location?.country?.name?.trim() ?? ''
  const doctors: { name: string; credentials: string; imageUrl: string | null }[] = []
  for (const d of data.doctors ?? []) {
    const name = (d.name ?? '').replace(/\s+/g, ' ').trim()
    if (!name || doctors.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue
    const years = d.years_of_practicing ? `${d.years_of_practicing} Years of Practice` : ''
    const associations = (d.associations ?? []).map((a) => a.replace(/\s+/g, ' ').trim()).filter(Boolean)
    doctors.push({
      name,
      credentials: [years, ...associations.slice(0, 2)].filter(Boolean).join('; '),
      imageUrl: d.photo ? cleanImageUrl(d.photo) : null,
    })
  }
  const galleryImages = (data.photos?.clinic_photos ?? [])
    .map((p) => (p.image ? cleanImageUrl(p.image) : null))
    .filter((u): u is string => !!u)
  const beforeAfterImages = (data.photos?.before_after_photos ?? [])
    .map((p) => cleanImageUrl(p.combined_image ?? p.after_image ?? p.before_image ?? ''))
    .filter((u): u is string => !!u)
  return {
    brand: 'MD' as Brand,
    profileUrl,
    name: (data.name ?? '').trim(),
    location: [city, country].filter(Boolean).join(', '),
    galleryImages: unique(galleryImages).slice(0, 30),
    beforeAfterImages: unique(beforeAfterImages).slice(0, 30),
    doctors,
  }
}
