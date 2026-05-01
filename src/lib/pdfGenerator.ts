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

async function buildDoc(): Promise<{ doc: jsPDF; logoDataUrl: string; mailIconUrl: string; phoneIconUrl: string }> {
  const [regular, bold, semibold, logoDataUrl, mailIconUrl, phoneIconUrl] = await Promise.all([
    loadFontBase64('/fonts/Montserrat-Regular.ttf'),
    loadFontBase64('/fonts/Montserrat-Bold.ttf'),
    loadFontBase64('/fonts/Montserrat-SemiBold.ttf'),
    loadImageDataUrl('/logo.png'),
    loadImageDataUrl('/mail-icon.png'),
    loadImageDataUrl('/phone-icon.png'),
  ])
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('Montserrat-Regular.ttf', regular)
  doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal')
  doc.addFileToVFS('Montserrat-Bold.ttf', bold)
  doc.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold')
  doc.addFileToVFS('Montserrat-SemiBold.ttf', semibold)
  doc.addFont('Montserrat-SemiBold.ttf', 'Montserrat', 'semibold')
  return { doc, logoDataUrl, mailIconUrl, phoneIconUrl }
}

// ── Palette ────────────────────────────────────────────────────────────────
type RGB = [number, number, number]
const C = {
  navy:      [0,   70,  127] as RGB,
  red:       [229, 27,  36]  as RGB,
  white:     [255, 255, 255] as RGB,
  darkText:  [30,  30,  30]  as RGB,
  gray:      [120, 120, 120] as RGB,
  lightBg:   [245, 246, 248] as RGB,
  lineGray:  [220, 220, 220] as RGB,
  cream:     [245, 240, 232] as RGB,
  creamText: [140, 120, 100] as RGB,
  creamLine: [210, 200, 188] as RGB,
  green:     [42,  110, 42]  as RGB,
  priceTag:  [160, 195, 230] as RGB,
}

// ── Layout constants ───────────────────────────────────────────────────────
const ML = 14
const MR = 14
const PW = 210
const CW = PW - ML - MR
const HEADER_BOTTOM = 34
const FOOTER_Y = 282
const MAX_Y = 265

// ── Helpers ────────────────────────────────────────────────────────────────
function fc(doc: jsPDF, c: RGB) { doc.setFillColor(...c) }
function tc(doc: jsPDF, c: RGB) { doc.setTextColor(...c) }
function dc(doc: jsPDF, c: RGB) { doc.setDrawColor(...c) }

// ── Page header (ALL pages) ──────────────────────────────────────────────────
function drawHeader(doc: jsPDF, quote: QuoteData, logoDataUrl: string) {
  // Logo: 65×22mm
  doc.addImage(logoDataUrl, 'PNG', ML, 6, 65, 22)

  // "TREATMENT QUOTE" bold dark/black
  tc(doc, C.darkText)
  doc.setFont('Montserrat', 'bold')
  doc.setFontSize(13)
  doc.text('TREATMENT QUOTE', PW - MR, 13, { align: 'right' })

  // Date
  tc(doc, C.gray)
  doc.setFont('Montserrat', 'normal')
  doc.setFontSize(8.5)
  const dateStr = quote.quoteDate
    ? quote.quoteDate
    : new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
  doc.text(`Date: ${dateStr}`, PW - MR, 20, { align: 'right' })

  // "Quote for: PatientName"
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

  // Horizontal divider — blue, thinner
  dc(doc, C.navy)
  doc.setLineWidth(0.4)
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
  doc.setLineWidth(0.5)
  doc.line(x, y + 1.2, x + 1.2, y + 2.4)
  doc.line(x + 1.2, y + 2.4, x + 3.5, y + 0)
}

// ── Draw X manually ─────────────────────────────────────────────────────────
function drawX(doc: jsPDF, x: number, y: number) {
  dc(doc, C.red)
  doc.setLineWidth(0.5)
  doc.line(x, y, x + 2.8, y + 2.8)
  doc.line(x + 2.8, y, x, y + 2.8)
}

// ── PDF Builder ─────────────────────────────────────────────────────────────
class Builder {
  doc: jsPDF
  y: number
  quote: QuoteData
  logoDataUrl: string
  mailIconUrl: string
  phoneIconUrl: string

  constructor(quote: QuoteData, doc: jsPDF, logoDataUrl: string, mailIconUrl: string, phoneIconUrl: string) {
    this.doc = doc
    this.quote = quote
    this.logoDataUrl = logoDataUrl
    this.mailIconUrl = mailIconUrl
    this.phoneIconUrl = phoneIconUrl
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

  // ── Info box ────────────────────────────────────────────────────────────────
  addInfoBox() {
    const doc = this.doc
    const boxY = this.y
    const boxH = 22
    const colW = CW / 3
    const maxW = colW - 10

    fc(doc, C.lightBg)
    dc(doc, C.lightBg)
    doc.roundedRect(ML, boxY, CW, boxH, 3, 3, 'F')

    const columns = [
      { label: 'TREATMENT', value: this.quote.treatmentName  || '—' },
      { label: 'CLINIC',    value: this.quote.clinicName     || '—' },
      { label: 'LOCATION',  value: this.quote.clinicLocation || '—' },
    ]

    columns.forEach((col, i) => {
      const colX = ML + i * colW
      const cx = colX + colW / 2

      // Label — bigger font
      tc(doc, C.gray)
      doc.setFont('Montserrat', 'bold')
      doc.setFontSize(9)
      doc.text(col.label, cx, boxY + 9, { align: 'center' })

      // Value — auto-shrink if too wide
      tc(doc, C.darkText)
      doc.setFont('Montserrat', 'bold')
      let valSize = 11
      doc.setFontSize(valSize)
      while (valSize > 7 && doc.getTextWidth(col.value) > maxW) {
        valSize -= 0.5
        doc.setFontSize(valSize)
      }
      const lines = doc.splitTextToSize(col.value, maxW) as string[]
      const lineH = valSize * 0.38
      const valY = boxY + 16 - (lines.length > 1 ? lineH / 2 : 0)
      doc.text(lines.slice(0, 2), cx, valY, { align: 'center', lineHeightFactor: 1.3 })

      // Vertical separator
      if (i > 0) {
        dc(doc, C.lineGray)
        doc.setLineWidth(0.3)
        doc.line(colX, boxY + 4, colX, boxY + boxH - 4)
      }
    })

    this.y = boxY + boxH + 5
  }

  // ── Price banner (navy card) ────────────────────────────────────────────────
  addPriceBanner() {
    const doc = this.doc
    const q = this.quote
    const currency = q.currency
    const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)

    const navyH   = 19
    const r       = 3
    const bannerY = this.y

    fc(doc, C.navy); dc(doc, C.navy)
    doc.roundedRect(ML, bannerY, CW, navyH, r, r, 'F')

    tc(doc, C.priceTag)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(9)
    doc.text('TREATMENT PRICE:', ML + 8, bannerY + 7)

    tc(doc, C.white)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(18)
    if (q.price !== null) {
      doc.text(`${fmt(q.price)} ${currency}`, ML + 8, bannerY + 15)
    } else {
      doc.text('—', ML + 8, bannerY + 15)
    }

    this.y = bannerY + navyH + 5
  }

  // ── Two-column includes/excludes — auto-scales to fit on one page ──────────
  addIncludesExcludes() {
    const doc = this.doc
    const leftX  = ML
    const rightX = ML + CW / 2 + 4
    const colW   = CW / 2 - 9

    const inclusions = this.quote.inclusions || []
    const exclusions = this.quote.exclusions || []

    const headerY    = this.y + 12
    const itemsY     = headerY + 8
    const MAX_ITEM_Y = FOOTER_Y - 26
    const available  = MAX_ITEM_Y - itemsY

    let fs  = 8.5
    let lh  = 5.5
    let gap = 1.8

    const colHeight = (items: string[], size: number, lineH: number, g: number) => {
      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(size)
      return items.reduce((sum, item) => {
        const lines = doc.splitTextToSize(item, colW) as string[]
        return sum + lines.length * lineH + g
      }, 0)
    }

    while (fs > 5.5) {
      const lH = colHeight(inclusions, fs, lh, gap)
      const rH = colHeight(exclusions, fs, lh, gap)
      if (Math.max(lH, rH) <= available) break
      fs  -= 0.3
      lh   = fs * 0.66
      gap  = Math.max(0.5, fs * 0.2)
    }

    tc(doc, C.navy)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(9)
    if (inclusions.length) doc.text('PACKAGE INCLUDES', leftX, headerY)
    tc(doc, C.red)
    if (exclusions.length) doc.text('PACKAGE EXCLUDES', rightX, headerY)

    let leftY = itemsY
    for (const item of inclusions) {
      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(fs)
      const lines = doc.splitTextToSize(item, colW) as string[]
      drawCheckmark(doc, leftX, leftY - 2)
      tc(doc, C.darkText)
      doc.text(lines, leftX + 6, leftY)
      leftY += lines.length * lh + gap
    }

    let rightY = itemsY
    for (const item of exclusions) {
      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(fs)
      const lines = doc.splitTextToSize(item, colW) as string[]
      drawX(doc, rightX, rightY - 2)
      tc(doc, C.darkText)
      doc.text(lines, rightX + 6, rightY)
      rightY += lines.length * lh + gap
    }

    this.y = Math.max(leftY, rightY) + 4
  }

  // ── View Clinic Page button ──────────────────────────────────────────────
  addViewClinicButton() {
    if (!this.quote.clinicProfileUrl) return
    const doc = this.doc
    const bw  = 55
    const bh  = 10
    const btnY = FOOTER_Y - 18

    fc(doc, C.navy); dc(doc, C.navy)
    doc.roundedRect(ML, btnY, bw, bh, 2, 2, 'F')

    tc(doc, C.white)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(8)
    doc.text('View Clinic Page \u2192', ML + bw / 2, btnY + 6, { align: 'center' })

    doc.link(ML, btnY, bw, bh, { url: this.quote.clinicProfileUrl! })
  }

  // ── Doctor section (page 2) ────────────────────────────────────────────────
  addDoctorSection() {
    const q = this.quote
    if (!q.surgeonName) return

    const doc = this.doc
    this.need(24)

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
  }

  // ── Generic section (label + paragraph text) ───────────────────────────────
  addSection(label: string, content: string | null) {
    if (!content) return

    const doc = this.doc
    this.need(20)

    tc(doc, C.navy)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(9.5)
    doc.text(label, ML, this.y)
    this.y += 6

    tc(doc, C.darkText)
    doc.setFont('Montserrat', 'normal')
    doc.setFontSize(9.5)
    const lines = doc.splitTextToSize(content, CW) as string[]
    for (const line of lines) {
      this.need(6)
      doc.text(line, ML, this.y)
      this.y += 5.5
    }
    this.y += 7
  }

  // ── Bullet-point section (for Important Notes) ─────────────────────────────
  addBulletSection(label: string, content: string | null) {
    if (!content) return

    const doc = this.doc
    this.need(20)

    // Section label
    tc(doc, C.navy)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(9.5)
    doc.text(label, ML, this.y)
    this.y += 7

    // Parse and render bullet structure
    const lines = content.split('\n').filter((l) => l.trim().length > 0)
    for (const line of lines) {
      const isSubBullet = /^\s{2,}-\s/.test(line)
      const isTopBullet = /^-\s/.test(line)
      this.need(7)

      if (isSubBullet) {
        const text = line.replace(/^\s+-\s+/, '')
        // Indent dash
        tc(doc, C.gray)
        doc.setFont('Montserrat', 'normal')
        doc.setFontSize(9)
        doc.text('\u2013', ML + 7, this.y)
        tc(doc, C.darkText)
        const wrapped = doc.splitTextToSize(text, CW - 16) as string[]
        doc.text(wrapped, ML + 12, this.y)
        this.y += wrapped.length * 5.2
      } else if (isTopBullet) {
        const text = line.slice(2)
        // Navy filled circle bullet
        fc(doc, C.navy); dc(doc, C.navy)
        doc.circle(ML + 1.5, this.y - 1.8, 1, 'F')
        tc(doc, C.darkText)
        doc.setFont('Montserrat', 'normal')
        doc.setFontSize(9.5)
        const wrapped = doc.splitTextToSize(text, CW - 8) as string[]
        doc.text(wrapped, ML + 5, this.y)
        this.y += wrapped.length * 5.5
      } else {
        // Plain paragraph line
        tc(doc, C.darkText)
        doc.setFont('Montserrat', 'normal')
        doc.setFontSize(9.5)
        const wrapped = doc.splitTextToSize(line, CW) as string[]
        doc.text(wrapped, ML, this.y)
        this.y += wrapped.length * 5.5
      }
    }
    this.y += 7
  }

  // ── Agent box ──────────────────────────────────────────────────────────────
  addAgentBox(agent: AgentProfile) {
    const doc = this.doc
    const boxH = 36

    // If box doesn't fit on current page, start a new one
    if (this.y + boxH + 10 > FOOTER_Y - 10) this.newPage()

    // Flow from current content position (don't anchor to bottom)
    const boxY = this.y + 10

    fc(doc, C.lightBg); dc(doc, C.lightBg)
    doc.roundedRect(ML, boxY, CW, boxH, 3, 3, 'F')

    // Title — bigger font
    tc(doc, C.navy)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(11)
    doc.text('YOUR PATIENT COORDINATOR', ML + 8, boxY + 9)

    // Agent name — 1.5 spacing below title (~7mm)
    tc(doc, C.darkText)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(10)
    doc.text(agent.name, ML + 8, boxY + 16)

    // Email with icon — single space
    const iconSize = 3.5
    const emailY = boxY + 22
    doc.addImage(this.mailIconUrl, 'PNG', ML + 8, emailY - iconSize + 0.5, iconSize, iconSize)
    tc(doc, C.gray)
    doc.setFont('Montserrat', 'normal')
    doc.setFontSize(9)
    doc.text(agent.email, ML + 8 + iconSize + 1.5, emailY)

    // Phone with icon — single space
    const phoneY = boxY + 28
    doc.addImage(this.phoneIconUrl, 'PNG', ML + 8, phoneY - iconSize + 0.5, iconSize, iconSize)
    doc.text(agent.phone, ML + 8 + iconSize + 1.5, phoneY)
  }

  save(filename: string) {
    this.doc.save(filename)
  }
}

// ── Public entry point ──────────────────────────────────────────────────────
export async function generateQuotePDF(quote: QuoteData, agent: AgentProfile): Promise<void> {
  const { doc, logoDataUrl, mailIconUrl, phoneIconUrl } = await buildDoc()
  const b = new Builder(quote, doc, logoDataUrl, mailIconUrl, phoneIconUrl)

  // Page 1
  b.addInfoBox()
  b.addPriceBanner()
  b.addIncludesExcludes()
  b.addViewClinicButton()

  // Page 2
  b.newPage()

  b.addDoctorSection()
  b.addSection('CLINIC ACCREDITATION', quote.accreditations || null)
  b.addBulletSection('IMPORTANT NOTES', quote.importantNotes || null)

  b.addAgentBox(agent)

  const safeName = (s: string | null) => (s ?? '').replace(/[^a-zA-Z0-9]+/g, '_')
  const filename = `Quote_${safeName(quote.patientName)}_${safeName(quote.treatmentName)}.pdf`
  b.save(filename)
}
