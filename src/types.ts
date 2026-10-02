export interface AgentProfile {
  name: string
  email: string
  phone: string
}

export type Brand = 'DD' | 'MD'

export interface QuoteData {
  // Patient
  patientName: string | null
  quoteDate: string | null  // DD/MM/YYYY, auto-set — not editable

  // Treatment
  treatmentName: string | null

  // Clinic (non-editable — from clinic selection)
  clinicName: string | null
  clinicLocation: string | null
  clinicProfileUrl: string | null

  // Pricing
  price: number | null
  currency: string
  pricePrefix: string | null  // e.g. "Starting from" for grouped option packages

  // Package
  inclusions: string[]
  exclusions: string[]

  // Doctor (non-editable — from doctor selection)
  surgeonName: string | null
  accreditations: string | null

  // Notes
  importantNotes: string | null

  // Images (Drive links or direct URLs) — drawn by the app
  clinicImageUrl: string | null
  beforeAfterImageUrl: string | null
  doctorImageUrl: string | null

  // Legacy per-clinic template override. Empty = use the brand template shipped with the app.
  templatePdfUrl: string | null

  // Drive — folder where finished quote PDFs are saved
  googleFolder: string | null

  // Set at generation time
  quoteId?: string
}

/** One row of the Clinic App sheet. Column order does not matter — rows are mapped by header name. */
export interface ClinicRow {
  brand: Brand
  clinic_name: string
  location: string
  google_folder: string
  clinic_profile_url: string
  surgeon_name: string
  accreditations: string
  status: 'active' | 'inactive' | 'error'
  notes: string
  template_pdf_url: string
  clinic_image_url: string
  before_after_image_url: string
  doctor_image_url: string
}

export interface SelectedClinic {
  clinic_name: string
  location: string
  google_folder: string
  clinic_profile_url: string
  template_pdf_url: string
  clinic_image_url: string
  before_after_image_url: string
}

export interface SelectedDoctor {
  surgeon_name: string
  accreditations: string
  template_pdf_url: string
  doctor_image_url: string
}

export const NO_DOCTOR = 'No Doctor'

export type AppStep = 'paste' | 'review' | 'done' | 'add-clinic'

// ── Add-clinic (scraped from the DD/MD profile page) ─────────────────────────
export interface ScrapedDoctor {
  name: string
  credentials: string
  imageUrl: string | null
}

export interface ScrapedClinic {
  brand: Brand
  profileUrl: string
  name: string
  location: string
  galleryImages: string[]
  beforeAfterImages: string[]
  doctors: ScrapedDoctor[]
}

export interface NewClinicPayload {
  brand: Brand
  clinicName: string
  location: string
  profileUrl: string
  clinicImageUrl: string | null
  beforeAfterImageUrl: string | null
  doctors: { name: string; credentials: string; imageUrl: string | null }[]
  agentName: string
  agentEmail: string
}
