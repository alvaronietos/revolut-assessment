// Static FX snapshot to GBP, identical to analysis/common.py. Currencies not
// listed here (exotic fiat and crypto) convert to 0 and are counted apart:
// crypto amounts are not expressed in minor units, so a naive amount/100*rate
// would poison every aggregate they touch.
export const FX_TO_GBP: Record<string, number> = {
  GBP: 1.0, EUR: 0.85, USD: 0.79, PLN: 0.20, RON: 0.17,
  CHF: 0.88, NOK: 0.075, AUD: 0.52, DKK: 0.114, SEK: 0.075,
  CZK: 0.034, JPY: 0.0052, CAD: 0.57, HUF: 0.0021,
};

// Currencies whose smallest unit is the major unit (no /100 division).
export const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK']);

/** GBP amount for a minor-unit value, or null when the currency is unmapped. */
export function toGbp(amountMinor: number, currency: string): number | null {
  const rate = FX_TO_GBP[currency];
  if (rate === undefined) return null;
  const major = ZERO_DECIMAL.has(currency) ? amountMinor : amountMinor / 100;
  return major * rate;
}
