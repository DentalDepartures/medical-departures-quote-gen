export interface AgentProfile {
  name: string
  email: string
  phone: string
}

export interface QuoteData {
  patientName: string | null
  quoteDate: string | null
  treatmentName: string | null
  clinicName: string | null
  clinicLocation: string | null
  clinicProfileUrl: string | null
  price: number | null
  currency: string
  reducedFrom: number | null
  savings: number | null
  inclusions: string[]
  exclusions: string[]
  surgeonName: string | null
  surgeonTitle: string | null
  accreditations: string | null
  importantNotes: string | null
  consultationRequired: boolean | null
  suggestedConsultTime: string | null
}

export type AppStep = 'profile' | 'paste' | 'review' | 'done'
