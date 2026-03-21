// Netlify serverless function — identical logic to api/extract.ts (Vercel version).
// Netlify routes: POST /.netlify/functions/extract
// netlify.toml rewrites /api/extract → here, so the frontend is unchanged.
// Set ANTHROPIC_API_KEY in Netlify dashboard → Site configuration → Environment variables.

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

type NetlifyEvent = {
  httpMethod: string
  body: string | null
}

type NetlifyResponse = {
  statusCode: number
  headers: Record<string, string>
  body: string
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

export const handler = async (event: NetlifyEvent): Promise<NetlifyResponse> => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
    }
  }

  let rawText: string
  try {
    const body = JSON.parse(event.body ?? '{}') as { rawText?: unknown }
    if (typeof body.rawText !== 'string' || !body.rawText) {
      throw new Error('rawText missing')
    }
    rawText = body.rawText
  } catch {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Invalid request body — rawText required' }),
    }
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
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: `Anthropic error ${anthropicRes.status}: ${errText}` }),
      }
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

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(parsed),
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: String(err) }),
    }
  }
}
