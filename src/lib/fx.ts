// Approximate USD and EUR for quotes priced in another currency (IDR, THB, MXN …), shown under the price.
// Daily rates from open.er-api.com (free, no key, all currencies the app offers). If the rates can't be
// loaded the quote simply has no approximate line — it never blocks the PDF.

let rates: Promise<Record<string, number> | null> | null = null

function loadRates(): Promise<Record<string, number> | null> {
  rates ??= fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d?.result === 'success' && d.rates ? (d.rates as Record<string, number>) : null))
    .catch(() => null)
    .then((r) => {
      if (!r) rates = null // try again next time
      return r
    })
  return rates
}

/** Round to a friendly "approximately" number: whole units, tens from 1,000 up. */
function approx(n: number): string {
  const step = n >= 1000 ? 10 : 1
  return (Math.round(n / step) * step).toLocaleString('en-US')
}

/** "Approx. USD 248 · EUR 221", or null for USD/EUR quotes, no price, or unknown currency. */
export async function approxUsdEur(price: number | null | undefined, currency: string | null | undefined): Promise<string | null> {
  const cur = (currency || '').trim().toUpperCase()
  if (price == null || !(price > 0) || !cur || cur === 'USD' || cur === 'EUR') return null
  const r = await loadRates()
  const perUsd = r?.[cur]
  if (!r || !perUsd || !r.EUR) return null
  const usd = price / perUsd
  return `Approx. USD ${approx(usd)} · EUR ${approx(usd * r.EUR)}`
}
