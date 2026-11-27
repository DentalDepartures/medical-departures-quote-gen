import type { ClinicRow, QuoteData, AgentProfile, ScrapedClinic, NewClinicPayload } from '../types'
import { getAdminKey } from './appMode'
import { api } from './env'

const adminHeaders = (): Record<string, string> => (getAdminKey() ? { 'x-admin-key': getAdminKey() } : {})

async function parseJson<T>(res: Response, what: string): Promise<T> {
  const raw = await res.text()
  let data: T & { error?: string }
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error(`${what} returned non-JSON (${res.status}): ${raw.slice(0, 160)}`)
  }
  if (!res.ok || (data && data.error)) throw new Error(data?.error ?? `${what} failed: ${res.status}`)
  return data
}

export async function fetchClinicRows(): Promise<ClinicRow[]> {
  const data = await parseJson<{ rows?: ClinicRow[] }>(await fetch(api('/api/clinics')), 'Clinics API')
  return data.rows ?? []
}

// The six sales agents, used only if the agents API cannot be reached at all
const DEFAULT_AGENTS: AgentProfile[] = [
  { name: 'Aileen Castro', email: 'aileen.castro@dentaldepartures.com', phone: '+66 2 508 8449' },
  { name: 'Celeste Aguirre', email: 'celeste.aguirre@dentaldepartures.com', phone: '+52 1 33 4162 2222' },
  { name: 'Grant Butler', email: 'grant.butler@dentaldepartures.com', phone: '+1 (866) 799-4028' },
  { name: 'Melea Soriano', email: 'melea.soriano@medicaldepartures.com', phone: '+44 1633 906816' },
  { name: 'Amira Dup-et', email: 'amira.dupet@medicaldepartures.com', phone: '+1 (959) 300-2038' },
  { name: 'Moffy Suson', email: 'mornjatte.suson@medicaldepartures.com', phone: '+17058051606' },
]

/** Sales agents for the "Choose the sales agent" dropdown. Never throws and never comes back empty. */
export async function fetchAgents(): Promise<AgentProfile[]> {
  try {
    const data = await parseJson<{ agents?: AgentProfile[] }>(await fetch(api('/api/agents')), 'Agents API')
    return data.agents?.length ? data.agents : DEFAULT_AGENTS
  } catch {
    return DEFAULT_AGENTS
  }
}

export async function scrapeClinic(url: string): Promise<ScrapedClinic> {
  return parseJson<ScrapedClinic>(await fetch(api(`/api/scrape-clinic?url=${encodeURIComponent(url)}`), { headers: adminHeaders() }), 'Clinic page reader')
}

export async function addClinic(payload: NewClinicPayload): Promise<{ ok: boolean; folder?: string; rowsAdded: number; skipped?: number; warnings?: string[] }> {
  return parseJson(
    await fetch(api('/api/add-clinic'), { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminHeaders() }, body: JSON.stringify(payload) }),
    'Add clinic',
  )
}

function toBase64(bytes: Uint8Array): string {
  const chunkSize = 8192
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)))
  }
  return btoa(chunks.join(''))
}

/** Saves the quote PDF to the clinic's Drive folder (a flyer quote: the brand's flyers folder) and returns its link. */
export async function uploadQuote(params: {
  pdfBytes: Uint8Array
  filename: string
  quote: QuoteData
  brand: string
  flyer?: boolean
}): Promise<{ webViewLink: string }> {
  const { pdfBytes, filename, quote, brand, flyer } = params
  return parseJson(
    await fetch(api('/api/upload-quote'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfBase64: toBase64(pdfBytes), filename, brand, googleFolder: quote.googleFolder, flyer: !!flyer }),
    }),
    'Quote upload',
  )
}

/** Largest original flyer file the app saves to Drive (bigger: the quote is still made, the original is not saved). */
export const MAX_FLYER_ORIGINAL_MB = 15

function mimeOf(file: File): string {
  if (file.type) return file.type
  const n = file.name.toLowerCase()
  return n.endsWith('.pdf') ? 'application/pdf' : n.endsWith('.png') ? 'image/png' : n.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
}

/** Saves the original flyer file the agent uploaded (PDF or photo) to the brand's flyers folder; returns its link. */
export async function uploadFlyerOriginal(params: { file: File; filename: string; brand: string }): Promise<{ webViewLink: string }> {
  const { file, filename, brand } = params
  if (file.size > MAX_FLYER_ORIGINAL_MB * 1024 * 1024) throw new Error(`it is over ${MAX_FLYER_ORIGINAL_MB} MB`)
  return parseJson(
    await fetch(api('/api/upload-quote'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: toBase64(new Uint8Array(await file.arrayBuffer())), mimeType: mimeOf(file), filename, brand, flyer: true }),
    }),
    'Flyer upload',
  )
}

/**
 * Writes the quote's row to the Quotes Tracker. Google Sheets is sometimes slow, so it tries up to
 * three times; the server skips a quote ID that is already logged, so a retry never doubles a row.
 */
export async function logQuote(params: {
  quoteId: string
  quote: QuoteData
  agent: AgentProfile
  opsAgent: string
  brand: string
  webViewLink: string
  uploadError?: string
  flyer?: boolean
  flyerLink?: string
}): Promise<void> {
  const { quoteId, quote, agent, opsAgent, brand, webViewLink, uploadError, flyer, flyerLink } = params
  const body = JSON.stringify({
    quoteId,
    patientName: quote.patientName,
    clinicName: quote.clinicName,
    brand,
    agentName: agent.name,
    agentEmail: agent.email,
    opsAgent,
    quoteDate: quote.quoteDate,
    webViewLink,
    uploadError: uploadError ?? '',
    flyer: !!flyer,
    flyerLink: flyerLink ?? '',
  })
  let lastErr: unknown
  for (const wait of [0, 3000, 8000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait))
    try {
      await parseJson(await fetch(api('/api/log-quote'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }), 'Quotes Tracker')
      return
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

export async function reportError(params: {
  errorType: 'extraction' | 'pdf' | 'api_key' | 'network' | 'tracker' | 'unknown'
  message: string
  step: string
  patientName?: string | null
  agentName?: string | null
  agentEmail?: string | null
}): Promise<void> {
  try {
    await fetch(api('/api/report-error'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, timestamp: new Date().toISOString() }),
    })
  } catch { /* never block the UI */ }
}
