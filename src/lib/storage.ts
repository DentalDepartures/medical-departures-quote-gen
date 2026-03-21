import type { AgentProfile } from '../types'

const PROFILE_KEY = 'dd_agent_profile'
const API_KEY_KEY = 'dd_api_key'

export function getProfile(): AgentProfile | null {
  try {
    const stored = localStorage.getItem(PROFILE_KEY)
    return stored ? (JSON.parse(stored) as AgentProfile) : null
  } catch {
    return null
  }
}

export function saveProfile(profile: AgentProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

export function getApiKey(): string | null {
  return localStorage.getItem(API_KEY_KEY)
}

export function saveApiKey(key: string): void {
  localStorage.setItem(API_KEY_KEY, key)
}

export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_KEY)
}
