import type { QuoteData } from '../types'
import { useBrand } from '../contexts/BrandContext'

interface Props {
  quotes: QuoteData[]
  onNewQuote: () => void
}

export default function QuoteDone({ quotes, onNewQuote }: Props) {
  const { config } = useBrand()
  const count = quotes.length

  return (
    <div className="min-h-screen" style={{ background: config.pageBackground }}>
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <img
          src={config.logo}
          alt={config.name}
          style={{ height: 48, objectFit: 'contain', marginBottom: 24 }}
          className="mx-auto"
        />

        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: `${config.primary}18` }}
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke={config.primary}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold mb-2" style={{ color: config.primary }}>
          {count > 1 ? `${count} Quotes Downloaded!` : 'Quote Downloaded!'}
        </h2>

        <p className="text-gray-500 mb-1">
          <strong>{quotes[0]?.patientName || 'Patient'}</strong>
        </p>

        {count > 1 ? (
          <div className="flex flex-col gap-1 mb-8">
            {quotes.map((q, i) => (
              <p key={i} className="text-sm text-gray-400">{q.treatmentName || `Procedure ${i + 1}`}</p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-8">
            {quotes[0]?.treatmentName || 'Treatment'}
            {quotes[0]?.clinicName ? ` · ${quotes[0].clinicName}` : ''}
          </p>
        )}

        <button
          onClick={onNewQuote}
          className="rounded-xl font-bold px-8 py-4 text-sm"
          style={{
            background: config.primary,
            color: config.primaryText,
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
            letterSpacing: 0.5,
          }}
        >
          + Generate Another Quote
        </button>

        <p className="text-xs text-gray-400 mt-8">
          {count > 1
            ? `${count} PDF files have been saved to your downloads folder.`
            : 'The PDF has been saved to your downloads folder.'}
        </p>
      </div>
    </div>
  )
}
