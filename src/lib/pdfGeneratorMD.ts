import jsPDF from 'jspdf'
import type { QuoteData, AgentProfile } from '../types'

// ── Asset loaders ─────────────────────────────────────────────────────────────
async function loadFontBase64(url: string): Promise<string> {
  const buf = await fetch(url).then((r) => r.arrayBuffer())
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

async function loadRequired(url: string): Promise<string> {
  const blob = await fetch(url).then((r) => r.blob())
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}


// ── Colors ────────────────────────────────────────────────────────────────────
type RGB = [number, number, number]
const C = {
  navy:     [0,   70,  127] as RGB,   // #00467f
  red:      [229, 27,  36]  as RGB,   // #e51b24
  white:    [255, 255, 255] as RGB,
  lightBg:  [248, 249, 250] as RGB,
  gray:     [155, 155, 155] as RGB,
  lineGray: [220, 220, 220] as RGB,
  dark:     [40,  40,  40]  as RGB,
  navyLight:[158, 176, 207] as RGB,   // #9eb0cf — location text in header
  green:    [42,  140, 70]  as RGB,
}

// ── Layout ────────────────────────────────────────────────────────────────────
const ML       = 14   // left margin
const MR       = 14   // right margin
const PW       = 210  // page width (A4)
const CW       = 182  // content width
const HEADER_H = 38   // navy strip height
const FOOTER_Y = 278
const MAX_Y    = 266

function fc(doc: jsPDF, c: RGB) { doc.setFillColor(...c) }
function tc(doc: jsPDF, c: RGB) { doc.setTextColor(...c) }
function dc(doc: jsPDF, c: RGB) { doc.setDrawColor(...c) }

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
}

function drawCheckmark(doc: jsPDF, x: number, y: number) {
  dc(doc, C.green)
  doc.setLineWidth(0.55)
  doc.line(x, y + 1.2, x + 1.3, y + 2.5)
  doc.line(x + 1.3, y + 2.5, x + 3.8, y + 0)
}

function drawX(doc: jsPDF, x: number, y: number) {
  dc(doc, C.red)
  doc.setLineWidth(0.55)
  doc.line(x, y, x + 2.8, y + 2.8)
  doc.line(x + 2.8, y, x, y + 2.8)
}

// ── Header: full-width navy strip (every page) ────────────────────────────────
// Clinic name auto-shrinks to fit within 83mm wide × 19mm tall text box
function drawHeader(doc: jsPDF, quote: QuoteData, logo: string) {
  // Full-width navy strip
  fc(doc, C.navy); dc(doc, C.navy)
  doc.rect(0, 0, PW, HEADER_H, 'F')

  // MD logo — top right inside strip
  doc.addImage(logo, 'PNG', PW - MR - 42, 4, 42, 18)

  // Clinic name: auto-shrink from 19pt down to 10pt to fit 83mm wide
  const clinicName = quote.clinicName || ''
  const MAX_CLINIC_W = 83
  let fs = 19
  tc(doc, C.white)
  doc.setFont('Montserrat', 'bold')
  doc.setFontSize(fs)
  while (fs > 10 && doc.getTextWidth(clinicName) > MAX_CLINIC_W) {
    fs -= 0.5
    doc.setFontSize(fs)
  }
  doc.text(clinicName, ML, 17)

  // Location — light blue-gray
  tc(doc, C.navyLight)
  doc.setFont('Montserrat', 'normal')
  doc.setFontSize(9)
  doc.text(quote.clinicLocation || '', ML, 27)
}

// ── Footer (every page) ───────────────────────────────────────────────────────
function drawFooter(doc: jsPDF, logo: string) {
  dc(doc, C.lineGray)
  doc.setLineWidth(0.2)
  doc.line(ML, FOOTER_Y, PW - MR, FOOTER_Y)

  tc(doc, C.gray)
  doc.setFont('Montserrat', 'normal')
  doc.setFontSize(6.5)
  doc.text('© 2026 Medical Departures Inc. All rights reserved.', ML, FOOTER_Y + 5.5)

  const pw = doc.getTextWidth('Powered by ')
  doc.text('Powered by', PW - MR - pw - 18, FOOTER_Y + 5.5)
  doc.addImage(logo, 'PNG', PW - MR - 18, FOOTER_Y + 1, 18, 7)
}

// ── PDF Builder class ─────────────────────────────────────────────────────────
class Builder {
  doc: jsPDF
  y: number
  quote: QuoteData
  logo: string
  mailIcon: string
  phoneIcon: string
  img1: string | null
  img2: string | null
  doctorImg: string | null

  constructor(
    quote: QuoteData,
    doc: jsPDF,
    logo: string,
    mailIcon: string,
    phoneIcon: string,
    img1: string | null,
    img2: string | null,
    doctorImg: string | null,
  ) {
    this.doc       = doc
    this.quote     = quote
    this.logo      = logo
    this.mailIcon  = mailIcon
    this.phoneIcon = phoneIcon
    this.img1      = img1
    this.img2      = img2
    this.doctorImg = doctorImg
    this.y         = HEADER_H + 8
    drawHeader(doc, quote, logo)
    drawFooter(doc, logo)
  }

  newPage() {
    this.doc.addPage()
    drawHeader(this.doc, this.quote, this.logo)
    drawFooter(this.doc, this.logo)
    this.y = HEADER_H + 8
  }

  need(h: number) {
    if (this.y + h > MAX_Y) this.newPage()
  }

  // ── Treatment name (full width) ───────────────────────────────────────────────
  addTreatmentName() {
    const doc  = this.doc
    this.need(20)
    tc(doc, C.navy)
    doc.setFont('Montserrat', 'bold')
    let tfs = 18
    doc.setFontSize(tfs)
    let lines = doc.splitTextToSize(this.quote.treatmentName || '', CW) as string[]
    while (tfs > 11 && lines.length > 2) {
      tfs -= 0.5
      doc.setFontSize(tfs)
      lines = doc.splitTextToSize(this.quote.treatmentName || '', CW) as string[]
    }
    doc.text(lines.slice(0, 3), ML, this.y + 10, { lineHeightFactor: 1.3 })
    this.y += (lines.slice(0, 3).length - 1) * tfs * 0.352 * 1.3 + tfs * 0.352 + 12
  }

  // ── Page 1: clinic image (right side) alongside content ──────────────────────
  // MD page 1 is full-width layout (no side image on page 1, unlike DD)
  // Clinic image 1 optional below treatment
  addClinicImage1() {
    if (!this.img1) return
    const doc  = this.doc
    const imgH = 50
    this.need(imgH + 4)
    try {
      doc.addImage(this.img1, 'JPEG', ML, this.y, CW, imgH, undefined, 'MEDIUM')
      this.y += imgH + 6
    } catch {
      try { doc.addImage(this.img1, 'PNG', ML, this.y, CW, imgH); this.y += imgH + 6 } catch { /* skip */ }
    }
  }

  // ── Red price banner ──────────────────────────────────────────────────────────
  addPriceBanner() {
    const doc     = this.doc
    const bannerH = 22
    this.need(bannerH + 4)

    fc(doc, C.red); dc(doc, C.red)
    doc.roundedRect(ML, this.y, CW, bannerH, 2, 2, 'F')

    tc(doc, C.white)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(7.5)
    doc.text('YOUR EXCLUSIVE TREATMENT PRICE', ML + 7, this.y + 9)

    doc.setFontSize(17)
    const q = this.quote
    const priceStr = q.price !== null ? `${fmt(q.price!)} ${q.currency || 'THB'}` : '—'
    doc.text(priceStr, ML + 7, this.y + 18.5)

    this.y += bannerH + 6
  }

  // ── Patient name + Quote date row ─────────────────────────────────────────────
  addPatientRow() {
    const doc = this.doc
    this.need(10)

    tc(doc, C.gray)
    doc.setFont('Montserrat', 'normal')
    doc.setFontSize(8.5)
    doc.text('Patient Name:', ML, this.y)

    tc(doc, C.dark)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(8.5)
    const labelW = doc.getTextWidth('Patient Name: ')
    doc.text(this.quote.patientName || '—', ML + labelW, this.y)

    tc(doc, C.gray)
    doc.setFont('Montserrat', 'normal')
    const dateLabel = 'Quote Date: '
    const dateVal   = this.quote.quoteDate || '—'
    const dateValW  = doc.getTextWidth(dateVal)
    const dateLblW  = doc.getTextWidth(dateLabel)
    doc.text(dateLabel, PW - MR - dateLblW - dateValW, this.y)
    tc(doc, C.dark)
    doc.setFont('Montserrat', 'bold')
    doc.text(dateVal, PW - MR - dateValW, this.y)

    this.y += 5
    dc(doc, C.lineGray)
    doc.setLineWidth(0.2)
    doc.line(ML, this.y, PW - MR, this.y)
    this.y += 6
  }

  // ── Two-column inclusions / exclusions ────────────────────────────────────────
  addIncludesExcludes() {
    const doc        = this.doc
    const inclusions = this.quote.inclusions || []
    const exclusions = this.quote.exclusions || []
    if (!inclusions.length && !exclusions.length) return

    const leftX  = ML
    const rightX = ML + CW / 2 + 4
    const colW   = CW / 2 - 9

    this.need(18)
    tc(doc, C.navy)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(8.5)
    if (inclusions.length) doc.text("WHAT'S INCLUDED", leftX, this.y)
    tc(doc, C.red)
    if (exclusions.length) doc.text("WHAT'S NOT INCLUDED", rightX, this.y)
    this.y += 7

    const fs  = 8
    const lh  = 5
    const gap = 1.5

    let leftY  = this.y
    let rightY = this.y

    for (const item of inclusions) {
      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(fs)
      const lines = doc.splitTextToSize(item, colW) as string[]
      drawCheckmark(doc, leftX, leftY - 2)
      tc(doc, C.dark)
      doc.text(lines, leftX + 6, leftY)
      leftY += lines.length * lh + gap
    }

    for (const item of exclusions) {
      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(fs)
      const lines = doc.splitTextToSize(item, colW) as string[]
      drawX(doc, rightX, rightY - 2)
      tc(doc, C.dark)
      doc.text(lines, rightX + 6, rightY)
      rightY += lines.length * lh + gap
    }

    this.y = Math.max(leftY, rightY) + 6
  }

  // ── Important notes (bullet section) ─────────────────────────────────────────
  addImportantNotes() {
    const content = this.quote.importantNotes
    if (!content) return
    const doc = this.doc
    this.need(20)

    tc(doc, C.navy)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(8.5)
    doc.text('IMPORTANT NOTES', ML, this.y)
    this.y += 7

    for (const line of content.split('\n').filter((l) => l.trim())) {
      const isSub = /^\s{2,}-\s/.test(line)
      const isTop = /^-\s/.test(line)
      this.need(6)

      if (isSub) {
        const text = line.replace(/^\s+-\s+/, '')
        tc(doc, C.gray); doc.setFont('Montserrat', 'normal'); doc.setFontSize(8)
        doc.text('–', ML + 7, this.y)
        tc(doc, C.dark)
        const w = doc.splitTextToSize(text, CW - 16) as string[]
        doc.text(w, ML + 12, this.y)
        this.y += w.length * 5
      } else if (isTop) {
        const text = line.slice(2)
        fc(doc, C.navy); dc(doc, C.navy)
        doc.circle(ML + 1.5, this.y - 1.8, 1, 'F')
        tc(doc, C.dark); doc.setFont('Montserrat', 'normal'); doc.setFontSize(8.5)
        const w = doc.splitTextToSize(text, CW - 8) as string[]
        doc.text(w, ML + 5, this.y)
        this.y += w.length * 5.2
      } else {
        tc(doc, C.dark); doc.setFont('Montserrat', 'normal'); doc.setFontSize(8.5)
        const w = doc.splitTextToSize(line, CW) as string[]
        doc.text(w, ML, this.y)
        this.y += w.length * 5.2
      }
    }
    this.y += 4
  }

  // ── Page 2: clinic image 2 (full width) ───────────────────────────────────────
  addClinicImage2() {
    if (!this.img2) return
    const doc  = this.doc
    const imgH = 58
    this.need(imgH + 4)
    try {
      doc.addImage(this.img2, 'JPEG', ML, this.y, CW, imgH, undefined, 'MEDIUM')
      this.y += imgH + 6
    } catch {
      try { doc.addImage(this.img2, 'PNG', ML, this.y, CW, imgH); this.y += imgH + 6 } catch { /* skip */ }
    }
  }

  // ── Page 2: doctor section ────────────────────────────────────────────────────
  addDoctorSection() {
    const q = this.quote
    if (!q.surgeonName) return
    const doc = this.doc
    this.need(40)

    tc(doc, C.navy)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(8.5)
    doc.text('LEADING SURGEON', ML, this.y)
    this.y += 6

    const photoSz     = 28
    const sectionStartY = this.y

    if (this.doctorImg) {
      try {
        doc.addImage(this.doctorImg, 'JPEG', ML, this.y, photoSz, photoSz, undefined, 'MEDIUM')
      } catch {
        try { doc.addImage(this.doctorImg, 'PNG', ML, this.y, photoSz, photoSz) } catch { /* skip */ }
      }
    }

    const textX = ML + photoSz + 5
    const textW = CW - photoSz - 5
    let textY   = this.y + 7

    tc(doc, C.dark)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(11)
    doc.text(q.surgeonName || '', textX, textY)
    textY += 7

    if (q.accreditations) {
      tc(doc, C.navy)
      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(8.5)
      const al = doc.splitTextToSize(q.accreditations, textW) as string[]
      doc.text(al, textX, textY)
      textY += al.length * 5
    }

    this.y = sectionStartY + Math.max(photoSz + 4, textY - sectionStartY + 4)
  }

  // ── Agent box ─────────────────────────────────────────────────────────────────
  addAgentBox(agent: AgentProfile) {
    const doc  = this.doc
    const boxH = 36
    this.need(boxH + 14)

    const boxY = this.y + 10
    fc(doc, C.lightBg); dc(doc, C.lineGray)
    doc.setLineWidth(0.3)
    doc.roundedRect(ML, boxY, CW, boxH, 3, 3, 'FD')

    tc(doc, C.navy)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(10)
    doc.text('YOUR PATIENT COORDINATOR', ML + 8, boxY + 9)

    tc(doc, C.dark)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(10)
    doc.text(agent.name, ML + 8, boxY + 17)

    const iconSz = 3.5
    tc(doc, C.gray)
    doc.setFont('Montserrat', 'normal')
    doc.setFontSize(9)
    doc.addImage(this.mailIcon, 'PNG', ML + 8, boxY + 20.5, iconSz, iconSz)
    doc.text(agent.email, ML + 8 + iconSz + 2, boxY + 24)
    doc.addImage(this.phoneIcon, 'PNG', ML + 8, boxY + 27.5, iconSz, iconSz)
    doc.text(agent.phone, ML + 8 + iconSz + 2, boxY + 31)

    this.y = boxY + boxH + 6
  }

  // ── View Clinic Page button ───────────────────────────────────────────────────
  addViewClinicButton() {
    if (!this.quote.clinicProfileUrl) return
    const doc = this.doc
    const bw  = 55
    const bh  = 10
    this.need(bh + 4)
    fc(doc, C.navy); dc(doc, C.navy)
    doc.roundedRect(ML, this.y, bw, bh, 2, 2, 'F')
    tc(doc, C.white)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(8)
    doc.text('View Clinic Page →', ML + bw / 2, this.y + 6.5, { align: 'center' })
    doc.link(ML, this.y, bw, bh, { url: this.quote.clinicProfileUrl! })
    this.y += bh + 4
  }

  save(filename: string) { this.doc.save(filename) }
}

// ── Public entry point ────────────────────────────────────────────────────────
export async function generateMDQuotePDF(quote: QuoteData, agent: AgentProfile): Promise<void> {
  const [regular, bold, semibold, logo, mailIcon, phoneIcon, img1, img2, doctorImg] =
    await Promise.all([
      loadFontBase64('/fonts/Montserrat-Regular.ttf'),
      loadFontBase64('/fonts/Montserrat-Bold.ttf'),
      loadFontBase64('/fonts/Montserrat-SemiBold.ttf'),
      loadRequired('/md-logo.png'),
      loadRequired('/mail-icon.png'),
      loadRequired('/phone-icon.png'),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.resolve(null),
    ])

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('Montserrat-Regular.ttf', regular)
  doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal')
  doc.addFileToVFS('Montserrat-Bold.ttf', bold)
  doc.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold')
  doc.addFileToVFS('Montserrat-SemiBold.ttf', semibold)
  doc.addFont('Montserrat-SemiBold.ttf', 'Montserrat', 'semibold')

  const b = new Builder(quote, doc, logo, mailIcon, phoneIcon, img1, img2, doctorImg)

  // ── Page 1 ──────────────────────────────────────────────────────────────────
  b.addTreatmentName()
  b.addPriceBanner()
  b.addPatientRow()
  b.addIncludesExcludes()
  b.addImportantNotes()

  // ── Page 2 ──────────────────────────────────────────────────────────────────
  b.newPage()
  b.addPriceBanner()
  b.addClinicImage2()
  b.addDoctorSection()
  b.addAgentBox(agent)
  b.addViewClinicButton()

  const safe = (s: string | null) => (s ?? '').replace(/[^a-zA-Z0-9]+/g, '_')
  b.save(`Quote_${safe(quote.patientName)}_${safe(quote.treatmentName)}.pdf`)
}
