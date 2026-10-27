import { useState, useEffect, useRef } from 'react'
import type { AgentProfile, ClinicRow, SelectedClinic, SelectedDoctor } from '../types'
import { getProfile, saveProfile, getOpsAgent, saveOpsAgent, getOpsNames, addOpsName } from '../lib/storage'
import { fetchAgents } from '../lib/api'
import { readPdfText } from '../lib/pdfText'
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
    splitTreatments: boolean,
  ) => void
  isLoading: boolean
  error: string | null
  onAddClinic: (profile: AgentProfile) => void
  preselectClinic?: string | null
}

interface FieldErrors {
  ops?: string
  name?: string
  email?: string
  phone?: string
  clinic?: string
  doctor?: string
  text?: string
}

export default function PasteInput({ rows, clinicsLoading, clinicsError, totalClinicRowsLoaded, onGenerate, isLoading, error, onAddClinic, preselectClinic }: Props) {
  const { config } = useBrand()
  const saved = getProfile()
  const [name, setName] = useState(saved?.name ?? '')
  const [email, setEmail] = useState(saved?.email ?? '')
  const [phone, setPhone] = useState(saved?.phone ?? '')
  const [agentSaved, setAgentSaved] = useState(!!saved)
  const [text, setText] = useState('')
  const [splitTreatments, setSplitTreatments] = useState(false)
  // Clinic PDF upload: its text is read in the browser and put in the box below for the usual extraction
  const [pdfStatus, setPdfStatus] = useState<{ kind: 'reading' | 'ok' | 'error'; msg: string } | null>(null)
  const pdfInputRef = useRef<HTMLInputElement | null>(null)

  async function handlePdf(file: File | undefined) {
    if (!file) return
    setPdfStatus({ kind: 'reading', msg: `Reading “${file.name}”…` })
    try {
      const { text: pdfText, pages } = await readPdfText(file)
      if (pdfText.replace(/--- Page \d+ ---/g, '').trim().length < 80) {
        setPdfStatus({ kind: 'error', msg: `“${file.name}” has no readable text (it looks like a scan or photo). Copy the patient, treatment and prices into the box by hand.` })
        return
      }
      setText(`Clinic PDF: ${file.name}\n\n${pdfText}`)
      setFieldErrors((p) => ({ ...p, text: undefined }))
      setPdfStatus({ kind: 'ok', msg: `Read “${file.name}” (${pages} page${pages === 1 ? '' : 's'}). Its text is in the box below — check it, add anything missing, then press Extract.` })
    } catch (err) {
      setPdfStatus({ kind: 'error', msg: `Could not read “${file.name}”: ${err instanceof Error ? err.message : String(err)}` })
    } finally {
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [selectedClinic, setSelectedClinic] = useState<SelectedClinic | null>(null)
  const [selectedDoctor, setSelectedDoctor] = useState<SelectedDoctor | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [agents, setAgents] = useState<AgentProfile[]>([])
  // The ops agent is the person making the quote for the sales agent: chosen once, then remembered
  const [opsNames, setOpsNames] = useState<string[]>(getOpsNames())
  const [opsAgent, setOpsAgent] = useState(getOpsAgent())
  const [opsEditing, setOpsEditing] = useState(!getOpsAgent())
  const [opsTyping, setOpsTyping] = useState(false)

  useEffect(() => {
    void fetchAgents().then(setAgents)
  }, [])

  function chooseOps(value: string) {
    setOpsAgent(value)
    saveOpsAgent(value)
    if (value.trim()) setFieldErrors((p) => ({ ...p, ops: undefined }))
  }

  // The dropdown shows whichever listed agent matches the email currently in the form
  const selectedAgent = agents.findIndex((a) => a.email.trim().toLowerCase() === email.trim().toLowerCase())

  function pickAgent(value: string) {
    const agent = agents[Number(value)]
    if (!agent) return
    setName(agent.name)
    setEmail(agent.email)
    setPhone(agent.phone)
    setAgentSaved(false)
    setFieldErrors((p) => ({ ...p, name: undefined, email: undefined, phone: undefined }))
  }

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
    if (!opsAgent.trim()) errs.ops = 'Choose your name (Ops Agent)'
    if (!name.trim()) errs.name = 'Full name is required'
    if (!email.trim()) errs.email = 'Email is required'
    if (!phone.trim()) errs.phone = 'Phone number is required'
    if (!selectedClinic) errs.clinic = 'Please select a clinic'
    if (selectedClinic && !selectedDoctor) errs.doctor = 'Please select a doctor'
    if (selectedDoctor?.manual && !selectedDoctor.surgeon_name.trim()) errs.doctor = "Type the doctor's name"
    if (!text.trim()) errs.text = 'Please paste the raw quote data'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isLoading) return
    if (!validate()) {
      if (!opsAgent.trim()) setOpsEditing(true)
      return
    }
    const profile: AgentProfile = { name, email, phone }
    saveProfile(profile)
    setOpsNames(addOpsName(opsAgent))
    onGenerate(text.trim(), profile, selectedClinic, selectedDoctor, splitTreatments)
  }

  function handleSelectionChange(clinic: SelectedClinic | null, doctor: SelectedDoctor | null) {
    setSelectedClinic(clinic)
    setSelectedDoctor(doctor)
    // clear related errors on selection (a typed doctor clears its error once a name is entered)
    const doctorOk = !doctor?.manual || !!doctor.surgeon_name.trim()
    setFieldErrors((prev) => ({ ...prev, clinic: undefined, doctor: doctorOk ? undefined : prev.doctor }))
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
            {config.name} — Quote Generator
          </h1>
          <p className="text-sm mt-2" style={{ color: '#888' }}>
            Paste raw clinic quote data below — AI will extract and format it into a branded PDF
          </p>
        </div>

        {/* Ops agent — who is making this quote (chosen once on this computer) */}
        <div
          className="bg-white rounded-xl px-7 py-5 mb-5"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
        >
          {!opsEditing && opsAgent ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-xs font-bold tracking-widest uppercase" style={{ color: config.primary }}>
                Ops Agent
              </span>
              <span style={{ fontWeight: 600, color: '#333' }}>{opsAgent}</span>
              <button
                type="button"
                onClick={() => { setOpsEditing(true); setOpsTyping(!opsNames.includes(opsAgent)) }}
                className="text-xs underline"
                style={{ color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Change
              </button>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold tracking-widest uppercase mb-2" style={{ color: config.primary }}>
                Ops Agent — who is making the quotes on this computer?
              </label>
              <div className="flex gap-3 items-start">
                <div style={{ flex: 1 }}>
                  {opsNames.length > 0 && !opsTyping ? (
                    <select
                      value={opsNames.includes(opsAgent) ? opsAgent : ''}
                      onChange={(e) => {
                        if (e.target.value === '__new__') { setOpsTyping(true); chooseOps(''); return }
                        chooseOps(e.target.value)
                      }}
                      style={{ ...inputStyle(fieldErrors.ops), background: 'white', cursor: 'pointer' }}
                    >
                      <option value="" disabled>— Select your name —</option>
                      {opsNames.map((n) => <option key={n} value={n}>{n}</option>)}
                      <option value="__new__">✎ Not listed — add new</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={opsAgent}
                      onChange={(e) => chooseOps(e.target.value)}
                      placeholder="Your full name"
                      autoFocus={opsTyping}
                      style={inputStyle(fieldErrors.ops)}
                    />
                  )}
                  {opsTyping && opsNames.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setOpsTyping(false); chooseOps(getOpsAgent() || '') }}
                      className="text-xs underline mt-1"
                      style={{ color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      ← Back to the list
                    </button>
                  )}
                  {fieldErrors.ops && (
                    <p className="text-xs mt-1" style={{ color: '#e51b24' }}>{fieldErrors.ops}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!opsAgent.trim()}
                  onClick={() => { chooseOps(opsAgent); setOpsNames(addOpsName(opsAgent)); setOpsTyping(false); setOpsEditing(false) }}
                  className="text-sm font-semibold rounded-lg px-4"
                  style={{ height: 37, background: opsAgent.trim() ? config.primary : '#ccc', color: 'white', border: 'none', cursor: opsAgent.trim() ? 'pointer' : 'default' }}
                >
                  Save
                </button>
              </div>
              <p className="text-xs mt-1" style={{ color: '#999' }}>
                Asked once, then remembered on this computer. It goes into the Quotes Tracker, not on the quote.
              </p>
            </div>
          )}
        </div>

        {/* Sales agent card — these details are printed on the quote */}
        <div
          className="bg-white rounded-xl p-7 mb-5"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-center gap-3 mb-3">
            <span
              className="text-xs font-bold tracking-widest uppercase"
              style={{ color: config.primary }}
            >
              Sales Agent (shown on the quote)
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

          {agents.length > 0 && (
            <div className="mb-3">
              <label className="block text-xs font-semibold mb-1" style={{ color: '#58585a' }}>
                Choose the sales agent
              </label>
              <select
                value={selectedAgent >= 0 ? String(selectedAgent) : ''}
                onChange={(e) => pickAgent(e.target.value)}
                style={{ ...inputStyle(), background: 'white', cursor: 'pointer' }}
              >
                <option value="" disabled>
                  {name || email ? 'Not in the list — details typed below' : '— Select the sales agent —'}
                </option>
                {agents.map((a, i) => (
                  <option key={a.email || a.name} value={i}>
                    {a.name}
                  </option>
                ))}
              </select>
              <p className="text-xs mt-1" style={{ color: '#999' }}>
                Fills in the sales agent's name, email and phone. Not listed? Just type the details below.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                placeholder="Sales agent's name"
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
                placeholder="agent@dentaldepartures.com"
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
              ⚠ {totalClinicRowsLoaded} clinic row(s) loaded from sheet, but none match the current brand tab. Check that the brand column in the sheet contains exactly "MD" or "DD".
            </div>
          )}
          {!clinicsLoading && !clinicsError && (totalClinicRowsLoaded ?? 0) === 0 && (
            <div
              className="text-xs rounded-lg px-3 py-2 mb-3"
              style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}
            >
              ⚠ No clinic rows returned from the sheet. Check that rows have status "Active" in the status column.
            </div>
          )}

          <ClinicDoctorSelector
            rows={rows}
            loading={clinicsLoading}
            onSelectionChange={handleSelectionChange}
            onAddClinic={() => { saveProfile({ name, email, phone }); onAddClinic({ name, email, phone }) }}
            preselectClinic={preselectClinic}
            clinicError={fieldErrors.clinic}
            doctorError={fieldErrors.doctor}
          />

          {/* Divider */}
          <div style={{ borderTop: '1px solid #f0f0f0', marginBottom: 20, marginTop: 4 }} />

          {/* Raw data */}
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div
              className="text-xs font-bold tracking-widest uppercase"
              style={{ color: config.primary }}
            >
              Raw Quote Data
            </div>
            <button
              type="button"
              onClick={() => pdfInputRef.current?.click()}
              disabled={isLoading || pdfStatus?.kind === 'reading'}
              className="text-xs font-semibold rounded-lg px-3 py-2"
              style={{ border: `1.5px solid ${config.primary}`, color: config.primary, background: 'white', cursor: 'pointer' }}
            >
              📄 Upload clinic PDF
            </button>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              style={{ display: 'none' }}
              onChange={(e) => void handlePdf(e.target.files?.[0])}
            />
          </div>
          {pdfStatus && (
            <p
              className="text-xs mb-2 rounded-lg px-3 py-2"
              style={{
                background: pdfStatus.kind === 'error' ? '#fdecec' : pdfStatus.kind === 'ok' ? '#eefbf1' : '#f4f6f8',
                color: pdfStatus.kind === 'error' ? '#b3261e' : '#333',
              }}
            >
              {pdfStatus.msg}
            </p>
          )}

          <form onSubmit={handleSubmit}>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                if (e.target.value.trim()) setFieldErrors((p) => ({ ...p, text: undefined }))
              }}
              placeholder="Paste the clinic's quote here — WhatsApp messages and emails all work — or press “Upload clinic PDF” above. Include treatment name, price, inclusions, and patient details."
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

            <label className="flex items-start gap-2 mt-3 text-xs cursor-pointer" style={{ color: '#58585a' }}>
              <input
                type="checkbox"
                checked={splitTreatments}
                onChange={(e) => setSplitTreatments(e.target.checked)}
                disabled={isLoading}
                style={{ marginTop: 2 }}
              />
              <span>
                <strong>Separate quote for each treatment</strong>
                <span style={{ color: '#999' }}>
                  {' '}— leave unticked to get ONE quote for the patient: treatments are added up into a total, and clinic options are listed inside with their prices ("Starting from" the cheapest).
                </span>
              </span>
            </label>

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
