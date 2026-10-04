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

export async function scrapeClinic(url: string): Promise<ScrapedClinic> {
  return parseJson<ScrapedClinic>(await fetch(`/api/scrape-clinic?url=${encodeURIComponent(url)}`, { headers: adminHeaders() }), 'Clinic page reader')
}

export async function addClinic(payload: NewClinicPayload): Promise<{ ok: boolean; folder: string; rowsAdded: number; warnings?: string[] }> {
  return parseJson(
    await fetch('/api/add-clinic', { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminHeaders() }, body: JSON.stringify(payload) }),
    'Add clinic',
  )
}

export async function uploadQuote(params: {
  pdfBytes: Uint8Array
  filename: string
  quoteId: string
  quote: QuoteData
  agent: AgentProfile
  brand: string
}): Promise<{ webViewLink: string }> {
  const { pdfBytes, filename, quoteId, quote, agent, brand } = params
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
      body: JSON.stringify({
        pdfBase64,
        filename,
        quoteId,
        patientName: quote.patientName,
        treatmentName: quote.treatmentName,
        clinicName: quote.clinicName,
        brand,
        agentName: agent.name,
        agentEmail: agent.email,
        googleFolder: quote.googleFolder,
        quoteDate: quote.quoteDate,
      }),
    }),
    'Quote upload',
  )
}

export async function reportError(params: {
  errorType: 'extraction' | 'pdf' | 'api_key' | 'network' | 'unknown'
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
