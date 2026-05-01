// Proxies a template PDF fetch server-side to avoid browser CORS restrictions.
// Accepts: GET /api/fetch-template?url=<encoded-template-url>
// Converts Google Drive /view and /file URLs to direct-download URLs automatically.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

type NetlifyEvent = {
  httpMethod: string
  queryStringParameters: Record<string, string> | null
}

function toDirectDownloadUrl(url: string): string {
  // Google Drive: /file/d/FILE_ID/view  →  /uc?export=download&id=FILE_ID
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/)
  if (fileMatch) {
    return `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`
  }
  // Already a direct download URL or other host — use as-is
  return url
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

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }

  const templateUrl = event.queryStringParameters?.url
  if (!templateUrl) {
    return {
      statusCode: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing ?url= parameter' }),
    }
  }

  if (!isAllowedUrl(templateUrl)) {
    return {
      statusCode: 403,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'URL not allowed — must be Google Drive or Netlify' }),
    }
  }

  try {
    const downloadUrl = toDirectDownloadUrl(templateUrl)

    const res = await fetch(downloadUrl, {
      redirect: 'follow',
      headers: {
        // Identifies as a non-browser to get the raw file from Google Drive
        'User-Agent': 'Mozilla/5.0 (compatible; QuoteGenerator/1.0)',
      },
    })

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Template source returned ${res.status}: ${res.statusText}` }),
      }
    }

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
      return {
        statusCode: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: `Expected PDF but got ${contentType}. Check that the Google Drive file is publicly shared and the URL is correct.`,
        }),
      }
    }

    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/pdf',
        'Cache-Control': 'public, max-age=300', // cache template for 5 min
      },
      body: base64,
      isBase64Encoded: true,
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Proxy error: ${String(err)}` }),
    }
  }
}
