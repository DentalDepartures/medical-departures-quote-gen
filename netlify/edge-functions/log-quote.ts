// Edge Function — logs a generated quote to the Quotes Tracker tab (one row per quote).
// Safe to call again for the same quote: a quote_id that is already in the tab is not written twice,
// so the app can retry after a Google Sheets timeout without creating duplicate rows.
// Env: GOOGLE_SERVICE_ACCOUNT_JSON, TRACKER_SPREADSHEET_ID (defaults to the Clinic App spreadsheet),
//      TRACKER_TAB (optional, default "Quotes Tracker")

import { CORS, SCOPES, ensureHeaders, env, getAccessToken, json, normaliseHeader, sheetsAppend, sheetsGet } from '../edge-lib/google.ts'

function columnLetter(index0: number): string {
  let n = index0 + 1
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await request.json() as {
      quoteId?: string
      patientName?: string | null
      clinicName?: string | null
      brand?: string
      agentName?: string
      agentEmail?: string
      opsAgent?: string
      quoteDate?: string | null
      webViewLink?: string
      uploadError?: string
    }
    const { quoteId, patientName, clinicName, brand, agentName, agentEmail, opsAgent, quoteDate, webViewLink, uploadError } = body
    if (!quoteId) return json({ error: 'quoteId is required' }, 400)

    const trackerId = env('TRACKER_SPREADSHEET_ID', env('CLINIC_APP_SPREADSHEET_ID', ''))
    const trackerTab = env('TRACKER_TAB', 'Quotes Tracker')
    if (!trackerId) return json({ ok: true, logged: false })

    const token = await getAccessToken(SCOPES.sheets)
    // Columns A–H are the tracker's existing layout; the extra columns are created at the end if missing
    const headers = await ensureHeaders(token, trackerId, trackerTab, ['quote_id', 'agent_email', 'created_iso', 'Ops Agent'])

    // Already logged by an earlier attempt whose reply was lost? Then there is nothing to do.
    const idCol = columnLetter(headers.indexOf('quote_id'))
    const ids = await sheetsGet(token, trackerId, `${trackerTab}!${idCol}:${idCol}`)
    if (ids.some((r) => (r[0] ?? '').trim() === quoteId)) return json({ ok: true, logged: true, duplicate: true })

    const now = new Date()
    const createdTime = now.toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' })
    // Bangkok is UTC+7 all year (no DST), so shifting the UTC clock gives local time
    const createdIso = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')
    // The tracker's locale is en_US, so USER_ENTERED turns "05/10/2026" into 10 May and leaves
    // "25/10/2026" as text. A leading apostrophe keeps both DD/MM cells as the text the team reads.
    const asText = (v: string) => (v ? `'${v}` : '')
    const row = [
      asText(quoteDate ?? ''),
      asText(createdTime),
      brand ?? '',
      patientName ?? '',
      clinicName ?? '',
      webViewLink ?? '',
      agentName ?? '',
      uploadError ? `Drive upload failed: ${uploadError}` : '',
    ]
    const extra: Record<string, string> = {
      quote_id: quoteId,
      // One spelling per agent to count by (agent names are typed freely)
      agent_email: (agentEmail ?? '').trim().toLowerCase(),
      // "YYYY-MM-DD HH:MM:SS" is read as a real date-time in any locale, so it sorts and filters
      created_iso: createdIso,
      [normaliseHeader('Ops Agent')]: (opsAgent ?? '').trim(),
    }
    for (const [name, value] of Object.entries(extra)) {
      const col = headers.indexOf(name)
      while (row.length <= col) row.push('')
      row[col] = value
    }
    // Google can be slow to answer appends; give it longer than the default before giving up
    await sheetsAppend(token, trackerId, `${trackerTab}!A:Z`, [row], 25000)
    return json({ ok: true, logged: true })
  } catch (err) {
    return json({ error: String(err) }, 502)
  }
}
