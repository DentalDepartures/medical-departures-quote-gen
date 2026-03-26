import jsPDF from 'jspdf'
import type { QuoteData, AgentProfile } from '../types'

// ── Asset loaders ───────────────────────────────────────────────────────────
async function loadFontBase64(url: string): Promise<string> {
  const buf = await fetch(url).then((r) => r.arrayBuffer())
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

async function loadImageDataUrl(url: string): Promise<string> {
  const blob = await fetch(url).then((r) => r.blob())
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

async function buildDoc(): Promise<{ doc: jsPDF; logoDataUrl: string }> {
  const [regular, bold, semibold, logoDataUrl] = await Promise.all([
    loadFontBase64('/fonts/Montserrat-Regular.ttf'),
    loadFontBase64('/fonts/Montserrat-Bold.ttf'),
    loadFontBase64('/fonts/Montserrat-SemiBold.ttf'),
    loadImageDataUrl('/logo.png'),
  ])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('Montserrat-Regular.ttf', regular)
  doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal')
  doc.addFileToVFS('Montserrat-Bold.ttf', bold)
  doc.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold')
  doc.addFileToVFS('Montserrat-SemiBold.ttf', semibold)
  doc.addFont('Montserrat-SemiBold.ttf', 'Montserrat', 'semibold')
  return { doc, logoDataUrl }
}

// ── Palette ────────────────────────────────────────────────────────────────
type RGB = [number, number, number]
const C = {
  navy:     [0,   70,  127] as RGB,
  red:      [229, 27,  36]  as RGB,
  white:    [255, 255, 255] as RGB,
  darkText: [30,  30,  30]  as RGB,
  gray:     [120, 120, 120] as RGB,
  lightBg:  [245, 246, 248] as RGB,
  lineGray: [220, 220, 220] as RGB,
}

// ── Layout constants ───────────────────────────────────────────────────────
const ML = 14
const MR = 14
const PW = 210
const CW = PW - ML - MR
const HEADER_BOTTOM = 36
const FOOTER_Y = 282
const MAX_Y = 265

// ── Helpers ────────────────────────────────────────────────────────────────
function fc(doc: jsPDF, c: RGB) { doc.setFillColor(...c) }
function tc(doc: jsPDF, c: RGB) { doc.setTextColor(...c) }
function dc(doc: jsPDF, c: RGB) { doc.setDrawColor(...c) }

// ── Page header ─────────────────────────────────────────────────────────────
function drawHeader(doc: jsPDF, quote: QuoteData, logoDataUrl: string) {
  // Logo: 50×17mm at x=14, y=7
  const logoW = 50
  const logoH = 17
  doc.addImage(logoDataUrl, 'PNG', ML, 7, logoW, logoH)

  // Right side: "TREATMENT QUOTE" bold navy 13pt right-aligned
  tc(doc, C.navy)
  doc.setFont('Montserrat', 'bold')
  doc.setFontSize(13)
  doc.text('TREATMENT QUOTE', PW - MR, 13, { align: 'right' })

  // Date: gray 8.5pt right-aligned
  tc(doc, C.gray)
  doc.setFont('Montserrat', 'normal')
  doc.setFontSize(8.5)
  const dateStr = quote.quoteDate
    ? quote.quoteDate
    : new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  doc.text(`Date: ${dateStr}`, PW - MR, 20, { align: 'right' })

  // "Quote for: PatientName" on same line, right-aligned
  const patientName = quote.patientName || 'Patient Name'
  doc.setFont('Montserrat', 'bold')
  doc.setFontSize(9)
  const nameW = doc.getTextWidth(patientName)
  doc.setFont('Montserrat', 'normal')
  doc.setFontSize(9)
  const labelW = doc.getTextWidth('Quote for: ')
  const startX = PW - MR - labelW - nameW
  tc(doc, C.gray)
  doc.text('Quote for: ', startX, 27)
  tc(doc, C.darkText)
  doc.setFont('Montserrat', 'bold')
  doc.setFontSize(9)
  doc.text(patientName, startX + labelW, 27)

  // Horizontal divider at y=36 — thicker
  dc(doc, C.lineGray)
  doc.setLineWidth(0.8)
  doc.line(ML, HEADER_BOTTOM, PW - MR, HEADER_BOTTOM)
}

// ── Footer ──────────────────────────────────────────────────────────────────
function drawFooter(doc: jsPDF) {
  const disclaimer =
    'This quotation is based on the information currently available and is for estimation purposes only. Final treatment plan and pricing may\n' +
    'change following an in-person clinical examination and diagnostic assessment by the doctor.'

  dc(doc, C.lineGray)
  doc.setLineWidth(0.2)
  doc.line(ML, FOOTER_Y, PW - MR, FOOTER_Y)

  tc(doc, C.gray)
  doc.setFont('Montserrat', 'normal')
  doc.setFontSize(6.5)
  doc.text(disclaimer, ML, 287)
}

// ── Draw checkmark manually ─────────────────────────────────────────────────
function drawCheckmark(doc: jsPDF, x: number, y: number) {
  dc(doc, C.navy)
  doc.setLineWidth(0.6)
  doc.line(x, y + 1.5, x + 1.5, y + 3)
  doc.line(x + 1.5, y + 3, x + 4.5, y + 0)
}

// ── Draw X manually ─────────────────────────────────────────────────────────
function drawX(doc: jsPDF, x: number, y: number) {
  dc(doc, C.red)
  doc.setLineWidth(0.6)
  doc.line(x, y, x + 3.5, y + 3.5)
  doc.line(x + 3.5, y, x, y + 3.5)
}

// ── PDF Builder ─────────────────────────────────────────────────────────────
class Builder {
  doc: jsPDF
  y: number
  quote: QuoteData
  logoDataUrl: string

  constructor(quote: QuoteData, doc: jsPDF, logoDataUrl: string) {
    this.doc = doc
    this.quote = quote
    this.logoDataUrl = logoDataUrl
    this.y = HEADER_BOTTOM + 8
    drawHeader(this.doc, quote, logoDataUrl)
    drawFooter(this.doc)
  }

  newPage() {
    this.doc.addPage()
    drawHeader(this.doc, this.quote, this.logoDataUrl)
    drawFooter(this.doc)
    this.y = HEADER_BOTTOM + 8
  }

  private need(h: number) {
    if (this.y + h > MAX_Y) this.newPage()
  }

  // ── Info box (y=43, h=32) ──────────────────────────────────────────────────
  addInfoBox() {
    const doc = this.doc
    const boxY = 43
    const boxH = 32
    const colW = CW / 3

    // Light gray rounded rect
    fc(doc, C.lightBg)
    dc(doc, C.lightBg)
    doc.roundedRect(ML, boxY, CW, boxH, 3, 3, 'F')

    const columns = [
      { label: 'TREATMENT', value: this.quote.treatmentName || '—' },
      { label: 'CLINIC',    value: this.quote.clinicName    || '—' },
      { label: 'LOCATION',  value: this.quote.clinicLocation || '—' },
    ]

    columns.forEach((col, i) => {
      const colX = ML + i * colW

      // Small uppercase gray bold label
      tc(doc, C.gray)
      doc.setFont('Montserrat', 'bold')
      doc.setFontSize(8)
      doc.text(col.label, colX + colW / 2, boxY + 10, { align: 'center' })

      // Bold dark value — bigger font
      tc(doc, C.darkText)
      doc.setFont('Montserrat', 'bold')
      doc.setFontSize(12)
      const maxW = colW - 8
      const lines = doc.splitTextToSize(col.value, maxW) as string[]
      doc.text(lines[0] || col.value, colX + colW / 2, boxY + 22, { align: 'center' })

      // Thin vertical separator between columns
      if (i > 0) {
        dc(doc, C.lineGray)
        doc.setLineWidth(0.3)
        doc.line(colX, boxY + 5, colX, boxY + boxH - 5)
      }
    })

    this.y = boxY + boxH + 6
  }

  // ── Price banner ───────────────────────────────────────────────────────────
  addPriceBanner() {
    const doc = this.doc
    const bannerY = this.y
    const bannerH = 22

    // Navy full-width rounded rect
    fc(doc, C.navy)
    dc(doc, C.navy)
    doc.roundedRect(ML, bannerY, CW, bannerH, 3, 3, 'F')

    // "TREATMENT PRICE" white bold 8pt at y+8
    tc(doc, C.white)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(8)
    doc.text('TREATMENT PRICE', ML + CW / 2, bannerY + 8, { align: 'center' })

    // Large price white bold 20pt at y+17
    if (this.quote.price !== null) {
      const priceNum = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(this.quote.price)
      const currency = this.quote.currency

      // Measure price number width to position currency right after
      doc.setFont('Montserrat', 'bold')
      doc.setFontSize(20)
      const priceW = doc.getTextWidth(priceNum)

      doc.setFontSize(10)
      const currW = doc.getTextWidth(' ' + currency)

      const totalW = priceW + currW
      const startX = ML + CW / 2 - totalW / 2

      // Price number at 20pt
      tc(doc, C.white)
      doc.setFont('Montserrat', 'bold')
      doc.setFontSize(20)
      doc.text(priceNum, startX, bannerY + 17)

      // Currency at 10pt right after price
      doc.setFontSize(10)
      doc.text(' ' + currency, startX + priceW, bannerY + 17)
    } else {
      tc(doc, C.white)
      doc.setFont('Montserrat', 'bold')
      doc.setFontSize(20)
      doc.text('—', ML + CW / 2, bannerY + 17, { align: 'center' })
    }

    this.y = bannerY + bannerH + 4
  }

  // ── Two-column includes/excludes ───────────────────────────────────────────
  addIncludesExcludes() {
    const doc = this.doc
    const startY = this.y + 12   // gap after price banner

    const leftX  = ML
    const rightX = ML + CW / 2 + 4
    const colW   = CW / 2 - 4

    const inclusions = this.quote.inclusions || []
    const exclusions = this.quote.exclusions || []

    // Headers
    tc(doc, C.navy)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(10)
    doc.text('PACKAGE INCLUDES', leftX, startY)

    tc(doc, C.red)
    doc.text('PACKAGE EXCLUDES', rightX, startY)

    const fontSize = 10
    const lineH = 6.5
    const itemStartY = startY + 9

    let leftY  = itemStartY
    let rightY = itemStartY

    // Render inclusions (left column)
    for (const item of inclusions) {
      const lines = doc.splitTextToSize(item, colW - 9) as string[]
      const itemH = lines.length * lineH
      drawCheckmark(doc, leftX, leftY - 3)      // align mark with text
      tc(doc, C.darkText)
      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(fontSize)
      doc.text(lines, leftX + 8, leftY)
      leftY += itemH + 3
    }

    // Render exclusions (right column)
    for (const item of exclusions) {
      const lines = doc.splitTextToSize(item, colW - 9) as string[]
      const itemH = lines.length * lineH
      drawX(doc, rightX, rightY - 3)            // align mark with text
      tc(doc, C.darkText)
      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(fontSize)
      doc.text(lines, rightX + 8, rightY)
      rightY += itemH + 3
    }

    this.y = Math.max(leftY, rightY) + 4
  }

  // ── View Clinic Page button — anchored to bottom of page 1 ──────────────
  addViewClinicButton() {
    if (!this.quote.clinicProfileUrl) return
    const doc = this.doc
    const bw = 55
    const bh = 10
    // Anchor: divider at FOOTER_Y - 22, button just below
    const dividerY = FOOTER_Y - 22
    const btnY = dividerY + 6

    // Full-width divider line above button
    dc(doc, C.lineGray)
    doc.setLineWidth(0.4)
    doc.line(ML, dividerY, PW - MR, dividerY)

    fc(doc, C.navy)
    dc(doc, C.navy)
    doc.roundedRect(ML, btnY, bw, bh, 2, 2, 'F')

    tc(doc, C.white)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(8)
    doc.text('View Clinic Page →', ML + bw / 2, btnY + 6.5, { align: 'center' })

    doc.link(ML, btnY, bw, bh, { url: this.quote.clinicProfileUrl! })
  }

  // ── Doctor section (page 2) ────────────────────────────────────────────────
  addDoctorSection() {
    const q = this.quote
    if (!q.surgeonName && !q.surgeonTitle) return

    const doc = this.doc
    this.need(24)

    // Label
    tc(doc, C.navy)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(9.5)
    doc.text('DOCTOR', ML, this.y)
    this.y += 6

    if (q.surgeonName) {
      tc(doc, C.darkText)
      doc.setFont('Montserrat', 'bold')
      doc.setFontSize(11)
      doc.text(q.surgeonName, ML, this.y)
      this.y += 6
    }

    if (q.surgeonTitle) {
      tc(doc, C.gray)
      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(9.5)
      doc.text(q.surgeonTitle, ML, this.y)
      this.y += 12
    }
  }

  // ── Generic section (label + content) ─────────────────────────────────────
  addSection(label: string, content: string | null) {
    if (!content) return

    const doc = this.doc
    this.need(20)

    // Navy bold uppercase label 9.5pt
    tc(doc, C.navy)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(9.5)
    doc.text(label, ML, this.y)
    this.y += 6

    // Content 9.5pt normal dark
    tc(doc, C.darkText)
    doc.setFont('Montserrat', 'normal')
    doc.setFontSize(9.5)
    const lines = doc.splitTextToSize(content, CW) as string[]
    for (const line of lines) {
      this.need(6)
      doc.text(line, ML, this.y)
      this.y += 5.5
    }
    this.y += 12
  }

  // ── Agent box anchored near bottom of last page ───────────────────────────
  addAgentBox(agent: AgentProfile) {
    const doc = this.doc
    const boxH = 44
    const boxY = 228

    // If we're past the anchor point, start a new page
    if (this.y > boxY - 4) this.newPage()

    // Light gray rounded rect
    fc(doc, C.lightBg)
    dc(doc, C.lightBg)
    doc.roundedRect(ML, boxY, CW, boxH, 3, 3, 'F')

    // "YOUR PATIENT COORDINATOR" navy bold 9pt — top padding ~11mm
    tc(doc, C.navy)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(9)
    doc.text('YOUR PATIENT COORDINATOR', ML + 8, boxY + 11)

    // Agent name bold 11pt
    tc(doc, C.darkText)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(11)
    doc.text(agent.name, ML + 8, boxY + 21)

    // Email gray 9pt
    tc(doc, C.gray)
    doc.setFont('Montserrat', 'normal')
    doc.setFontSize(9)
    doc.text(agent.email, ML + 8, boxY + 31)

    // Phone gray 9pt
    doc.text(agent.phone, ML + 8, boxY + 39)
  }

  save(filename: string) {
    this.doc.save(filename)
  }
}

// ── Public entry point ──────────────────────────────────────────────────────
export async function generateQuotePDF(quote: QuoteData, agent: AgentProfile): Promise<void> {
  const { doc, logoDataUrl } = await buildDoc()
  const b = new Builder(quote, doc, logoDataUrl)

  // Page 1
  b.addInfoBox()
  b.addPriceBanner()
  b.addIncludesExcludes()
  b.addViewClinicButton()

  // Page 2
  b.newPage()

  b.addDoctorSection()

  const accredText = quote.accreditations || null
  b.addSection('CLINIC ACCREDITATION', accredText)

  // Consultation text logic
  let consultText: string | null = null
  if (quote.consultationRequired && quote.suggestedConsultTime) {
    consultText = quote.suggestedConsultTime
  } else if (quote.consultationRequired) {
    consultText = 'Consultation required'
  } else if (quote.suggestedConsultTime) {
    consultText = quote.suggestedConsultTime
  }
  b.addSection('CONSULTATION', consultText)

  b.addSection('IMPORTANT NOTES', quote.importantNotes || null)

  b.addAgentBox(agent)

  const safeName = (s: string | null) => (s ?? '').replace(/[^a-zA-Z0-9]+/g, '_')
  const filename = `Quote_${safeName(quote.patientName)}_${safeName(quote.treatmentName)}.pdf`
  b.save(filename)
}
