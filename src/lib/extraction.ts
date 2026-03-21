import type { QuoteData } from '../types'
import { getApiKey } from './storage'

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

function parseJsonFromText(text: string): QuoteData {
  try {
    return JSON.parse(text) as QuoteData
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON object found in AI response')
    return JSON.parse(match[0]) as QuoteData
  }
}

async function callAnthropic(rawText: string, apiKey: string): Promise<QuoteData> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
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

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Anthropic API ${response.status}: ${errText}`)
  }

  const result = await response.json()
  const text: string = result.content?.[0]?.text ?? ''
  return parseJsonFromText(text)
}

export async function extractQuoteData(rawText: string): Promise<QuoteData> {
  // 1. Try the server-side proxy first (works in Netlify/Vercel production)
  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data && !data.error) {
        return data as QuoteData
      }
      // Server responded but Anthropic returned an error (e.g. no credits)
      if (data?.error) {
        throw new Error(data.error)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Only fall through to direct call if the proxy itself wasn't reachable.
    // If the proxy reached Anthropic and got back a real error, surface it.
    if (msg.includes('Anthropic error') || msg.includes('credit balance') || msg.includes('invalid')) {
      throw err
    }
    // Otherwise proxy not available — fall through to direct call
  }

  // 2. Fall back to direct Anthropic call using localStorage API key
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('NO_API_KEY')
  }

  return callAnthropic(rawText, apiKey)
}
