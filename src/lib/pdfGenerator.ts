import jsPDF from 'jspdf'
import type { QuoteData, AgentProfile } from '../types'

// ── Font loader ─────────────────────────────────────────────────────────────
async function loadFontBase64(url: string): Promise<string> {
  const buf = await fetch(url).then((r) => r.arrayBuffer())
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

async function buildDoc(): Promise<jsPDF> {
  const [regular, bold] = await Promise.all([
    loadFontBase64('/fonts/Roboto-Regular.ttf'),
    loadFontBase64('/fonts/Roboto-Bold.ttf'),
  ])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('Roboto-Regular.ttf', regular)
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
  doc.addFileToVFS('Roboto-Bold.ttf', bold)
  doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold')
  return doc
}

// ── Palette ────────────────────────────────────────────────────────────────
const C = {
  navy:      [91,  168, 212] as [number, number, number],  // Dental Departures light blue
  navyLight: [70,  148, 192] as [number, number, number],  // slightly deeper variant
  white:     [255, 255, 255] as [number, number, number],
  darkText:  [17,  24,  39]  as [number, number, number],
  gray:      [107, 114, 128] as [number, number, number],
  lineGray:  [229, 231, 235] as [number, number, number],
  cream:     [232, 246, 252] as [number, number, number],  // light blue tint for savings area
  blue:      [91,  168, 212] as [number, number, number],  // same accent blue for ✓
  red:       [220, 38,  38]  as [number, number, number],
  green:     [22,  163, 74]  as [number, number, number],
  charcoal:  [55,  55,  55]  as [number, number, number],  // logo text
  logoBlue:  [91,  168, 211] as [number, number, number],  // globe blue
}

// ── Layout constants ───────────────────────────────────────────────────────
const ML = 15          // left margin
const MR = 15          // right margin
const PW = 210         // page width (A4)
const CW = PW - ML - MR  // content width
const HEADER_BOTTOM = 44
const FOOTER_Y = 280
const MAX_Y = 270      // page-break threshold

// ── Helpers ────────────────────────────────────────────────────────────────
function fc(doc: jsPDF, c: [number, number, number]) { doc.setFillColor(...c) }
function tc(doc: jsPDF, c: [number, number, number]) { doc.setTextColor(...c) }
function dc(doc: jsPDF, c: [number, number, number]) { doc.setDrawColor(...c) }

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

// ── Logo — Dental Departures globe + tooth ────────────────────────────────
function drawLogo(doc: jsPDF, x: number, y: number) {
  const cx = x + 9
  const cy = y + 8
  const r  = 9

  // Globe fill
  fc(doc, C.logoBlue)
  doc.circle(cx, cy, r, 'F')

  // Globe grid lines (white strokes)
  dc(doc, C.white)
  doc.setLineWidth(0.35)
  // Horizontal parallels
  doc.line(cx - r + 1.5, cy - 3.5, cx + r - 1.5, cy - 3.5)
  doc.line(cx - r + 1.5, cy + 3.5, cx + r - 1.5, cy + 3.5)
  // Meridian ellipses
  doc.ellipse(cx, cy, 4.5, r, 'S')
  doc.ellipse(cx, cy, 8.5, r, 'S')

  // Tooth shape (white) — crown + two roots
  const tw = 5.5   // tooth half-width
  const th = 5     // crown height
  const ty = cy - th / 2 - 1.5  // top of crown
  fc(doc, C.white)
  // Crown — ellipse
  doc.ellipse(cx, ty + th / 2, tw, th / 2 + 1, 'F')
  // Roots — two narrow rectangles
  doc.rect(cx - tw + 1,   ty + th - 0.5, tw - 1.5, 4.5, 'F')
  doc.rect(cx + 1,        ty + th - 0.5, tw - 1.5, 4.5, 'F')
  // Clip bottom of crown ellipse overflow with logo blue
  fc(doc, C.logoBlue)
  doc.rect(cx - tw, cy + 5.5, tw * 2, 4, 'F')

  // Brand text
  tc(doc, C.charcoal)
  doc.setFont('Roboto', 'bold')
  doc.setFontSize(12)
  doc.text('DENTAL', x + 21, y + 7)
  doc.setFontSize(9)
  doc.text('DEPARTURES', x + 21, y + 13)
}

// ── Page header ────────────────────────────────────────────────────────────
function drawHeader(doc: jsPDF, quote: QuoteData) {
  const y = 15

  // "Quote for:" label
  tc(doc, C.gray)
  doc.setFont('Roboto', 'normal')
  doc.setFontSize(8)
  doc.text('Quote for:', ML, y + 5)

  // Patient name
  tc(doc, C.darkText)
  doc.setFont('Roboto', 'bold')
  doc.setFontSize(13)
  doc.text(quote.patientName || 'Patient Name', ML, y + 12)

  // Date
  tc(doc, C.gray)
  doc.setFont('Roboto', 'normal')
  doc.setFontSize(8)
  const dateStr = quote.quoteDate
    ? quote.quoteDate
    : new Date().toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
      })
  doc.text(dateStr, ML, y + 19)

  // Logo
  drawLogo(doc, PW - MR - 45, y)

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
  doc.setFont('Roboto', 'normal')
  doc.setFontSize(6.5)
  doc.text(disclaimer, ML, FOOTER_Y + 2)
}

// ── PDF Builder ────────────────────────────────────────────────────────────
class Builder {
  doc: jsPDF
  y: number
  quote: QuoteData

  constructor(quote: QuoteData, doc: jsPDF) {
    this.doc = doc
    this.quote = quote
    this.y = HEADER_BOTTOM + 8
    drawHeader(this.doc, quote)
    drawFooter(this.doc)
  }

  private newPage() {
    this.doc.addPage()
    drawHeader(this.doc, this.quote)
    drawFooter(this.doc)
    this.y = HEADER_BOTTOM + 8
  }

  private need(h: number) {
    if (this.y + h > MAX_Y) this.newPage()
  }

  // ── Treatment heading ────────────────────────────────────────────────────
  addTreatmentHeading() {
    this.need(16)
    const name = this.quote.treatmentName || 'Dental Treatment'
    tc(this.doc, C.navy)
    this.doc.setFont('Roboto', 'bold')
    this.doc.setFontSize(17)
    this.doc.text(`Treatment:  ${name}`, ML, this.y + 8)
    this.y += 18
  }

  // ── Clinic + price block ─────────────────────────────────────────────────
  addClinicPriceBlock() {
    this.need(58)
    const blockY = this.y + 4
    const doc = this.doc

    // — Left: clinic name ———————————————————————————————
    // Small building icon
    fc(doc, C.navy)
    doc.rect(ML, blockY, 6, 5, 'F')          // main body
    doc.rect(ML + 2, blockY + 5, 2, 3, 'F')  // door
    doc.rect(ML + 0.5, blockY - 1.5, 5, 2, 'F') // roof-ish line

    tc(doc, C.darkText)
    doc.setFont('Roboto', 'bold')
    doc.setFontSize(11)
    doc.text(this.quote.clinicName || '', ML + 9, blockY + 4.5)

    // Location pin
    fc(doc, C.red)
    doc.circle(ML + 3, blockY + 14, 3, 'F')
    fc(doc, C.white)
    doc.circle(ML + 3, blockY + 13.5, 1.2, 'F')
    fc(doc, C.red)
    // pin tail
    doc.triangle(ML + 1.5, blockY + 16.5, ML + 4.5, blockY + 16.5, ML + 3, blockY + 19.5, 'F')

    tc(doc, C.gray)
    doc.setFont('Roboto', 'normal')
    doc.setFontSize(10)
    doc.text(this.quote.clinicLocation || '', ML + 9, blockY + 15)

    // — Right: price box ————————————————————————————————
    if (this.quote.price !== null) {
      const bx = 115
      const bw = PW - MR - bx

      // Dark navy price box
      fc(doc, C.navy)
      doc.rect(bx, blockY - 2, bw, 27, 'F')

      // "Price:" small label
      tc(doc, C.white)
      doc.setFont('Roboto', 'normal')
      doc.setFontSize(8.5)
      doc.text('Price:', bx + 5, blockY + 5)

      // Price amount — large bold on second line
      doc.setFont('Roboto', 'bold')
      doc.setFontSize(14)
      doc.text(formatPrice(this.quote.price, this.quote.currency), bx + 5, blockY + 16)

      // Cream savings area
      fc(doc, C.cream)
      doc.rect(bx, blockY + 23, bw, 20, 'F')

      tc(doc, C.gray)
      doc.setFont('Roboto', 'normal')
      doc.setFontSize(8.5)

      let savY = blockY + 30
      if (this.quote.reducedFrom !== null) {
        doc.text('Reduced from:', bx + 4, savY)
        tc(doc, C.darkText)
        doc.setFont('Roboto', 'bold')
        doc.text(formatPrice(this.quote.reducedFrom, this.quote.currency), bx + 38, savY)
        doc.setFont('Roboto', 'normal')
        tc(doc, C.gray)
        savY += 7
      }
      if (this.quote.savings !== null) {
        doc.text('Savings:', bx + 4, savY)
        tc(doc, C.darkText)
        doc.setFont('Roboto', 'bold')
        doc.text(formatPrice(this.quote.savings, this.quote.currency), bx + 25, savY)
      }
    }

    this.y = blockY + 48
  }

  // ── Section heading with icon ────────────────────────────────────────────
  // minFollowHeight: estimate of content that must appear with heading (keeps them together)
  addSectionHeading(
    title: string,
    icon: 'check' | 'x' | 'bang',
    minFollowHeight = 20
  ) {
    this.need(20 + minFollowHeight)
    const doc = this.doc

    doc.setFont('Roboto', 'bold')

    // Use Roboto Unicode glyphs for icons — renders correctly as real PDF text
    doc.setFontSize(16)
    if (icon === 'check') {
      tc(doc, C.blue)
      doc.text('✓', ML + 1, this.y + 12)
    } else if (icon === 'x') {
      tc(doc, C.red)
      doc.text('✕', ML + 1, this.y + 12)
    } else {
      tc(doc, [245, 158, 11] as [number, number, number])
      doc.text('!', ML + 3, this.y + 12)
    }

    tc(doc, C.navy)
    doc.setFont('Roboto', 'bold')
    doc.setFontSize(14)
    doc.text(title, ML + 12, this.y + 10)

    this.y += 18
  }

  // ── Bullet list ──────────────────────────────────────────────────────────
  addBulletList(items: string[]) {
    const doc = this.doc
    const lineH = 5.5   // tight single-line spacing to match reference PDF
    for (const item of items) {
      this.need(7)
      tc(doc, C.darkText)
      doc.setFont('Roboto', 'normal')
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
      doc.setFont('Roboto', 'normal')
      doc.setFontSize(10)
      doc.text(label, ML, this.y)
      tc(doc, C.darkText)
      doc.setFont('Roboto', 'bold')
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
      doc.setFont('Roboto', 'bold')
      doc.setFontSize(10)
      doc.text('Consultation Required:', ML, this.y)
      tc(doc, C.navyLight)
      doc.text(q.consultationRequired ? 'Yes' : 'No', ML + 56, this.y)
      this.y += 8
    }

    if (q.suggestedConsultTime) {
      this.need(10)
      tc(doc, C.darkText)
      this.doc.setFont('Roboto', 'bold')
      this.doc.setFontSize(10)
      doc.text('Consult Day & Time:', ML, this.y)
      tc(doc, C.navyLight)
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
    doc.setFont('Roboto', 'bold')
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
    doc.setFont('Roboto', 'normal')
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
      doc.setFont('Roboto', 'normal')
      doc.setFontSize(10)
      doc.text(label, ML + 10, this.y)
      tc(doc, C.darkText)
      doc.setFont('Roboto', 'bold')
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
    doc.setFont('Roboto', 'bold')
    doc.setFontSize(9)
    doc.text('Visit Clinic Page', bx + bw / 2, this.y + 8, { align: 'center' })

    // Make the button clickable
    doc.link(bx, this.y, bw, 12, { url: this.quote.clinicProfileUrl! })

    this.y += 18
  }

  // ── Important notes ──────────────────────────────────────────────────────
  addImportantNotes() {
    if (!this.quote.importantNotes) return

    // Split notes into sentences — replace ". " with a sentinel, then split
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
  const doc = await buildDoc()
  const b = new Builder(quote, doc)

  // ── Page 1 content ────────────────────────────────────────────────────
  b.addTreatmentHeading()
  b.addClinicPriceBlock()

  if (quote.inclusions.length > 0) {
    // Reserve heading + at least 2 items worth of space
    const inclH = Math.min(quote.inclusions.length * 8, 40)
    b.addSectionHeading('Package Includes:', 'check', inclH)
    b.addBulletList(quote.inclusions)
    b.y += 4
  }

  b.addVisitClinicButton()

  // ── Exclusions ────────────────────────────────────────────────────────
  if (quote.exclusions.length > 0) {
    // Reserve heading + all exclusion items so they never orphan across pages
    const exclH = Math.min(quote.exclusions.length * 8, 50)
    b.addSectionHeading('Package Excludes:', 'x', exclH)
    b.addBulletList(quote.exclusions)
    b.y += 4
  }

  // ── Surgeon + Consultation ────────────────────────────────────────────
  b.addSurgeonSection()
  b.addConsultationSection()

  // ── Next steps ────────────────────────────────────────────────────────
  b.addNextStepBox()
  b.addAgentContact(agent)

  // ── Important notes ───────────────────────────────────────────────────
  b.addImportantNotes()

  // ── Save ──────────────────────────────────────────────────────────────
  const safeName = (s: string | null) => (s ?? '').replace(/[^a-zA-Z0-9]+/g, '_')
  const filename = `Quote_${safeName(quote.patientName)}_${safeName(quote.treatmentName)}.pdf`
  b.save(filename)
}
