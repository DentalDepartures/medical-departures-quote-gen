import type { QuoteData, AgentProfile, Brand } from '../types'
import { generateQuotePDFBytes } from './pdfOverlay'
import { fetchBytes, prepareImage } from './imagePrep'

export async function generateQuotePDF(
  quote: QuoteData,
  agent: AgentProfile,
  brand: Brand,
): Promise<{ pdfBytes: Uint8Array; filename: string; quoteId: string }> {
  const result = await generateQuotePDFBytes(quote, agent, brand, { fetchBytes, prepareImage })

  // Trigger browser download
  const { pdfBytes, filename } = result
  const blob = new Blob(
    [pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer],
    { type: 'application/pdf' },
  )
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)

  return result
}
