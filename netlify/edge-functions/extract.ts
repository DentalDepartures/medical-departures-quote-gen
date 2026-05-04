// Edge Function — Anthropic quote extraction, converted from Lambda to Deno.
// Environment variables: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (optional)

const SYSTEM_PROMPT = `You are a medical/dental tourism quote extraction specialist.
Extract structured data from the provided quote text and return ONLY valid JSON.

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
    "pricePrefix": string | null,
    "currency": string,
    "inclusions": string[],
    "exclusions": string[],
    "surgeonName": string | null,
    "surgeonTitle": string | null,
    "accreditations": string | null,
    "importantNotes": string | null
  }
]

═══════ CORE RULES ═══════
- Return ONLY the JSON array, zero other text
- quoteDate: always return null
- currency: ISO code — THB, USD, MXN, EUR, BRL, GBP, AUD, etc. Default to USD if unknown
- clinicLocation: "City, Country" format
- accreditations: combine all accreditation details into one string
- importantNotes: each note on its own line, prefixed with "- ". Use actual newlines (\n) between notes
- Do NOT invent details not in the source text
- Shared fields (clinicName, clinicLocation, surgeonName, etc.) are duplicated across all quote objects

═══════ PRICE RULES ═══════
- If only one price exists → price = that number, pricePrefix = null
- If BOTH Original Price and Promotion Price exist → price = Promotion Price (number only), pricePrefix = null. Ignore original price in the price field (may mention in importantNotes if useful)
- If the source lists SAME-ROOT options with different prices → price = lowest numeric price, pricePrefix = "Starting from"
- price field is always a plain number (strip all currency symbols and commas) or null
- pricePrefix field is "Starting from" or null

═══════ GROUPING RULES ═══════
Determine the number of quote objects based on TREATMENT ROOT:

SAME ROOT → ONE quote object
If multiple options share the same treatment root (e.g. all are "Liposuction" variants), group them into ONE quote:
- treatmentName: use the package/promotion name as written in the source (e.g. "Liposuction Package Promotion - Wansiri Hospital")
- price: lowest option price (number)
- pricePrefix: "Starting from"
- inclusions: shared package inclusions
- exclusions: shared package exclusions
- importantNotes: include ALL of the following using actual newlines:
  1. "- Package starts from [LOWEST_PRICE] [CURRENCY]. Final price depends on selected [treatment type] area."
  2. "- Available options:\n  - [Option Name]: [PRICE] [CURRENCY]" — list ALL options, one per line with 2-space indent. If an option has a special note, append it after the price on the same line.
  3. Any shared conditions (validity dates, stay requirements, etc.)

DIFFERENT ROOTS → SEPARATE quote objects
If the source contains clearly different treatment types (e.g. "Nose reduction" and "Earlobe reduction"), create one object per treatment root.
- Each gets its own treatmentName, price, inclusions, exclusions
- Shared information (conditions, pre-op costs, notes) is duplicated into each object's importantNotes`

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
