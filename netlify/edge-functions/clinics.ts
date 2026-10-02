// Edge Function — reads the Clinic App tab and returns active rows.
// Columns are matched BY HEADER NAME (row 1), so column order in the sheet does not matter.
// Env: GOOGLE_SERVICE_ACCOUNT_JSON, CLINIC_APP_SPREADSHEET_ID, CLINIC_APP_TAB (optional, default "Clinic App")

import { CORS, SCOPES, env, getAccessToken, json, rowsToObjects, sheetsGet } from '../edge-lib/google.ts'

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  try {
    const spreadsheetId = env('CLINIC_APP_SPREADSHEET_ID')
    const tab = env('CLINIC_APP_TAB', 'Clinic App')
    const token = await getAccessToken(SCOPES.sheetsRead)
    const values = await sheetsGet(token, spreadsheetId, `${tab}!A:Z`)
    const objects = rowsToObjects(values)

    const rows = objects
      .filter((o) => (o.status ?? '').toLowerCase() === 'active')
      .map((o) => ({
        brand: (o.brand ?? '').toUpperCase() as 'DD' | 'MD',
        clinic_name: o.clinic_name ?? '',
        location: o.location ?? '',
        google_folder: o.google_folder ?? '',
        clinic_profile_url: o.clinic_profile_url ?? '',
        surgeon_name: o.surgeon_name ?? '',
        accreditations: o.accreditations ?? '',
        status: 'active' as const,
        notes: o.notes ?? '',
        template_pdf_url: o.template_pdf_url ?? '',
        clinic_image_url: o.clinic_image_url ?? '',
        before_after_image_url: o.before_after_image_url ?? '',
        doctor_image_url: o.doctor_image_url ?? '',
      }))
      .filter((r) => r.clinic_name && (r.brand === 'DD' || r.brand === 'MD'))

    return json({ rows })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
}
