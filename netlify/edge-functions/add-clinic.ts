// Edge Function — onboards a clinic from the app with no manual steps:
//   1. creates "<Clinic> <Brand> Quotes" under the brand's quotes folder on Drive
//   2. copies the chosen images (clinic, before/after, doctor headshots) into that folder
//   3. appends one "No Doctor" row + one row per doctor to the Clinic App tab, status = Active
// Env: GOOGLE_SERVICE_ACCOUNT_JSON, CLINIC_APP_SPREADSHEET_ID, CLINIC_APP_TAB (optional),
//      DD_QUOTES_FOLDER_ID, MD_QUOTES_FOLDER_ID
// POST /api/add-clinic  (JSON: NewClinicPayload; image urls may be https URLs or data: URIs for uploads)

import {
  CORS, SCOPES, driveCreateFolder, driveUpload, env, fetchWithTimeout, getAccessToken, json,
  objectToRow, ensureHeaders, sheetsAppend, sheetsGet, rowsToObjects,
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
}

const ALLOWED_IMAGE_HOSTS = [
  'static.dentaldepartures.com', 'img.dentaldepartures.com',
  'static.medicaldepartures.com', 'img.medicaldepartures.com',
]

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

export default async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

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

    // Refuse a duplicate active clinic (same brand + name, case-insensitive)
    const existing = rowsToObjects(await sheetsGet(token, spreadsheetId, `${tab}!A:Z`))
    const dup = existing.find((o) =>
      (o.brand ?? '').toUpperCase() === p.brand &&
      (o.clinic_name ?? '').trim().toLowerCase() === p.clinicName.trim().toLowerCase() &&
      (o.status ?? '').toLowerCase() === 'active')
    if (dup) return json({ error: `"${p.clinicName}" already exists for ${p.brand}. Pick it from the clinic list instead.` }, 409)

    // 1. Drive folder
    const clinicName = safeName(p.clinicName)
    const folder = await driveCreateFolder(token, `${clinicName} ${p.brand} Quotes`, parentFolderId)

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
    return json({ error: String(err) }, 500)
  }
}
