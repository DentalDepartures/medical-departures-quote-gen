// Edge Function — saves a generated quote PDF to the clinic's Drive folder and logs it to the Quotes Tracker tab.
// Env: GOOGLE_SERVICE_ACCOUNT_JSON, TRACKER_SPREADSHEET_ID (defaults to the Clinic App spreadsheet),
//      TRACKER_TAB (optional, default "Quotes Tracker")

import { CORS, SCOPES, driveUpload, ensureHeaders, env, extractDriveFolderId, getAccessToken, json, sheetsAppend } from '../edge-lib/google.ts'

export default async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await request.json() as {
      pdfBase64?: string
      filename?: string
      quoteId?: string
      patientName?: string | null
      treatmentName?: string | null
      clinicName?: string | null
      brand?: string
      agentName?: string
      agentEmail?: string
      googleFolder?: string | null
      quoteDate?: string | null
    }
    const { pdfBase64, filename, quoteId, patientName, clinicName, brand, agentName, googleFolder, quoteDate } = body
    if (!pdfBase64 || !filename) return json({ error: 'pdfBase64 and filename are required' }, 400)

    const pdfBytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0))
    const token = await getAccessToken(`${SCOPES.drive} ${SCOPES.sheets}`)

    // Upload to Drive (clinic folder, else the brand's quotes folder, else skip)
    let webViewLink = ''
    let uploadError = ''
    const folderId =
      (googleFolder && extractDriveFolderId(googleFolder)) ||
      env(brand === 'MD' ? 'MD_QUOTES_FOLDER_ID' : 'DD_QUOTES_FOLDER_ID', '')
    if (folderId) {
      try {
        const up = await driveUpload({ token, folderId, filename, bytes: pdfBytes, mimeType: 'application/pdf' })
        webViewLink = up.webViewLink
      } catch (e) {
        uploadError = String(e)
      }
    }

    // Log to the tracker (always, even when the Drive upload failed — the row then carries the error)
    const trackerId = env('TRACKER_SPREADSHEET_ID', env('CLINIC_APP_SPREADSHEET_ID', ''))
    const trackerTab = env('TRACKER_TAB', 'Quotes Tracker')
    if (trackerId) {
      const createdTime = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' })
      // Columns A–H are the tracker's existing layout; quote_id is created at the end if missing
      const headers = await ensureHeaders(token, trackerId, trackerTab, ['quote_id'])
      const row = [
        quoteDate ?? '',
        createdTime,
        brand ?? '',
        patientName ?? '',
        clinicName ?? '',
        webViewLink,
        agentName ?? '',
        uploadError ? `Drive upload failed: ${uploadError}` : '',
      ]
      const idCol = headers.indexOf('quote_id')
      while (row.length <= idCol) row.push('')
      row[idCol] = quoteId ?? ''
      await sheetsAppend(token, trackerId, `${trackerTab}!A:Z`, [row])
    }

    if (uploadError) return json({ ok: false, error: uploadError, webViewLink: '' }, 502)
    return json({ ok: true, webViewLink })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
}
