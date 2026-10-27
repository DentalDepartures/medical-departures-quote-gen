import type { ClinicRow, QuoteData, AgentProfile, ScrapedClinic, NewClinicPayload } from '../types'
import { getAdminKey } from './appMode'

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
  const data = await parseJson<{ rows?: ClinicRow[] }>(await fetch('/api/clinics'), 'Clinics API')
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
    const data = await parseJson<{ agents?: AgentProfile[] }>(await fetch('/api/agents'), 'Agents API')
    return data.agents?.length ? data.agents : DEFAULT_AGENTS
  } catch {
    return DEFAULT_AGENTS
  }
}

export async function scrapeClinic(url: string): Promise<ScrapedClinic> {
  return parseJson<ScrapedClinic>(await fetch(`/api/scrape-clinic?url=${encodeURIComponent(url)}`, { headers: adminHeaders() }), 'Clinic page reader')
}

export async function addClinic(payload: NewClinicPayload): Promise<{ ok: boolean; folder?: string; rowsAdded: number; skipped?: number; warnings?: string[] }> {
  return parseJson(
    await fetch('/api/add-clinic', { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminHeaders() }, body: JSON.stringify(payload) }),
    'Add clinic',
  )
}

/** Saves the quote PDF to the clinic's Drive folder and returns its link. */
export async function uploadQuote(params: {
  pdfBytes: Uint8Array
  filename: string
  quote: QuoteData
  brand: string
}): Promise<{ webViewLink: string }> {
  const { pdfBytes, filename, quote, brand } = params
  const chunkSize = 8192
  const chunks: string[] = []
  for (let i = 0; i < pdfBytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode(...pdfBytes.subarray(i, i + chunkSize)))
  }
  const pdfBase64 = btoa(chunks.join(''))

  return parseJson(
    await fetch('/api/upload-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfBase64, filename, brand, googleFolder: quote.googleFolder }),
    }),
    'Quote upload',
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
}): Promise<void> {
  const { quoteId, quote, agent, opsAgent, brand, webViewLink, uploadError } = params
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
  })
  let lastErr: unknown
  for (const wait of [0, 3000, 8000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait))
    try {
      await parseJson(await fetch('/api/log-quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }), 'Quotes Tracker')
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
    await fetch('/api/report-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, timestamp: new Date().toISOString() }),
    })
  } catch { /* never block the UI */ }
}
