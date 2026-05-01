import { useState, useEffect, useRef } from 'react'
import type { AgentProfile, ClinicRow, SelectedClinic, SelectedDoctor } from '../types'
import { getProfile, saveProfile } from '../lib/storage'
import { useBrand } from '../contexts/BrandContext'
import TabBar from './TabBar'
import ClinicDoctorSelector from './ClinicDoctorSelector'

interface Props {
  rows: ClinicRow[]
  clinicsLoading: boolean
  clinicsError?: string | null
  totalClinicRowsLoaded?: number
  onGenerate: (
    rawText: string,
    profile: AgentProfile,
    clinic: SelectedClinic | null,
    doctor: SelectedDoctor | null,
  ) => void
  isLoading: boolean
  error: string | null
}

interface FieldErrors {
  name?: string
  email?: string
  phone?: string
  clinic?: string
  doctor?: string
  text?: string
}

export default function PasteInput({ rows, clinicsLoading, clinicsError, totalClinicRowsLoaded, onGenerate, isLoading, error }: Props) {
  const { config } = useBrand()
  const saved = getProfile()
  const [name, setName] = useState(saved?.name ?? '')
  const [email, setEmail] = useState(saved?.email ?? '')
  const [phone, setPhone] = useState(saved?.phone ?? '')
  const [agentSaved, setAgentSaved] = useState(!!saved)
  const [text, setText] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [selectedClinic, setSelectedClinic] = useState<SelectedClinic | null>(null)
  const [selectedDoctor, setSelectedDoctor] = useState<SelectedDoctor | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-save agent details with debounce
  useEffect(() => {
    if (!name && !email && !phone) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      saveProfile({ name, email, phone })
      setAgentSaved(true)
    }, 800)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [name, email, phone])

  function validate(): boolean {
    const errs: FieldErrors = {}
    if (!name.trim()) errs.name = 'Full name is required'
    if (!email.trim()) errs.email = 'Email is required'
    if (!phone.trim()) errs.phone = 'Phone number is required'
    if (!selectedClinic) errs.clinic = 'Please select a clinic'
    if (selectedClinic && !selectedDoctor) errs.doctor = 'Please select a doctor'
    if (!text.trim()) errs.text = 'Please paste the raw quote data'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isLoading) return
    if (!validate()) return
    const profile: AgentProfile = { name, email, phone }
    saveProfile(profile)
    onGenerate(text.trim(), profile, selectedClinic, selectedDoctor)
  }

  function handleSelectionChange(clinic: SelectedClinic | null, doctor: SelectedDoctor | null) {
    setSelectedClinic(clinic)
    setSelectedDoctor(doctor)
    // clear related errors on selection
    setFieldErrors((prev) => ({ ...prev, clinic: undefined, doctor: undefined }))
  }

  const inputStyle = (hasError?: string): React.CSSProperties => ({
    border: `1.5px solid ${hasError ? '#e51b24' : '#e0e0e0'}`,
    fontFamily: 'inherit',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
    width: '100%',
  })

  return (
    <div className="min-h-screen" style={{ background: config.pageBackground, padding: 32 }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Logo + title */}
        <div className="text-center mb-8">
          <img
            src={config.logo}
            alt={config.name}
            style={{ height: 60, objectFit: 'contain', marginBottom: 16 }}
          />
          <h1 className="text-2xl font-extrabold" style={{ color: config.primary, margin: 0 }}>
            Quote Generator
          </h1>
          <p className="text-sm mt-2" style={{ color: '#888' }}>
            Paste raw clinic quote data below — AI will extract and format it into a branded PDF
          </p>
        </div>

        {/* Contact details card */}
        <div
          className="bg-white rounded-xl p-7 mb-5"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center gap-3 mb-3">
            <span
              className="text-xs font-bold tracking-widest uppercase"
              style={{ color: config.primary }}
            >
              Your Details (Ops Agent)
            </span>
            {agentSaved && (
              <span
                className="text-xs font-medium rounded-full px-2 py-0.5"
                style={{ background: '#e8f5e9', color: '#4caf50' }}
              >
                ✓ Saved
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: '#58585a' }}>
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setAgentSaved(false)
                  if (e.target.value.trim()) setFieldErrors((p) => ({ ...p, name: undefined }))
                }}
                placeholder="Your name"
                style={inputStyle(fieldErrors.name)}
              />
              {fieldErrors.name && (
                <p className="text-xs mt-1" style={{ color: '#e51b24' }}>
                  {fieldErrors.name}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: '#58585a' }}>
                Email
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setAgentSaved(false)
                  if (e.target.value.trim()) setFieldErrors((p) => ({ ...p, email: undefined }))
                }}
                placeholder="your@email.com"
                style={inputStyle(fieldErrors.email)}
              />
              {fieldErrors.email && (
                <p className="text-xs mt-1" style={{ color: '#e51b24' }}>
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: '#58585a' }}>
                Phone Number
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  setAgentSaved(false)
                  if (e.target.value.trim()) setFieldErrors((p) => ({ ...p, phone: undefined }))
                }}
                placeholder="+1 234 567 8900"
                style={inputStyle(fieldErrors.phone)}
              />
              {fieldErrors.phone && (
                <p className="text-xs mt-1" style={{ color: '#e51b24' }}>
                  {fieldErrors.phone}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Quote raw data card */}
        <div
          className="bg-white rounded-xl p-7"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
        >
          {/* Brand tabs */}
          <TabBar />

          {/* Divider */}
          <div style={{ borderTop: '1px solid #f0f0f0', marginBottom: 20 }} />

          {/* Clinic / Doctor selection */}
          <div
            className="text-xs font-bold tracking-widest uppercase mb-3"
            style={{ color: config.primary }}
          >
            Select Clinic & Doctor
          </div>

          {clinicsError && (
            <div
              className="text-xs rounded-lg px-3 py-2 mb-3"
              style={{ background: '#fff0f0', border: '1px solid #fca5a5', color: '#b91c1c' }}
            >
              ⚠ Could not load clinics: {clinicsError}
            </div>
          )}
          {!clinicsLoading && !clinicsError && rows.length === 0 && (totalClinicRowsLoaded ?? 0) > 0 && (
            <div
              className="text-xs rounded-lg px-3 py-2 mb-3"
              style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}
            >
              ⚠ {totalClinicRowsLoaded} clinic row(s) loaded from sheet, but none match the current brand tab. Check that the Brand column (column A) in the sheet contains exactly "MD" or "DD".
            </div>
          )}
          {!clinicsLoading && !clinicsError && (totalClinicRowsLoaded ?? 0) === 0 && (
            <div
              className="text-xs rounded-lg px-3 py-2 mb-3"
              style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}
            >
              ⚠ No clinic rows returned from the sheet. Check that rows have status "active" in column L.
            </div>
          )}

          <ClinicDoctorSelector
            rows={rows}
            loading={clinicsLoading}
            onSelectionChange={handleSelectionChange}
            clinicError={fieldErrors.clinic}
            doctorError={fieldErrors.doctor}
          />

          {/* Divider */}
          <div style={{ borderTop: '1px solid #f0f0f0', marginBottom: 20, marginTop: 4 }} />

          {/* Raw data */}
          <div
            className="text-xs font-bold tracking-widest uppercase mb-3"
            style={{ color: config.primary }}
          >
            Raw Quote Data
          </div>

          <form onSubmit={handleSubmit}>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                if (e.target.value.trim()) setFieldErrors((p) => ({ ...p, text: undefined }))
              }}
              placeholder="Paste the clinic's quote here — WhatsApp messages, emails, PDFs all work. Include treatment name, price, inclusions, and patient details."
              disabled={isLoading}
              className="w-full rounded-lg px-4 py-3 text-sm outline-none resize-y"
              style={{
                minHeight: 220,
                border: `1.5px solid ${fieldErrors.text ? '#e51b24' : '#e0e0e0'}`,
                fontFamily: 'inherit',
                lineHeight: 1.6,
              }}
            />

            {fieldErrors.text && (
              <p className="text-xs mt-1" style={{ color: '#e51b24' }}>
                {fieldErrors.text}
              </p>
            )}

            {error && (
              <div className="text-sm mt-3" style={{ color: '#e51b24' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-xl font-bold text-white mt-5"
              style={{
                background: isLoading ? '#aaa' : config.primary,
                padding: '14px 24px',
                fontSize: 14,
                letterSpacing: 0.5,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                border: 'none',
                fontFamily: 'inherit',
                color: config.primaryText,
              }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Extracting quote data...
                </span>
              ) : (
                'Extract & Generate Quote →'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
