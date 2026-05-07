import type { ClinicRow } from '../types'

export async function fetchClinicRows(): Promise<ClinicRow[]> {
  const res = await fetch('/api/clinics')
  const raw = await res.text()
  let data: { rows?: ClinicRow[]; error?: string }
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error(`Clinics API returned non-JSON (${res.status}): ${raw.slice(0, 120)}`)
  }
  if (!res.ok || data.error) throw new Error(data.error ?? `Failed to fetch clinics: ${res.status}`)
  return data.rows ?? []
}
