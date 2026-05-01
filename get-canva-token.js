// Run with: node get-canva-token.js
// Prerequisite: add http://127.0.0.1:3001/callback to your Canva integration's Redirect URLs

const http   = require('http')
const https  = require('https')
const crypto = require('crypto')
const { execSync } = require('child_process')

const CLIENT_ID     = 'PASTE_YOUR_CLIENT_ID_HERE'
const CLIENT_SECRET = 'PASTE_YOUR_CLIENT_SECRET_HERE'
const REDIRECT_URI  = 'http://127.0.0.1:3001/callback'
const SCOPES        = [
  'design:content:read',
  'design:content:write',
  'design:meta:read',
  'asset:read',
  'asset:write',
  'brandtemplate:meta:read',
  'brandtemplate:content:read',
  'brandtemplate:content:write',
  'profile:read',
].join(' ')

// ── PKCE ─────────────────────────────────────────────────────────────────────
const codeVerifier  = crypto.randomBytes(32).toString('base64url')
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')

const authUrl =
  'https://www.canva.com/api/oauth/authorize' +
  `?response_type=code` +
  `&code_challenge_method=s256` +
  `&code_challenge=${codeChallenge}` +
  `&client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&scope=${encodeURIComponent(SCOPES)}`

console.log('\nOpening Canva authorization in your browser...')
console.log('If it does not open, paste this URL manually:\n')
console.log(authUrl + '\n')

try { execSync(`open "${authUrl}"`) } catch { /* user opens manually */ }

// ── Local server to catch redirect ────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url  = new URL(req.url, 'http://127.0.0.1:3001')
  const code = url.searchParams.get('code')
  const err  = url.searchParams.get('error')

  if (err) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Authorization denied: ' + err + '. Check your terminal.')
    server.close()
    console.error('\n❌ Authorization denied:', err)
    return
  }

  if (!code) {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('No code received — please try running the script again.')
    return
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('✅ Authorization successful! Check your terminal for the refresh token. You can close this tab.')
  server.close()

  console.log('\nAuthorization code received — exchanging for tokens...')

  // ── Exchange code for tokens ────────────────────────────────────────────────
  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  REDIRECT_URI,
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code_verifier: codeVerifier,   // PKCE verifier
  }).toString()

  const options = {
    hostname: 'api.canva.com',
    path:     '/rest/v1/oauth/token',
    method:   'POST',
    headers: {
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  }

  const tokenReq = https.request(options, (tokenRes) => {
    let data = ''
    tokenRes.on('data', (chunk) => { data += chunk })
    tokenRes.on('end', () => {
      let tokens
      try { tokens = JSON.parse(data) } catch {
        console.error('Could not parse response:', data)
        return
      }

      if (tokens.refresh_token) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('✅  Add these to Netlify environment variables:')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
        console.log('CANVA_CLIENT_ID=' + CLIENT_ID)
        console.log('CANVA_CLIENT_SECRET=' + CLIENT_SECRET)
        console.log('CANVA_REFRESH_TOKEN=' + tokens.refresh_token)
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      } else {
        console.error('\n❌ No refresh_token in response:')
        console.error(JSON.stringify(tokens, null, 2))
      }
    })
  })

  tokenReq.on('error', console.error)
  tokenReq.write(body)
  tokenReq.end()
})

server.listen(3001, '127.0.0.1', () => {
  console.log('Waiting on http://127.0.0.1:3001/callback ...\n')
})
