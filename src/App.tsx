import { useState, useEffect } from 'react'
import type { AgentProfile, QuoteData, ClinicRow, SelectedClinic, SelectedDoctor } from './types'
import { extractQuoteData } from './lib/extraction'
import { generateQuotePDF } from './lib/pdfService'
import { BrandProvider, useBrand } from './contexts/BrandContext'
import { fetchClinicRows } from './lib/clinicsApi'

import PasteInput from './components/PasteInput'
import ReviewForm from './components/ReviewForm'
import QuoteDone from './components/QuoteDone'
import ApiKeySetup from './components/ApiKeySetup'

async function reportError(params: {
  errorType: 'extraction' | 'pdf' | 'api_key' | 'network' | 'unknown'
  message: string
  step: string
  patientName?: string | null
  agentName?: string | null
  agentEmail?: string | null
}) {
  try {
    await fetch('/api/report-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, timestamp: new Date().toISOString() }),
    })
  } catch { /* never block the UI */ }
}

function todayDDMMYYYY(): string {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

function AppContent() {
  const { brand } = useBrand()
  const [step, setStep] = useState<'paste' | 'review' | 'done'>('paste')
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [quotes, setQuotes] = useState<QuoteData[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [pendingRawText, setPendingRawText] = useState<string | null>(null)
  const [pendingClinic, setPendingClinic] = useState<SelectedClinic | null>(null)
  const [pendingDoctor, setPendingDoctor] = useState<SelectedDoctor | null>(null)

  // Clinic rows — fetched live from Google Sheet via Netlify function
  const [clinicRows, setClinicRows] = useState<ClinicRow[]>([])
  const [clinicsLoading, setClinicsLoading] = useState(true)
  const [clinicsError, setClinicsError] = useState<string | null>(null)

  useEffect(() => {
    fetchClinicRows()
      .then(setClinicRows)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        setClinicsError(msg)
      })
      .finally(() => setClinicsLoading(false))
  }, [])

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
          // override with clinic selection
          ...(clinic
            ? {
                clinicName: clinic.clinic_name,
                clinicLocation: clinic.location,
                clinicProfileUrl: clinic.clinic_profile_url,
                templatePdfUrl: clinic.template_pdf_url || null,
              }
            : {}),
          // override with doctor selection — template_pdf_url is per clinic+doctor row
          ...(doctor
            ? {
                surgeonName: doctor.surgeon_name,
                accreditations: doctor.accreditations,
                templatePdfUrl: doctor.template_pdf_url || null,
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
        void reportError({
          errorType: 'extraction',
          message: msg,
          step: 'Quote extraction',
          agentName: p.name,
          agentEmail: p.email,
        })
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
      for (const quote of data) {
        await generateQuotePDF(quote, profile)
      }
      setQuotes(data)
      setStep('done')
    } catch (err) {
      const msg = String(err)
      alert('PDF generation failed: ' + msg)
      void reportError({
        errorType: 'pdf',
        message: msg,
        step: 'PDF generation / download',
        patientName: data[0]?.patientName,
        agentName: profile.name,
        agentEmail: profile.email,
      })
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
