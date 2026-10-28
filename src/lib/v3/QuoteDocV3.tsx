// The v3 quote: a real flowing layout (react-pdf) instead of text placed on a fixed template.
// Page 1 is the brochure cover; page 2 holds the package details and flows onto page 3+ when long.
// Sizes are in PDF points on A4 (595 × 842); they follow the v3 mock-up shown to the CEO.

import { Document, Page, View, Text, Image, Link, StyleSheet } from '@react-pdf/renderer'
import { Icon, iconFor } from './icons'

export interface V3Colors { navy: string; red: string; sky: string; pale: string; pale2: string }

export const V3_BRAND: Record<'DD' | 'MD', V3Colors & { site: string; name: string }> = {
  MD: { navy: '#00467f', red: '#e31b23', sky: '#00aeef', pale: '#eef4fb', pale2: '#dfeaf6', site: 'medicaldepartures.com', name: 'Medical Departures' },
  DD: { navy: '#1f86bf', red: '#e51b24', sky: '#52bdec', pale: '#eef8fd', pale2: '#d8eff9', site: 'dentaldepartures.com', name: 'Dental Departures' },
}

const INK = '#23303d'
const SOFT = '#5b6878'
const PAD = 33

export interface V3Item { text: string; price: string | null }
export interface V3Tile { title: string; sub: string | null; icon: string }

export interface V3Data {
  brand: 'DD' | 'MD'
  kind: 'SURGICAL' | 'TREATMENT'
  logo: string
  hero: string
  photo2: string | null          // 4:3 photo for page 2 (only when there is a doctor)
  providerPhoto: string          // doctor headshot circle, or the clinic photo when there is no doctor
  providerIsDoctor: boolean
  patient: string
  quoteDate: string
  quoteId: string
  doctorName: string | null
  doctorCreds: string | null
  clinicName: string
  clinicLocation: string
  clinicBlurb: string
  clinicUrl: string | null
  tiles: V3Tile[]
  priceLabel: string             // "Starting from" | "Total quoted package price"
  priceText: string
  planLabel: string
  includes: V3Item[]
  excludes: string[]
  notes: string[]
  agent: { name: string; email: string; phone: string; initials: string; whatsapp: string; photo: string | null }
  k?: number                     // detail-page text scale: 1, or one step smaller to keep a long quote on 2 pages
}

const s = StyleSheet.create({
  page: { fontFamily: 'Montserrat', color: INK, fontSize: 10 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 26, paddingHorizontal: PAD },
  slogan: { fontSize: 8.6, color: SOFT, fontWeight: 500, marginTop: 4 },
  pill: { fontSize: 10, fontWeight: 700, borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10 },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 18, paddingHorizontal: PAD, fontSize: 7.6, color: SOFT, borderTopWidth: 1.2 },
  secH: { fontSize: 12.5, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase' },
  card: { borderRadius: 13, paddingVertical: 13, paddingHorizontal: 16, marginBottom: 13 },
  h4: { fontSize: 11.5, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 9 },
  item: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  itemIc: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  itemTx: { fontSize: 10, fontWeight: 500, lineHeight: 1.25, flex: 1 },
})

function Logo({ src }: { src: string }) {
  return (
    <View>
      <Image src={src} style={{ height: 40, objectFit: 'contain', objectPosition: 'left' }} />
      <Text style={s.slogan}>The #1 online medical travel agency</Text>
    </View>
  )
}

function Footer({ c }: { c: V3Colors & { site: string } }) {
  return (
    <View fixed style={[s.foot, { borderTopColor: c.pale2 }]}>
      <Text>{c.site}</Text>
      <Text style={{ textAlign: 'right', maxWidth: 330 }}>Final treatment suitability, scope and pricing depend on clinical assessment by the treating provider.</Text>
    </View>
  )
}

function PageNo({ color, background }: { color: string; background: string }) {
  return <Text style={[s.pill, { color, backgroundColor: background }]} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
}

function Avatar({ initials, photo, size, border = 3 }: { initials: string; photo: string | null; size: number; border?: number }) {
  if (photo) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#fff', padding: border }}>
        <Image src={photo} style={{ width: size - border * 2, height: size - border * 2 }} />
      </View>
    )
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#c99a83', borderWidth: border, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: 800, fontSize: size * 0.34 }}>{initials}</Text>
    </View>
  )
}

function priceSize(text: string): number {
  const n = text.length
  return n <= 10 ? 34 : n <= 12 ? 29 : n <= 15 ? 24 : 20
}

// ── Page 1: the cover ──────────────────────────────────────────────────────────
function Cover({ d }: { d: V3Data }) {
  const c = V3_BRAND[d.brand]
  const many = d.tiles.length > 4
  return (
    <Page size="A4" style={s.page}>
      <Image src={d.hero} style={{ position: 'absolute', right: 0, top: 0, width: 333, height: 396 }} />
      <View style={s.top}>
        <Logo src={d.logo} />
        <PageNo color="#fff" background="rgba(0,0,0,0.28)" />
      </View>

      <View style={{ width: '52%', paddingHorizontal: PAD, paddingTop: 22 }}>
        <Text style={{ color: c.red, fontWeight: 800, fontSize: 19 }}>YOUR PERSONALIZED</Text>
        <Text style={{ color: c.navy, fontWeight: 800, fontSize: 34, lineHeight: 1.02, marginTop: 6 }}>{d.kind} PROPOSAL</Text>
        <View style={{ width: 48, height: 4, backgroundColor: c.red, borderRadius: 4, marginTop: 10 }} />
        <Text style={{ fontSize: 11.5, color: SOFT, fontWeight: 500, marginTop: 10 }}>Prepared exclusively for</Text>
        <Text style={{ fontSize: 21, fontWeight: 800, color: c.navy, marginTop: 3 }}>{d.patient}</Text>
        <Text style={{ fontSize: 9.6, color: SOFT, fontWeight: 500, marginTop: 6, lineHeight: 1.5 }}>Quote date: {d.quoteDate}{'\n'}Quote ID: {d.quoteId}</Text>
      </View>

      <View style={{ marginTop: 'auto', paddingHorizontal: PAD, paddingBottom: 66 }}>
        {/* Provider: the doctor with their headshot, or the clinic with Photo 2 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.pale, borderRadius: 14, padding: 14, marginBottom: 14 }}>
          <Image src={d.providerPhoto} style={d.providerIsDoctor ? { width: 84, height: 84 } : { width: 96, height: 72 }} />
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={{ fontSize: 8.6, fontWeight: 700, letterSpacing: 0.8, color: SOFT, textTransform: 'uppercase' }}>
              {d.providerIsDoctor ? `Your ${d.kind === 'SURGICAL' ? 'surgical' : 'treatment'} provider` : 'Your clinic'}
            </Text>
            <Text style={{ fontSize: 17, fontWeight: 800, color: c.navy, marginTop: 3, lineHeight: 1.1 }}>{d.doctorName ?? d.clinicName}</Text>
            <Text style={{ fontSize: 11, fontWeight: 700, marginTop: 5 }}>
              {d.doctorName ? `${d.clinicName} · ${d.clinicLocation}` : d.clinicLocation}
            </Text>
            {(d.doctorName ? d.doctorCreds : d.clinicBlurb) ? (
              <Text style={{ fontSize: 9.4, color: SOFT, fontWeight: 500, marginTop: 4, lineHeight: 1.35 }}>
                {d.doctorName ? d.doctorCreds : d.clinicBlurb}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={[s.secH, { color: c.navy }]}>Proposed {d.kind === 'SURGICAL' ? 'procedures' : 'treatment'}</Text>
          <View style={{ flex: 1, height: 1.5, backgroundColor: c.pale2, marginLeft: 8 }} />
        </View>
        {many ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
            {d.tiles.slice(0, 10).map((t, i) => (
              <View key={i} style={{ width: '50%', flexDirection: 'row', alignItems: 'center', marginBottom: 6, paddingRight: 8 }}>
                <Icon name={t.icon} size={17} color={c.navy} />
                <Text style={{ fontSize: 10.5, fontWeight: 700, color: c.navy, marginLeft: 7, flex: 1 }}>{t.title}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', marginBottom: 14 }}>
            {d.tiles.map((t, i) => (
              <View key={i} style={{ flex: 1, backgroundColor: c.pale, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 8, alignItems: 'center', marginLeft: i ? 10 : 0 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={t.icon} size={26} color={c.navy} />
                </View>
                <Text style={{ fontSize: 10.5, fontWeight: 700, color: c.navy, textAlign: 'center', marginTop: 7, lineHeight: 1.2 }}>{t.title}</Text>
                {t.sub ? <Text style={{ fontSize: 8.8, color: SOFT, fontWeight: 500, textAlign: 'center', marginTop: 3 }}>{t.sub}</Text> : null}
              </View>
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, backgroundColor: c.navy, borderRadius: 14, padding: 17, justifyContent: 'center', marginRight: 15 }}>
            <Text style={{ color: '#fff', fontSize: 9.6, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', opacity: 0.9 }}>{d.priceLabel}</Text>
            <Text style={{ color: '#fff', fontSize: priceSize(d.priceText), fontWeight: 800, marginTop: 5 }}>{d.priceText}</Text>
            <Text style={{ color: '#fff', fontSize: 8.8, fontWeight: 500, opacity: 0.85, marginTop: 5 }}>{d.planLabel}</Text>
          </View>
          <View style={{ flex: 1.05 }}>
            <Link src={d.agent.whatsapp} style={{ textDecoration: 'none' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.red, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 13 }}>
                <Icon name="video" size={24} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: 800, fontSize: 10.6, letterSpacing: 0.2, textTransform: 'uppercase', marginLeft: 10, flex: 1, lineHeight: 1.2 }}>Schedule your personal video consultation</Text>
              </View>
            </Link>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 11 }}>
              <Avatar initials={d.agent.initials} photo={d.agent.photo} size={56} />
              <View style={{ marginLeft: 11, flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: 800, color: c.navy }}>{d.agent.name}</Text>
                <Text style={{ fontSize: 8.8, color: SOFT, fontWeight: 500 }}>Your patient coordinator</Text>
                <Link src={d.agent.whatsapp} style={{ textDecoration: 'none' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                    <Icon name="wa" size={13} color="#1fa855" />
                    <Text style={{ fontSize: 9.8, fontWeight: 600, color: INK, marginLeft: 4 }}>{d.agent.phone}</Text>
                  </View>
                </Link>
                <Text style={{ fontSize: 8.8, color: SOFT, fontWeight: 500 }}>{d.agent.email}</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
      <Footer c={c} />
    </Page>
  )
}

// ── Page 2+: details that flow ─────────────────────────────────────────────────
function Details({ d }: { d: V3Data }) {
  const c = V3_BRAND[d.brand]
  const first = d.agent.name.split(' ')[0]
  const z = (n: number) => Math.round(n * (d.k ?? 1) * 10) / 10
  const card = { paddingVertical: z(13), paddingHorizontal: z(16), marginBottom: z(13) }
  const h4 = { fontSize: z(11.5), marginBottom: z(9) }
  const item = { marginBottom: z(7) }
  const itemTx = { fontSize: z(10) }
  return (
    <Page size="A4" style={[s.page, { paddingBottom: 64 }]}>
      <View fixed style={[s.top, { alignItems: 'center', paddingBottom: 14 }]}>
        <Logo src={d.logo} />
        <PageNo color={c.navy} background={c.pale} />
      </View>

      <View style={{ paddingHorizontal: PAD }}>
        <View style={{ flexDirection: 'row', marginBottom: z(15) }}>
          <View style={{ flex: 1, backgroundColor: c.navy, borderRadius: 14, paddingVertical: z(18), paddingHorizontal: 20, justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: 800, lineHeight: 1.05 }}>YOUR {d.kind} PACKAGE</Text>
            <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: 600, marginTop: 6 }}>Details & next steps</Text>
            <View style={{ width: 48, height: 4, backgroundColor: c.red, borderRadius: 4, marginTop: 10 }} />
          </View>
          {d.photo2 ? <Image src={d.photo2} style={{ width: z(173), height: z(130), marginLeft: 15 }} /> : null}
        </View>

        {d.includes.length ? (
          <View style={[s.card, card, { backgroundColor: c.pale }]}>
            <Text style={[s.h4, h4, { color: c.navy }]}>What’s included</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {d.includes.map((it, i) => (
                <View key={i} wrap={false} style={[s.item, item, { width: '50%', paddingRight: 10 }]}>
                  <View style={s.itemIc}><Icon name={iconFor(it.text)} size={14} color={c.navy} /></View>
                  {/* Price after a hard line break: a soft wrap between two styled runs makes react-pdf add a hyphen */}
                  <Text style={[s.itemTx, itemTx]}>
                    {it.text}
                    {it.price ? <Text style={{ fontSize: z(9.4), color: SOFT, fontWeight: 600 }}>{`\n${it.price}`}</Text> : null}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {d.excludes.length ? (
          <View style={[s.card, card, { backgroundColor: '#fff', borderWidth: 1.5, borderColor: c.pale2 }]}>
            <Text style={[s.h4, h4, { color: INK }]}>Not included</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {d.excludes.map((t, i) => (
                <View key={i} wrap={false} style={[s.item, item, { width: '33.33%', paddingRight: 8 }]}>
                  <View style={[s.itemIc, { backgroundColor: '#fdeced' }]}><Icon name="x" size={13} color={c.red} /></View>
                  <Text style={[s.itemTx, itemTx]}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {d.notes.length ? (
          <View style={[s.card, card, { backgroundColor: '#fff', borderLeftWidth: 5, borderLeftColor: c.sky, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }]}>
            <Text style={[s.h4, h4, { color: c.navy }]}>Important treatment & pricing notes</Text>
            {d.notes.map((t, i) => (
              <View key={i} wrap={false} style={{ flexDirection: 'row', marginBottom: z(4) }}>
                <Text style={{ fontSize: 10, color: c.sky, fontWeight: 800, width: 10 }}>•</Text>
                <Text style={{ fontSize: z(9.8), fontWeight: 500, lineHeight: 1.35, flex: 1 }}>{t}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Next steps and the contact bar always stay together */}
        <View wrap={false} style={{ marginTop: z(4) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: z(9) }}>
            <Text style={[s.secH, { color: c.navy }]}>Your next steps</Text>
            <View style={{ flex: 1, height: 1.5, backgroundColor: c.pale2, marginLeft: 8 }} />
          </View>
          <View style={{ flexDirection: 'row', marginBottom: z(14) }}>
            {[
              ['Video consultation', `Book a call with ${first} on WhatsApp.`],
              ['Review your plan', `Go through suitability, timing and the proposed ${d.kind === 'SURGICAL' ? 'surgical' : 'treatment'} plan.`],
              ['Confirm arrangements', 'Your coordinator confirms the date and travel arrangements.'],
            ].map(([b, t], i) => (
              <View key={i} style={{ flex: 1, marginLeft: i ? 12 : 0 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.navy, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>{i + 1}</Text>
                </View>
                <Text style={{ fontSize: z(10.8), fontWeight: 700, color: c.navy, marginTop: z(5) }}>{b}</Text>
                <Text style={{ fontSize: z(9), color: SOFT, fontWeight: 500, marginTop: 2, lineHeight: 1.35 }}>{t}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.navy, borderRadius: 14, paddingVertical: z(13), paddingHorizontal: 16 }}>
            <Avatar initials={d.agent.initials} photo={d.agent.photo} size={46} border={2.5} />
            <View style={{ flex: 1, marginLeft: 11 }}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', opacity: 0.9 }}>Questions? Your coordinator</Text>
              <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: 800, marginTop: 1 }}>{d.agent.name}</Text>
              <Text style={{ color: '#fff', fontSize: 9.8, fontWeight: 600, opacity: 0.95 }}>WhatsApp {d.agent.phone}</Text>
            </View>
            <View style={{ width: 168 }}>
              <Link src={d.agent.whatsapp} style={{ textDecoration: 'none' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1fa855', borderRadius: 9, paddingVertical: 8 }}>
                  <Icon name="wa" size={15} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 9.4, fontWeight: 800, letterSpacing: 0.3, marginLeft: 6 }}>WHATSAPP</Text>
                </View>
              </Link>
              {d.clinicUrl ? (
                <Link src={d.clinicUrl} style={{ textDecoration: 'none', marginTop: 7 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 9, paddingVertical: 8 }}>
                    <Icon name="link" size={14} color={c.navy} />
                    <Text style={{ color: c.navy, fontSize: 9.4, fontWeight: 800, letterSpacing: 0.3, marginLeft: 6 }}>
                      {d.doctorName ? 'VIEW SURGEON & CLINIC' : 'VIEW CLINIC'}
                    </Text>
                  </View>
                </Link>
              ) : null}
            </View>
          </View>
        </View>
      </View>
      <Footer c={c} />
    </Page>
  )
}

export function QuoteDocV3({ d }: { d: V3Data }) {
  return (
    <Document title={`${V3_BRAND[d.brand].name} quote ${d.quoteId}`} subject={d.quoteId} author={V3_BRAND[d.brand].name}>
      <Cover d={d} />
      <Details d={d} />
    </Document>
  )
}
