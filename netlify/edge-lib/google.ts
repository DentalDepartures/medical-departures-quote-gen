// Shared Google service-account helpers for Netlify Edge Functions (Deno).
// Env: GOOGLE_SERVICE_ACCOUNT_JSON (service account key JSON, as one line)

declare const Deno: { env: { get(key: string): string | undefined } }

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export function env(name: string, fallback?: string): string {
  const v = Deno.env.get(name)
  if (v && v.trim()) return v.trim()
  if (fallback !== undefined) return fallback
  throw new Error(`${name} not configured`)
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

export function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(id))
}

export const SCOPES = {
  sheetsRead: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  sheets: 'https://www.googleapis.com/auth/spreadsheets',
  driveRead: 'https://www.googleapis.com/auth/drive.readonly',
  drive: 'https://www.googleapis.com/auth/drive',
}

export async function getAccessToken(scopes: string): Promise<string> {
  const saJson = env('GOOGLE_SERVICE_ACCOUNT_JSON')
  const sa = JSON.parse(saJson) as { client_email: string; private_key: string }
  // Env vars sometimes double-escape newlines in the key
  const privateKey = sa.private_key.replace(/\\n/g, '\n')
  const now = Math.floor(Date.now() / 1000)

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: scopes,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }))
  const signingInput = `${header}.${payload}`
  const signature = await signRS256(signingInput, privateKey)
  const jwt = `${signingInput}.${signature}`

  const res = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
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

/** Extracts a Drive file ID from /file/d/{id}, ?id={id}, or a bare ID. */
export function extractDriveFileId(url: string): string | null {
  const pathMatch = url.match(/\/file\/d\/([^/?#]+)/)
  if (pathMatch) return pathMatch[1]
  try {
    const id = new URL(url).searchParams.get('id')
    if (id) return id
  } catch { /* not a URL */ }
  if (/^[A-Za-z0-9_-]{20,}$/.test(url)) return url
  return null
}

export function extractDriveFolderId(url: string): string | null {
  const match = url.match(/\/folders\/([^/?#]+)/)
  if (match) return match[1]
  try {
    const id = new URL(url).searchParams.get('id')
    if (id) return id
  } catch { /* ignore */ }
  if (/^[A-Za-z0-9_-]{20,}$/.test(url)) return url
  return null
}

export function isDriveUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'drive.google.com' || hostname === 'drive.usercontent.google.com' || hostname === 'docs.google.com'
  } catch {
    return false
  }
}

export async function driveDownload(token: string, fileId: string): Promise<Response> {
  return fetchWithTimeout(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
    20000,
  )
}

export async function driveCreateFolder(token: string, name: string, parentId: string): Promise<{ id: string; webViewLink: string }> {
  // Reuse an existing folder of the same name (a retried onboarding must not create duplicates)
  const q = `name = '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  const found = await fetchWithTimeout(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,webViewLink)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (found.ok) {
    const data = await found.json() as { files?: { id: string; webViewLink?: string }[] }
    const f = data.files?.[0]
    if (f) return { id: f.id, webViewLink: f.webViewLink ?? `https://drive.google.com/drive/folders/${f.id}` }
  }
  const res = await fetchWithTimeout(
    'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
    },
  )
  if (!res.ok) throw new Error(`Drive folder create failed ${res.status}: ${await res.text()}`)
  const data = await res.json() as { id: string; webViewLink?: string }
  return { id: data.id, webViewLink: data.webViewLink ?? `https://drive.google.com/drive/folders/${data.id}` }
}

export async function driveUpload(params: {
  token: string
  folderId: string
  filename: string
  bytes: Uint8Array
  mimeType: string
}): Promise<{ id: string; webViewLink: string }> {
  const { token, folderId, filename, bytes, mimeType } = params
  const metadata = JSON.stringify({ name: filename, parents: [folderId] })
  const boundary = 'quote_gen_upload_boundary'
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`
  const filePart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  const closing = `\r\n--${boundary}--`
  const metaBytes = new TextEncoder().encode(metaPart)
  const fileHeader = new TextEncoder().encode(filePart)
  const closeBytes = new TextEncoder().encode(closing)
  const body = new Uint8Array(metaBytes.length + fileHeader.length + bytes.length + closeBytes.length)
  let offset = 0
  body.set(metaBytes, offset); offset += metaBytes.length
  body.set(fileHeader, offset); offset += fileHeader.length
  body.set(bytes, offset); offset += bytes.length
  body.set(closeBytes, offset)

  const res = await fetchWithTimeout(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
    30000,
  )
  if (!res.ok) throw new Error(`Drive upload failed ${res.status}: ${await res.text()}`)
  const data = await res.json() as { id: string; webViewLink?: string }
  return { id: data.id, webViewLink: data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view` }
}

// ── Sheets helpers ────────────────────────────────────────────────────────────

export async function sheetsGet(token: string, spreadsheetId: string, range: string): Promise<string[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
  const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`)
  const data = await res.json() as { values?: string[][] }
  return data.values ?? []
}

export async function sheetsAppend(token: string, spreadsheetId: string, range: string, rows: string[][]): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: rows }),
  })
  if (!res.ok) throw new Error(`Sheets append failed ${res.status}: ${await res.text()}`)
}

/** Turns a header row + data rows into objects keyed by normalised header name (lowercase, snake_case). */
export function rowsToObjects(values: string[][]): Record<string, string>[] {
  if (values.length === 0) return []
  const headers = values[0].map(normaliseHeader)
  return values.slice(1).map((r) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { if (h) obj[h] = (r[i] ?? '').trim() })
    return obj
  })
}

export function normaliseHeader(h: string): string {
  return (h ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/** Column mapping for appends: returns the header list so callers can place values by name. */
export async function sheetHeaders(token: string, spreadsheetId: string, tab: string): Promise<string[]> {
  const values = await sheetsGet(token, spreadsheetId, `${tab}!1:1`)
  return (values[0] ?? []).map(normaliseHeader)
}

export function objectToRow(headers: string[], obj: Record<string, string>): string[] {
  return headers.map((h) => obj[h] ?? '')
}

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

/**
 * Makes sure the header row of `tab` contains every name in `required`
 * (compared after normalisation). Missing headers are appended to the right
 * of the existing ones, so no one has to edit the sheet by hand.
 * Returns the (normalised) header list after the update.
 */
export async function ensureHeaders(
  token: string,
  spreadsheetId: string,
  tab: string,
  required: string[],
): Promise<string[]> {
  const raw = (await sheetsGet(token, spreadsheetId, `${tab}!1:1`))[0] ?? []
  const have = raw.map(normaliseHeader)
  const missing = required.filter((r) => !have.includes(normaliseHeader(r)))
  if (missing.length === 0) return have

  // Fill gaps so new headers land after the last existing column
  const padded = [...raw]
  while (padded.length < have.length) padded.push('')
  const start = padded.length
  const range = `${tab}!${columnLetter(start)}1:${columnLetter(start + missing.length - 1)}1`
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`
  const res = await fetchWithTimeout(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [missing] }),
  })
  if (!res.ok) throw new Error(`Sheets header update failed ${res.status}: ${await res.text()}`)
  return [...have, ...missing.map(normaliseHeader)]
}
