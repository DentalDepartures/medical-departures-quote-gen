// Edge Function — Anthropic quote extraction, converted from Lambda to Deno.
// Environment variables: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (optional)

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

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS })
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500, headers: CORS,
    })
  }

  let rawText: string
  try {
    const body = await request.json() as { rawText?: unknown }
    if (typeof body.rawText !== 'string' || !body.rawText) throw new Error('rawText missing')
    rawText = body.rawText
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body — rawText required' }), {
      status: 400, headers: CORS,
    })
  }

  const model = Deno.env.get('ANTHROPIC_MODEL') || 'claude-opus-4-5'

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
        messages: [{ role: 'user', content: `Extract the quote data from this text:\n\n${rawText}` }],
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      return new Response(
        JSON.stringify({ error: `Anthropic error ${anthropicRes.status}: ${errText}` }),
        { status: 500, headers: CORS },
      )
    }

    const result = await anthropicRes.json() as { content: { text: string }[] }
    const text = result.content?.[0]?.text ?? ''

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('No JSON in AI response')
      parsed = JSON.parse(match[0])
    }

    return new Response(JSON.stringify(parsed), { status: 200, headers: CORS })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS })
  }
}
