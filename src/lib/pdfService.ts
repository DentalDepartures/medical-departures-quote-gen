import type { QuoteData, AgentProfile } from '../types'
import { generateMDQuotePDFOverlay } from './pdfGeneratorMDOverlay'

export async function generateQuotePDF(
  quote: QuoteData,
  agent: AgentProfile,
): Promise<{ pdfBytes: Uint8Array; filename: string }> {
  if (!quote.templatePdfUrl) {
    throw new Error(
      'No PDF template configured for this clinic. Ask your admin to add a template_pdf_url in the Clinic App sheet.',
    )
  }
  const { pdfBytes, filename } = await generateMDQuotePDFOverlay(quote, agent)

  // Trigger browser download
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)

  return { pdfBytes, filename }
}
