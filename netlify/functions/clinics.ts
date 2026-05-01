// Reads the Clinic App sheet and returns all active rows as JSON.
// Requires env vars: GOOGLE_SERVICE_ACCOUNT_JSON, CLINIC_APP_SPREADSHEET_ID
// Uses Node.js built-in crypto for JWT signing — no extra dependencies.

import { createSign } from 'crypto'

const SPREADSHEET_ID = process.env.CLINIC_APP_SPREADSHEET_ID ?? ''
const RANGE = 'Clinic App!A:N'

type NetlifyEvent = { httpMethod: string }
type NetlifyResponse = { statusCode: number; headers: Record<string, string>; body: string }

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

async function getAccessToken(): Promise<string> {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')

  const sa = JSON.parse(saJson) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }),
  ).toString('base64url')

  const signingInput = `${header}.${payload}`
  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  const signature = sign.sign(sa.private_key, 'base64url')
  const jwt = `${signingInput}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string }
  if (!data.access_token) {
    throw new Error(`Token error: ${data.error} — ${data.error_description}`)
  }
  return data.access_token
}

export const handler = async (event: NetlifyEvent): Promise<NetlifyResponse> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }

  if (!SPREADSHEET_ID) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'CLINIC_APP_SPREADSHEET_ID not configured' }),
    }
  }

  try {
    const token = await getAccessToken()

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(RANGE)}`
    const sheetsRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!sheetsRes.ok) {
      const errText = await sheetsRes.text()
      throw new Error(`Sheets API ${sheetsRes.status}: ${errText}`)
    }

    const data = (await sheetsRes.json()) as { values?: string[][] }
    const [, ...dataRows] = data.values ?? [] // skip header row

    // Column index mapping (A=0 ... N=13):
    // 0:brand 1:clinic_name 2:location 3:google_folder 4:clinic_profile_url
    // 5:clinic_image_1 6:clinic_image_2 7:surgeon_name 8:surgeon_title
    // 9:accreditations 10:doctor_picture_url 11:status 12:notes 13:template_pdf_url
    const rows = dataRows
      .filter((r) => (r[11] ?? '').trim().toLowerCase() === 'active')
      .map((r) => ({
        brand: (r[0] ?? '').trim() as 'DD' | 'MD',
        clinic_name: (r[1] ?? '').trim(),
        location: (r[2] ?? '').trim(),
        google_folder: (r[3] ?? '').trim(),
        clinic_profile_url: (r[4] ?? '').trim(),
        clinic_image_1: (r[5] ?? '').trim(),
        clinic_image_2: (r[6] ?? '').trim(),
        surgeon_name: (r[7] ?? '').trim(),
        surgeon_title: (r[8] ?? '').trim(),
        accreditations: (r[9] ?? '').trim(),
        doctor_picture_url: (r[10] ?? '').trim(),
        status: 'active' as const,
        notes: (r[12] ?? '').trim(),
        template_pdf_url: (r[13] ?? '').trim(),
      }))
      .filter((r) => r.clinic_name && r.brand) // skip incomplete rows

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ rows }),
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: String(err) }),
    }
  }
}
