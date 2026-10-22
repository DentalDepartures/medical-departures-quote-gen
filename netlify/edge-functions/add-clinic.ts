// Edge Function — onboards a clinic from the app with no manual steps:
//   1. creates "<Clinic> <Brand> Quotes" under the brand's quotes folder on Drive
//   2. copies the chosen images (clinic, before/after, doctor headshots) into that folder
//   3. appends one "No Doctor" row + one row per doctor to the Clinic App tab, status = Active
// Env: GOOGLE_SERVICE_ACCOUNT_JSON, CLINIC_APP_SPREADSHEET_ID, CLINIC_APP_TAB (optional),
//      DD_QUOTES_FOLDER_ID, MD_QUOTES_FOLDER_ID
// POST /api/add-clinic  (JSON: NewClinicPayload; image urls may be https URLs or data: URIs for uploads)
// With mode "add-doctors": adds doctor rows (and headshots in its existing Drive folder) to a clinic already in the tab.

import {
  CORS, SCOPES, driveCreateFolder, driveUpload, env, fetchWithTimeout, getAccessToken, json,
  objectToRow, ensureHeaders, sheetsAppend, sheetsGet, rowsToObjects, requireAdmin,
} from '../edge-lib/google.ts'

type Brand = 'DD' | 'MD'

interface DoctorIn { name: string; credentials: string; imageUrl: string | null }
interface Payload {
  brand: Brand
  clinicName: string
  location: string
  profileUrl: string
  clinicImageUrl: string | null
  beforeAfterImageUrl: string | null
  doctors: DoctorIn[]
  agentName?: string
  agentEmail?: string
  mode?: 'new' | 'add-doctors'
}

const ALLOWED_IMAGE_HOSTS = [
  'static.dentaldepartures.com', 'img.dentaldepartures.com',
  'static.medicaldepartures.com', 'img.medicaldepartures.com',
]

/** Profile URLs compared without scheme, www, query, hash or trailing slash */
function sameUrl(a: string | undefined, b: string | undefined): boolean {
  const n = (u: string | undefined) => (u ?? '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '')
  return !!n(a) && n(a) === n(b)
}

/** Rows of the clinic with this profile page; rows saved without a URL fall back to the same name + location */
function rowsOfClinic(rows: Record<string, string>[], brand: Brand, profileUrl: string, name: string, location: string) {
  const same = (x: string | undefined, y: string) => (x ?? '').trim().toLowerCase() === y.trim().toLowerCase()
  return rows.filter((o) =>
    (o.brand ?? '').toUpperCase() === brand && (o.status ?? '').toLowerCase() === 'active' &&
    (o.clinic_profile_url ? sameUrl(o.clinic_profile_url, profileUrl) : same(o.clinic_name, name) && same(o.location, location)))
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return 'jpg'
}

/** Loads an image from an allowed https URL or a data: URI. Returns bytes + mime. */
async function loadImage(src: string): Promise<{ bytes: Uint8Array; mime: string }> {
  if (src.startsWith('data:')) {
    const m = src.match(/^data:([^;]+);base64,(.*)$/s)
    if (!m) throw new Error('Bad data URI')
    return { bytes: Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)), mime: m[1] }
  }
  const url = new URL(src)
  if (!ALLOWED_IMAGE_HOSTS.includes(url.hostname)) throw new Error(`Image host not allowed: ${url.hostname}`)
  url.searchParams.delete('width')
  const res = await fetchWithTimeout(url.toString(), {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; QuoteGenerator/2.0)' },
  }, 20000)
  if (!res.ok) throw new Error(`Image fetch ${res.status} for ${src}`)
  const mime = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg'
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime }
}

/** True for a usable image source: a data: URI or an https URL with a real path (not the site's bare-host placeholder). */
function isUsableImageSrc(src: string | null | undefined): src is string {
  if (!src) return false
  if (src.startsWith('data:')) return true
  try {
    const u = new URL(src)
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.pathname !== '/' && u.pathname !== ''
  } catch {
    return false
  }
}

/**
 * Copies an image into the clinic folder; returns the Drive view link, or '' when there is no usable image.
 * A failed copy never blocks onboarding the clinic — the slot stays empty and the reason is reported in `warnings`.
 */
async function copyImage(
  token: string, folderId: string, src: string | null, filename: string, label: string, warnings: string[],
): Promise<string> {
  if (!isUsableImageSrc(src)) return ''
  try {
    const { bytes, mime } = await loadImage(src)
    const up = await driveUpload({ token, folderId, filename: `${filename}.${extFromMime(mime)}`, bytes, mimeType: mime })
    return up.webViewLink
  } catch (err) {
    warnings.push(`${label}: could not copy the photo (${String(err).replace(/^Error:\s*/, '')}) — saved without it; you can upload one later.`)
    return ''
  }
}

/** Adds doctors to a clinic that is already in the tab: one row per new doctor, copying the clinic's own fields. */
async function addDoctors(token: string, spreadsheetId: string, tab: string, p: Payload): Promise<Response> {
  const existing = rowsToObjects(await sheetsGet(token, spreadsheetId, `${tab}!A:Z`))
  const clinicRows = rowsOfClinic(existing, p.brand, p.profileUrl, p.clinicName, p.location)
  if (!clinicRows.length) return json({ error: `"${p.clinicName}" is not in the ${p.brand} clinic list yet — add the clinic instead.` }, 404)

  // The clinic's own fields come from its "No Doctor" row (or its first row)
  const base = clinicRows.find((o) => (o.surgeon_name ?? '').trim().toLowerCase() === 'no doctor') ?? clinicRows[0]
  const have = new Set(clinicRows.map((o) => (o.surgeon_name ?? '').trim().toLowerCase()))
  const doctors = (p.doctors ?? []).filter((d) => d.name?.trim() && !have.has(d.name.trim().toLowerCase()))
  const skipped = (p.doctors ?? []).length - doctors.length
  if (!doctors.length) return json({ ok: true, rowsAdded: 0, skipped, warnings: [] })

  const warnings: string[] = []
  const folderId = (base.google_folder ?? '').match(/folders\/([A-Za-z0-9_-]+)/)?.[1] ?? ''
  if (!folderId) warnings.push('The clinic has no Drive folder link in the sheet, so headshots were not copied.')
  const clinicName = (base.clinic_name ?? p.clinicName).trim()
  const doctorImages: string[] = []
  for (const d of doctors) {
    doctorImages.push(folderId
      ? await copyImage(token, folderId, d.imageUrl, `${safeName(clinicName)} - ${safeName(d.name)}`, `Headshot for ${d.name}`, warnings)
      : '')
  }

  const headers = await ensureHeaders(token, spreadsheetId, tab, [
    'brand', 'clinic_name', 'location', 'google_folder', 'clinic_profile_url', 'surgeon_name', 'accreditations', 'status',
    'clinic_image_url', 'before_after_image_url', 'doctor_image_url', 'added_by', 'added_at',
  ])
  const now = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' })
  const rows = doctors.map((d, i) => objectToRow(headers, {
    brand: p.brand,
    clinic_name: clinicName,
    location: base.location ?? '',
    google_folder: base.google_folder ?? '',
    clinic_profile_url: base.clinic_profile_url ?? '',
    status: 'Active',
    notes: '',
    template_pdf_url: base.template_pdf_url ?? '',
    clinic_image_url: base.clinic_image_url ?? '',
    before_after_image_url: base.before_after_image_url ?? '',
    added_by: [p.agentName, p.agentEmail].filter(Boolean).join(' '),
    added_at: now,
    surgeon_name: d.name.trim(),
    accreditations: (d.credentials ?? '').trim(),
    doctor_image_url: doctorImages[i] ?? '',
  }))
  await sheetsAppend(token, spreadsheetId, `${tab}!A:Z`, rows)
  return json({ ok: true, rowsAdded: rows.length, skipped, warnings, clinic: { brand: p.brand, clinic_name: clinicName } })
}

export default async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const denied = requireAdmin(request)
  if (denied) return denied

  let p: Payload
  try {
    p = await request.json() as Payload
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!p || (p.brand !== 'DD' && p.brand !== 'MD')) return json({ error: 'brand must be DD or MD' }, 400)
  if (!p.clinicName?.trim()) return json({ error: 'clinicName is required' }, 400)
  if (!p.location?.trim()) return json({ error: 'location is required' }, 400)
  if (!p.profileUrl?.trim()) return json({ error: 'profileUrl is required' }, 400)

  try {
    const spreadsheetId = env('CLINIC_APP_SPREADSHEET_ID')
    const tab = env('CLINIC_APP_TAB', 'Clinic App')
    const parentFolderId = env(p.brand === 'MD' ? 'MD_QUOTES_FOLDER_ID' : 'DD_QUOTES_FOLDER_ID')
    const token = await getAccessToken(`${SCOPES.drive} ${SCOPES.sheets}`)

    if (p.mode === 'add-doctors') return await addDoctors(token, spreadsheetId, tab, p)

    // Refuse a duplicate: the same profile page is already an active clinic. Clinics that only share a
    // name (e.g. two branches of a chain in different cities) are different clinics.
    const existing = rowsToObjects(await sheetsGet(token, spreadsheetId, `${tab}!A:Z`))
    const dup = rowsOfClinic(existing, p.brand, p.profileUrl, p.clinicName, p.location)[0]
    if (dup) {
      return json({ error: `"${dup.clinic_name}" (${dup.location}) is already in the ${p.brand} clinic list with this profile page. Pick it from the clinic list instead.` }, 409)
    }

    // 1. Drive folder — named after the city too when another clinic already has this name,
    //    so the two never share (or reuse) one folder
    const clinicName = safeName(p.clinicName)
    const nameTaken = existing.some((o) =>
      (o.brand ?? '').toUpperCase() === p.brand && (o.clinic_name ?? '').trim().toLowerCase() === clinicName.toLowerCase())
    const city = safeName(p.location.split(',')[0] ?? '')
    const folderName = nameTaken && city ? `${clinicName} - ${city} ${p.brand} Quotes` : `${clinicName} ${p.brand} Quotes`
    const folder = await driveCreateFolder(token, folderName, parentFolderId)

    // 2. Images → Drive (stable source; the website may change)
    const warnings: string[] = []
    const clinicImage = await copyImage(token, folder.id, p.clinicImageUrl, `${clinicName} - clinic`, 'Clinic photo', warnings)
    const beforeAfter = await copyImage(token, folder.id, p.beforeAfterImageUrl, `${clinicName} - before after`, 'Before/after photo', warnings)
    const doctorImages: string[] = []
    for (const d of p.doctors ?? []) {
      doctorImages.push(await copyImage(token, folder.id, d.imageUrl, `${clinicName} - ${safeName(d.name)}`, `Headshot for ${d.name}`, warnings))
    }

    // 3. Sheet rows, placed by header name
    // Any column the app writes that the tab doesn't have yet is created on the fly
    const headers = await ensureHeaders(token, spreadsheetId, tab, [
      'brand', 'clinic_name', 'location', 'google_folder', 'clinic_profile_url', 'surgeon_name', 'accreditations', 'status',
      'clinic_image_url', 'before_after_image_url', 'doctor_image_url', 'added_by', 'added_at',
    ])

    const now = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' })
    const base: Record<string, string> = {
      brand: p.brand,
      clinic_name: clinicName,
      location: p.location.trim(),
      google_folder: folder.webViewLink,
      clinic_profile_url: p.profileUrl.trim(),
      status: 'Active',
      notes: '',
      template_pdf_url: '',
      clinic_image_url: clinicImage,
      before_after_image_url: beforeAfter,
      added_by: [p.agentName, p.agentEmail].filter(Boolean).join(' '),
      added_at: now,
    }
    const rows: string[][] = [
      objectToRow(headers, { ...base, surgeon_name: 'No Doctor', accreditations: '', doctor_image_url: '' }),
      ...(p.doctors ?? []).map((d, i) => objectToRow(headers, {
        ...base,
        surgeon_name: d.name.trim(),
        accreditations: (d.credentials ?? '').trim(),
        doctor_image_url: doctorImages[i] ?? '',
      })),
    ]
    await sheetsAppend(token, spreadsheetId, `${tab}!A:Z`, rows)

    return json({
      ok: true,
      folder: folder.webViewLink,
      rowsAdded: rows.length,
      warnings,
      clinic: { brand: p.brand, clinic_name: clinicName, location: base.location },
    })
  } catch (err) {
    const msg = String(err)
    if (/protected cell or object/i.test(msg)) {
      return json({
        error: 'The "Clinic App" tab is protected, so the app cannot add rows to it. Ask the sheet owner to add ' +
          'quote-generator@quote-generator-495310.iam.gserviceaccount.com as an editor of that protection ' +
          '(Data → Protect sheets and ranges), then try again.',
      }, 500)
    }
    return json({ error: msg }, 500)
  }
}
