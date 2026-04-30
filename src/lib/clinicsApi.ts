import type { ClinicRow } from '../types'

export async function fetchClinicRows(): Promise<ClinicRow[]> {
  const res = await fetch('/api/clinics')
  if (!res.ok) throw new Error(`Failed to fetch clinics: ${res.status}`)
  const data = (await res.json()) as { rows?: ClinicRow[]; error?: string }
  if (data.error) throw new Error(data.error)
  return data.rows ?? []
}
