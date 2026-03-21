import { useState } from 'react'
import type { AgentProfile, AppStep, QuoteData } from './types'
import { getProfile } from './lib/storage'
import { extractQuoteData } from './lib/extraction'
import { generateQuotePDF } from './lib/pdfGenerator'

import Header from './components/Header'
import ProfileSetup from './components/ProfileSetup'
import ApiKeySetup from './components/ApiKeySetup'
import PasteInput from './components/PasteInput'
import ReviewForm from './components/ReviewForm'
import QuoteDone from './components/QuoteDone'

export default function App() {
  const [profile, setProfile] = useState<AgentProfile | null>(getProfile)
  const [step, setStep] = useState<AppStep>(() => (getProfile() ? 'paste' : 'profile'))
  const [quoteData, setQuoteData] = useState<QuoteData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [showApiKeyModal, setShowApiKeyModal] = useState(false)
  const [pendingRawText, setPendingRawText] = useState<string | null>(null)

  // ── Profile ────────────────────────────────────────────────────────────
  function handleProfileSave(p: AgentProfile) {
    setProfile(p)
    setStep('paste')
  }

  // ── Extraction ─────────────────────────────────────────────────────────
  async function handleGenerate(rawText: string) {
    setIsLoading(true)
    setExtractError(null)
    try {
      const data = await extractQuoteData(rawText)
      setQuoteData(data)
      setStep('review')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'NO_API_KEY') {
        // Show API key modal, then retry with same text
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
    if (pendingRawText) {
      void handleGenerate(pendingRawText)
      setPendingRawText(null)
    }
  }

  // ── PDF generation ─────────────────────────────────────────────────────
  function handleConfirmAndDownload(data: QuoteData) {
    if (!profile) return
    setIsGenerating(true)
    try {
      generateQuotePDF(data, profile)
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
  if (step === 'profile') {
    return (
      <ProfileSetup
        initial={profile}
        onSave={handleProfileSave}
        onCancel={profile ? () => setStep('paste') : undefined}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header profile={profile} onEditProfile={() => setStep('profile')} />

      <main className="flex-1">
        {step === 'paste' && (
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
        )}

        {step === 'review' && quoteData && (
          <ReviewForm
            initial={quoteData}
            onConfirm={handleConfirmAndDownload}
            onBack={() => setStep('paste')}
            isGenerating={isGenerating}
          />
        )}

        {step === 'done' && quoteData && (
          <QuoteDone quote={quoteData} onNewQuote={handleNewQuote} />
        )}
      </main>
    </div>
  )
}
