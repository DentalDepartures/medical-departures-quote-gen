import { useState } from 'react'
import type { QuoteData } from '../types'

interface Props {
  initial: QuoteData
  onConfirm: (data: QuoteData) => void
  onBack: () => void
  isGenerating: boolean
}

const CURRENCIES = ['THB', 'USD', 'MXN', 'EUR', 'BRL', 'GBP', 'AUD', 'CAD', 'SGD', 'HKD']

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100 pt-5 mt-5 first:border-0 first:mt-0 first:pt-0">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

export default function ReviewForm({ initial, onConfirm, onBack, isGenerating }: Props) {
  const [q, setQ] = useState<QuoteData>(initial)

  // Helpers for array fields edited as multi-line text
  function arrayToText(arr: string[]) {
    return arr.join('\n')
  }
  function textToArray(text: string) {
    return text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  function set<K extends keyof QuoteData>(key: K, value: QuoteData[K]) {
    setQ((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onConfirm(q)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 transition-colors">
          ← Back
        </button>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Review Quote</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Verify the extracted data. Edit anything that looks wrong, then download the PDF.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card space-y-0">
          {/* Patient */}
          <Section title="Patient">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Patient Name">
                <input
                  type="text"
                  className="input-field"
                  value={q.patientName ?? ''}
                  onChange={(e) => set('patientName', e.target.value || null)}
                />
              </Field>
              <Field label="Quote Date">
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. 03/25/2025"
                  value={q.quoteDate ?? ''}
                  onChange={(e) => set('quoteDate', e.target.value || null)}
                />
              </Field>
            </div>
          </Section>

          {/* Treatment */}
          <Section title="Treatment">
            <Field label="Treatment Name">
              <input
                type="text"
                className="input-field"
                value={q.treatmentName ?? ''}
                onChange={(e) => set('treatmentName', e.target.value || null)}
              />
            </Field>
          </Section>

          {/* Clinic */}
          <Section title="Clinic">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Clinic Name">
                <input
                  type="text"
                  className="input-field"
                  value={q.clinicName ?? ''}
                  onChange={(e) => set('clinicName', e.target.value || null)}
                />
              </Field>
              <Field label="Location (City, Country)">
                <input
                  type="text"
                  className="input-field"
                  placeholder="Bangkok, Thailand"
                  value={q.clinicLocation ?? ''}
                  onChange={(e) => set('clinicLocation', e.target.value || null)}
                />
              </Field>
            </div>
            <Field label="Clinic Profile URL (optional)">
              <input
                type="url"
                className="input-field"
                placeholder="https://..."
                value={q.clinicProfileUrl ?? ''}
                onChange={(e) => set('clinicProfileUrl', e.target.value || null)}
              />
            </Field>
          </Section>

          {/* Pricing */}
          <Section title="Pricing">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="sm:col-span-1">
                <label className="label">Currency</label>
                <select
                  className="input-field"
                  value={q.currency}
                  onChange={(e) => set('currency', e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-1">
                <Field label="Price">
                  <input
                    type="number"
                    className="input-field"
                    placeholder="270000"
                    value={q.price ?? ''}
                    onChange={(e) =>
                      set('price', e.target.value ? parseFloat(e.target.value) : null)
                    }
                  />
                </Field>
              </div>
              <div className="sm:col-span-1">
                <Field label="Original Price">
                  <input
                    type="number"
                    className="input-field"
                    placeholder="Reduced from"
                    value={q.reducedFrom ?? ''}
                    onChange={(e) =>
                      set('reducedFrom', e.target.value ? parseFloat(e.target.value) : null)
                    }
                  />
                </Field>
              </div>
              <div className="sm:col-span-1">
                <Field label="Savings">
                  <input
                    type="number"
                    className="input-field"
                    placeholder="Auto-calc"
                    value={q.savings ?? ''}
                    onChange={(e) =>
                      set('savings', e.target.value ? parseFloat(e.target.value) : null)
                    }
                  />
                </Field>
              </div>
            </div>
          </Section>

          {/* Package */}
          <Section title="Package">
            <Field label="Inclusions (one per line)">
              <textarea
                className="input-field h-32 resize-none"
                value={arrayToText(q.inclusions)}
                onChange={(e) => set('inclusions', textToArray(e.target.value))}
              />
            </Field>
            <Field label="Exclusions (one per line)">
              <textarea
                className="input-field h-24 resize-none"
                value={arrayToText(q.exclusions)}
                onChange={(e) => set('exclusions', textToArray(e.target.value))}
              />
            </Field>
          </Section>

          {/* Surgeon */}
          <Section title="Surgeon & Accreditation">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Surgeon Name">
                <input
                  type="text"
                  className="input-field"
                  value={q.surgeonName ?? ''}
                  onChange={(e) => set('surgeonName', e.target.value || null)}
                />
              </Field>
              <Field label="Surgeon Title">
                <input
                  type="text"
                  className="input-field"
                  value={q.surgeonTitle ?? ''}
                  onChange={(e) => set('surgeonTitle', e.target.value || null)}
                />
              </Field>
            </div>
            <Field label="Accreditations">
              <input
                type="text"
                className="input-field"
                placeholder="e.g. JCI Accredited"
                value={q.accreditations ?? ''}
                onChange={(e) => set('accreditations', e.target.value || null)}
              />
            </Field>
          </Section>

          {/* Consultation */}
          <Section title="Consultation">
            <div className="flex items-center gap-3">
              <input
                id="consult-req"
                type="checkbox"
                className="w-4 h-4 rounded accent-navy"
                checked={q.consultationRequired ?? false}
                onChange={(e) => set('consultationRequired', e.target.checked)}
              />
              <label htmlFor="consult-req" className="text-sm font-medium text-gray-700">
                Consultation Required
              </label>
            </div>
            <Field label="Suggested Consult Day & Time">
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Friday, 2:00 PM"
                value={q.suggestedConsultTime ?? ''}
                onChange={(e) => set('suggestedConsultTime', e.target.value || null)}
              />
            </Field>
          </Section>

          {/* Notes */}
          <Section title="Important Notes">
            <Field label="Clinical / Medical Notes">
              <textarea
                className="input-field h-24 resize-none"
                placeholder="Any important notes that should appear on the quote..."
                value={q.importantNotes ?? ''}
                onChange={(e) => set('importantNotes', e.target.value || null)}
              />
            </Field>
          </Section>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={onBack} className="btn-secondary">
            ← Back
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={isGenerating}>
            {isGenerating ? (
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
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Generating PDF…
              </span>
            ) : (
              '⬇ Download PDF'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
