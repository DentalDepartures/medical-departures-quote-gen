// Edge Function — uploads a generated quote PDF to Google Drive and logs to Quote Tracker sheet.
// Runs on Deno (Netlify Edge). Requires GOOGLE_SERVICE_ACCOUNT_JSON env var.
// Service account needs Editor access on the Drive folder and the Quote Tracker spreadsheet.

declare const Deno: { env: { get(key: string): string | undefined } }

const TRACKER_SPREADSHEET_ID = '13XkySIivS9DltK4L9gbgunzKXRmoV2rmydyDQfB9hI0'
const TRACKER_RANGE = 'Quotes Tracker!A:G'

// ── JWT / OAuth helpers ───────────────────────────────────────────────────────

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

async function getAccessToken(scopes: string): Promise<string> {
  const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')
  const sa = JSON.parse(saJson) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)

  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: scopes,
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

// ── Drive helpers ─────────────────────────────────────────────────────────────

function extractFolderId(url: string): string | null {
  const match = url.match(/\/folders\/([^/?#]+)/)
  if (match) return match[1]
  try {
    const id = new URL(url).searchParams.get('id')
    if (id) return id
  } catch { /* ignore */ }
  return null
}

async function uploadToDrive(params: {
  token: string
  folderId: string
  filename: string
  pdfBytes: Uint8Array
}): Promise<string> {
  const { token, folderId, filename, pdfBytes } = params

  const metadata = JSON.stringify({ name: filename, parents: [folderId] })
  const boundary = 'quote_upload_boundary'

  // Build multipart body manually (Deno fetch doesn't support FormData multipart for binary)
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`
  const filePart = `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
  const closing  = `\r\n--${boundary}--`

  const metaBytes  = new TextEncoder().encode(metaPart)
  const fileHeader = new TextEncoder().encode(filePart)
  const closeBytes = new TextEncoder().encode(closing)

  const body = new Uint8Array(metaBytes.length + fileHeader.length + pdfBytes.length + closeBytes.length)
  let offset = 0
  body.set(metaBytes,  offset); offset += metaBytes.length
  body.set(fileHeader, offset); offset += fileHeader.length
  body.set(pdfBytes,   offset); offset += pdfBytes.length
  body.set(closeBytes, offset)

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Drive upload failed ${res.status}: ${err}`)
  }

  const data = await res.json() as { id?: string; webViewLink?: string }
  return data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`
}

async function appendToTracker(params: {
  token: string
  row: string[]
}): Promise<void> {
  const { token, row } = params
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${TRACKER_SPREADSHEET_ID}/values/${encodeURIComponent(TRACKER_RANGE)}:append?valueInputOption=USER_ENTERED`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [row] }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Sheets append failed ${res.status}: ${err}`)
  }
}

// ── CORS ──────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await request.json() as {
      pdfBase64?: string
      filename?: string
      patientName?: string | null
      treatmentName?: string | null
      clinicName?: string | null
      brand?: string
      agentName?: string
      agentEmail?: string
      googleFolder?: string | null
      quoteDate?: string | null
    }

    const { pdfBase64, filename, patientName, treatmentName, clinicName, brand, agentName, googleFolder, quoteDate } = body

    if (!pdfBase64 || !filename) {
      return new Response(JSON.stringify({ error: 'pdfBase64 and filename are required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Decode base64 PDF
    const pdfBytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0))

    // Get access token with Drive + Sheets scopes
    const token = await getAccessToken(
      'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
    )

    // Upload to Drive if folder URL provided
    let webViewLink = ''
    if (googleFolder) {
      const folderId = extractFolderId(googleFolder)
      if (folderId) {
        webViewLink = await uploadToDrive({ token, folderId, filename, pdfBytes })
      }
    }

    // Log to Quote Tracker sheet
    const now = new Date()
    const createdTime = now.toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' })
    await appendToTracker({
      token,
      row: [
        quoteDate ?? '',
        createdTime,
        brand ?? '',
        patientName ?? '',
        clinicName ?? '',
        webViewLink,
        agentName ?? '',
      ],
    })

    return new Response(JSON.stringify({ ok: true, webViewLink }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
}
