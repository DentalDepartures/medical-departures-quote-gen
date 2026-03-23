import type { QuoteData } from '../types'

interface Props {
  quote: QuoteData
  onNewQuote: () => void
}

export default function QuoteDone({ quote, onNewQuote }: Props) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <img src="/logo.png" alt="Medical Departures" style={{ height: 48, objectFit: 'contain', marginBottom: 24 }} className="mx-auto" />

      <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: '#ebf1f9' }}>
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="#00467f">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h2 className="text-2xl font-bold mb-2" style={{ color: '#00467f' }}>Quote Downloaded!</h2>
      <p className="text-gray-500 mb-1">
        <strong>{quote.patientName || 'Patient'}</strong> —{' '}
        {quote.treatmentName || 'Treatment'}
      </p>
      {quote.clinicName && (
        <p className="text-sm text-gray-400 mb-8">
          {quote.clinicName}
          {quote.clinicLocation ? ` · ${quote.clinicLocation}` : ''}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button onClick={onNewQuote} className="btn-primary">
          + Generate Another Quote
        </button>
      </div>

      <p className="text-xs text-gray-400 mt-8">
        The PDF has been saved to your downloads folder.
      </p>
    </div>
  )
}
