// Where the app runs. The Netlify sites leave these unset; the GitHub Pages test build sets them.
//   VITE_API_BASE   — origin of the API (e.g. https://dental-medical-departures-quote-gen.netlify.app); '' = same origin
//   VITE_PDF_DESIGN — 'v3' draws the new flowing layout instead of filling the PDF templates
//   VITE_TEST_MODE  — '1' = quotes are only downloaded, never saved to Drive or logged in the Quotes Tracker

export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')
export const PDF_DESIGN: 'v3' | 'template' = import.meta.env.VITE_PDF_DESIGN === 'v3' ? 'v3' : 'template'
export const TEST_MODE = import.meta.env.VITE_TEST_MODE === '1'

/** URL of an API route, e.g. api('/api/clinics'). */
export const api = (path: string): string => `${API_BASE}${path}`

/** URL of a file in public/, honouring the build's base path (GitHub Pages serves the app from a sub-folder). */
export const asset = (path: string): string => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
