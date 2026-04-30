import { useBrand } from '../contexts/BrandContext'
import type { Brand } from '../contexts/BrandContext'

const TABS: { brand: Brand; label: string; primary: string; primaryText: string }[] = [
  { brand: 'DD', label: 'Dental Departures', primary: '#52bdec', primaryText: '#58585a' },
  { brand: 'MD', label: 'Medical Departures', primary: '#00467f', primaryText: '#ffffff' },
]

export default function TabBar() {
  const { brand, setBrand, config } = useBrand()

  return (
    <div
      className="flex rounded-xl overflow-hidden mb-6"
      style={{ border: `2px solid ${config.primary}`, background: 'white' }}
    >
      {TABS.map((tab) => {
        const active = brand === tab.brand
        return (
          <button
            key={tab.brand}
            onClick={() => setBrand(tab.brand)}
            className="flex-1 py-3 text-sm font-bold transition-colors"
            style={{
              background: active ? tab.primary : 'white',
              color: active ? tab.primaryText : config.primary,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              letterSpacing: 0.3,
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
