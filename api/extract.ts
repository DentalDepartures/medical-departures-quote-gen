// Vercel serverless function — proxies extraction requests to Anthropic.
// The API key lives here on the server; agents never see it.
// Deploy to Vercel and set ANTHROPIC_API_KEY in the environment variables dashboard.

const SYSTEM_PROMPT = `You are a medical/dental tourism quote extraction specialist.
Extract structured data from the provided quote text and return ONLY valid JSON.

Return JSON matching this exact schema (null for missing fields, [] for missing lists):
{
  "patientName": string | null,
  "quoteDate": string | null,
  "treatmentName": string | null,
  "clinicName": string | null,
  "clinicLocation": string | null,
  "clinicProfileUrl": string | null,
  "price": number | null,
  "currency": string,
  "reducedFrom": number | null,
  "savings": number | null,
  "inclusions": string[],
  "exclusions": string[],
  "surgeonName": string | null,
  "surgeonTitle": string | null,
  "accreditations": string | null,
  "importantNotes": string | null,
  "consultationRequired": boolean | null,
  "suggestedConsultTime": string | null
}

Rules:
- Return ONLY the JSON object, zero other text
- prices must be plain numbers (strip commas and currency symbols)
- currency: ISO code — THB, USD, MXN, EUR, BRL, GBP, AUD, etc. Default to USD if unknown
- Handle any language (Spanish, Portuguese, Thai, French, etc.)
- clinicLocation: "City, Country" format
- importantNotes: combine all medical/clinical notes into one string
- accreditations: combine all accreditation details into one string
- If savings or reducedFrom can be inferred from context, include them`

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured on server' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let rawText: string
  try {
    const body = await req.json()
    rawText = body.rawText
    if (!rawText || typeof rawText !== 'string') {
      return new Response(
        JSON.stringify({ error: 'rawText is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const model = process.env.ANTHROPIC_MODEL || 'claude-opus-4-5'

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Extract the quote data from this text:\n\n${rawText}`,
          },
        ],
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      return new Response(
        JSON.stringify({ error: `Anthropic error: ${anthropicRes.status} — ${errText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const result = await anthropicRes.json()
    const content = result.content?.[0]?.text ?? ''

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      const match = content.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON object found in AI response')
      parsed = JSON.parse(match[0])
    }

    return new Response(JSON.stringify(parsed), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
