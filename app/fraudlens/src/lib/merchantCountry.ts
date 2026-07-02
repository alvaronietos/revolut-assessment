// Normalises the messy merchant-country field to ISO2.
//
// The raw field mixes ISO3 codes, US state / Canadian province codes and
// URL-encoded free text with the country tucked at the end ("PRAHA%201
// ...CZE", occasionally encoded twice). Two-letter codes are checked against
// the state sets BEFORE ISO2 on purpose: in this kind of acquirer data "CA"
// is California and "ON" is Ontario, never Canada.

import { CA_PROVINCES, ISO3_TO_ISO2, US_STATES, VALID_ISO2 } from './countries.ts';

const TRAILING_ALPHA = /([A-Za-z]+)[^A-Za-z]*$/;

/** Returns an ISO2 code, or null when the value is missing or unparseable. */
export function normalizeMerchantCountry(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (s === '') return null;

  if (s.length > 3) {
    for (let i = 0; i < 3; i++) {
      let decoded = s;
      try {
        decoded = decodeURIComponent(s);
      } catch {
        break;
      }
      if (decoded === s) break;
      s = decoded;
    }
    const match = TRAILING_ALPHA.exec(s);
    if (!match) return null;
    const token = match[1].toUpperCase();
    if (token.length >= 3) {
      return ISO3_TO_ISO2[token.slice(-3)] ?? null;
    }
    s = token; // trailing 2-letter token, fall through to the state logic
  }

  s = s.toUpperCase();
  if (s.length === 2) {
    if (US_STATES.has(s)) return 'US';
    if (CA_PROVINCES.has(s)) return 'CA';
    if (VALID_ISO2.has(s)) return s;
    return null;
  }
  if (s.length === 3) {
    return ISO3_TO_ISO2[s] ?? null;
  }
  return null;
}
