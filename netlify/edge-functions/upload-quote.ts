// Edge Function — saves a generated quote PDF to the clinic's Drive folder.
// Flyer quotes (the agent ticked "Flyer") go to the brand's FLYERS folder instead, and so does the original
// flyer file the agent uploaded (PDF or photo), sent as fileBase64 + mimeType.
// The Quotes Tracker row is written separately by /api/log-quote, so a slow Google Sheets call can
// be retried on its own without uploading the PDF again.
// Env: GOOGLE_SERVICE_ACCOUNT_JSON, DD_QUOTES_FOLDER_ID / MD_QUOTES_FOLDER_ID (fallback folders),
//      DD_FLYERS_FOLDER_ID / MD_FLYERS_FOLDER_ID (optional; default to the DD Fliers / MD Fliers folders)

import { CORS, SCOPES, driveUpload, env, extractDriveFolderId, getAccessToken, json } from '../edge-lib/google.ts'

const FLYERS_FOLDER: Record<string, string> = {
  DD: '1VOKyn_2sveaREskfxYnsIJTUrOSqwEbL',
  MD: '1BOdIX3p3LuFdGCWglurY-v1oq76jqoxq',
}
const ORIGINAL_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

export default async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await request.json() as {
      pdfBase64?: string
      fileBase64?: string // an original flyer file (flyer uploads only)
      mimeType?: string
      filename?: string
      brand?: string
      googleFolder?: string | null
      flyer?: boolean
    }
    const { pdfBase64, fileBase64, filename, brand, googleFolder, flyer } = body
    const data = pdfBase64 || fileBase64
    const mimeType = pdfBase64 ? 'application/pdf' : (body.mimeType || '').toLowerCase()
    if (!data || !filename) return json({ error: 'pdfBase64 (or fileBase64) and filename are required' }, 400)
    if (fileBase64 && !flyer) return json({ error: 'original files are only saved for flyers' }, 400)
    if (!ORIGINAL_TYPES.includes(mimeType)) return json({ error: `file type ${mimeType || '(none)'} is not saved` }, 400)

    const b = brand === 'MD' ? 'MD' : 'DD'
    // Flyer: the brand's flyers folder. Quote: the clinic folder, else the brand's quotes folder, else skip.
    const folderId = flyer
      ? env(`${b}_FLYERS_FOLDER_ID`, FLYERS_FOLDER[b])
      : (googleFolder && extractDriveFolderId(googleFolder)) || env(`${b}_QUOTES_FOLDER_ID`, '')
    if (!folderId) return json({ ok: true, webViewLink: '' })

    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    const token = await getAccessToken(SCOPES.drive)
    const up = await driveUpload({ token, folderId, filename, bytes, mimeType })
    return json({ ok: true, webViewLink: up.webViewLink })
  } catch (err) {
    return json({ error: String(err) }, 502)
  }
}
