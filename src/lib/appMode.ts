// Build-time app mode. The same codebase ships as two sites:
//   agent (default) — quote generator for sales agents; clinics come from the sheet, no onboarding UI
//   admin           — clinic onboarding only (Yana); protected by ADMIN_PASSWORD on the server
export type AppMode = 'agent' | 'admin'
export const APP_MODE: AppMode = (import.meta.env.VITE_APP_MODE === 'admin' ? 'admin' : 'agent')
export const IS_ADMIN = APP_MODE === 'admin'

const KEY = 'qg_admin_key'
export function getAdminKey(): string { try { return localStorage.getItem(KEY) ?? '' } catch { return '' } }
export function setAdminKey(v: string): void { try { localStorage.setItem(KEY, v) } catch { /* ignore */ } }
export function clearAdminKey(): void { try { localStorage.removeItem(KEY) } catch { /* ignore */ } }
