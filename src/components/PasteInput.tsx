import { useState, useEffect, useRef } from 'react'
import type { AgentProfile } from '../types'
import { getProfile, saveProfile } from '../lib/storage'

interface Props {
  onGenerate: (rawText: string, profile: AgentProfile) => void
  isLoading: boolean
  error: string | null
}

export default function PasteInput({ onGenerate, isLoading, error }: Props) {
  const saved = getProfile()
  const [name, setName] = useState(saved?.name ?? '')
  const [email, setEmail] = useState(saved?.email ?? '')
  const [phone, setPhone] = useState(saved?.phone ?? '')
  const [agentSaved, setAgentSaved] = useState(!!saved)
  const [text, setText] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-save agent details with debounce
  useEffect(() => {
    if (!name && !email && !phone) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      saveProfile({ name, email, phone })
      setAgentSaved(true)
    }, 800)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [name, email, phone])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || isLoading) return
    const profile: AgentProfile = { name, email, phone }
    saveProfile(profile)
    onGenerate(text.trim(), profile)
  }

  const fields: [string, string, (v: string) => void, string][] = [
    ['Full Name', name, setName, 'Your name'],
    ['Email', email, setEmail, 'your@email.com'],
    ['Phone', phone, setPhone, '+1 234 567 8900'],
  ]

  return (
    <div
      className="min-h-screen"
      style={{ background: 'linear-gradient(135deg, #ebf1f9 0%, #f0f4f8 100%)', padding: 32 }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Logo + title */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="Medical Departures"
            style={{ height: 60, objectFit: 'contain', marginBottom: 16 }}
          />
          <h1 className="text-2xl font-extrabold" style={{ color: '#00467f', margin: 0 }}>
            Quote Generator
          </h1>
          <p className="text-sm mt-2" style={{ color: '#888' }}>
            Paste raw clinic quote data below — AI will extract and format it into a branded PDF
          </p>
        </div>

        {/* Main card */}
        <div
          className="bg-white rounded-xl p-7 mb-5"
          style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}
        >
          {/* Agent details */}
          <div className="flex items-center gap-3 mb-3">
            <span
              className="text-xs font-bold tracking-widest uppercase"
              style={{ color: '#00467f' }}
            >
              Your Details (Ops Agent)
            </span>
            {agentSaved && (
              <span
                className="text-xs font-medium rounded-full px-2 py-0.5"
                style={{ background: '#e8f5e9', color: '#4caf50' }}
              >
                ✓ Saved
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5">
            {fields.map(([label, val, setter, placeholder]) => (
              <div key={label}>
                <label
                  className="block text-xs font-semibold mb-1"
                  style={{ color: '#58585a' }}
                >
                  {label}
                </label>
                <input
                  type="text"
                  value={val}
                  onChange={(e) => {
                    setter(e.target.value)
                    setAgentSaved(false)
                  }}
                  placeholder={placeholder}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ border: '1.5px solid #e0e0e0', fontFamily: 'inherit' }}
                />
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #f0f0f0', marginBottom: 20 }} />

          {/* Raw data */}
          <div
            className="text-xs font-bold tracking-widest uppercase mb-3"
            style={{ color: '#00467f' }}
          >
            Raw Quote Data
          </div>

          <form onSubmit={handleSubmit}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the clinic's quote here — WhatsApp messages, emails, PDFs all work. Include treatment name, price, inclusions, and patient details."
              disabled={isLoading}
              className="w-full rounded-lg px-4 py-3 text-sm outline-none resize-y"
              style={{
                minHeight: 220,
                border: '1.5px solid #e0e0e0',
                fontFamily: 'inherit',
                lineHeight: 1.6,
              }}
            />

            {error && (
              <div className="text-sm mt-3" style={{ color: '#e51b24' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!text.trim() || isLoading}
              className="w-full rounded-xl font-bold text-white mt-5"
              style={{
                background: text.trim() && !isLoading ? '#00467f' : '#aaa',
                padding: '14px 24px',
                fontSize: 14,
                letterSpacing: 0.5,
                cursor: text.trim() && !isLoading ? 'pointer' : 'not-allowed',
                border: 'none',
                fontFamily: 'inherit',
              }}
            >
              {isLoading ? (
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
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Extracting quote data...
                </span>
              ) : (
                'Extract & Generate Quote →'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
