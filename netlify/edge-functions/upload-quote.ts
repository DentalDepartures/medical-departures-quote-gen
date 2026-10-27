// Edge Function — saves a generated quote PDF to the clinic's Drive folder.
// The Quotes Tracker row is written separately by /api/log-quote, so a slow Google Sheets call can
// be retried on its own without uploading the PDF again.
// Env: GOOGLE_SERVICE_ACCOUNT_JSON, DD_QUOTES_FOLDER_ID / MD_QUOTES_FOLDER_ID (fallback folders)

import { CORS, SCOPES, driveUpload, env, extractDriveFolderId, getAccessToken, json } from '../edge-lib/google.ts'

export default async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await request.json() as {
      pdfBase64?: string
      filename?: string
      brand?: string
      googleFolder?: string | null
    }
    const { pdfBase64, filename, brand, googleFolder } = body
    if (!pdfBase64 || !filename) return json({ error: 'pdfBase64 and filename are required' }, 400)

    // Upload to Drive (clinic folder, else the brand's quotes folder, else skip)
    const folderId =
      (googleFolder && extractDriveFolderId(googleFolder)) ||
      env(brand === 'MD' ? 'MD_QUOTES_FOLDER_ID' : 'DD_QUOTES_FOLDER_ID', '')
    if (!folderId) return json({ ok: true, webViewLink: '' })

    const pdfBytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0))
    const token = await getAccessToken(SCOPES.drive)
    const up = await driveUpload({ token, folderId, filename, bytes: pdfBytes, mimeType: 'application/pdf' })
    return json({ ok: true, webViewLink: up.webViewLink })
  } catch (err) {
    return json({ error: String(err) }, 502)
  }
}
