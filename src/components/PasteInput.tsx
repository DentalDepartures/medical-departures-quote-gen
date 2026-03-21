import { useState } from 'react'

interface Props {
  onGenerate: (rawText: string) => void
  isLoading: boolean
  error: string | null
}

const PLACEHOLDER = `Paste anything here — WhatsApp messages, emails, price lists, PDFs copied to clipboard...

Examples:
• "Hi David, your quote for rhinoplasty at Wansiri Hospital is 270,000 THB..."
• Text in Spanish, Thai, Portuguese — all supported
• Raw copied text from a PDF or email thread

The AI will extract the key details automatically. You can review and edit before generating the PDF.`

export default function PasteInput({ onGenerate, isLoading, error }: Props) {
  const [text, setText] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || isLoading) return
    onGenerate(text.trim())
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">New Quote</h2>
        <p className="text-gray-500 text-sm">
          Paste any raw quote information below and the AI will structure it for you.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="card p-0 overflow-hidden">
          <textarea
            className="w-full h-72 sm:h-96 p-5 text-sm text-gray-800 placeholder-gray-400
                       resize-none focus:outline-none leading-relaxed"
            placeholder={PLACEHOLDER}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isLoading}
            autoFocus
          />
          <div className="border-t border-gray-100 px-5 py-3 bg-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {text.length > 0 ? `${text.length} characters` : 'Any language supported'}
            </span>
            <button
              type="submit"
              className="btn-primary text-sm px-8"
              disabled={!text.trim() || isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
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
                  Extracting…
                </span>
              ) : (
                'Generate Quote →'
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <strong>Error:</strong> {error}
          </div>
        )}
      </form>

      {/* Tips */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            icon: '📋',
            title: 'Paste anything',
            desc: 'Emails, WhatsApp, PDFs — messy text is fine',
          },
          {
            icon: '🌍',
            title: 'Any language',
            desc: 'Spanish, Thai, Portuguese, French and more',
          },
          {
            icon: '✏️',
            title: 'Review before sending',
            desc: 'Edit AI mistakes before the PDF is generated',
          },
        ].map((tip) => (
          <div key={tip.title} className="card flex items-start gap-3 p-4">
            <span className="text-2xl">{tip.icon}</span>
            <div>
              <p className="font-semibold text-sm text-gray-800">{tip.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{tip.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
