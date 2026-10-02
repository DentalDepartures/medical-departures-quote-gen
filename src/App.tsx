import { useState, useEffect, useCallback } from 'react'
import type { AgentProfile, QuoteData, ClinicRow, SelectedClinic, SelectedDoctor, AppStep } from './types'
import { extractQuoteData } from './lib/extraction'
import { generateQuotePDF } from './lib/pdfService'
import { BrandProvider, useBrand } from './contexts/BrandContext'
import { fetchClinicRows, uploadQuote, reportError } from './lib/api'
import { getProfile } from './lib/storage'

import PasteInput from './components/PasteInput'
import ReviewForm from './components/ReviewForm'
import QuoteDone from './components/QuoteDone'
import ApiKeySetup from './components/ApiKeySetup'
import AddClinic from './components/AddClinic'

function todayDDMMYYYY(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

function AppContent() {
  const { brand } = useBrand()
  const [step, setStep] = useState<AppStep>('paste')
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [quotes, setQuotes] = useState<QuoteData[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [pendingRawText, setPendingRawText] = useState<string | null>(null)
  const [pendingClinic, setPendingClinic] = useState<SelectedClinic | null>(null)
  const [pendingDoctor, setPendingDoctor] = useState<SelectedDoctor | null>(null)
  const [preselectClinic, setPreselectClinic] = useState<string | null>(null)

  // Clinic rows — fetched live from the Google Sheet via the clinics edge function
  const [clinicRows, setClinicRows] = useState<ClinicRow[]>([])
  const [clinicsLoading, setClinicsLoading] = useState(true)
  const [clinicsError, setClinicsError] = useState<string | null>(null)

  const loadClinics = useCallback(async () => {
    setClinicsLoading(true)
    setClinicsError(null)
    try {
      setClinicRows(await fetchClinicRows())
    } catch (err: unknown) {
      setClinicsError(err instanceof Error ? err.message : String(err))
    } finally {
      setClinicsLoading(false)
    }
  }, [])

  useEffect(() => { void loadClinics() }, [loadClinics])

  async function handleGenerate(
    rawText: string,
    p: AgentProfile,
    clinic: SelectedClinic | null,
    doctor: SelectedDoctor | null,
  ) {
    setProfile(p)
    setIsLoading(true)
    setExtractError(null)
    try {
      const data = await extractQuoteData(rawText)
      const today = todayDDMMYYYY()
      setQuotes(
        data.map((q) => ({
          ...q,
          quoteDate: today,
          templatePdfUrl: null,
          googleFolder: null,
          pricePrefix: q.pricePrefix ?? null,
          clinicImageUrl: null,
          beforeAfterImageUrl: null,
          doctorImageUrl: null,
          // Clinic facts always come from the sheet, never from the pasted text
          ...(clinic
            ? {
                clinicName: clinic.clinic_name,
                clinicLocation: clinic.location,
                clinicProfileUrl: clinic.clinic_profile_url,
                templatePdfUrl: clinic.template_pdf_url || null,
                googleFolder: clinic.google_folder || null,
                clinicImageUrl: clinic.clinic_image_url || null,
                beforeAfterImageUrl: clinic.before_after_image_url || null,
              }
            : {}),
          ...(doctor
            ? {
                surgeonName: doctor.surgeon_name,
                accreditations: doctor.accreditations,
                templatePdfUrl: doctor.template_pdf_url || clinic?.template_pdf_url || null,
                doctorImageUrl: doctor.doctor_image_url || null,
              }
            : {}),
        })),
      )
      setStep('review')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'NO_API_KEY') {
        setPendingRawText(rawText)
        setPendingClinic(clinic)
        setPendingDoctor(doctor)
        setShowApiKeyModal(true)
      } else {
        setExtractError(msg)
        void reportError({ errorType: 'extraction', message: msg, step: 'Quote extraction', agentName: p.name, agentEmail: p.email })
      }
    } finally {
      setIsLoading(false)
    }
  }

  function handleApiKeySaved() {
    setShowApiKeyModal(false)
    if (pendingRawText && profile) {
      void handleGenerate(pendingRawText, profile, pendingClinic, pendingDoctor)
      setPendingRawText(null)
      setPendingClinic(null)
      setPendingDoctor(null)
    }
  }

  async function handleConfirmAndDownload(data: QuoteData[]) {
    if (!profile) return
    setIsGenerating(true)
    try {
      const failures: string[] = []
      const finished: QuoteData[] = []
      for (const quote of data) {
        try {
          const { pdfBytes, filename, quoteId } = await generateQuotePDF(quote, profile, brand)
          finished.push({ ...quote, quoteId })
          try {
            await uploadQuote({ pdfBytes, filename, quoteId, quote, agent: profile, brand })
          } catch (uploadErr) {
            failures.push(`${quote.treatmentName || 'Quote'} — the PDF downloaded but could not be saved to Drive: ${String(uploadErr)}`)
          }
        } catch (pdfErr) {
          const msg = String(pdfErr)
          finished.push(quote)
          failures.push(`${quote.treatmentName || 'Quote'} — PDF failed: ${msg}`)
          void reportError({ errorType: 'pdf', message: msg, step: 'PDF generation / download', patientName: quote.patientName, agentName: profile.name, agentEmail: profile.email })
        }
      }
      if (failures.length > 0) {
        alert(`⚠ ${failures.length} of ${data.length} quotes had issues:\n\n${failures.join('\n')}`)
      }
      setQuotes(finished)
      setStep('done')
    } catch (err) {
      alert('Unexpected error: ' + String(err))
    } finally {
      setIsGenerating(false)
    }
  }

  function handleNewQuote() {
    setQuotes(null)
    setExtractError(null)
    setStep('paste')
  }

  // Filter clinic rows by active brand (case-insensitive)
  const brandRows = clinicRows.filter((r) => r.brand.trim().toUpperCase() === brand.toUpperCase())

  if (step === 'add-clinic') {
    const agent = profile ?? getProfile() ?? { name: '', email: '', phone: '' }
    return (
      <AddClinic
        agent={agent}
        onCancel={() => setStep('paste')}
        onDone={async (clinicName) => {
          setPreselectClinic(clinicName)
          await loadClinics()
          setStep('paste')
        }}
      />
    )
  }

  if (step === 'paste') {
    return (
      <>
        <PasteInput
          rows={brandRows}
          clinicsLoading={clinicsLoading}
          clinicsError={clinicsError}
          totalClinicRowsLoaded={clinicRows.length}
          onGenerate={handleGenerate}
          isLoading={isLoading}
          error={extractError}
          onAddClinic={(p) => { setProfile(p); setStep('add-clinic') }}
          preselectClinic={preselectClinic}
        />
        {showApiKeyModal && (
          <ApiKeySetup
            onSave={handleApiKeySaved}
            onCancel={() => {
              setShowApiKeyModal(false)
              setPendingRawText(null)
              setPendingClinic(null)
              setPendingDoctor(null)
            }}
          />
        )}
      </>
    )
  }

  if (step === 'review' && quotes) {
    return (
      <ReviewForm
        initial={quotes}
        onConfirm={handleConfirmAndDownload}
        onBack={() => setStep('paste')}
        isGenerating={isGenerating}
      />
    )
  }

  if (step === 'done' && quotes) {
    return <QuoteDone quotes={quotes} onNewQuote={handleNewQuote} />
  }

  return null
}

export default function App() {
  return (
    <BrandProvider>
      <AppContent />
    </BrandProvider>
  )
}
