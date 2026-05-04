// Edge Function — Anthropic quote extraction, converted from Lambda to Deno.
// Environment variables: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (optional)

const SYSTEM_PROMPT = `You are a medical/dental tourism quote extraction specialist.
Extract structured data from the provided quote text and return ONLY valid JSON.

IMPORTANT: If the text contains multiple distinct procedures/treatments, return ONE object per procedure.
If only one procedure is mentioned, return an array with one item.

Return a JSON ARRAY where each element matches this schema (null for missing fields, [] for missing lists):
[
  {
    "patientName": string | null,
    "quoteDate": null,
    "treatmentName": string | null,
    "clinicName": string | null,
    "clinicLocation": string | null,
    "clinicProfileUrl": string | null,
    "price": number | null,
    "currency": string,
    "inclusions": string[],
    "exclusions": string[],
    "surgeonName": string | null,
    "surgeonTitle": string | null,
    "accreditations": string | null,
    "importantNotes": string | null
  }
]

Rules:
- Return ONLY the JSON array, zero other text
- Each procedure with its own price, inclusions, exclusions gets its own object
- Shared fields (patientName, clinicName, surgeonName, etc.) are duplicated across objects
- price: the FINAL payable price only. Strip all currency symbols and commas — plain number only
- currency: ISO code — THB, USD, MXN, EUR, BRL, GBP, AUD, etc. Default to USD if unknown
- quoteDate: always return null — the date is set automatically by the application
- Handle any language (Spanish, Portuguese, Thai, French, etc.)
- clinicLocation: "City, Country" format
- importantNotes: each note on its own line, prefixed with "- ". Use actual newlines between notes.
  Example: "- Consultation required\n- Valid for 30 days\n- Prices in THB"
- accreditations: combine all accreditation details into one string

--- OPTION-BASED PROMOTIONS ---
When the text is a promotion listing multiple treatment options (e.g. "You can choose from: - Option A for X THB, - Option B for Y THB"):
- Extract EACH option as its own separate object in the array
- Use the specific option name as treatmentName (e.g. "Liposuction - Upper Back")
- Use the specific option price as price
- Apply the shared package inclusions to ALL options
- Apply the shared package exclusions to ALL options
- For importantNotes on EVERY option, always include:
  1. A note stating the lowest available price: "- Package starts from [MIN_PRICE] [CURRENCY]. Final price depends on the selected treatment area."
  2. Any shared notes (validity dates, stay requirements, etc.)
  3. Any option-specific note ONLY on that specific option's object
- Shared fields (clinicName, clinicLocation, surgeonName, etc.) are duplicated across all option objects
- Do NOT invent details not present in the source text`

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
        max_tokens: 4096,
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
      const arr = text.match(/\[[\s\S]*\]/)
      if (arr) { parsed = JSON.parse(arr[0]) }
      else {
        const obj = text.match(/\{[\s\S]*\}/)
        if (!obj) throw new Error('No JSON in AI response')
        parsed = [JSON.parse(obj[0])]
      }
    }

    // Always return an array
    const asArray = Array.isArray(parsed) ? parsed : [parsed]
    return new Response(JSON.stringify(asArray), { status: 200, headers: CORS })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS })
  }
}
