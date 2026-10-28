// Line icons for the v3 quote (24×24, drawn with strokes) and the keyword rules that pick one for each line.

import { Svg, Path, Circle, Rect } from '@react-pdf/renderer'

type Shape =
  | { p: string }
  | { c: [number, number, number] }
  | { r: [number, number, number, number, number] }

const ICONS: Record<string, Shape[]> = {
  clinic: [{ p: 'M4 21V6l8-3 8 3v15M9 21v-4h6v4M8 9h2M14 9h2M8 13h2M14 13h2' }],
  anesthesia: [{ p: 'M6 3v6a4 4 0 0 0 8 0V3M10 13v3a5 5 0 0 0 10 0v-2' }, { c: [20, 12, 2] }],
  team: [{ c: [9, 8, 3] }, { c: [17, 9, 2.5] }, { p: 'M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15.5 14.5c3 .3 5.5 2.3 5.5 5.5' }],
  fees: [{ p: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7' }],
  garment: [{ p: 'M8 3 3 7l3 4 2-2v12h8V9l2 2 3-4-5-4c-1 2-2.5 3-4 3S9 5 8 3z' }],
  stockings: [{ p: 'M8 3h5v9l4 5a3 3 0 0 1-4.5 4L8 15z' }],
  drainage: [{ p: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z' }],
  ultrasound: [{ r: [3, 4, 18, 12, 2] }, { p: 'M8 20h8M12 16v4' }],
  followup: [{ r: [3, 5, 18, 16, 2] }, { p: 'M3 10h18M8 3v4M16 3v4' }],
  hotel: [{ p: 'M3 18V7M3 13h18v5M21 13a3 3 0 0 0-3-3h-7v3' }, { c: [7, 10.5, 1.5] }],
  transfer: [{ p: 'M5 16l1.5-5h11L19 16M4 16h16v3H4zM7 19v2M17 19v2' }],
  meds: [{ p: 'M8.5 15.5l7-7a3.5 3.5 0 0 0-5-5l-7 7a3.5 3.5 0 0 0 5 5zM7 9l5 5' }],
  tooth: [{ p: 'M7 3C5 3 3.5 5 4 8c.5 2.5 1.5 4 2 7s1 6 2.5 6 1.5-4 3.5-4 2 4 3.5 4 2-3 2.5-6 1.5-4.5 2-7c.5-3-1-5-3-5-2 0-3 1-5 1S9 3 7 3z' }],
  body: [{ c: [12, 5, 2] }, { p: 'M8 21l1-7-2-5 5-1.5L17 9l-2 5 1 7' }],
  face: [{ p: 'M12 3c-4 0-6.5 3-6.5 7.5 0 5 3 10.5 6.5 10.5s6.5-5.5 6.5-10.5C18.5 6 16 3 12 3z' }, { p: 'M9.2 10h.01M14.8 10h.01M12 11.5l-1 2.5h2M9.8 16.8c1.3.8 3.1.8 4.4 0' }],
  scan: [{ p: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10' }],
  lab: [{ p: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3' }],
  nurse: [{ p: 'M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z' }, { p: 'M12 10v5M9.5 12.5h5' }],
  translate: [{ p: 'M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M11 5c-1 4-4 7-7 8M13 21l4-9 4 9M14.5 18h5' }],
  check: [{ p: 'M5 12.5l4.5 4.5L19 7.5' }],
  x: [{ p: 'M7 7l10 10M17 7 7 17' }],
  wa: [{ p: 'M4 20l1.4-4.2A8 8 0 1 1 8.4 18.8z' }, { p: 'M9.2 8.8c.3 2.6 2.4 4.8 5 5.2l1-1.3 1.9.9-.4 1.6c-3.6.1-7.5-3.7-7.6-7.4l1.6-.5.9 1.9z' }],
  video: [{ r: [3, 6, 13, 12, 2] }, { p: 'm16 10 5-3v10l-5-3' }],
  link: [{ p: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' }],
}

export function Icon({ name, size, color, strokeWidth = 1.7 }: { name: string; size: number; color: string; strokeWidth?: number }) {
  const stroke = { stroke: color, strokeWidth, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      {(ICONS[name] ?? ICONS.clinic).map((s, i) =>
        'p' in s ? <Path key={i} d={s.p} {...stroke} />
          : 'c' in s ? <Circle key={i} cx={s.c[0]} cy={s.c[1]} r={s.c[2]} {...stroke} />
            : <Rect key={i} x={s.r[0]} y={s.r[1]} width={s.r[2]} height={s.r[3]} rx={s.r[4]} {...stroke} />,
      )}
    </Svg>
  )
}

// First match wins, so the more specific words come first
const RULES: [RegExp, string][] = [
  [/hotel|accommodation|\bnights?\b|\bstay\b|airbnb|room/i, 'hotel'],
  [/transfer|airport|shuttle|pick.?up|transport|driver|chauffeur/i, 'transfer'],
  [/an(a)?esthe|sedation/i, 'anesthesia'],
  [/x-?ray|\bct\b|cbct|scan|panoramic|radiograph|3d/i, 'scan'],
  [/medicat|medicine|antibiotic|painkill|prescription/i, 'meds'],
  [/blood|\blab\b|test|\becg\b|\bekg\b/i, 'lab'],
  [/ultrasound/i, 'ultrasound'],
  [/garment|compression|binder|bra\b|splint|tape/i, 'garment'],
  [/stocking/i, 'stockings'],
  [/drainage|massage/i, 'drainage'],
  [/nurs|hospital stay|in hospital|hospitali/i, 'nurse'],
  [/follow|check-?up|review|aftercare|warranty|guarantee|stitch|suture/i, 'followup'],
  [/translat|interpret|coordinator|advisor|support/i, 'translate'],
  [/consult|exam|assessment|surgeon|doctor|team|technician|staff/i, 'team'],
  [/fee|tax|admin/i, 'fees'],
  [/implant|crown|veneer|tooth|teeth|dental|denture|filling|root canal|bridge|whiten|overlay|onlay|abutment|zircon|all-on|extraction|clean/i, 'tooth'],
  [/rhino|nose|face|eyelid|bleph|brow|lift|chin|neck|botox|filler|ear/i, 'face'],
  [/lipo|bbl|butt|tummy|abdomin|breast|body|arm|thigh|mommy|bariatric|gastric|sleeve/i, 'body'],
  [/clinic|operating|surgery|surgical|room|facility/i, 'clinic'],
]

export function iconFor(text: string, fallback = 'check'): string {
  for (const [re, name] of RULES) if (re.test(text)) return name
  return fallback
}
