import { useEffect, useState } from 'react'
import type { ClinicRow, SelectedClinic, SelectedDoctor } from '../types'
import { NO_DOCTOR } from '../types'
import { useBrand } from '../contexts/BrandContext'
import { IS_ADMIN } from '../lib/appMode'

interface Props {
  rows: ClinicRow[]
  loading: boolean
  onSelectionChange: (clinic: SelectedClinic | null, doctor: SelectedDoctor | null) => void
  onAddClinic: () => void
  /** Clinic to pre-select (e.g. right after it was added): "name" or "name|location". */
  preselectClinic?: string | null
  clinicError?: string | null
  doctorError?: string | null
}

const key = (name: string) => name.trim().toLowerCase()
/** A clinic is its name + location: two branches of a chain with the same name stay separate */
const clinicKey = (c: { clinic_name: string; location: string }) => `${key(c.clinic_name)}|${key(c.location ?? '')}`
const MANUAL = '__manual__'

export default function ClinicDoctorSelector({
  rows, loading, onSelectionChange, onAddClinic, preselectClinic, clinicError, doctorError,
}: Props) {
  const { config } = useBrand()
  const [selectedClinicKey, setSelectedClinicKey] = useState<string>('')
  const [selectedDoctorIdx, setSelectedDoctorIdx] = useState<string>('')
  const [manualName, setManualName] = useState('')
  const [manualCreds, setManualCreds] = useState('')

  // One entry per clinic (case-insensitive name + location)
  const clinics: SelectedClinic[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const k = clinicKey(row)
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
    .filter((r) => clinicKey(r) === selectedClinicKey)
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

  function selectClinic(k: string) {
    setSelectedClinicKey(k)
    setSelectedDoctorIdx('')
    setManualName('')
    setManualCreds('')
    const clinic = clinics.find((c) => clinicKey(c) === k) ?? null
    // Auto-pick when the clinic has a single row
    const docs = rows.filter((r) => clinicKey(r) === k)
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

  // A doctor the agent types in: no headshot; uses the clinic's own (No Doctor row) template
  function manualDoctor(name: string, creds: string): SelectedDoctor {
    const base = doctors.find((r) => r.surgeon_name.toLowerCase() === NO_DOCTOR.toLowerCase()) ?? doctors[0]
    return { surgeon_name: name, accreditations: creds, template_pdf_url: base?.template_pdf_url ?? '', doctor_image_url: '', manual: true }
  }

  function handleDoctorChange(idx: string) {
    setSelectedDoctorIdx(idx)
    const clinic = clinics.find((c) => clinicKey(c) === selectedClinicKey) ?? null
    if (idx === MANUAL) {
      onSelectionChange(clinic, manualDoctor(manualName, manualCreds))
      return
    }
    const row = idx !== '' ? doctors[parseInt(idx)] : undefined
    onSelectionChange(clinic, row ? toDoctor(row) : null)
  }

  function handleManualChange(name: string, creds: string) {
    setManualName(name)
    setManualCreds(creds)
    const clinic = clinics.find((c) => clinicKey(c) === selectedClinicKey) ?? null
    onSelectionChange(clinic, manualDoctor(name, creds))
  }

  // Pre-select a clinic once its rows have arrived (used right after "Add clinic")
  useEffect(() => {
    if (!preselectClinic) return
    const [name, location] = preselectClinic.split('|')
    const match = clinics.find((c) => key(c.clinic_name) === key(name) && (location === undefined || key(c.location) === key(location)))
    if (match && selectedClinicKey !== clinicKey(match)) selectClinic(clinicKey(match))
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
            <option key={clinicKey(c)} value={clinicKey(c)}>
              {c.clinic_name}{c.location ? ` — ${c.location}` : ''}
            </option>
          ))}
          {IS_ADMIN && <option value="__add__">＋ Add a new clinic…</option>}
        </select>
        {clinicError && <p className="text-xs mt-1" style={{ color: '#e51b24' }}>{clinicError}</p>}
        {IS_ADMIN ? (
          <button
            type="button"
            onClick={onAddClinic}
            className="text-xs mt-2 font-semibold"
            style={{ color: config.primary, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            Clinic not in the list? Add it from its {config.name} page →
          </button>
        ) : (
          <p className="text-xs mt-2" style={{ color: '#999' }}>Clinic not in the list? Ask Yana to add it.</p>
        )}
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
          {selectedClinicKey && <option value={MANUAL}>✎ Doctor not listed — type name</option>}
        </select>
        {selectedDoctorIdx === MANUAL && (
          <div className="mt-2 grid gap-2">
            <input
              type="text"
              value={manualName}
              onChange={(e) => handleManualChange(e.target.value, manualCreds)}
              placeholder="Doctor's full name, e.g. Dr. Jane Smith"
              style={{ ...baseSelect, border: `1.5px solid ${doctorError ? '#e51b24' : '#e0e0e0'}` }}
            />
            <input
              type="text"
              value={manualCreds}
              onChange={(e) => handleManualChange(manualName, e.target.value)}
              placeholder="Credentials (optional), e.g. DDS, Implantologist"
              style={{ ...baseSelect, border: '1.5px solid #e0e0e0' }}
            />
            <p className="text-xs" style={{ color: '#999' }}>Shown on the quote without a photo. Ask Yana to add the doctor so they appear in the list next time.</p>
          </div>
        )}
        {doctorError && <p className="text-xs mt-1" style={{ color: '#e51b24' }}>{doctorError}</p>}
      </div>
    </div>
  )
}
