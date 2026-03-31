import { useState } from 'react'
import type { AgentProfile, QuoteData } from './types'
import { extractQuoteData } from './lib/extraction'
import { generateQuotePDF } from './lib/pdfGenerator'

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
    await fetch('/.netlify/functions/report-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, timestamp: new Date().toISOString() }),
    })
  } catch { /* never block the UI */ }
}

export default function App() {
  const [step, setStep] = useState<'paste' | 'review' | 'done'>('paste')
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [quotes, setQuotes] = useState<QuoteData[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [pendingRawText, setPendingRawText] = useState<string | null>(null)

  async function handleGenerate(rawText: string, p: AgentProfile) {
    setProfile(p)
    setIsLoading(true)
    setExtractError(null)
    try {
      const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD
      const data = await extractQuoteData(rawText)
      setQuotes(data.map(q => ({ ...q, quoteDate: today })))
      setStep('review')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'NO_API_KEY') {
        setPendingRawText(rawText)
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
      void handleGenerate(pendingRawText, profile)
      setPendingRawText(null)
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

  if (step === 'paste') {
    return (
      <>
        <PasteInput onGenerate={handleGenerate} isLoading={isLoading} error={extractError} />
        {showApiKeyModal && (
          <ApiKeySetup
            onSave={handleApiKeySaved}
            onCancel={() => { setShowApiKeyModal(false); setPendingRawText(null) }}
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
