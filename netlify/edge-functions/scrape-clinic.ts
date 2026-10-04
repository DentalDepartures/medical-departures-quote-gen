// Edge Function — reads a Dental/Medical Departures clinic profile page and returns the clinic facts
// the quote needs: name, "City, Country", gallery images, before/after images and doctors
// (name, credentials, headshot). Deterministic HTML parsing — no AI, no credits.
// GET /api/scrape-clinic?url=https://www.dentaldepartures.com/dentist/<slug>

import { CORS, fetchWithTimeout, json, requireAdmin } from '../edge-lib/google.ts'
import { brandFromUrl, parseClinic } from '../edge-lib/scrape.ts'

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
    if (!res.ok) return json({ error: `Clinic page returned ${res.status}` }, 502)
    const html = await res.text()
    const clinic = parseClinic(html, url, brand)
    if (!clinic.name) return json({ error: 'Could not find the clinic name on that page. Is it a clinic profile URL?' }, 422)
    return json(clinic)
  } catch (err) {
    return json({ error: `Scrape failed: ${String(err)}` }, 500)
  }
}
