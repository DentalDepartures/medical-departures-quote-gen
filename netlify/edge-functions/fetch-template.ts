// Edge Function — proxies template PDF fetches server-side to avoid browser CORS restrictions.
// Uses Google Drive API v3 with service account auth so files don't need public sharing.
// Requires: GOOGLE_SERVICE_ACCOUNT_JSON env var + Drive folder shared with service account as Viewer.

declare const Deno: { env: { get(key: string): string | undefined } }

// ── JWT / OAuth helpers (same pattern as clinics.ts) ────────────────────────

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

async function getDriveAccessToken(): Promise<string> {
  const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')
  const sa = JSON.parse(saJson) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)

  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
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

// ── Drive helpers ────────────────────────────────────────────────────────────

function extractDriveFileId(url: string): string | null {
  // /file/d/{fileId}/view  or  /file/d/{fileId}
  const pathMatch = url.match(/\/file\/d\/([^/?#]+)/)
  if (pathMatch) return pathMatch[1]
  // ?id={fileId}
  try {
    const id = new URL(url).searchParams.get('id')
    if (id) return id
  } catch { /* ignore */ }
  return null
}

function isDriveUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'drive.google.com' || hostname === 'drive.usercontent.google.com'
  } catch {
    return false
  }
}

function isAllowedUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return (
      hostname === 'drive.google.com' ||
      hostname === 'drive.usercontent.google.com' ||
      hostname === 'docs.google.com' ||
      hostname.endsWith('.netlify.app') ||
      hostname.endsWith('.netlify.com')
    )
  } catch {
    return false
  }
}

// ── CORS ─────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Handler ──────────────────────────────────────────────────────────────────

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  const { searchParams } = new URL(request.url)
  const templateUrl = searchParams.get('url')

  if (!templateUrl) return jsonError('Missing ?url= parameter', 400)
  if (!isAllowedUrl(templateUrl)) return jsonError('URL not allowed — must be Google Drive or Netlify', 403)

  try {
    // ── Authenticated Drive API v3 fetch ──────────────────────────────────
    if (isDriveUrl(templateUrl)) {
      const fileId = extractDriveFileId(templateUrl)
      if (!fileId) return jsonError('Could not extract file ID from Drive URL', 400)

      const saJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')

      if (saJson) {
        // Service account auth — works without public sharing
        const token = await getDriveAccessToken()
        const driveRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          { headers: { Authorization: `Bearer ${token}` } },
        )

        if (driveRes.status === 403) {
          return jsonError(
            'Template PDF is not accessible. Share the "Quotes Auto" Google Drive folder with quote-generator@valid-shine-476508-u5.iam.gserviceaccount.com as Viewer.',
            403,
          )
        }
        if (driveRes.status === 404) {
          return jsonError('Template PDF not found. Check the template URL in the clinic sheet.', 404)
        }
        if (!driveRes.ok) {
          return jsonError(`Drive API returned ${driveRes.status}: ${driveRes.statusText}`, driveRes.status)
        }

        const buffer = await driveRes.arrayBuffer()
        return new Response(buffer, {
          status: 200,
          headers: { ...CORS, 'Content-Type': 'application/pdf', 'Cache-Control': 'public, max-age=300' },
        })
      }

      // Fallback: no service account configured — try unauthenticated public URL
      const fallbackUrl = `https://drive.google.com/uc?export=download&id=${fileId}`
      const res = await fetch(fallbackUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QuoteGenerator/1.0)' },
      })
      if (!res.ok) return jsonError(`Template source returned ${res.status}: ${res.statusText}`, res.status)

      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
        return jsonError(
          `Expected PDF but got "${contentType}". The file must be set to "Anyone with the link can view" or the Drive folder must be shared with the service account.`,
          502,
        )
      }

      const buffer = await res.arrayBuffer()
      return new Response(buffer, {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/pdf', 'Cache-Control': 'public, max-age=300' },
      })
    }

    // ── Non-Drive URL (Netlify, etc.) — plain fetch ───────────────────────
    const res = await fetch(templateUrl, { redirect: 'follow' })
    if (!res.ok) return jsonError(`Template source returned ${res.status}: ${res.statusText}`, res.status)

    const buffer = await res.arrayBuffer()
    return new Response(buffer, {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/pdf', 'Cache-Control': 'public, max-age=300' },
    })
  } catch (err) {
    return jsonError(`Proxy error: ${String(err)}`, 500)
  }
}
