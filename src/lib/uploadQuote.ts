import type { QuoteData, AgentProfile } from '../types'

export async function uploadQuote(params: {
  pdfBytes: Uint8Array
  filename: string
  quote: QuoteData
  agent: AgentProfile
  brand: string
}): Promise<void> {
  const { pdfBytes, filename, quote, agent, brand } = params

  // Convert bytes to base64
  let binary = ''
  for (let i = 0; i < pdfBytes.length; i++) binary += String.fromCharCode(pdfBytes[i])
  const pdfBase64 = btoa(binary)

  const res = await fetch('/api/upload-quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pdfBase64,
      filename,
      patientName: quote.patientName,
      treatmentName: quote.treatmentName,
      clinicName: quote.clinicName,
      brand,
      agentName: agent.name,
      agentEmail: agent.email,
      googleFolder: quote.googleFolder,
      quoteDate: quote.quoteDate,
    }),
  })
  if (!res.ok) {
    const raw = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status}: ${raw}`)
  }
}
