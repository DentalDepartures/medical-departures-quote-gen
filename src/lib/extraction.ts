import type { QuoteData } from '../types'
import { getApiKey } from './storage'

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

function parseJsonFromText(text: string): QuoteData[] {
  const parsed = (() => {
    try {
      return JSON.parse(text)
    } catch {
      const match = text.match(/\[[\s\S]*\]/)
      if (match) return JSON.parse(match[0])
      const obj = text.match(/\{[\s\S]*\}/)
      if (obj) return [JSON.parse(obj[0])]
      throw new Error('No JSON found in AI response')
    }
  })()
  return Array.isArray(parsed) ? parsed as QuoteData[] : [parsed as QuoteData]
}

async function callAnthropic(rawText: string, apiKey: string): Promise<QuoteData[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-allow-browser': 'true',
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
    throw new Error(`Anthropic API ${response.status}: ${errText}`)
  }

  const result = await response.json()
  const text: string = result.content?.[0]?.text ?? ''
  return parseJsonFromText(text)
}

export async function extractQuoteData(rawText: string): Promise<QuoteData[]> {
  // 1. Try server-side proxy first
  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data && !data.error) {
        return Array.isArray(data) ? data as QuoteData[] : [data as QuoteData]
      }
      if (data?.error) throw new Error(data.error)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Anthropic error') || msg.includes('credit balance') || msg.includes('invalid')) {
      throw err
    }
  }

  // 2. Fall back to direct call
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || getApiKey()
  if (!apiKey) throw new Error('NO_API_KEY')
  return callAnthropic(rawText, apiKey)
}
