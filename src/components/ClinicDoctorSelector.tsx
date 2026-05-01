import { useState } from 'react'
import type { ClinicRow, SelectedClinic, SelectedDoctor } from '../types'

interface Props {
  rows: ClinicRow[]
  loading: boolean
  onSelectionChange: (clinic: SelectedClinic | null, doctor: SelectedDoctor | null) => void
  clinicError?: string | null
  doctorError?: string | null
}

interface ClinicOption {
  clinic_name: string
  location: string
  google_folder: string
  clinic_profile_url: string
  template_pdf_url: string
}

const key = (name: string) => name.trim().toLowerCase()

export default function ClinicDoctorSelector({
  rows,
  loading,
  onSelectionChange,
  clinicError,
  doctorError,
}: Props) {
  const [selectedClinicKey, setSelectedClinicKey] = useState<string>('')
  const [selectedDoctorIdx, setSelectedDoctorIdx] = useState<string>('')

  // Deduplicate clinics by case-insensitive clinic_name
  const clinics: ClinicOption[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const k = key(row.clinic_name)
    if (!seen.has(k)) {
      seen.add(k)
      clinics.push({
        clinic_name: row.clinic_name,
        location: row.location,
        google_folder: row.google_folder,
        clinic_profile_url: row.clinic_profile_url,
        template_pdf_url: row.template_pdf_url,
      })
    }
  }

  // Doctors for selected clinic (case-insensitive match)
  const doctors = rows.filter((r) => key(r.clinic_name) === selectedClinicKey)

  function handleClinicChange(clinicKey: string) {
    setSelectedClinicKey(clinicKey)
    setSelectedDoctorIdx('')
    const clinic = clinics.find((c) => key(c.clinic_name) === clinicKey) ?? null
    onSelectionChange(clinic, null)
  }

  function handleDoctorChange(idx: string) {
    setSelectedDoctorIdx(idx)
    const clinic = clinics.find((c) => key(c.clinic_name) === selectedClinicKey) ?? null
    const row = idx !== '' ? doctors[parseInt(idx)] : undefined
    const doctor: SelectedDoctor | null = row
      ? {
          surgeon_name: row.surgeon_name,
          accreditations: row.accreditations,
          template_pdf_url: row.template_pdf_url,
        }
      : null
    onSelectionChange(clinic, doctor)
  }

  const baseSelect: React.CSSProperties = {
    width: '100%',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    background: 'white',
    color: '#333',
    cursor: 'pointer',
    appearance: 'auto',
  }

  return (
    <div className="grid grid-cols-2 gap-3 mb-4">
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: '#58585a' }}>
          Choice of Clinic
        </label>
        {loading ? (
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{ border: '1.5px solid #e0e0e0', color: '#aaa', background: '#fafafa' }}
          >
            Loading clinics…
          </div>
        ) : (
          <select
            value={selectedClinicKey}
            onChange={(e) => handleClinicChange(e.target.value)}
            style={{
              ...baseSelect,
              border: `1.5px solid ${clinicError ? '#e51b24' : '#e0e0e0'}`,
            }}
          >
            <option value="">Select clinic…</option>
            {clinics.map((c) => (
              <option key={key(c.clinic_name)} value={key(c.clinic_name)}>
                {c.clinic_name}
              </option>
            ))}
          </select>
        )}
        {clinicError && (
          <p className="text-xs mt-1" style={{ color: '#e51b24' }}>
            {clinicError}
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: '#58585a' }}>
          Choice of Doctor
        </label>
        <select
          value={selectedDoctorIdx}
          onChange={(e) => handleDoctorChange(e.target.value)}
          disabled={!selectedClinicKey || loading}
          style={{
            ...baseSelect,
            border: `1.5px solid ${doctorError ? '#e51b24' : '#e0e0e0'}`,
            background: !selectedClinicKey ? '#f5f5f5' : 'white',
            cursor: !selectedClinicKey ? 'not-allowed' : 'pointer',
            color: !selectedClinicKey ? '#aaa' : '#333',
          }}
        >
          <option value="">Select doctor…</option>
          {doctors.map((d, i) => (
            <option key={i} value={String(i)}>
              {d.surgeon_name}
            </option>
          ))}
        </select>
        {doctorError && (
          <p className="text-xs mt-1" style={{ color: '#e51b24' }}>
            {doctorError}
          </p>
        )}
      </div>
    </div>
  )
}
