import { createContext, useContext, useState } from 'react'

export type Brand = 'DD' | 'MD'

export interface BrandConfig {
  brand: Brand
  logo: string
  primary: string
  primaryText: string
  accent: string
  neutral: string
  pageBackground: string
  name: string
}

export const BRAND_CONFIGS: Record<Brand, BrandConfig> = {
  DD: {
    brand: 'DD',
    logo: '/dd-logo.png',
    primary: '#52bdec',
    primaryText: '#58585a',
    accent: '#f5f5f5',
    neutral: '#58585a',
    pageBackground: 'linear-gradient(135deg, #e8f6fd 0%, #f0f8ff 100%)',
    name: 'Dental Departures',
  },
  MD: {
    brand: 'MD',
    logo: '/md-logo.png',
    primary: '#00467f',
    primaryText: '#ffffff',
    accent: '#e51b24',
    neutral: '#9eb0cf',
    pageBackground: 'linear-gradient(135deg, #ebf1f9 0%, #f0f4f8 100%)',
    name: 'Medical Departures',
  },
}

interface BrandContextValue {
  config: BrandConfig
  brand: Brand
  setBrand: (b: Brand) => void
}

const BrandContext = createContext<BrandContextValue | null>(null)

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = useState<Brand>('DD')
  return (
    <BrandContext.Provider value={{ config: BRAND_CONFIGS[brand], brand, setBrand }}>
      {children}
    </BrandContext.Provider>
  )
}

export function useBrand() {
  const ctx = useContext(BrandContext)
  if (!ctx) throw new Error('useBrand must be used inside BrandProvider')
  return ctx
}
