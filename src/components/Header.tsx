import type { AgentProfile } from '../types'

interface Props {
  profile: AgentProfile | null
  onEditProfile: () => void
}

export default function Header({ profile, onEditProfile }: Props) {
  return (
    <header className="bg-navy text-white shadow-md">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 flex items-center justify-center">
              {/* Red cross */}
              <div className="relative w-6 h-6">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-red-500 w-2 h-6 rounded-sm" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-red-500 w-6 h-2 rounded-sm" />
                </div>
              </div>
            </div>
          </div>
          <div>
            <div className="font-bold text-sm leading-tight tracking-wide">DENTAL</div>
            <div className="font-bold text-xs leading-tight tracking-widest text-blue-200">
              DEPARTURES
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-base font-semibold hidden sm:block text-blue-100">
          Quote Generator
        </h1>

        {/* Agent profile */}
        <div className="flex items-center gap-3">
          {profile ? (
            <button
              onClick={onEditProfile}
              className="flex items-center gap-2 text-sm text-blue-200 hover:text-white transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-navy-light flex items-center justify-center font-bold text-sm border border-blue-400">
                {profile.name.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:inline">{profile.name}</span>
              <span className="text-blue-300 text-xs">Edit</span>
            </button>
          ) : (
            <button
              onClick={onEditProfile}
              className="text-sm text-blue-200 hover:text-white transition-colors"
            >
              Set up profile
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
