import { useState } from 'react'
import type { AgentProfile } from '../types'
import { saveProfile } from '../lib/storage'

interface Props {
  initial: AgentProfile | null
  onSave: (profile: AgentProfile) => void
  onCancel?: () => void
}

export default function ProfileSetup({ initial, onSave, onCancel }: Props) {
  const [form, setForm] = useState<AgentProfile>(
    initial ?? { name: '', email: '', phone: '' }
  )
  const [errors, setErrors] = useState<Partial<AgentProfile>>({})

  function validate(): boolean {
    const e: Partial<AgentProfile> = {}
    if (!form.name.trim()) e.name = 'Required'
    if (!form.email.trim()) e.email = 'Required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Invalid email'
    if (!form.phone.trim()) e.phone = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    const profile: AgentProfile = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
    }
    saveProfile(profile)
    onSave(profile)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-navy rounded-full mb-4">
            <span className="text-white text-2xl">👤</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            {initial ? 'Edit Your Profile' : 'Set Up Your Agent Profile'}
          </h2>
          <p className="text-gray-500 mt-2 text-sm">
            Your details appear on every quote you generate. Saved locally — set once, never again.
          </p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">Your Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Didi Morales"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="label">Email Address</label>
              <input
                type="email"
                className="input-field"
                placeholder="e.g. didi@dentaldepartures.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="label">Phone Number</label>
              <input
                type="tel"
                className="input-field"
                placeholder="e.g. +1 959 300 2038"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
            </div>

            <div className="flex gap-3 pt-2">
              {onCancel && (
                <button type="button" onClick={onCancel} className="btn-secondary flex-1">
                  Cancel
                </button>
              )}
              <button type="submit" className="btn-primary flex-1">
                {initial ? 'Save Changes' : 'Save & Continue →'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
