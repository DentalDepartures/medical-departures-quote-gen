// Edge Function — Anthropic quote extraction, converted from Lambda to Deno.
// Environment variables: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (optional)

const PROMPT_HEAD = `You are a Medical and Dental Quote Processing Agent.

Your job is to read raw clinic/hospital quotation text, extract the correct procedure details, and return ONLY a valid JSON array. No other text.

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

=== CORE OUTPUT RULES ===
- Return ONLY the JSON array, zero other text
- quoteDate: always return null
- currency: ISO code (THB, USD, MXN, EUR, BRL, GBP, AUD, IDR, etc.) — default to USD if unknown
- Indonesian Rupiah ("Rp", "IDR"): dots are thousand separators ("Rp 45.000.000" = 45000000) and "jt"/"juta" means million ("45 jt" = 45000000)
- clinicLocation: "City, Country" format
- accreditations: combine all accreditation details into one string
- importantNotes: each note on its own line, prefixed with "- ". Use actual newlines between notes
- Do NOT invent details not present in the source text
- Inside text values never use double quote marks — write 'up to' instead of "up to"
- Fill the return_quotes tool with real objects in the quotes array, never one JSON string
- Shared fields (clinicName, clinicLocation, surgeonName, etc.) must be duplicated across all quote objects when multiple quotes are created
- price: always a plain number (strip all currency symbols and commas) or null
- pricePrefix: "Starting from" or null
`

// Used only when the agent ticks "Separate quote for each treatment"
const SPLIT_RULES = `=== DECISION LOGIC — HOW MANY QUOTES TO CREATE ===

Before producing output, silently decide which rule applies:
1. Are these procedures variations of the same treatment root? → RULE 1
2. Are they different treatment categories? → RULE 2
3. Is this one treatment split into phases or visits? → RULE 3

--- RULE 1: Same Category Variations = ONE Quote ---
Use when the raw text contains several options under the same treatment category/root.
Same root means procedures share the same treatment root word or clearly belong to the same treatment family.

Examples of same root: Liposuction - Upper Back, Liposuction - Arms, Liposuction - Abdomen (root = Liposuction)

Action:
- Create ONE quote only
- treatmentName: use the package/promotion name as written in the source
- price: lowest promotion/final price as the main price (number only)
- pricePrefix: "Starting from"
- inclusions: shared package inclusions only
- exclusions: shared package exclusions only
- importantNotes (use actual newlines between each note):
  - "- Package starts from [LOWEST_PRICE] [CURRENCY]. Final price depends on selected [treatment type] area."
  - "- Available options:" then list each option as "  - [Option Name]: [PRICE] [CURRENCY]" (2-space indent). If an option has a special note, append it after the price on the same line.
  - Any shared conditions (validity dates, stay requirements, etc.) as separate "- " lines

--- RULE 2: Different Treatment Categories = MULTIPLE Quotes ---
Use when the raw text contains multiple procedures that are clearly different treatment categories.
Even if they share the same package inclusions, they must be separated into individual quotes.

Examples: Rhinoplasty + Earlobe Reduction, Breast Augmentation + Liposuction, Dental Implant + Veneers

Action:
- Create one separate quote per distinct procedure
- Each quote gets its own treatmentName and price
- Apply relevant shared inclusions to each quote
- Apply procedure-specific notes only to the relevant quote
- Shared conditions must be duplicated into each quote's importantNotes
- Price rule for different categories: use only the promotion/final price for each procedure. Do not use old price, regular price, or crossed-out price unless it is the only price available.

--- RULE 3: Phased or Staged Treatment = ONE Quote ---
Use when the raw text describes one overall treatment split into phases, visits, or stages.
Examples: dental implants, All-on-4, orthodontic treatment, multi-visit surgery plans.

Action:
- Create ONE quote only
- price: total treatment price. If no total is stated, calculate from all phases.
- Put phase/visit breakdown and timing into inclusions or importantNotes

`

// Default: keep a clinic's treatment plan together — one quote per plan, or per option when the clinic offers options
const COMBINE_RULES = `=== DECISION LOGIC — HOW MANY QUOTES TO CREATE ===

The agent wants ONE quote file for the patient. Return a JSON array with EXACTLY ONE element — never more, whatever the text contains.
If the text holds several treatments, treatment plans, quotes or documents for the same patient — even pasted one after another, each with its own price or total — they are ONE combined plan: put them all in one quote and add up their totals.

Before producing output, silently decide which rule applies:
1. Does the clinic explicitly present alternatives the patient must choose ONE of, using words like "Option 1 / Option 2", "Plan A / Plan B", "Package 1 / Package 2", "or", "alternatively", "choose between"? → RULE A
2. Otherwise → RULE B (everything is one plan = one quote). When unsure, use RULE B.

--- RULE A: Clinic options = still ONE quote, with every option inside ---
- Do NOT add the options up — the patient picks one.
- treatmentName: the shared treatment plus the number of options, e.g. "All-on-4 Upper Arch — 2 options" (max ~60 characters)
- price: the LOWEST option's price, pricePrefix: "Starting from"
- inclusions: first one line per option with its label, short summary and price, e.g. "Option 1 – All-on-4 with acrylic teeth: 8,900 USD", "Option 2 – All-on-4 with zirconia teeth: 12,500 USD"; then the inclusions shared by all options; an inclusion that only one option has gets the option in brackets, e.g. "5-year warranty on zirconia (Option 2)"
- exclusions and importantNotes: shared lines once; a note that differs per option starts with the option, e.g. "- Option 2: second visit 7 days after 4–6 months"

--- RULE B: One treatment plan = ONE quote ---
Use for everything quoted for the patient as one plan, even when it mixes different treatment categories (e.g. Overlays + Crowns + Cleaning, or Rhinoplasty + Earlobe Reduction).
- treatmentName: the plan or package name if the clinic gives one, otherwise the treatments joined with " + " (short, max ~60 characters, e.g. "Overlays + Crowns")
- price: the plan TOTAL — the total stated by the clinic, or if none is stated, the sum of the final price of every item in the plan. When several plans/quotes are combined, add up each one's total. pricePrefix: null
- If combined plans use different currencies, keep the currency of the largest amount and add a line in importantNotes with each plan's original price
- Exception — alternatives inside a plan: if items are variations of the same treatment where the patient picks only one (e.g. liposuction areas, implant brands, crown materials), do not add them up: use the lowest price with pricePrefix "Starting from" and list each variation with its price in importantNotes as "  - [Variation]: [PRICE] [CURRENCY]"
- inclusions: first one line per treatment with its quantity and price, e.g. "Overlay x8 (teeth 14, 15, 16, 17, 24, 25, 36, 46): 60,000 MXN" (for a combined plan, one line per plan with its total, e.g. "All-on-4 with Zirconia Crown: 12,000 USD"), then the package inclusions (hotel, transfers, consultation, etc.) without repeating the same item twice
- Visits, phases and timing (e.g. "Day 1: preparation and scanning") go in importantNotes
- exclusions and importantNotes are shared by the whole plan — never repeat the same line

`

const PROMPT_TAIL = `=== PRICE RULES ===
Priority order (use highest available):
1. Promotion price
2. Discounted price
3. Final quoted price
4. Starting price
5. Regular price (only if no other price exists)

For same-category variations: use the lowest promotion/final price as the main price. Put all variation prices in importantNotes.
For different treatment categories: extract only the promotion/final price for each procedure separately.

=== LINE LIMITS ===
Keep text concise. The PDF has strict limits:
- inclusions: max 30 lines
- exclusions: max 7 lines
- importantNotes: max 23 lines

Do not pad or repeat information to fill space. Do not invent missing details.`

const systemPrompt = (splitTreatments: boolean) =>
  `${PROMPT_HEAD}\n${splitTreatments ? SPLIT_RULES : COMBINE_RULES}${PROMPT_TAIL}`

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

// The quotes come back through a forced tool call, so the API hands over valid JSON — a quote mark copied from
// the clinic text (e.g. ("up to")) can no longer break parsing the way free-text JSON did
const nullable = (type: string) => ({ type: [type, 'null'] })
const QUOTE_TOOL = {
  name: 'return_quotes',
  description: 'Return the extracted quotes (the JSON array described in the instructions).',
  input_schema: {
    type: 'object',
    properties: {
      quotes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            patientName: nullable('string'),
            quoteDate: { type: 'null' },
            treatmentName: nullable('string'),
            clinicName: nullable('string'),
            clinicLocation: nullable('string'),
            clinicProfileUrl: nullable('string'),
            price: nullable('number'),
            pricePrefix: nullable('string'),
            currency: { type: 'string' },
            inclusions: { type: 'array', items: { type: 'string' } },
            exclusions: { type: 'array', items: { type: 'string' } },
            surgeonName: nullable('string'),
            surgeonTitle: nullable('string'),
            accreditations: nullable('string'),
            importantNotes: nullable('string'),
          },
          required: ['treatmentName', 'price', 'currency', 'inclusions', 'exclusions'],
        },
      },
    },
    required: ['quotes'],
  },
}

/**
 * JSON.parse that survives quote marks the AI copied into a text value unescaped, e.g. maximums ("up to"):
 * the parser stops just after such a quote, so the last quote before that spot is escaped and parsing retried.
 */
function parseLenient(text: string): unknown {
  let s = text
  for (let tries = 0; ; tries++) {
    try {
      return JSON.parse(s)
    } catch (err) {
      const at = Number(String(err).match(/position (\d+)/)?.[1] ?? NaN)
      const q = Number.isNaN(at) ? -1 : s.lastIndexOf('"', at - 1)
      if (tries >= 40 || q <= 0) throw err
      s = s.slice(0, q) + '\\"' + s.slice(q + 1)
    }
  }
}

/** Free-text fallback, for a reply without the tool call (or the whole list sent as one string) */
function parseText(text: string): unknown {
  try {
    return parseLenient(text)
  } catch {
    const arr = text.match(/\[[\s\S]*\]/)
    if (arr) return parseLenient(arr[0])
    const obj = text.match(/\{[\s\S]*\}/)
    if (!obj) throw new Error('No JSON in AI response')
    return [parseLenient(obj[0])]
  }
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
  let splitTreatments = false
  try {
    const body = await request.json() as { rawText?: unknown; splitTreatments?: unknown }
    if (typeof body.rawText !== 'string' || !body.rawText) throw new Error('rawText missing')
    rawText = body.rawText
    splitTreatments = body.splitTreatments === true
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body — rawText required' }), {
      status: 400, headers: CORS,
    })
  }

  const model = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6'

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
        max_tokens: 8192,
        system: systemPrompt(splitTreatments),
        tools: [QUOTE_TOOL],
        tool_choice: { type: 'tool', name: QUOTE_TOOL.name },
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

    const result = await anthropicRes.json() as {
      content?: { type: string; text?: string; input?: { quotes?: unknown } }[]
      stop_reason?: string
    }
    if (result.stop_reason === 'max_tokens') throw new Error('The quote text is too long for one go — split it into smaller parts and extract each')
    const call = result.content?.find((c) => c.type === 'tool_use')
    // Long quotes sometimes come back as the whole JSON list in one string instead of real objects
    const quotes = call?.input?.quotes
    const parsed: unknown = typeof quotes === 'string'
      ? parseText(quotes)
      : quotes ?? parseText(result.content?.find((c) => c.type === 'text')?.text ?? '')

    // Always return an array
    const asArray = Array.isArray(parsed) ? parsed : [parsed]
    return new Response(JSON.stringify(asArray), { status: 200, headers: CORS })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: CORS })
  }
}
