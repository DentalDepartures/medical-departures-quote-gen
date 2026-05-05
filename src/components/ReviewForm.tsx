import { useState } from 'react'
import type { QuoteData } from '../types'
import { useBrand } from '../contexts/BrandContext'

interface Props {
  initial: QuoteData[]
  onConfirm: (data: QuoteData[]) => void
  onBack: () => void
  isGenerating: boolean
}

const CURRENCIES = ['THB', 'USD', 'MXN', 'EUR', 'BRL', 'GBP', 'AUD', 'CAD', 'SGD', 'HKD']

const LIMITS = { inclusions: 30, exclusions: 7, notes: 23 }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-gray-100 pt-5 mt-5 first:border-0 first:mt-0 first:pt-0">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">{title}</h3>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div
        className="input-field flex items-center"
        style={{
          background: '#f5f5f5',
          color: '#999',
          cursor: 'not-allowed',
          minHeight: 38,
          userSelect: 'none',
        }}
      >
        {value || <span style={{ color: '#ccc' }}>—</span>}
      </div>
    </div>
  )
}

function LineCounter({ text, max }: { text: string; max: number }) {
  const count = text.split('\n').filter((l) => l.trim().length > 0).length
  const over = count > max
  const near = !over && count >= max - 3
  const color = over ? '#e51b24' : near ? '#e07b00' : '#aaa'
  return (
    <div className="text-xs text-right mt-1 font-medium" style={{ color }}>
      {over && '⚠ Over limit — '}
      {count} / {max} lines
    </div>
  )
}

interface QuoteFieldErrors {
  patientName?: string
  treatmentName?: string
  price?: string
}

function ErrorMsg({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="text-xs mt-1 font-medium" style={{ color: '#e51b24' }}>{msg}</p>
}

function QuoteEditor({
  q,
  onChange,
  errors = {},
  onClearError,
}: {
  q: QuoteData
  onChange: (q: QuoteData) => void
  errors?: QuoteFieldErrors
  onClearError: (field: keyof QuoteFieldErrors) => void
}) {
  const [inclText, setInclText] = useState(() => q.inclusions.join('\n'))
  const [exclText, setExclText] = useState(() => q.exclusions.join('\n'))
  const [notesText, setNotesText] = useState(() => q.importantNotes ?? '')

  const inclCount = inclText.split('\n').filter((l) => l.trim().length > 0).length
  const exclCount = exclText.split('\n').filter((l) => l.trim().length > 0).length
  const notesCount = notesText.split('\n').filter((l) => l.trim().length > 0).length

  function set<K extends keyof QuoteData>(key: K, value: QuoteData[K]) {
    onChange({ ...q, [key]: value })
  }
  function textToArray(text: string) {
    return text.split('\n').filter((s) => s.trim().length > 0)
  }

  const textareaStyle = (count: number, max: number): React.CSSProperties => ({
    border: `1.5px solid ${count > max ? '#e51b24' : '#d1d5db'}`,
    borderRadius: 8,
    padding: '8px 12px',
    width: '100%',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    resize: 'vertical' as const,
    lineHeight: 1.6,
  })

  const inputErr = (hasErr?: string): React.CSSProperties => ({
    border: `1.5px solid ${hasErr ? '#e51b24' : '#d1d5db'}`,
  })

  return (
    <div className="card space-y-0">
      {/* Patient */}
      <Section title="Patient">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Patient Name *">
            <input
              type="text"
              className="input-field"
              style={inputErr(errors.patientName)}
              value={q.patientName ?? ''}
              onChange={(e) => {
                set('patientName', e.target.value || null)
                if (e.target.value.trim()) onClearError('patientName')
              }}
            />
            <ErrorMsg msg={errors.patientName} />
          </Field>
          <ReadOnlyField label="Quote Date" value={q.quoteDate} />
        </div>
      </Section>

      {/* Treatment */}
      <Section title="Treatment">
        <Field label="Treatment Name *">
          <input
            type="text"
            className="input-field"
            style={inputErr(errors.treatmentName)}
            value={q.treatmentName ?? ''}
            onChange={(e) => {
              set('treatmentName', e.target.value || null)
              if (e.target.value.trim()) onClearError('treatmentName')
            }}
          />
          <ErrorMsg msg={errors.treatmentName} />
        </Field>
      </Section>

      {/* Clinic (all non-editable) */}
      <Section title="Clinic">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ReadOnlyField label="Clinic Name" value={q.clinicName} />
          <ReadOnlyField label="Location" value={q.clinicLocation} />
        </div>
        <ReadOnlyField label="Clinic Profile URL" value={q.clinicProfileUrl} />
      </Section>

      {/* Pricing */}
      <Section title="Pricing">
        {q.pricePrefix && (
          <div
            className="rounded-lg px-3 py-2 mb-3 text-sm font-medium"
            style={{ background: '#fff8e1', border: '1.5px solid #f6c90e', color: '#7a5c00' }}
          >
            PDF banner will show: <strong>{q.pricePrefix} {q.price?.toLocaleString('en-US')} {q.currency}</strong>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4" style={{ maxWidth: 320 }}>
          <div>
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
          <Field label={`${q.pricePrefix ? 'Starting Price' : 'Final Price'} *`}>
            <input
              type="number"
              className="input-field"
              style={inputErr(errors.price)}
              placeholder="270000"
              value={q.price ?? ''}
              onChange={(e) => {
                set('price', e.target.value ? parseFloat(e.target.value) : null)
                if (e.target.value) onClearError('price')
              }}
            />
            <ErrorMsg msg={errors.price} />
          </Field>
        </div>
      </Section>

      {/* Package */}
      <Section title="Package">
        <Field label={`Inclusions (one per line)`}>
          <textarea
            value={inclText}
            onChange={(e) => setInclText(e.target.value)}
            onBlur={() => set('inclusions', textToArray(inclText))}
            style={{ ...textareaStyle(inclCount, LIMITS.inclusions), minHeight: 128 }}
          />
          <LineCounter text={inclText} max={LIMITS.inclusions} />
        </Field>
        <Field label={`Exclusions (one per line)`}>
          <textarea
            value={exclText}
            onChange={(e) => setExclText(e.target.value)}
            onBlur={() => set('exclusions', textToArray(exclText))}
            style={{ ...textareaStyle(exclCount, LIMITS.exclusions), minHeight: 96 }}
          />
          <LineCounter text={exclText} max={LIMITS.exclusions} />
        </Field>
      </Section>

      {/* Doctor (all non-editable) */}
      <Section title="Surgeon & Accreditation">
        <ReadOnlyField label="Surgeon Name" value={q.surgeonName} />
        <ReadOnlyField label="Accreditations" value={q.accreditations} />
      </Section>

      {/* Important Notes */}
      <Section title="Important Notes">
        <Field label="Clinical / Medical Notes (bullet points — start each line with -)">
          <textarea
            value={notesText}
            onChange={(e) => {
              setNotesText(e.target.value)
              set('importantNotes', e.target.value || null)
            }}
            placeholder="- Note one&#10;- Note two&#10;  - Sub-note"
            style={{ ...textareaStyle(notesCount, LIMITS.notes), minHeight: 96 }}
          />
          <LineCounter text={notesText} max={LIMITS.notes} />
        </Field>
      </Section>
    </div>
  )
}

function countLines(text: string): number {
  return text.split('\n').filter(l => l.trim().length > 0).length
}

export default function ReviewForm({ initial, onConfirm, onBack, isGenerating }: Props) {
  const { config } = useBrand()
  const [quotes, setQuotes] = useState<QuoteData[]>(initial)
  const [activeIdx, setActiveIdx] = useState(0)
  const [allErrors, setAllErrors] = useState<string[]>([])
  const [quoteFieldErrors, setQuoteFieldErrors] = useState<QuoteFieldErrors[]>(
    () => initial.map(() => ({}))
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const errors: string[] = []
    const newFieldErrors: QuoteFieldErrors[] = quotes.map(() => ({}))

    quotes.forEach((q, i) => {
      const prefix = quotes.length > 1 ? `Procedure ${i + 1}: ` : ''

      if (!q.patientName?.trim()) {
        newFieldErrors[i].patientName = 'Patient name is required'
        errors.push(`${prefix}Patient name is required.`)
      }
      if (!q.treatmentName?.trim()) {
        newFieldErrors[i].treatmentName = 'Treatment name is required'
        errors.push(`${prefix}Treatment name is required.`)
      }
      if (q.price == null || isNaN(q.price)) {
        newFieldErrors[i].price = 'Price is required'
        errors.push(`${prefix}Price is required.`)
      }

      const inclLines = q.inclusions.filter(s => s.trim()).length
      const exclLines = q.exclusions.filter(s => s.trim()).length
      const notesLines = countLines(q.importantNotes ?? '')
      if (inclLines > LIMITS.inclusions)
        errors.push(`${prefix}Inclusions cannot exceed 30 lines.`)
      if (exclLines > LIMITS.exclusions)
        errors.push(`${prefix}Exclusions cannot exceed 7 lines.`)
      if (notesLines > LIMITS.notes)
        errors.push(`${prefix}Important Notes cannot exceed 23 lines.`)
    })

    setQuoteFieldErrors(newFieldErrors)

    if (errors.length > 0) {
      setAllErrors(errors)
      // Auto-switch to first tab that has field errors
      const firstErrIdx = newFieldErrors.findIndex(e => Object.keys(e).length > 0)
      if (firstErrIdx >= 0) setActiveIdx(firstErrIdx)
      return
    }

    setAllErrors([])
    onConfirm(quotes)
  }

  function clearQuoteFieldError(quoteIdx: number, field: keyof QuoteFieldErrors) {
    setQuoteFieldErrors(prev => {
      const next = [...prev]
      next[quoteIdx] = { ...next[quoteIdx], [field]: undefined }
      return next
    })
    // Remove matching error from the banner
    setAllErrors(prev => prev.filter(e => {
      if (field === 'patientName') return !e.includes('Patient name')
      if (field === 'treatmentName') return !e.includes('Treatment name')
      if (field === 'price') return !e.includes('Price is required')
      return true
    }))
  }

  const tabLabel = (q: QuoteData, i: number) =>
    q.treatmentName
      ? q.treatmentName.length > 22
        ? q.treatmentName.slice(0, 20) + '…'
        : q.treatmentName
      : `Procedure ${i + 1}`

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky toolbar */}
      <div
        className="sticky top-0 z-50 flex items-center justify-between px-6 py-3"
        style={{ background: '#1a1a1a' }}
      >
        <button
          onClick={onBack}
          className="text-sm font-semibold rounded-md px-4 py-2 transition-colors"
          style={{
            background: 'transparent',
            border: '1.5px solid rgba(255,255,255,0.3)',
            color: 'white',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ← Edit Data
        </button>
        <div className="text-sm font-bold text-white hidden sm:block">
          {quotes.length > 1 ? `${quotes.length} Procedures` : quotes[0]?.patientName || 'Quote'}
        </div>
        <button
          form="review-form"
          type="submit"
          disabled={isGenerating}
          className="text-sm font-bold rounded-md px-5 py-2"
          style={{
            background: config.primary,
            border: 'none',
            color: config.primaryText,
            cursor: isGenerating ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            opacity: isGenerating ? 0.7 : 1,
          }}
        >
          {isGenerating
            ? 'Generating…'
            : `⬇ Download ${quotes.length > 1 ? `${quotes.length} PDFs` : 'PDF'}`}
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Procedure tabs — only for multiple procedures */}
        {quotes.length > 1 && (
          <div className="flex gap-2 mb-6 flex-wrap">
            {quotes.map((q, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={{
                  background: activeIdx === i ? config.primary : '#e5e7eb',
                  color: activeIdx === i ? config.primaryText : '#374151',
                  fontFamily: 'inherit',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {tabLabel(q, i)}
              </button>
            ))}
          </div>
        )}

        {allErrors.length > 0 && (
          <div
            className="rounded-xl mb-5 px-5 py-4"
            style={{ background: '#fff5f5', border: '1.5px solid #fca5a5' }}
          >
            <p className="text-sm font-bold mb-2" style={{ color: '#dc2626' }}>
              Please fix the following before generating:
            </p>
            <ul className="space-y-1">
              {allErrors.map((err, i) => (
                <li key={i} className="text-sm" style={{ color: '#dc2626' }}>
                  • {err}
                </li>
              ))}
            </ul>
          </div>
        )}

        <form id="review-form" onSubmit={handleSubmit}>
          <QuoteEditor
            q={quotes[activeIdx]}
            onChange={(updated) =>
              setQuotes(quotes.map((q, i) => (i === activeIdx ? updated : q)))
            }
            errors={quoteFieldErrors[activeIdx]}
            onClearError={(field) => clearQuoteFieldError(activeIdx, field)}
          />
        </form>
      </div>
    </div>
  )
}
