import type { QuoteData, AgentProfile } from '../types'
import { generateMDQuotePDFOverlay } from './pdfGeneratorMDOverlay'

export async function generateQuotePDF(quote: QuoteData, agent: AgentProfile): Promise<void> {
  if (!quote.templatePdfUrl) {
    throw new Error(
      'No PDF template configured for this clinic. Ask your admin to add a template_pdf_url in the Clinic App sheet.',
    )
  }
  await generateMDQuotePDFOverlay(quote, agent)
}
