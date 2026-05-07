import type { ClinicRow } from '../types'

export async function fetchClinicRows(): Promise<ClinicRow[]> {
  const res = await fetch('/api/clinics')
  const data = (await res.json()) as { rows?: ClinicRow[]; error?: string }
  if (!res.ok || data.error) throw new Error(data.error ?? `Failed to fetch clinics: ${res.status}`)
  return data.rows ?? []
}
