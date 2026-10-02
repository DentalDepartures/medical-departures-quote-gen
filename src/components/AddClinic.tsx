import { useState } from 'react'
import type { AgentProfile, ScrapedClinic, NewClinicPayload } from '../types'
import { useBrand } from '../contexts/BrandContext'
import { scrapeClinic, addClinic } from '../lib/api'
import { proxiedUrl } from '../lib/imagePrep'

interface Props {
  agent: AgentProfile
  onDone: (clinicName: string, warnings: string[]) => void
  onCancel: () => void
}

interface DoctorDraft {
  include: boolean
  name: string
  credentials: string
  imageUrl: string | null   // https URL from the profile page, a data: URI for an upload, or null for no photo
  candidate: string | null  // the headshot found on the page (so "use page photo" can be restored)
}

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_UPLOAD_BYTES) { reject(new Error('Image is larger than 6 MB')); return }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

function thumbSrc(url: string | null): string | undefined {
  if (!url) return undefined
  return url.startsWith('data:') ? url : proxiedUrl(url)
}

export default function AddClinic({ agent, onDone, onCancel }: Props) {
  const { config, brand } = useBrand()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scraped, setScraped] = useState<ScrapedClinic | null>(null)

  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [clinicImage, setClinicImage] = useState<string | null>(null)
  const [beforeAfter, setBeforeAfter] = useState<string | null>(null)
  const [doctors, setDoctors] = useState<DoctorDraft[]>([])

  async function handleFetch(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const u = url.trim()
    if (!u) { setError('Paste the clinic profile URL first'); return }
    setLoading(true)
    try {
      const data = await scrapeClinic(u)
      if (data.brand !== brand) {
        setError(`That is a ${data.brand === 'DD' ? 'Dental' : 'Medical'} Departures page — switch to the ${data.brand} tab first.`)
        return
      }
      setScraped(data)
      setName(data.name)
      setLocation(data.location)
      setClinicImage(data.galleryImages[0] ?? null)
      setBeforeAfter(null) // judgement call — never auto-pick the before/after
      setDoctors(data.doctors.map((d) => ({ include: true, name: d.name, credentials: d.credentials, imageUrl: d.imageUrl, candidate: d.imageUrl })))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleUpload(file: File | undefined, apply: (dataUri: string) => void) {
    if (!file) return
    try {
      apply(await fileToDataUri(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleSave() {
    setError(null)
    if (!scraped) return
    if (!name.trim()) { setError('Clinic name is required'); return }
    if (!location.trim()) { setError('Location is required (City, Country)'); return }
    const chosenDoctors = doctors.filter((d) => d.include && d.name.trim())
    const payload: NewClinicPayload = {
      brand,
      clinicName: name.trim(),
      location: location.trim(),
      profileUrl: scraped.profileUrl,
      clinicImageUrl: clinicImage,
      beforeAfterImageUrl: beforeAfter,
      doctors: chosenDoctors.map((d) => ({ name: d.name.trim(), credentials: d.credentials.trim(), imageUrl: d.imageUrl })),
      agentName: agent.name,
      agentEmail: agent.email,
    }
    setSaving(true)
    try {
      const result = await addClinic(payload)
      onDone(payload.clinicName, result.warnings ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const card: React.CSSProperties = { boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }
  const input: React.CSSProperties = {
    border: '1.5px solid #e0e0e0', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
  }
  const sectionTitle: React.CSSProperties = { color: config.primary }

  function Thumb({ src, selected, onClick, label }: { src: string; selected: boolean; onClick: () => void; label?: string }) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={label}
        style={{
          width: 108, height: 80, borderRadius: 8, overflow: 'hidden', padding: 0, cursor: 'pointer', background: '#f3f3f3',
          border: selected ? `3px solid ${config.primary}` : '2px solid #e5e5e5', boxSizing: 'border-box',
        }}
      >
        <img src={src} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </button>
    )
  }

  function ImagePicker({
    title, hint, candidates, value, onChange, optional,
  }: {
    title: string; hint: string; candidates: string[]; value: string | null; onChange: (v: string | null) => void; optional?: boolean
  }) {
    const isUpload = !!value && value.startsWith('data:')
    return (
      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-xs font-bold tracking-widest uppercase" style={sectionTitle}>{title}</div>
          <div className="text-xs" style={{ color: '#888' }}>{hint}</div>
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          {optional && (
            <button
              type="button"
              onClick={() => onChange(null)}
              style={{
                width: 108, height: 80, borderRadius: 8, fontSize: 12, cursor: 'pointer', color: '#666', background: '#fafafa',
                border: value === null ? `3px solid ${config.primary}` : '2px dashed #d0d0d0', boxSizing: 'border-box',
              }}
            >
              No photo
            </button>
          )}
          {candidates.map((c) => (
            <Thumb key={c} src={proxiedUrl(c)} selected={value === c} onClick={() => onChange(c)} />
          ))}
          {isUpload && <Thumb src={value!} selected onClick={() => {}} label="Uploaded" />}
        </div>
        <label className="text-xs font-semibold" style={{ color: config.primary, cursor: 'pointer' }}>
          Upload a better photo instead
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => handleUpload(e.target.files?.[0], onChange)}
          />
        </label>
        {candidates.length === 0 && !isUpload && (
          <span className="text-xs ml-3" style={{ color: '#888' }}>No photos found on the page.</span>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: config.pageBackground, padding: 32 }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div className="text-center mb-6">
          <img src={config.logo} alt={config.name} style={{ height: 52, objectFit: 'contain', marginBottom: 12 }} />
          <h1 className="text-2xl font-extrabold" style={{ color: config.primary, margin: 0 }}>Add a clinic to {config.name} quotes</h1>
          <p className="text-sm mt-2" style={{ color: '#888' }}>
            Paste the clinic's {config.name} profile URL. Name, location, doctors and photos are read from the page — pick the photos you like and save.
          </p>
        </div>

        {/* Step 1: URL */}
        <div className="bg-white rounded-xl p-6 mb-5" style={card}>
          <form onSubmit={handleFetch} className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-semibold mb-1" style={{ color: '#58585a' }}>Clinic profile URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={brand === 'DD' ? 'https://www.dentaldepartures.com/dentist/…' : 'https://www.medicaldepartures.com/clinic/…'}
                style={input}
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg font-bold"
              style={{ background: loading ? '#aaa' : config.primary, color: config.primaryText, padding: '10px 18px', border: 'none', fontSize: 13, cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit' }}
            >
              {loading ? 'Reading page…' : scraped ? 'Re-read page' : 'Read clinic page'}
            </button>
          </form>
          {error && <div className="text-sm mt-3" style={{ color: '#e51b24' }}>{error}</div>}
        </div>

        {scraped && (
          <div className="bg-white rounded-xl p-6 mb-5" style={card}>
            {/* Clinic facts */}
            <div className="text-xs font-bold tracking-widest uppercase mb-3" style={sectionTitle}>Clinic</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#58585a' }}>Clinic name (as shown on the quote)</label>
                <input value={name} onChange={(e) => setName(e.target.value)} style={input} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#58585a' }}>Location (City, Country)</label>
                <input value={location} onChange={(e) => setLocation(e.target.value)} style={input} />
              </div>
            </div>

            <ImagePicker
              title="Clinic photo (page 1)"
              hint="Shown top-right on the first page"
              candidates={scraped.galleryImages}
              value={clinicImage}
              onChange={setClinicImage}
              optional
            />
            <ImagePicker
              title="Before / after photo (page 2)"
              hint="Optional — if none, the clinic photo is used again"
              candidates={scraped.beforeAfterImages}
              value={beforeAfter}
              onChange={setBeforeAfter}
              optional
            />

            {/* Doctors */}
            <div className="text-xs font-bold tracking-widest uppercase mb-1" style={sectionTitle}>Doctors</div>
            <p className="text-xs mb-3" style={{ color: '#888' }}>
              Each ticked doctor becomes a choice in the Doctor dropdown. A "No doctor" option is always added.
            </p>
            {doctors.length === 0 && <p className="text-sm mb-3" style={{ color: '#888' }}>No doctors found on the page. You can add one below.</p>}
            <div className="space-y-3 mb-3">
              {doctors.map((d, i) => (
                <div key={i} className="flex gap-3 items-start rounded-lg p-3" style={{ border: '1px solid #eee', opacity: d.include ? 1 : 0.55 }}>
                  <input
                    type="checkbox"
                    checked={d.include}
                    onChange={(e) => setDoctors((prev) => prev.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                    style={{ marginTop: 10 }}
                  />
                  <div style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', background: '#f3f3f3', flexShrink: 0 }}>
                    {d.imageUrl ? (
                      <img src={thumbSrc(d.imageUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="text-xs flex items-center justify-center h-full" style={{ color: '#aaa' }}>no photo</div>
                    )}
                  </div>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      value={d.name}
                      onChange={(e) => setDoctors((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      placeholder="Doctor name"
                      style={input}
                    />
                    <input
                      value={d.credentials}
                      onChange={(e) => setDoctors((prev) => prev.map((x, j) => (j === i ? { ...x, credentials: e.target.value } : x)))}
                      placeholder="Credentials (years of practice, associations)"
                      style={input}
                    />
                    <div className="text-xs flex gap-3 sm:col-span-2" style={{ color: config.primary }}>
                      <label style={{ cursor: 'pointer', fontWeight: 600 }}>
                        Upload headshot
                        <input
                          type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={(e) => handleUpload(e.target.files?.[0], (uri) => setDoctors((prev) => prev.map((x, j) => (j === i ? { ...x, imageUrl: uri } : x))))}
                        />
                      </label>
                      {d.candidate && d.imageUrl !== d.candidate && (
                        <button type="button" style={{ background: 'none', border: 'none', padding: 0, color: config.primary, cursor: 'pointer', fontWeight: 600 }}
                          onClick={() => setDoctors((prev) => prev.map((x, j) => (j === i ? { ...x, imageUrl: x.candidate } : x)))}>
                          Use page photo
                        </button>
                      )}
                      {d.imageUrl && (
                        <button type="button" style={{ background: 'none', border: 'none', padding: 0, color: '#888', cursor: 'pointer' }}
                          onClick={() => setDoctors((prev) => prev.map((x, j) => (j === i ? { ...x, imageUrl: null } : x)))}>
                          No photo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setDoctors((prev) => [...prev, { include: true, name: '', credentials: '', imageUrl: null, candidate: null }])}
              className="text-xs font-semibold"
              style={{ color: config.primary, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              ＋ Add a doctor manually
            </button>

            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 20, paddingTop: 20 }} className="flex gap-3 justify-end">
              <button type="button" onClick={onCancel} disabled={saving}
                className="rounded-lg font-semibold"
                style={{ background: '#f3f3f3', color: '#555', padding: '12px 18px', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="rounded-lg font-bold"
                style={{ background: saving ? '#aaa' : config.primary, color: config.primaryText, padding: '12px 22px', border: 'none', fontSize: 13, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving clinic…' : 'Save clinic & use it →'}
              </button>
            </div>
          </div>
        )}

        {!scraped && (
          <div className="text-center">
            <button type="button" onClick={onCancel} className="text-sm" style={{ color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}>
              ← Back to quote
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
