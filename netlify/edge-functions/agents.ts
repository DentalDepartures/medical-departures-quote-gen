// Edge Function — returns the sales agents for the "Choose the sales agent" dropdown.
// Reads the Agents tab (columns matched BY HEADER NAME: name, email, phone), so Yana can add or
// change agents in the sheet without a redeploy. The built-in agents below are always in the list:
// the sheet's version of an agent wins (matched by email), and any built-in agent missing from the
// sheet is added after the sheet's agents — the dropdown should never lose anyone or break quotes.
// Env: GOOGLE_SERVICE_ACCOUNT_JSON, CLINIC_APP_SPREADSHEET_ID, AGENTS_TAB (optional, default "Agents")

import { CORS, SCOPES, env, getAccessToken, json, rowsToObjects, sheetsGet } from '../edge-lib/google.ts'

const DEFAULT_AGENTS = [
  { name: 'Aileen Castro', email: 'aileen.castro@dentaldepartures.com', phone: '+66 2 508 8449' },
  { name: 'Celeste Aguirre', email: 'celeste.aguirre@dentaldepartures.com', phone: '+52 1 33 4162 2222' },
  { name: 'Grant Butler', email: 'grant.butler@dentaldepartures.com', phone: '+1 (866) 799-4028' },
  { name: 'Melea Soriano', email: 'melea.soriano@medicaldepartures.com', phone: '+44 1633 906816' },
  { name: 'Amira Dup-et', email: 'amira.dupet@medicaldepartures.com', phone: '+1 (959) 300-2038' },
  { name: 'Moffy Suson', email: 'mornjatte.suson@medicaldepartures.com', phone: '+17058051606' },
]

export default async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  try {
    const spreadsheetId = env('CLINIC_APP_SPREADSHEET_ID')
    const tab = env('AGENTS_TAB', 'Agents')
    const token = await getAccessToken(SCOPES.sheetsRead)
    const agents = rowsToObjects(await sheetsGet(token, spreadsheetId, `${tab}!A:Z`))
      .map((o) => ({ name: o.name ?? '', email: o.email ?? '', phone: o.phone ?? '' }))
      .filter((a) => a.name)
    if (!agents.length) return json({ agents: DEFAULT_AGENTS, source: 'built-in' })
    const have = new Set(agents.map((a) => a.email.trim().toLowerCase()).filter(Boolean))
    const missing = DEFAULT_AGENTS.filter((a) => !have.has(a.email.toLowerCase()))
    return json({ agents: [...agents, ...missing], source: missing.length ? 'sheet + built-in' : 'sheet' })
  } catch (err) {
    return json({ agents: DEFAULT_AGENTS, source: 'built-in', warning: String(err) })
  }
}
