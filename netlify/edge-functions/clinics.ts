// Edge Function — Google Sheets reader using Web Crypto API for JWT signing.
// Runs on Deno (Cloudflare Workers-like) — no Node.js crypto module available.
// Environment variables: GOOGLE_SERVICE_ACCOUNT_JSON, CLINIC_APP_SPREADSHEET_ID

const RANGE = 'Clinic App!A:N'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
}

function base64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function uint8ToBase64url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function signRS256(signingInput: string, pemKey: string): Promise<string> {
  const keyBody = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')
  const keyBytes = Uint8Array.from(atob(keyBody), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  )
  return uint8ToBase64url(new Uint8Array(sig))
}

async function getAccessToken(): Promise<string> {
  const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')
  const sa = JSON.parse(saJson) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)

  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }))
  const signingInput = `${header}.${payload}`
  const signature = await signRS256(signingInput, sa.private_key)
  const jwt = `${signingInput}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json() as { access_token?: string; error?: string; error_description?: string }
  if (!data.access_token) throw new Error(`Token error: ${data.error} — ${data.error_description}`)
  return data.access_token
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  const spreadsheetId = Deno.env.get('CLINIC_APP_SPREADSHEET_ID')
  if (!spreadsheetId) {
    return new Response(JSON.stringify({ error: 'CLINIC_APP_SPREADSHEET_ID not configured' }), {
      status: 500, headers: CORS,
    })
  }

  try {
    const token = await getAccessToken()
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(RANGE)}`
    const sheetsRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })

    if (!sheetsRes.ok) {
      throw new Error(`Sheets API ${sheetsRes.status}: ${await sheetsRes.text()}`)
    }

    const data = await sheetsRes.json() as { values?: string[][] }
    const [, ...dataRows] = data.values ?? []

    // Column index mapping (A=0 … N=13):
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
      .filter((r) => r.clinic_name && r.brand)

    return new Response(JSON.stringify({ rows }), { status: 200, headers: CORS })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS })
  }
}
