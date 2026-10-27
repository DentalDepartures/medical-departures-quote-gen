// Edge Function — reads a Dental/Medical Departures clinic profile page and returns the clinic facts
// the quote needs: name, "City, Country", gallery images, before/after images and doctors
// (name, credentials, headshot). Deterministic HTML parsing — no AI, no credits.
// GET /api/scrape-clinic?url=https://www.dentaldepartures.com/dentist/<slug>

import { CORS, fetchWithTimeout, json, requireAdmin } from '../edge-lib/google.ts'
import { brandFromUrl, mdClinicSlug, parseClinic, parseMdApiClinic } from '../edge-lib/scrape.ts'

export default async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const denied = requireAdmin(request)
  if (denied) return denied

  const { searchParams } = new URL(request.url)
  const url = (searchParams.get('url') ?? '').trim()
  if (!url) return json({ error: 'Missing ?url= parameter' }, 400)
  const brand = brandFromUrl(url)
  if (!brand) return json({ error: 'URL must be a dentaldepartures.com or medicaldepartures.com clinic page' }, 400)

  try {
    const res = await fetchWithTimeout(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) QuoteGenerator/2.0',
        Accept: 'text/html',
      },
    }, 20000)
    // The MD site sometimes serves a live, fully rendered clinic profile with a 404 status
    // (e.g. /clinic/ruby-plastic-surgery), so a 404 still gets parsed; a page with no clinic
    // name in it is a genuinely missing clinic.
    if (!res.ok && res.status !== 404) return json({ error: `Clinic page returned ${res.status}` }, 502)
    const html = await res.text()
    let clinic = parseClinic(html, url, brand)
    // Some live MD clinics come back as the site's "page not found" shell when the URL is opened
    // directly; the site's own pages read them from its API, so do the same.
    if (!clinic.name && brand === 'MD') {
      const fromApi = await readMdApi(url)
      if (fromApi?.name) clinic = fromApi
    }
    if (!clinic.name && !res.ok) return json({ error: `Clinic page returned ${res.status}` }, 502)
    if (!clinic.name) return json({ error: 'Could not find the clinic name on that page. Is it a clinic profile URL?' }, 422)
    return json(clinic)
  } catch (err) {
    return json({ error: `Scrape failed: ${String(err)}` }, 500)
  }
}

async function readMdApi(url: string) {
  const slug = mdClinicSlug(url)
  if (!slug) return null
  try {
    const res = await fetchWithTimeout(`https://api.medicaldepartures.com/core/v1/clinics/${encodeURIComponent(slug)}`, {
      headers: { Accept: 'application/json', 'X-MD-Site-Id': '4', 'x-locale': 'en-US' },
    }, 20000)
    if (!res.ok) return null
    return parseMdApiClinic(await res.json(), url)
  } catch {
    return null
  }
}
