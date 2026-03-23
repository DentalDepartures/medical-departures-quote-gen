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

async function buildDoc(): Promise<{ doc: jsPDF; logoDataUrl: string; xMarkDataUrl: string }> {
  const [regular, bold, semibold, logoDataUrl, xMarkDataUrl] = await Promise.all([
    loadFontBase64('/fonts/Montserrat-Regular.ttf'),
    loadFontBase64('/fonts/Montserrat-Bold.ttf'),
    loadFontBase64('/fonts/Montserrat-SemiBold.ttf'),
    loadImageDataUrl('/logo.png'),
    loadImageDataUrl('/x-mark.png'),
  ])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('Montserrat-Regular.ttf', regular)
  doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal')
  doc.addFileToVFS('Montserrat-Bold.ttf', bold)
  doc.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold')
  doc.addFileToVFS('Montserrat-SemiBold.ttf', semibold)
  doc.addFont('Montserrat-SemiBold.ttf', 'Montserrat', 'semibold')
  return { doc, logoDataUrl, xMarkDataUrl }
}

// ── Palette — Medical Departures brand ────────────────────────────────────
type RGB = [number, number, number]
const C = {
  navy:     [0,   70,  127] as RGB,  // #00467f — primary
  red:      [229, 27,  36]  as RGB,  // #e51b24 — accent / exclusions
  silver:   [158, 176, 207] as RGB,  // #9eb0cf — secondary accent
  cream:    [235, 241, 249] as RGB,  // light silver tint for savings area
  white:    [255, 255, 255] as RGB,
  darkText: [17,  24,  39]  as RGB,
  gray:     [107, 114, 128] as RGB,
  lineGray: [229, 231, 235] as RGB,
}

// ── Layout constants ───────────────────────────────────────────────────────
const ML = 15
const MR = 15
const PW = 210
const CW = PW - ML - MR
const HEADER_BOTTOM = 46
const FOOTER_Y = 280
const MAX_Y = 270

// ── Helpers ────────────────────────────────────────────────────────────────
function fc(doc: jsPDF, c: RGB) { doc.setFillColor(...c) }
function tc(doc: jsPDF, c: RGB) { doc.setTextColor(...c) }
function dc(doc: jsPDF, c: RGB) { doc.setDrawColor(...c) }

function formatPrice(amount: number | null, currency: string): string {
  if (amount === null) return ''
  try {
    return (
      new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount) +
      ' ' +
      currency
    )
  } catch {
    return amount.toLocaleString() + ' ' + currency
  }
}

// ── Page header ────────────────────────────────────────────────────────────
function drawHeader(doc: jsPDF, quote: QuoteData, logoDataUrl: string) {
  const y = 13

  // "Quote for:" label
  tc(doc, C.gray)
  doc.setFont('Montserrat', 'normal')
  doc.setFontSize(8)
  doc.text('Quote for:', ML, y + 5)

  // Patient name
  tc(doc, C.darkText)
  doc.setFont('Montserrat', 'bold')
  doc.setFontSize(13)
  doc.text(quote.patientName || 'Patient Name', ML, y + 12)

  // Date
  tc(doc, C.gray)
  doc.setFont('Montserrat', 'normal')
  doc.setFontSize(8)
  const dateStr = quote.quoteDate
    ? quote.quoteDate
    : new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  doc.text(dateStr, ML, y + 19)

  // Logo — real Medical Departures PNG, top-right
  // Logo is ~3:1 aspect ratio; render at 58mm wide × 19mm tall
  const logoW = 58
  const logoH = 19
  doc.addImage(logoDataUrl, 'PNG', PW - MR - logoW, y, logoW, logoH)

  // Divider
  dc(doc, C.lineGray)
  doc.setLineWidth(0.3)
  doc.line(ML, HEADER_BOTTOM, PW - MR, HEADER_BOTTOM)
}

// ── Footer ─────────────────────────────────────────────────────────────────
function drawFooter(doc: jsPDF) {
  const disclaimer =
    'This quotation is based on the information currently available and is for estimation purposes only. Final treatment plan and pricing may\n' +
    'change following an in-person clinical examination and diagnostic assessment by the doctor.'

  dc(doc, C.lineGray)
  doc.setLineWidth(0.2)
  doc.line(ML, FOOTER_Y - 3, PW - MR, FOOTER_Y - 3)

  tc(doc, C.gray)
  doc.setFont('Montserrat', 'normal')
  doc.setFontSize(6.5)
  doc.text(disclaimer, ML, FOOTER_Y + 2)
}

// ── PDF Builder ────────────────────────────────────────────────────────────
class Builder {
  doc: jsPDF
  y: number
  quote: QuoteData
  logoDataUrl: string
  xMarkDataUrl: string

  constructor(quote: QuoteData, doc: jsPDF, logoDataUrl: string, xMarkDataUrl: string) {
    this.doc = doc
    this.quote = quote
    this.logoDataUrl = logoDataUrl
    this.xMarkDataUrl = xMarkDataUrl
    this.y = HEADER_BOTTOM + 8
    drawHeader(this.doc, quote, logoDataUrl)
    drawFooter(this.doc)
  }

  private newPage() {
    this.doc.addPage()
    drawHeader(this.doc, this.quote, this.logoDataUrl)
    drawFooter(this.doc)
    this.y = HEADER_BOTTOM + 8
  }

  private need(h: number) {
    if (this.y + h > MAX_Y) this.newPage()
  }

  // ── Treatment heading ────────────────────────────────────────────────────
  addTreatmentHeading() {
    const name = this.quote.treatmentName || 'Medical Treatment'
    const doc = this.doc
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(17)
    const lines = doc.splitTextToSize(`Treatment:  ${name}`, CW) as string[]
    const blockH = lines.length * 8 + 10
    this.need(blockH)
    tc(doc, C.navy)
    doc.text(lines, ML, this.y + 8)
    this.y += blockH
  }

  // ── Clinic + price block ─────────────────────────────────────────────────
  addClinicPriceBlock() {
    this.need(58)
    const blockY = this.y + 4
    const doc = this.doc

    // — Left: clinic name ———————————————————————————————
    // Building icon
    fc(doc, C.navy)
    doc.rect(ML, blockY, 6, 5, 'F')
    doc.rect(ML + 2, blockY + 5, 2, 3, 'F')
    doc.rect(ML + 0.5, blockY - 1.5, 5, 2, 'F')

    tc(doc, C.darkText)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(11)
    doc.text(this.quote.clinicName || '', ML + 9, blockY + 4.5)

    // Location pin
    fc(doc, C.red)
    doc.circle(ML + 3, blockY + 14, 3, 'F')
    fc(doc, C.white)
    doc.circle(ML + 3, blockY + 13.5, 1.2, 'F')
    fc(doc, C.red)
    doc.triangle(ML + 1.5, blockY + 16.5, ML + 4.5, blockY + 16.5, ML + 3, blockY + 19.5, 'F')

    tc(doc, C.gray)
    doc.setFont('Montserrat', 'normal')
    doc.setFontSize(10)
    doc.text(this.quote.clinicLocation || '', ML + 9, blockY + 15)

    // — Right: price box ————————————————————————————————
    if (this.quote.price !== null) {
      const bx = 115
      const bw = PW - MR - bx

      fc(doc, C.navy)
      doc.rect(bx, blockY - 2, bw, 27, 'F')

      tc(doc, C.white)
      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(8.5)
      doc.text('Price:', bx + 5, blockY + 5)

      doc.setFont('Montserrat', 'bold')
      doc.setFontSize(14)
      doc.text(formatPrice(this.quote.price, this.quote.currency), bx + 5, blockY + 16)

      // Savings area in light silver
      fc(doc, C.cream)
      doc.rect(bx, blockY + 23, bw, 20, 'F')

      tc(doc, C.gray)
      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(8.5)

      let savY = blockY + 30
      if (this.quote.reducedFrom !== null) {
        doc.text('Reduced from:', bx + 4, savY)
        tc(doc, C.darkText)
        doc.setFont('Montserrat', 'bold')
        doc.text(formatPrice(this.quote.reducedFrom, this.quote.currency), bx + 38, savY)
        doc.setFont('Montserrat', 'normal')
        tc(doc, C.gray)
        savY += 7
      }
      if (this.quote.savings !== null) {
        doc.text('Savings:', bx + 4, savY)
        tc(doc, C.darkText)
        doc.setFont('Montserrat', 'bold')
        doc.text(formatPrice(this.quote.savings, this.quote.currency), bx + 25, savY)
      }
    }

    this.y = blockY + 48
  }

  // ── Section heading with icon ────────────────────────────────────────────
  addSectionHeading(
    title: string,
    icon: 'check' | 'x' | 'bang',
    minFollowHeight = 20
  ) {
    this.need(20 + minFollowHeight)
    const doc = this.doc

    doc.setFont('Montserrat', 'bold')

    // Icons: ✓ and ! as Unicode text; ✕ as the real x-mark PNG
    doc.setFontSize(16)
    if (icon === 'check') {
      tc(doc, C.navy)
      doc.text('✓', ML + 1, this.y + 12)
    } else if (icon === 'x') {
      // Use the x-mark PNG — render at 11×11 mm
      doc.addImage(this.xMarkDataUrl, 'PNG', ML, this.y + 1, 11, 11)
    } else {
      tc(doc, C.silver)
      doc.text('!', ML + 3, this.y + 12)
    }

    tc(doc, C.navy)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(14)
    doc.text(title, ML + 12, this.y + 10)

    this.y += 18
  }

  // ── Bullet list ──────────────────────────────────────────────────────────
  addBulletList(items: string[]) {
    const doc = this.doc
    const lineH = 5.5
    for (const item of items) {
      this.need(7)
      tc(doc, C.darkText)
      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(10)
      doc.text('—', ML + 3, this.y + 1)
      const lines = doc.splitTextToSize(item, CW - 14)
      doc.text(lines, ML + 10, this.y + 1)
      this.y += (lines.length as number) * lineH + 1
    }
  }

  // ── Horizontal divider ───────────────────────────────────────────────────
  addDivider() {
    this.need(6)
    dc(this.doc, C.lineGray)
    this.doc.setLineWidth(0.25)
    this.doc.line(ML, this.y, PW - MR, this.y)
    this.y += 6
  }

  // ── Surgeon + accreditation ──────────────────────────────────────────────
  addSurgeonSection() {
    const q = this.quote
    const rows: [string, string | null][] = [
      ['Lead Surgeon Name :', q.surgeonName],
      ['Lead Surgeon Title :', q.surgeonTitle],
      ['Clinic Accreditations:', q.accreditations],
    ]
    const visible = rows.filter(([, v]) => v)
    if (!visible.length) return

    this.addDivider()
    const doc = this.doc

    const valueX = ML + 56
    const maxValueW = PW - MR - valueX
    for (const [label, value] of visible) {
      const valueLines = doc.splitTextToSize(value!, maxValueW)
      const rowH = (valueLines.length as number) * 6 + 4
      this.need(rowH)
      tc(doc, C.gray)
      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(10)
      doc.text(label, ML, this.y)
      tc(doc, C.darkText)
      doc.setFont('Montserrat', 'bold')
      doc.text(valueLines, valueX, this.y)
      this.y += rowH
    }
  }

  // ── Consultation ─────────────────────────────────────────────────────────
  addConsultationSection() {
    const q = this.quote
    if (q.consultationRequired === null && !q.suggestedConsultTime) return

    this.addDivider()
    const doc = this.doc

    if (q.consultationRequired !== null) {
      this.need(10)
      tc(doc, C.darkText)
      doc.setFont('Montserrat', 'bold')
      doc.setFontSize(10)
      doc.text('Consultation Required:', ML, this.y)
      tc(doc, C.navy)
      doc.text(q.consultationRequired ? 'Yes' : 'No', ML + 56, this.y)
      this.y += 8
    }

    if (q.suggestedConsultTime) {
      this.need(10)
      tc(doc, C.darkText)
      doc.setFont('Montserrat', 'bold')
      doc.setFontSize(10)
      doc.text('Consult Day & Time:', ML, this.y)
      tc(doc, C.navy)
      doc.text(q.suggestedConsultTime, ML + 56, this.y)
      this.y += 8
    }
  }

  // ── "Your Next Step" box ─────────────────────────────────────────────────
  addNextStepBox() {
    this.need(24)
    this.y += 4
    const doc = this.doc

    dc(doc, C.navy)
    doc.setLineWidth(0.5)
    doc.roundedRect(ML, this.y, CW, 16, 3, 3, 'S')

    tc(doc, C.darkText)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(9.5)
    doc.text(
      'Your Next Step:  Confirm consultation appointment with your agent',
      PW / 2,
      this.y + 10,
      { align: 'center' }
    )
    this.y += 22
  }

  // ── Agent contact ────────────────────────────────────────────────────────
  addAgentContact(agent: AgentProfile) {
    this.need(35)
    const doc = this.doc

    tc(doc, C.gray)
    doc.setFont('Montserrat', 'normal')
    doc.setFontSize(8)
    doc.text(
      'Simply reply to the email from your agent, or contact them via email/phone below.',
      PW / 2,
      this.y,
      { align: 'center' }
    )
    this.y += 9

    const rows: [string, string][] = [
      ["Your Agent's Name :", agent.name],
      ['Email :', agent.email],
      ['Phone :', agent.phone],
    ]
    for (const [label, value] of rows) {
      this.need(9)
      tc(doc, C.gray)
      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(10)
      doc.text(label, ML + 10, this.y)
      tc(doc, C.darkText)
      doc.setFont('Montserrat', 'bold')
      doc.text(value, ML + 56, this.y)
      this.y += 8
    }
  }

  // ── "Visit Clinic Page" button ───────────────────────────────────────────
  addVisitClinicButton() {
    if (!this.quote.clinicProfileUrl) return
    this.need(18)
    this.y += 4
    const doc = this.doc
    const bw = 52
    const bx = PW - MR - bw

    fc(doc, C.navy)
    doc.roundedRect(bx, this.y, bw, 12, 2, 2, 'F')

    tc(doc, C.white)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(9)
    doc.text('Visit Clinic Page', bx + bw / 2, this.y + 8, { align: 'center' })

    doc.link(bx, this.y, bw, 12, { url: this.quote.clinicProfileUrl! })

    this.y += 18
  }

  // ── Important notes ──────────────────────────────────────────────────────
  addImportantNotes() {
    if (!this.quote.importantNotes) return

    const bullets = this.quote.importantNotes
      .replace(/([.!?])\s+/g, '$1|||')
      .split('|||')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    const estimatedH = Math.min(bullets.length * 7, 60)
    this.addSectionHeading('Important Notes:', 'bang', estimatedH)
    this.addBulletList(bullets)
    this.y += 4
  }

  save(filename: string) {
    this.doc.save(filename)
  }
}

// ── Public entry point ─────────────────────────────────────────────────────
export async function generateQuotePDF(quote: QuoteData, agent: AgentProfile): Promise<void> {
  const { doc, logoDataUrl, xMarkDataUrl } = await buildDoc()
  const b = new Builder(quote, doc, logoDataUrl, xMarkDataUrl)

  b.addTreatmentHeading()
  b.addClinicPriceBlock()

  if (quote.inclusions.length > 0) {
    const inclH = Math.min(quote.inclusions.length * 8, 40)
    b.addSectionHeading('Package Includes:', 'check', inclH)
    b.addBulletList(quote.inclusions)
    b.y += 4
  }

  b.addVisitClinicButton()

  if (quote.exclusions.length > 0) {
    const exclH = Math.min(quote.exclusions.length * 8, 50)
    b.addSectionHeading('Package Excludes:', 'x', exclH)
    b.addBulletList(quote.exclusions)
    b.y += 4
  }

  b.addSurgeonSection()
  b.addConsultationSection()
  b.addNextStepBox()
  b.addAgentContact(agent)
  b.addImportantNotes()

  const safeName = (s: string | null) => (s ?? '').replace(/[^a-zA-Z0-9]+/g, '_')
  const filename = `Quote_${safeName(quote.patientName)}_${safeName(quote.treatmentName)}.pdf`
  b.save(filename)
}
