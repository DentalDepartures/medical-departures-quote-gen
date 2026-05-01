// Edge Function — runs on Cloudflare Workers (no Lambda 4KB env var limit).
// Proxies template PDF fetches server-side to avoid browser CORS restrictions.
// Converts Google Drive /view and /file URLs to direct-download URLs automatically.

function toDirectDownloadUrl(url: string): string {
  const match = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/)
  if (match) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}`
  }
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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  const { searchParams } = new URL(request.url)
  const templateUrl = searchParams.get('url')

  if (!templateUrl) {
    return new Response(JSON.stringify({ error: 'Missing ?url= parameter' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  if (!isAllowedUrl(templateUrl)) {
    return new Response(JSON.stringify({ error: 'URL not allowed — must be Google Drive or Netlify' }), {
      status: 403,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const downloadUrl = toDirectDownloadUrl(templateUrl)

    const res = await fetch(downloadUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; QuoteGenerator/1.0)',
      },
    })

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: `Template source returned ${res.status}: ${res.statusText}` }),
        { status: res.status, headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('pdf') && !contentType.includes('octet-stream')) {
      return new Response(
        JSON.stringify({
          error: `Expected PDF but got "${contentType}". Check that the Google Drive file is set to "Anyone with the link can view".`,
        }),
        { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }

    const buffer = await res.arrayBuffer()

    return new Response(buffer, {
      status: 200,
      headers: {
        ...CORS,
        'Content-Type': 'application/pdf',
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: `Proxy error: ${String(err)}` }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
}
