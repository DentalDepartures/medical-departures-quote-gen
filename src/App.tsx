import { useState } from 'react'
import type { AgentProfile, QuoteData } from './types'
import { extractQuoteData } from './lib/extraction'
import { generateQuotePDF } from './lib/pdfGenerator'

import PasteInput from './components/PasteInput'
import ReviewForm from './components/ReviewForm'
import QuoteDone from './components/QuoteDone'
import ApiKeySetup from './components/ApiKeySetup'

export default function App() {
  const [step, setStep] = useState<'paste' | 'review' | 'done'>('paste')
  const [profile, setProfile] = useState<AgentProfile | null>(null)
  const [quoteData, setQuoteData] = useState<QuoteData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [pendingRawText, setPendingRawText] = useState<string | null>(null)

  // ── Extraction ─────────────────────────────────────────────────────────
  async function handleGenerate(rawText: string, p: AgentProfile) {
    setProfile(p)
    setIsLoading(true)
    setExtractError(null)
    try {
      const data = await extractQuoteData(rawText)
      setQuoteData(data)
      setStep('review')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'NO_API_KEY') {
        setPendingRawText(rawText)
        setShowApiKeyModal(true)
      } else {
        setExtractError(msg)
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

  // ── PDF generation ─────────────────────────────────────────────────────
  async function handleConfirmAndDownload(data: QuoteData) {
    if (!profile) return
    setIsGenerating(true)
    try {
      await generateQuotePDF(data, profile)
      setQuoteData(data)
      setStep('done')
    } catch (err) {
      alert('PDF generation failed: ' + String(err))
    } finally {
      setIsGenerating(false)
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────
  function handleNewQuote() {
    setQuoteData(null)
    setExtractError(null)
    setStep('paste')
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (step === 'paste') {
    return (
      <>
        <PasteInput
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
            }}
          />
        )}
      </>
    )
  }

  if (step === 'review' && quoteData) {
    return (
      <ReviewForm
        initial={quoteData}
        onConfirm={handleConfirmAndDownload}
        onBack={() => setStep('paste')}
        isGenerating={isGenerating}
        quote={quoteData}
      />
    )
  }

  if (step === 'done' && quoteData) {
    return <QuoteDone quote={quoteData} onNewQuote={handleNewQuote} />
  }

  return null
}
