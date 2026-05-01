export interface AgentProfile {
  name: string
  email: string
  phone: string
}

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

  // Package
  inclusions: string[]
  exclusions: string[]

  // Doctor (non-editable — from doctor selection)
  surgeonName: string | null
  accreditations: string | null

  // Notes
  importantNotes: string | null

  // PDF generation — template URL from clinic row (not editable)
  templatePdfUrl: string | null
}

export interface ClinicRow {
  brand: 'DD' | 'MD'
  clinic_name: string
  location: string
  google_folder: string
  clinic_profile_url: string
  surgeon_name: string
  accreditations: string
  status: 'active' | 'inactive' | 'error'
  notes: string
  template_pdf_url: string
}

export interface SelectedClinic {
  clinic_name: string
  location: string
  google_folder: string
  clinic_profile_url: string
  template_pdf_url: string
}

export interface SelectedDoctor {
  surgeon_name: string
  accreditations: string
  template_pdf_url: string
}

export type AppStep = 'paste' | 'review' | 'done'
