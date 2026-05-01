// Edge Function — sends error notification emails via Resend.
// Environment variables: RESEND_API_KEY

const YANA_EMAIL = 'yana.arkhipova@dentaldepartures.com'
const FROM_EMAIL = 'MD Quote Generator <onboarding@resend.dev>'

const ERROR_LABELS: Record<string, string> = {
  extraction: 'Quote Extraction Failed',
  pdf:        'PDF Generation Failed',
  api_key:    'Anthropic API Key Issue',
  network:    'Network / Connectivity Error',
  unknown:    'Unknown Error',
}

export default async (request: Request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const { errorType, message, step, patientName, agentName, agentEmail, timestamp } =
      await request.json() as Record<string, string>

    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      console.error('[report-error] RESEND_API_KEY not set — skipping email')
      return new Response('ok', { status: 200 })
    }

    const label = ERROR_LABELS[errorType] ?? ERROR_LABELS.unknown
    const time  = timestamp || new Date().toISOString()

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#00467f;padding:16px 24px;border-radius:6px 6px 0 0">
          <h2 style="color:#fff;margin:0;font-size:18px">⚠️ Quote Generator Error</h2>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 6px 6px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#6b7280;width:130px">Error type</td>
                <td style="padding:6px 0;font-weight:600;color:#111">${label}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Step</td>
                <td style="padding:6px 0;color:#111">${step || '—'}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Message</td>
                <td style="padding:6px 0;color:#dc2626;font-family:monospace;font-size:13px">${message || '—'}</td></tr>
            ${patientName ? `<tr><td style="padding:6px 0;color:#6b7280">Patient</td>
                <td style="padding:6px 0;color:#111">${patientName}</td></tr>` : ''}
            ${agentName  ? `<tr><td style="padding:6px 0;color:#6b7280">Agent</td>
                <td style="padding:6px 0;color:#111">${agentName}${agentEmail ? ` &lt;${agentEmail}&gt;` : ''}</td></tr>` : ''}
            <tr><td style="padding:6px 0;color:#6b7280">Time</td>
                <td style="padding:6px 0;color:#111">${time}</td></tr>
          </table>
          <hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb">
          <p style="color:#6b7280;font-size:12px;margin:0">
            Sent automatically by the Medical Departures Quote Generator.<br>
            Site: <a href="https://dental-medical-departures-quote-gen.netlify.app">dental-medical-departures-quote-gen.netlify.app</a>
          </p>
        </div>
      </div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: YANA_EMAIL, subject: `[MD Quote Gen] ${label}`, html }),
    })

    if (!res.ok) console.error('[report-error] Resend API error:', await res.text())

    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('[report-error] Failed:', String(err))
    return new Response('ok', { status: 200 })
  }
}
