import { PDFDocument, PDFString, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import type { QuoteData, AgentProfile } from '../types'

// ── Colors ────────────────────────────────────────────────────────────────────
const MD_RED  = rgb(229 / 255, 27 / 255, 36 / 255)  // #e51b24 — procedure name color
const WHITE   = rgb(1, 1, 1)
const DARK    = rgb(0.22, 0.22, 0.22)                // #383838
const GRAY    = rgb(88 / 255, 88 / 255, 89 / 255)    // #585859 — agent subtext

// ── Coordinate Map ────────────────────────────────────────────────────────────
// All values in PDF points (pt). Origin = bottom-left of page.
//
// Derived from two reference PDFs:
//   • "Wansiri @ MD QUOTE TEMPLATE.pdf"  — layout, column widths, row positions
//   • "@MD Quote Example Filled.pdf"     — exact text-box positions confirmed
//
// Reference page size: 595.5 × 842.25 pt (A4). Scale: 0.6669 pt/pixel at 150 DPI.
//
// IMPORTANT: Templates are exported from Canva WITHOUT placeholder text.
// Static labels ("Patient Name:", "Quote Date:", "WHAT'S INCLUDED:", etc.)
// are already in the template — we overlay the VALUE ONLY at the positions below.
// Dynamic title areas (procedure name, price) are fully blank in the template.
// ──────────────────────────────────────────────────────────────────────────────
export const MD_COORD = {
  page1: {
    // Full dynamic title — no static label in template for this area
    procedureName: { x: 29.8,  startY: 701.7, lineH: 24,  maxWidth: 224, size: 20.5 },
    // Full price string ("50000 THB") — no static label, sits inside the red banner
    price:         { x: 47.2,  y: 610.2,       maxWidth: 285, size: 20.5 },
    // VALUE ONLY — "Patient Name:" static label already in template at x≈34.6
    patientName:   { x: 130.1, y: 567.7,        size: 12 },
    // VALUE ONLY — "Quote Date:" static label already in template at x≈34.6
    quoteDate:     { x: 130.1, y: 546.1,        size: 10 },
    // "WHAT'S INCLUDED:" heading is static in template
    inclusions: {
      checkX:    32.8,
      textX:     43.1,
      startY:    490.7,
      lineH:     15,
      maxWidth:  252,
      size:      11,
    },
    // "WHAT'S NOT INCLUDED:" heading is static in template
    // iconX aligns with the heading left edge; textX starts after the icon
    exclusions: {
      iconX:    307.2,
      textX:    318.2,
      startY:   490.0,
      lineH:    15,
      maxWidth: 237,
      size:     11,
    },
    // "IMPORTANT NOTES:" heading is static in template
    notes: {
      textX:    307.2,
      startY:   351.7,
      lineH:    13,
      maxWidth: 248,
      size:     11,
    },
  },
  page2: {
    procedureName: { x: 29.8,  startY: 705.7, lineH: 24,  maxWidth: 224, size: 20.5 },
    price:         { x: 47.2,  y: 610.2,       maxWidth: 285, size: 20.5 },
    // VALUE ONLY — "YOUR PATIENT COORDINATOR" heading + bold [SALES AGENT NAME] slot
    agentName:     { x: 34.6,  y: 338.0,        size: 10 },
    // VALUE ONLY — mail icon is static in template
    agentEmail:    { x: 50.3,  y: 323.0,        size: 9 },
    // VALUE ONLY — phone icon is static in template
    agentPhone:    { x: 50.3,  y: 308.3,        size: 9 },
    // Invisible PDF link annotation over "View Clinic Page" button [x1, y1, x2, y2]
    clinicLinkRect: [386, 358, 575, 382] as const,
  },
} as const

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`)
  return new Uint8Array(await res.arrayBuffer())
}

// Fetches a template PDF through the server-side proxy to avoid CORS restrictions.
// Google Drive /view and /file URLs are automatically converted to direct-download URLs
// by the proxy function before fetching.
async function fetchTemplateBytes(templateUrl: string): Promise<Uint8Array> {
  const proxyUrl = `/api/fetch-template?url=${encodeURIComponent(templateUrl)}`
  const res = await fetch(proxyUrl)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(`Template fetch failed: ${(err as { error?: string }).error ?? res.statusText}`)
  }
  return new Uint8Array(await res.arrayBuffer())
}

/** Wrap text into lines that fit within maxWidth at the given widthOf measurement. */
function wrapText(
  text: string,
  widthOf: (s: string) => number,
  maxWidth: number,
): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (widthOf(candidate) <= maxWidth) {
      line = candidate
    } else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

/**
 * Find the largest font size ≤ startSize at which `check` passes.
 * For single-line text: pass the full string.
 * For multiline text: pass the longest individual word (so it can always wrap).
 */
function autoFitSize(
  checkText: string,
  widthOf: (text: string, size: number) => number,
  startSize: number,
  maxWidth: number,
  minSize = 10,
): number {
  let size = startSize
  while (size > minSize && widthOf(checkText, size) > maxWidth) {
    size -= 0.5
  }
  return size
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateMDQuotePDFOverlay(
  quote: QuoteData,
  agent: AgentProfile,
): Promise<{ pdfBytes: Uint8Array; filename: string }> {
  if (!quote.templatePdfUrl) {
    throw new Error(
      'No PDF template configured for this clinic. Ask your admin to add a template_pdf_url in the Clinic App sheet.',
    )
  }

  // Fetch template via proxy (handles CORS + Google Drive URL conversion),
  // fonts and icon PNGs directly from the same origin.
  const [templateBytes, boldBytes, regularBytes, checkBytes, xBytes] = await Promise.all([
    fetchTemplateBytes(quote.templatePdfUrl),
    fetchBytes('/fonts/Montserrat-Bold.ttf'),
    fetchBytes('/fonts/Montserrat-Regular.ttf'),
    fetchBytes('/check.png'),
    fetchBytes('/X.png'),
  ])

  const pdfDoc = await PDFDocument.load(templateBytes)
  pdfDoc.registerFontkit(fontkit)

  const boldFont    = await pdfDoc.embedFont(boldBytes)
  const regularFont = await pdfDoc.embedFont(regularBytes)
  const checkImg    = await pdfDoc.embedPng(checkBytes)
  const xImg        = await pdfDoc.embedPng(xBytes)

  const pages = pdfDoc.getPages()
  const page1 = pages[0]
  const page2 = pages[1]

  const boldW    = (s: string, sz: number) => boldFont.widthOfTextAtSize(s, sz)
  const regularW = (s: string, sz: number) => regularFont.widthOfTextAtSize(s, sz)

  const priceStr = quote.price != null ? `${quote.price} ${quote.currency}` : ''

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1
  // ═══════════════════════════════════════════════════════════════════════════

  const c1 = MD_COORD.page1

  // ── Procedure Name (navy bold, auto-shrink if longest word exceeds column) ──
  const procText = quote.treatmentName || ''
  const longestWord = procText.split(' ').reduce((a, b) => (a.length > b.length ? a : b), '')
  const procSize = autoFitSize(longestWord, boldW, c1.procedureName.size, c1.procedureName.maxWidth)
  const procLines = wrapText(procText, s => boldW(s, procSize), c1.procedureName.maxWidth)

  let procY = c1.procedureName.startY
  for (const line of procLines) {
    page1.drawText(line, {
      x: c1.procedureName.x, y: procY,
      font: boldFont, size: procSize, color: MD_RED,
    })
    procY -= c1.procedureName.lineH
  }

  // ── Price (white bold, auto-shrink if too wide for the red banner) ─────────
  const priceSize = autoFitSize(priceStr, boldW, c1.price.size, c1.price.maxWidth)
  page1.drawText(priceStr, {
    x: c1.price.x, y: c1.price.y,
    font: boldFont, size: priceSize, color: WHITE,
  })

  // ── Patient Name value (regular 12pt) ─────────────────────────────────────
  // "Patient Name:" label is already printed as static Canva text in the template.
  page1.drawText(quote.patientName || '', {
    x: c1.patientName.x, y: c1.patientName.y,
    font: regularFont, size: c1.patientName.size, color: DARK,
  })

  // ── Quote Date value (regular 10pt) ───────────────────────────────────────
  // "Quote Date:" label is already printed as static Canva text in the template.
  page1.drawText(quote.quoteDate || '', {
    x: c1.quoteDate.x, y: c1.quoteDate.y,
    font: regularFont, size: c1.quoteDate.size, color: DARK,
  })

  // ── Inclusions (PNG checkmark + text, 11pt, max 30 lines) ───────────────
  // "WHAT'S INCLUDED:" heading is static in the template.
  // Uses check-mark.png instead of ✓ Unicode — Montserrat doesn't include that glyph.
  const iconSize = 9
  let inclY = c1.inclusions.startY
  for (const item of quote.inclusions) {
    const wrapped = wrapText(
      item,
      s => regularW(s, c1.inclusions.size),
      c1.inclusions.maxWidth,
    )
    page1.drawImage(checkImg, {
      x: c1.inclusions.checkX, y: inclY - 1,
      width: iconSize, height: iconSize,
    })
    page1.drawText(wrapped[0], {
      x: c1.inclusions.textX, y: inclY,
      font: regularFont, size: c1.inclusions.size, color: DARK,
    })
    inclY -= c1.inclusions.lineH
    for (let i = 1; i < wrapped.length; i++) {
      page1.drawText(wrapped[i], {
        x: c1.inclusions.textX, y: inclY,
        font: regularFont, size: c1.inclusions.size, color: DARK,
      })
      inclY -= c1.inclusions.lineH
    }
  }

  // ── Exclusions (PNG x-mark + text, 11pt, max 7 lines) ───────────────────
  // "WHAT'S NOT INCLUDED:" heading is static in the template.
  // iconX aligns with heading left edge; textX starts 11pt after icon.
  let exclY = c1.exclusions.startY
  for (const item of quote.exclusions) {
    const wrapped = wrapText(
      item,
      s => regularW(s, c1.exclusions.size),
      c1.exclusions.maxWidth,
    )
    page1.drawImage(xImg, {
      x: c1.exclusions.iconX, y: exclY - 1,
      width: iconSize, height: iconSize,
    })
    page1.drawText(wrapped[0], {
      x: c1.exclusions.textX, y: exclY,
      font: regularFont, size: c1.exclusions.size, color: DARK,
    })
    exclY -= c1.exclusions.lineH
    for (let i = 1; i < wrapped.length; i++) {
      page1.drawText(wrapped[i], {
        x: c1.exclusions.textX, y: exclY,
        font: regularFont, size: c1.exclusions.size, color: DARK,
      })
      exclY -= c1.exclusions.lineH
    }
  }

  // ── Important Notes (bullet points, 10pt, max 27 lines) ─────────────────
  // "IMPORTANT NOTES:" heading is static in the template.
  // Each line prefixed with "• ". Continuation lines indented to align with text after bullet.
  let notesY = c1.notes.startY
  const bulletPrefix = '• '
  const bulletIndent = regularFont.widthOfTextAtSize(bulletPrefix, c1.notes.size)
  // Split on \n; if AI returned everything on one line, also split on embedded "- " markers
  const rawNotes = (quote.importantNotes || '').trim()
  const noteLines = rawNotes.includes('\n')
    ? rawNotes.split('\n').filter(l => l.trim())
    : rawNotes.split(/(?<!\w)-\s+/).filter(l => l.trim())
  for (const noteLine of noteLines) {
    const cleanLine = noteLine.replace(/^[-•]\s*/, '')
    const firstLineMaxWidth = c1.notes.maxWidth - bulletIndent
    const wrapped = wrapText(cleanLine, s => regularW(s, c1.notes.size), firstLineMaxWidth)
    page1.drawText(bulletPrefix + (wrapped[0] ?? ''), {
      x: c1.notes.textX, y: notesY,
      font: regularFont, size: c1.notes.size, color: DARK,
    })
    notesY -= c1.notes.lineH
    for (let i = 1; i < wrapped.length; i++) {
      page1.drawText(wrapped[i], {
        x: c1.notes.textX + bulletIndent, y: notesY,
        font: regularFont, size: c1.notes.size, color: DARK,
      })
      notesY -= c1.notes.lineH
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2
  // ═══════════════════════════════════════════════════════════════════════════

  const c2 = MD_COORD.page2

  // ── Procedure Name (same layout as page 1) ─────────────────────────────────
  let procY2 = c2.procedureName.startY
  const proc2Size = autoFitSize(longestWord, boldW, c2.procedureName.size, c2.procedureName.maxWidth)
  const proc2Lines = wrapText(procText, s => boldW(s, proc2Size), c2.procedureName.maxWidth)
  for (const line of proc2Lines) {
    page2.drawText(line, {
      x: c2.procedureName.x, y: procY2,
      font: boldFont, size: proc2Size, color: MD_RED,
    })
    procY2 -= c2.procedureName.lineH
  }

  // ── Price ──────────────────────────────────────────────────────────────────
  const price2Size = autoFitSize(priceStr, boldW, c2.price.size, c2.price.maxWidth)
  page2.drawText(priceStr, {
    x: c2.price.x, y: c2.price.y,
    font: boldFont, size: price2Size, color: WHITE,
  })

  // ── Agent Name (bold 10pt) ─────────────────────────────────────────────────
  // "YOUR PATIENT COORDINATOR" heading is static in template.
  page2.drawText(agent.name || '', {
    x: c2.agentName.x, y: c2.agentName.y,
    font: boldFont, size: c2.agentName.size, color: DARK,
  })

  // ── Agent Email (regular 9pt, grey) ────────────────────────────────────────
  // Mail icon is static in template.
  page2.drawText(agent.email || '', {
    x: c2.agentEmail.x, y: c2.agentEmail.y,
    font: regularFont, size: c2.agentEmail.size, color: GRAY,
  })

  // ── Agent Phone (regular 9pt, grey) ────────────────────────────────────────
  // Phone icon is static in template.
  page2.drawText(agent.phone || '', {
    x: c2.agentPhone.x, y: c2.agentPhone.y,
    font: regularFont, size: c2.agentPhone.size, color: GRAY,
  })

  // ── Invisible hyperlink over "View Clinic Page" button ─────────────────────
  // URL from column E (clinic_profile_url). Button artwork is static in template.
  if (quote.clinicProfileUrl) {
    const [lx, ly, rx, ry] = c2.clinicLinkRect
    const linkAnnot = pdfDoc.context.register(
      pdfDoc.context.obj({
        Type:    'Annot',
        Subtype: 'Link',
        Rect:    [lx, ly, rx, ry],
        Border:  [0, 0, 0],
        A: pdfDoc.context.obj({
          Type: 'Action',
          S:    'URI',
          URI:  PDFString.of(quote.clinicProfileUrl),
        }),
      }),
    )
    page2.node.addAnnot(linkAnnot)
  }

  // ── Save and return bytes ──────────────────────────────────────────────────
  const pdfBytes = await pdfDoc.save()
  const filename = `${quote.patientName || 'Quote'} - ${quote.treatmentName || 'Treatment'}.pdf`
  return { pdfBytes, filename }
}
