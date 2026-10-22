import { useEffect, useState } from 'react'
import type { ClinicRow } from '../types'
import { fetchClinicRows } from '../lib/api'
import { useBrand } from '../contexts/BrandContext'
import { getAdminKey, setAdminKey, clearAdminKey } from '../lib/appMode'
import AddClinic from './AddClinic'
import TabBar from './TabBar'

/**
 * Clinic Admin — the only screen of the admin build.
 * Flow: enter admin password once (kept in this browser) → pick brand → paste clinic URL → pick photos → save.
 * A clinic that is already in the app switches to "add the doctors it doesn't list yet".
 * The password is verified by the server on every scrape/add call, so the agents' site cannot onboard clinics.
 */
export default function AdminApp() {
  const { config } = useBrand()
  const [key, setKey] = useState(getAdminKey())
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [done, setDone] = useState<{ clinic: string; warnings: string[] }[]>([])
  // Current Clinic App rows, so a clinic that is already in the app can get its missing doctors added
  const [rows, setRows] = useState<ClinicRow[]>([])
  useEffect(() => { fetchClinicRows().then(setRows).catch(() => setRows([])) }, [adding])

  const card = { boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }

  if (!key) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: config.pageBackground, padding: 32 }}>
        <form
          onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { setAdminKey(draft.trim()); setKey(draft.trim()) } }}
          className="bg-white rounded-xl p-7"
          style={{ ...card, width: 380 }}
        >
          <img src={config.logo} alt={config.name} style={{ height: 44, objectFit: 'contain', marginBottom: 14 }} />
          <h1 className="text-xl font-extrabold" style={{ color: config.primary, margin: 0 }}>Quote Generator — Clinic Admin</h1>
          <p className="text-sm mt-2 mb-4" style={{ color: '#888' }}>Enter the admin password to add clinics.</p>
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Admin password"
            autoFocus
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ border: '1.5px solid #e0e0e0' }}
          />
          <button
            type="submit"
            className="w-full mt-3 py-2 rounded-lg text-sm font-bold"
            style={{ background: config.primary, color: 'white', border: 'none', cursor: 'pointer' }}
          >
            Continue
          </button>
        </form>
      </div>
    )
  }

  if (adding) {
    return (
      <AddClinic
        agent={{ name: 'Yana (admin)', email: '', phone: '' }}
        rows={rows}
        onCancel={() => setAdding(false)}
        onDone={(clinic, warnings, message) => { setDone((d) => [{ clinic: message ?? clinic, warnings }, ...d]); setAdding(false) }}
      />
    )
  }

  return (
    <div className="min-h-screen" style={{ background: config.pageBackground, padding: 32 }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="text-center mb-6">
          <img src={config.logo} alt={config.name} style={{ height: 52, objectFit: 'contain', marginBottom: 12 }} />
          <h1 className="text-2xl font-extrabold" style={{ color: config.primary, margin: 0 }}>Quote Generator — Clinic Admin</h1>
          <p className="text-sm mt-2" style={{ color: '#888' }}>
            Add a clinic here and it appears in the agents' clinic list immediately. Paste a clinic that is already in the app to add the doctors it's missing.
          </p>
        </div>

        <div className="bg-white rounded-xl p-7" style={card}>
          <TabBar />
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="w-full py-3 rounded-lg text-sm font-bold"
            style={{ background: config.primary, color: 'white', border: 'none', cursor: 'pointer' }}
          >
            ＋ Add a {config.name} clinic from its profile page
          </button>

          {done.length > 0 && (
            <div className="mt-6">
              <div className="text-xs font-semibold mb-2" style={{ color: '#58585a' }}>ADDED THIS SESSION</div>
              {done.map((d, i) => (
                <div key={i} className="rounded-lg p-3 text-sm mb-2" style={{ background: d.warnings.length ? '#fff7e6' : '#eefbf1', border: `1px solid ${d.warnings.length ? '#f0c36d' : '#9fd9ad'}` }}>
                  <div style={{ fontWeight: 600 }}>{d.clinic}</div>
                  {d.warnings.map((w, j) => <div key={j} style={{ marginTop: 4 }}>{w}</div>)}
                </div>
              ))}
            </div>
          )}

          <div className="text-xs mt-6" style={{ color: '#aaa' }}>
            Rows go to the “Clinic App” tab of the Quote Automs sheet; photos and future quotes go to the clinic's folder under DD/MD Quote PDFs.
            {' '}
            <button type="button" onClick={() => { clearAdminKey(); setKey('') }} style={{ color: '#aaa', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}>
              Change password
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
