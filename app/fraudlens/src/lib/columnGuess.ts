import { CANONICAL_FIELDS, type CanonicalField, type ColumnMap } from '../types.ts';

// Substring hints per canonical field, checked after exact name matches.
const HINTS: Record<CanonicalField, string[]> = {
  USER_ID: ['user', 'customer', 'account'],
  TYPE: ['type', 'category'],
  AMOUNT: ['amount', 'value', 'sum'],
  CURRENCY: ['currency', 'ccy'],
  COUNTRY: ['country'],
  MERCHANT_COUNTRY: ['merchant'],
  KYC: ['kyc', 'verification'],
  BIRTH_YEAR: ['birth', 'yob', 'dob'],
  IS_FRAUD: ['fraud', 'label'],
};

/** Best-effort mapping from CSV headers to canonical fields. */
export function guessColumnMap(headers: string[]): ColumnMap {
  const map = {} as ColumnMap;
  const taken = new Set<string>();
  const lower = headers.map((h) => h.toLowerCase().trim());

  // Pass 1: exact (case-insensitive) canonical names.
  for (const field of CANONICAL_FIELDS) {
    const idx = lower.indexOf(field.toLowerCase());
    if (idx >= 0 && !taken.has(headers[idx])) {
      map[field] = headers[idx];
      taken.add(headers[idx]);
    } else {
      map[field] = null;
    }
  }

  // Pass 2: substring hints. MERCHANT_COUNTRY before COUNTRY so the more
  // specific header does not get swallowed by the generic 'country' hint.
  const order: CanonicalField[] = [
    'USER_ID', 'TYPE', 'AMOUNT', 'CURRENCY', 'MERCHANT_COUNTRY',
    'COUNTRY', 'KYC', 'BIRTH_YEAR', 'IS_FRAUD',
  ];
  for (const field of order) {
    if (map[field]) continue;
    const hit = headers.find(
      (h, i) =>
        !taken.has(h) &&
        HINTS[field].some((hint) => lower[i].includes(hint)) &&
        // Do not send a merchant column into COUNTRY.
        !(field === 'COUNTRY' && lower[i].includes('merchant')),
    );
    if (hit) {
      map[field] = hit;
      taken.add(hit);
    }
  }
  return map;
}
