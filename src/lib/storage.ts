import type { AgentProfile } from '../types'

const PROFILE_KEY = 'dd_agent_profile'
const API_KEY_KEY = 'dd_api_key'
const OPS_AGENT_KEY = 'qg_ops_agent'
const OPS_NAMES_KEY = 'qg_ops_agent_names'

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
  return sessionStorage.getItem(API_KEY_KEY)
}

export function saveApiKey(key: string): void {
  sessionStorage.setItem(API_KEY_KEY, key)
}

export function clearApiKey(): void {
  sessionStorage.removeItem(API_KEY_KEY)
}

/** The ops agent working on this computer — chosen once, then remembered. */
export function getOpsAgent(): string {
  try {
    return localStorage.getItem(OPS_AGENT_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveOpsAgent(name: string): void {
  try {
    localStorage.setItem(OPS_AGENT_KEY, name.trim())
  } catch { /* private mode — the name is just asked again next time */ }
}

/** Ops agent names already used on this computer, for the "Ops Agent" dropdown. */
export function getOpsNames(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(OPS_NAMES_KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((n) => typeof n === 'string' && n.trim()) : []
  } catch {
    return []
  }
}

export function addOpsName(name: string): string[] {
  const n = name.trim()
  const list = getOpsNames()
  if (n && !list.some((x) => x.toLowerCase() === n.toLowerCase())) list.push(n)
  try {
    localStorage.setItem(OPS_NAMES_KEY, JSON.stringify(list))
  } catch { /* private mode */ }
  return list
}
