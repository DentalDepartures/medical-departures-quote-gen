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
  teal:     [82,  189, 236] as RGB,   // #52bdec
  coal:     [88,  88,  90]  as RGB,   // #58585a
  white:    [255, 255, 255] as RGB,
  lightBg:  [248, 249, 250] as RGB,
  gray:     [155, 155, 155] as RGB,
  lineGray: [220, 220, 220] as RGB,
  dark:     [40,  40,  40]  as RGB,
  red:      [229, 27,  36]  as RGB,
  green:    [42,  140, 70]  as RGB,
}

// ── Layout ────────────────────────────────────────────────────────────────────
const ML      = 14   // left margin
const MR      = 14   // right margin
const PW      = 210  // page width (A4)
const CW      = 182  // content width
const FOOTER_Y = 278
const MAX_Y   = 266

// Left/right split for page 1 content
const LEFT_W  = 103  // treatment + price column
const IMG_X   = ML + LEFT_W + 4  // = 121
const IMG_W   = PW - MR - IMG_X  // = 75

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

// ── Header (every page) ───────────────────────────────────────────────────────
// Clinic name auto-shrinks to fit within 83mm (W 8.3 on A4) x 19mm (H 1.9)
function drawHeader(doc: jsPDF, quote: QuoteData, logo: string) {
  // DD logo — top right, 42×18mm
  doc.addImage(logo, 'PNG', PW - MR - 42, 4, 42, 18)

  // Clinic name: auto-shrink from 19pt down to 10pt to fit 83mm wide
  const clinicName = quote.clinicName || ''
  const MAX_CLINIC_W = 83
  let fs = 19
  tc(doc, C.coal)
  doc.setFont('Montserrat', 'bold')
  doc.setFontSize(fs)
  while (fs > 10 && doc.getTextWidth(clinicName) > MAX_CLINIC_W) {
    fs -= 0.5
    doc.setFontSize(fs)
  }
  doc.text(clinicName, ML, 15)

  // Location — gray, 9pt
  tc(doc, C.gray)
  doc.setFont('Montserrat', 'normal')
  doc.setFontSize(9)
  doc.text(quote.clinicLocation || '', ML, 23)

  // Teal divider
  dc(doc, C.teal)
  doc.setLineWidth(0.7)
  doc.line(ML, 29, PW - MR, 29)
}

// ── Footer (every page) ───────────────────────────────────────────────────────
function drawFooter(doc: jsPDF, logo: string) {
  dc(doc, C.lineGray)
  doc.setLineWidth(0.2)
  doc.line(ML, FOOTER_Y, PW - MR, FOOTER_Y)

  tc(doc, C.gray)
  doc.setFont('Montserrat', 'normal')
  doc.setFontSize(6.5)
  doc.text('© 2026 Dental Departures Inc. All rights reserved.', ML, FOOTER_Y + 5.5)

  // "Powered by" + logo (right side)
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
    this.doc      = doc
    this.quote    = quote
    this.logo     = logo
    this.mailIcon = mailIcon
    this.phoneIcon = phoneIcon
    this.img1     = img1
    this.img2     = img2
    this.doctorImg = doctorImg
    this.y        = 33
    drawHeader(doc, quote, logo)
    drawFooter(doc, logo)
  }

  newPage() {
    this.doc.addPage()
    drawHeader(this.doc, this.quote, this.logo)
    drawFooter(this.doc, this.logo)
    this.y = 33
  }

  need(h: number) {
    if (this.y + h > MAX_Y) this.newPage()
  }

  // ── Page 1: treatment name (left) + clinic image (right) ────────────────────
  addTreatmentAndImage() {
    const doc  = this.doc
    const startY = this.y
    const IMG_H  = 50

    // Clinic image — right column
    if (this.img1) {
      try {
        doc.addImage(this.img1, 'JPEG', IMG_X, startY, IMG_W, IMG_H, undefined, 'MEDIUM')
      } catch {
        try { doc.addImage(this.img1, 'PNG', IMG_X, startY, IMG_W, IMG_H) } catch { /* skip */ }
      }
    }

    // Treatment name — left column, teal bold
    tc(doc, C.teal)
    doc.setFont('Montserrat', 'bold')
    let tfs = 16
    doc.setFontSize(tfs)
    let treatLines = doc.splitTextToSize(this.quote.treatmentName || '', LEFT_W) as string[]
    // Shrink if more than 3 lines
    while (tfs > 10 && treatLines.length > 3) {
      tfs -= 0.5
      doc.setFontSize(tfs)
      treatLines = doc.splitTextToSize(this.quote.treatmentName || '', LEFT_W) as string[]
    }
    doc.text(treatLines.slice(0, 4), ML, startY + 10, { lineHeightFactor: 1.35 })

    this.y = startY + IMG_H + 4
  }

  // ── Page 1: price box (bordered, teal left accent) ───────────────────────────
  addPriceBox() {
    const doc  = this.doc
    const boxH = 24
    const boxY = this.y

    fc(doc, C.lightBg); dc(doc, C.lightBg)
    doc.roundedRect(ML, boxY, LEFT_W + IMG_W + 4, boxH, 2, 2, 'F')

    // Teal left accent bar
    fc(doc, C.teal); dc(doc, C.teal)
    doc.roundedRect(ML, boxY, 3.5, boxH, 1, 1, 'F')

    // Label
    tc(doc, C.gray)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(7)
    doc.text('YOUR EXCLUSIVE TREATMENT PRICE', ML + 7, boxY + 8)

    // Price
    tc(doc, C.teal)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(17)
    const q = this.quote
    const priceStr = q.price !== null ? `${fmt(q.price!)} ${q.currency || 'USD'}` : '—'
    doc.text(priceStr, ML + 7, boxY + 20)

    this.y = boxY + boxH + 5
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

    // Quote Date — right aligned
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
    tc(doc, C.coal)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(8.5)
    if (inclusions.length) doc.text("WHAT'S INCLUDED", leftX, this.y)
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

    tc(doc, C.coal)
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
        fc(doc, C.teal); dc(doc, C.teal)
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

  // ── Page 2: full-width teal price banner ──────────────────────────────────────
  addPriceBannerP2() {
    const doc     = this.doc
    const bannerH = 20
    fc(doc, C.teal); dc(doc, C.teal)
    doc.roundedRect(ML, this.y, CW, bannerH, 2, 2, 'F')

    tc(doc, C.white)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(7.5)
    doc.text('YOUR EXCLUSIVE TREATMENT PRICE', ML + 7, this.y + 8)

    doc.setFontSize(16)
    const q = this.quote
    const priceStr = q.price !== null ? `${fmt(q.price!)} ${q.currency || 'USD'}` : '—'
    doc.text(priceStr, ML + 7, this.y + 17)

    this.y += bannerH + 6
  }

  // ── Page 2: clinic image 2 (full width) ───────────────────────────────────────
  addClinicImage2() {
    if (!this.img2) return
    const imgH = 58
    this.need(imgH + 4)
    try {
      this.doc.addImage(this.img2, 'JPEG', ML, this.y, CW, imgH, undefined, 'MEDIUM')
      this.y += imgH + 6
    } catch {
      try { this.doc.addImage(this.img2, 'PNG', ML, this.y, CW, imgH); this.y += imgH + 6 } catch { /* skip */ }
    }
  }

  // ── Page 2: doctor section ────────────────────────────────────────────────────
  addDoctorSection() {
    const q = this.quote
    if (!q.surgeonName) return
    const doc = this.doc
    this.need(40)

    tc(doc, C.coal)
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(8.5)
    doc.text('LEADING SURGEON', ML, this.y)
    this.y += 6

    const photoSz = 28
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
      tc(doc, C.teal)
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

    tc(doc, C.teal)
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
    fc(doc, C.teal); dc(doc, C.teal)
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
export async function generateDDQuotePDF(quote: QuoteData, agent: AgentProfile): Promise<void> {
  const [regular, bold, semibold, logo, mailIcon, phoneIcon, img1, img2, doctorImg] =
    await Promise.all([
      loadFontBase64('/fonts/Montserrat-Regular.ttf'),
      loadFontBase64('/fonts/Montserrat-Bold.ttf'),
      loadFontBase64('/fonts/Montserrat-SemiBold.ttf'),
      loadRequired('/dd-logo.png'),
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
  b.addTreatmentAndImage()
  b.addPriceBox()
  b.addPatientRow()
  b.addIncludesExcludes()
  b.addImportantNotes()

  // ── Page 2 ──────────────────────────────────────────────────────────────────
  b.newPage()
  b.addPriceBannerP2()
  b.addClinicImage2()
  b.addDoctorSection()
  b.addAgentBox(agent)
  b.addViewClinicButton()

  const safe = (s: string | null) => (s ?? '').replace(/[^a-zA-Z0-9]+/g, '_')
  b.save(`Quote_${safe(quote.patientName)}_${safe(quote.treatmentName)}.pdf`)
}
