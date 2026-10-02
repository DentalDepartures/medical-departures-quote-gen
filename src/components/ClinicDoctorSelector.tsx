import { useEffect, useState } from 'react'
import type { ClinicRow, SelectedClinic, SelectedDoctor } from '../types'
import { NO_DOCTOR } from '../types'
import { useBrand } from '../contexts/BrandContext'

interface Props {
  rows: ClinicRow[]
  loading: boolean
  onSelectionChange: (clinic: SelectedClinic | null, doctor: SelectedDoctor | null) => void
  onAddClinic: () => void
  /** Clinic to pre-select (e.g. right after it was added). */
  preselectClinic?: string | null
  clinicError?: string | null
  doctorError?: string | null
}

const key = (name: string) => name.trim().toLowerCase()

export default function ClinicDoctorSelector({
  rows, loading, onSelectionChange, onAddClinic, preselectClinic, clinicError, doctorError,
}: Props) {
  const { config } = useBrand()
  const [selectedClinicKey, setSelectedClinicKey] = useState<string>('')
  const [selectedDoctorIdx, setSelectedDoctorIdx] = useState<string>('')

  // Deduplicate clinics by case-insensitive clinic_name
  const clinics: SelectedClinic[] = []
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
        clinic_image_url: row.clinic_image_url,
        before_after_image_url: row.before_after_image_url,
      })
    }
  }
  clinics.sort((a, b) => a.clinic_name.localeCompare(b.clinic_name))

  // Doctors for the selected clinic — "No Doctor" first, then alphabetical
  const doctors = rows
    .filter((r) => key(r.clinic_name) === selectedClinicKey)
    .sort((a, b) => {
      const an = a.surgeon_name.toLowerCase() === NO_DOCTOR.toLowerCase() ? 0 : 1
      const bn = b.surgeon_name.toLowerCase() === NO_DOCTOR.toLowerCase() ? 0 : 1
      return an - bn || a.surgeon_name.localeCompare(b.surgeon_name)
    })

  const toDoctor = (row: ClinicRow): SelectedDoctor => ({
    surgeon_name: row.surgeon_name,
    accreditations: row.accreditations,
    template_pdf_url: row.template_pdf_url,
    doctor_image_url: row.doctor_image_url,
  })

  function selectClinic(clinicKey: string) {
    setSelectedClinicKey(clinicKey)
    setSelectedDoctorIdx('')
    const clinic = clinics.find((c) => key(c.clinic_name) === clinicKey) ?? null
    // Auto-pick when the clinic has a single row
    const docs = rows.filter((r) => key(r.clinic_name) === clinicKey)
    if (clinic && docs.length === 1) {
      setSelectedDoctorIdx('0')
      onSelectionChange(clinic, toDoctor(docs[0]))
    } else {
      onSelectionChange(clinic, null)
    }
  }

  function handleClinicChange(value: string) {
    if (value === '__add__') {
      onAddClinic()
      return
    }
    selectClinic(value)
  }

  function handleDoctorChange(idx: string) {
    setSelectedDoctorIdx(idx)
    const clinic = clinics.find((c) => key(c.clinic_name) === selectedClinicKey) ?? null
    const row = idx !== '' ? doctors[parseInt(idx)] : undefined
    onSelectionChange(clinic, row ? toDoctor(row) : null)
  }

  // Pre-select a clinic once its rows have arrived (used right after "Add clinic")
  useEffect(() => {
    if (!preselectClinic) return
    const k = key(preselectClinic)
    if (clinics.some((c) => key(c.clinic_name) === k) && selectedClinicKey !== k) selectClinic(k)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectClinic, rows.length])

  const baseSelect: React.CSSProperties = {
    width: '100%',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    background: '#fff',
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: '#58585a' }}>Clinic</label>
        <select
          value={selectedClinicKey}
          onChange={(e) => handleClinicChange(e.target.value)}
          disabled={loading}
          style={{ ...baseSelect, border: `1.5px solid ${clinicError ? '#e51b24' : '#e0e0e0'}` }}
        >
          <option value="">{loading ? 'Loading clinics…' : '— Select clinic —'}</option>
          {clinics.map((c) => (
            <option key={key(c.clinic_name)} value={key(c.clinic_name)}>
              {c.clinic_name}{c.location ? ` — ${c.location}` : ''}
            </option>
          ))}
          <option value="__add__">＋ Add a new clinic…</option>
        </select>
        {clinicError && <p className="text-xs mt-1" style={{ color: '#e51b24' }}>{clinicError}</p>}
        <button
          type="button"
          onClick={onAddClinic}
          className="text-xs mt-2 font-semibold"
          style={{ color: config.primary, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          Clinic not in the list? Add it from its {config.name} page →
        </button>
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: '#58585a' }}>Doctor</label>
        <select
          value={selectedDoctorIdx}
          onChange={(e) => handleDoctorChange(e.target.value)}
          disabled={!selectedClinicKey || doctors.length === 0}
          style={{ ...baseSelect, border: `1.5px solid ${doctorError ? '#e51b24' : '#e0e0e0'}` }}
        >
          <option value="">{selectedClinicKey ? '— Select doctor —' : 'Select a clinic first'}</option>
          {doctors.map((d, i) => (
            <option key={i} value={String(i)}>
              {d.surgeon_name.toLowerCase() === NO_DOCTOR.toLowerCase() ? 'No doctor (clinic only)' : d.surgeon_name}
            </option>
          ))}
        </select>
        {doctorError && <p className="text-xs mt-1" style={{ color: '#e51b24' }}>{doctorError}</p>}
      </div>
    </div>
  )
}
