const SYSTEM_PROMPT = `You are a medical/dental tourism quote extraction specialist.
Extract structured data from the provided quote text and return ONLY a valid JSON array.

IMPORTANT: If the text contains multiple distinct procedures/treatments, return ONE object per procedure.
If only one procedure is mentioned, return an array with one item.

Return a JSON ARRAY where each element matches this schema (null for missing fields, [] for missing lists):
[
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
]

Rules:
- Return ONLY the JSON array, zero other text
- Each procedure with its own price, inclusions, exclusions gets its own object
- Shared fields (patientName, clinicName, surgeonName, etc.) are duplicated across objects
- prices must be plain numbers (strip commas and currency symbols)
- currency: ISO code — THB, USD, MXN, EUR, BRL, GBP, AUD, etc. Default to USD if unknown
- Handle any language (Spanish, Portuguese, Thai, French, etc.)
- clinicLocation: "City, Country" format
- importantNotes: combine all medical/clinical notes into one string
- accreditations: combine all accreditation details into one string
- If savings or reducedFrom can be inferred from context, include them`

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const { rawText } = JSON.parse(event.body)
    const apiKey = process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'No API key configured on server' }) }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Extract the quote data from this text:\n\n${rawText}` }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      return { statusCode: 500, body: JSON.stringify({ error: `Anthropic error: ${errText}` }) }
    }

    const result = await response.json()
    const text = result.content?.[0]?.text ?? ''

    let data
    try {
      data = JSON.parse(text)
    } catch {
      const arrMatch = text.match(/\[[\s\S]*\]/)
      if (arrMatch) { data = JSON.parse(arrMatch[0]) }
      else {
        const objMatch = text.match(/\{[\s\S]*\}/)
        if (!objMatch) throw new Error('No JSON found in AI response')
        data = [JSON.parse(objMatch[0])]
      }
    }

    if (!Array.isArray(data)) data = [data]

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) }
  }
}
