import type { QuoteData, AgentProfile, Brand } from '../types'
import { generateQuotePDFBytes } from './pdfOverlay'
import { fetchBytes, prepareImage } from './imagePrep'
import { PDF_DESIGN } from './env'

export async function generateQuotePDF(
  quote: QuoteData,
  agent: AgentProfile,
  brand: Brand,
): Promise<{ pdfBytes: Uint8Array; filename: string; quoteId: string }> {
  // The v3 layout engine is loaded only by builds that use it
  const result = PDF_DESIGN === 'v3'
    ? await (await import('./v3/generateV3')).generateQuotePDFv3(quote, agent, brand)
    : await generateQuotePDFBytes(quote, agent, brand, { fetchBytes, prepareImage })

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
