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
  clinicImage1: string | null
  clinicImage2: string | null

  // Pricing
  price: number | null
  currency: string

  // Package
  inclusions: string[]
  exclusions: string[]

  // Doctor (non-editable — from doctor selection)
  surgeonName: string | null
  surgeonTitle: string | null
  accreditations: string | null
  doctorPictureUrl: string | null

  // Notes
  importantNotes: string | null
}

export interface ClinicRow {
  brand: 'DD' | 'MD'
  clinic_name: string
  location: string
  google_folder: string
  clinic_profile_url: string
  clinic_image_1: string
  clinic_image_2: string
  surgeon_name: string
  surgeon_title: string
  accreditations: string
  doctor_picture_url: string
  status: 'active' | 'inactive' | 'error'
  notes: string
}

export interface SelectedClinic {
  clinic_name: string
  location: string
  google_folder: string
  clinic_profile_url: string
  clinic_image_1: string
  clinic_image_2: string
}

export interface SelectedDoctor {
  surgeon_name: string
  surgeon_title: string
  accreditations: string
  doctor_picture_url: string
}

export type AppStep = 'paste' | 'review' | 'done'
