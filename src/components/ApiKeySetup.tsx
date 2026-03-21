import { useState } from 'react'
import { saveApiKey } from '../lib/storage'

interface Props {
  onSave: () => void
  onCancel: () => void
}

export default function ApiKeySetup({ onSave, onCancel }: Props) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = key.trim()
    if (!trimmed.startsWith('sk-ant-')) {
      setError('Key should start with sk-ant-')
      return
    }
    saveApiKey(trimmed)
    onSave()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Anthropic API Key Required</h2>
        <p className="text-sm text-gray-500 mb-4">
          The server proxy isn't available in this environment. Enter your Anthropic API key
          to extract quote data directly from your browser.
          <br />
          <span className="text-amber-600 font-medium">
            Your key is stored locally and never sent to our servers.
          </span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Anthropic API Key</label>
            <input
              type="password"
              className="input-field font-mono"
              placeholder="sk-ant-api03-..."
              value={key}
              onChange={(e) => {
                setKey(e.target.value)
                setError('')
              }}
              autoFocus
            />
            {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
          </div>

          <p className="text-xs text-gray-400">
            Get your key at{' '}
            <span className="font-mono">console.anthropic.com</span>. For production,
            deploy to Vercel with ANTHROPIC_API_KEY set — agents won't need their own keys.
          </p>

          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={!key.trim()}>
              Save Key & Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
