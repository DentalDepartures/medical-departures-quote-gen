// Edge Function — same-origin proxy for template PDFs and images the overlay draws.
// Google Drive links are fetched with the service account (no public sharing needed).
// Direct image URLs are allowed only from the DD/MD static hosts.
// GET /api/fetch-file?url=<drive link | allowed image url>

import { CORS, SCOPES, driveDownload, extractDriveFileId, fetchWithTimeout, getAccessToken, isDriveUrl, json } from '../edge-lib/google.ts'

const ALLOWED_HOSTS = [
  'static.dentaldepartures.com',
  'img.dentaldepartures.com',
  'static.medicaldepartures.com',
  'img.medicaldepartures.com',
  'www.dentaldepartures.com',
  'www.medicaldepartures.com',
  'lh3.googleusercontent.com',
]

function isAllowed(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return ALLOWED_HOSTS.includes(hostname) || isDriveUrl(url)
  } catch {
    return false
  }
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  if (!url) return json({ error: 'Missing ?url= parameter' }, 400)
  if (!isAllowed(url)) return json({ error: 'URL not allowed — must be Google Drive or a Dental/Medical Departures image' }, 403)

  try {
    if (isDriveUrl(url)) {
      const fileId = extractDriveFileId(url)
      if (!fileId) return json({ error: 'Could not extract file ID from Drive URL' }, 400)
      const token = await getAccessToken(SCOPES.driveRead)
      const res = await driveDownload(token, fileId)
      if (res.status === 403) {
        return json({ error: 'File is not accessible to the service account. Share the Quotes Auto Drive folder with it as Viewer.' }, 403)
      }
      if (res.status === 404) return json({ error: 'File not found on Drive. Check the link in the Clinic App sheet.' }, 404)
      if (!res.ok) return json({ error: `Drive API returned ${res.status}` }, res.status)
      const buffer = await res.arrayBuffer()
      const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
      return new Response(buffer, {
        status: 200,
        headers: { ...CORS, 'Content-Type': contentType, 'Cache-Control': 'public, max-age=600' },
      })
    }

    // Direct image from the DD/MD static hosts. Strip Canva/CDN resize params so we get the full image.
    const clean = new URL(url)
    clean.searchParams.delete('width')
    const res = await fetchWithTimeout(clean.toString(), {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QuoteGenerator/2.0)' },
    }, 20000)
    if (!res.ok) return json({ error: `Image source returned ${res.status}` }, res.status)
    const buffer = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
    return new Response(buffer, {
      status: 200,
      headers: { ...CORS, 'Content-Type': contentType, 'Cache-Control': 'public, max-age=600' },
    })
  } catch (err) {
    return json({ error: `Proxy error: ${String(err)}` }, 500)
  }
}
