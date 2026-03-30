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
- consultationRequired: set true if ANY mention of consultation, consultation appointment, or follow-up visit is found
- suggestedConsultTime: extract the SPECIFIC date, time, or scheduling info for the consultation — look for any mention of appointment dates, times, "schedule on", "available on", "consult on", "follow-up on" etc. This MUST be extracted here, never left in importantNotes
- importantNotes: combine all medical/clinical notes into one string — NEVER include consultation scheduling info here, it belongs in suggestedConsultTime
- accreditations: combine all accreditation details into one string
- reducedFrom: the original/regular/full price BEFORE any discount — look for words like "regular price", "original price", "reduced from", "was", "normal price", "list price"
- savings: the discount amount in the same currency — look for "save", "savings", "discount", "you save", or calculate as reducedFrom - price if both are present
- Always extract reducedFrom and savings if ANY pricing comparison is mentioned in the text
- importantNotes: EXCLUDE any pricing-related information (prices, discounts, savings, payment terms, costs) — pricing is already captured in the price fields above. Only include clinical/medical notes here. Format as structured bullet points: use "- " for top-level bullets and "  - " (2 spaces + dash + space) for sub-bullets. Example: "- Recovery timeline:\\n  - Week 1-2: swelling and bruising\\n  - Week 3-4: social recovery\\n- Post-op care required"`

async function notifyError(type, message, step) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'MD Quote Generator <onboarding@resend.dev>',
        to: 'yana.arkhipova@dentaldepartures.com',
        subject: `[MD Quote Gen] Server Error: ${type}`,
        html: `<p><b>Error:</b> ${type}</p><p><b>Step:</b> ${step}</p><p><b>Message:</b> <code>${message}</code></p><p><b>Time:</b> ${new Date().toISOString()}</p>`,
      }),
    })
  } catch { /* silent */ }
}

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
      await notifyError('Anthropic API Error', errText, 'AI extraction request')
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
    await notifyError('Extraction Function Crash', String(err), 'Netlify function handler')
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) }
  }
}
