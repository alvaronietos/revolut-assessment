// Synthetic demo dataset: ~40k rows, ~800 users, with a handful of planted
// suspicious accounts (mules, card testers, a corridor dominator and one
// amount outlier) so the demo dashboard has something to find. Fully seeded,
// so every visitor sees the same data.

const CURRENCIES = ['GBP', 'GBP', 'GBP', 'EUR', 'EUR', 'USD', 'PLN'];
const RESIDENCES = ['GB', 'GB', 'GB', 'GB', 'FR', 'ES', 'PL', 'IE', 'LT', 'DE', 'PT', 'RO'];
const MERCHANTS = ['GBR', 'GBR', 'FRA', 'ESP', 'USA', 'IRL', 'NLD', 'POL', 'ITA', 'DEU', 'LTU'];
const KYC_POOL = ['PASSED', 'PASSED', 'PASSED', 'PASSED', 'PASSED', 'PASSED', 'NONE', 'PENDING', 'FAILED'];

function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function generateDemoCsv(rows = 40_000): string {
  const rng = makeRng(0x5eed);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const id = (n: number) => `demo-user-${String(n).padStart(4, '0')}`;

  const lines: string[] = ['USER_ID,TYPE,AMOUNT,CURRENCY,MERCHANT_COUNTRY,KYC,BIRTH_YEAR,COUNTRY,IS_FRAUD'];
  const nUsers = 800;
  const users = Array.from({ length: nUsers }, (_, i) => ({
    id: id(i),
    residence: pick(RESIDENCES),
    kyc: pick(KYC_POOL),
    birthYear: 1950 + Math.floor(rng() * 50),
  }));

  const push = (
    u: (typeof users)[number],
    type: string,
    amountMinor: number,
    currency: string,
    merchant: string,
    fraud: boolean,
  ) => {
    lines.push(
      `${u.id},${type},${Math.round(amountMinor)},${currency},${merchant},${u.kyc},${u.birthYear},${u.residence},${fraud ? 'True' : 'False'}`,
    );
  };

  // Background traffic.
  const organic = rows - 2_600;
  for (let i = 0; i < organic; i++) {
    const u = users[Math.floor(rng() * nUsers)];
    const r = rng();
    if (r < 0.6) push(u, 'CARD_PAYMENT', 100 + rng() * 90_000, pick(CURRENCIES), pick(MERCHANTS), false);
    else if (r < 0.8) push(u, 'TOPUP', 1_000 + rng() * 200_000, pick(CURRENCIES), '', false);
    else if (r < 0.9) push(u, 'P2P', 500 + rng() * 40_000, pick(CURRENCIES), '', false);
    else if (r < 0.97) push(u, 'ATM', 2_000 + rng() * 20_000, pick(CURRENCIES), pick(MERCHANTS), false);
    else push(u, 'BANK_TRANSFER', 5_000 + rng() * 150_000, pick(CURRENCIES), '', false);
  }

  // Planted mules: money in via top-up, straight out via ATM.
  for (let m = 0; m < 5; m++) {
    const u = { id: id(900 + m), residence: 'GB', kyc: 'PASSED', birthYear: 1992 + m };
    for (let i = 0; i < 30; i++) push(u, 'TOPUP', 50_000 + rng() * 50_000, 'GBP', '', true);
    for (let i = 0; i < 28; i++) push(u, 'ATM', 45_000 + rng() * 50_000, 'GBP', 'GBR', true);
  }

  // Planted card testers: dozens of sub-£1 card payments.
  for (let t = 0; t < 3; t++) {
    const u = { id: id(920 + t), residence: 'FR', kyc: 'PASSED', birthYear: 1996 + t };
    for (let i = 0; i < 60; i++) push(u, 'CARD_PAYMENT', 1 + rng() * 80, 'EUR', pick(MERCHANTS), true);
    for (let i = 0; i < 6; i++) push(u, 'CARD_PAYMENT', 20_000 + rng() * 40_000, 'EUR', pick(MERCHANTS), true);
  }

  // Corridor dominator: one account owns a small DE -> CY corridor.
  const dom = { id: id(940), residence: 'DE', kyc: 'PASSED', birthYear: 1988 };
  for (let i = 0; i < 70; i++) push(dom, 'CARD_PAYMENT', 10_000 + rng() * 30_000, 'EUR', 'CYP', true);
  for (let e = 0; e < 4; e++) {
    const u = { id: id(941 + e), residence: 'DE', kyc: 'PASSED', birthYear: 1970 + e };
    for (let i = 0; i < 3; i++) push(u, 'CARD_PAYMENT', 8_000 + rng() * 20_000, 'EUR', 'CYP', false);
  }

  // One outlier transfer that dwarfs everything else.
  const whale = { id: id(950), residence: 'ES', kyc: 'FAILED', birthYear: 1975 };
  push(whale, 'BANK_TRANSFER', 25_000_000, 'EUR', '', true);
  for (let i = 0; i < 9; i++) push(whale, 'TOPUP', 100_000 + rng() * 400_000, 'EUR', '', true);

  return lines.join('\n');
}
