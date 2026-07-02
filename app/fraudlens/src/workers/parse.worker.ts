// Streaming CSV parse + aggregation. Raw rows are never retained beyond two
// capped reservoir samples; everything else is accumulated on the fly so a
// 700k-row file stays well under the memory budget.

import * as Papa from 'papaparse';

import { toGbp } from '../lib/fx.ts';
import { normalizeMerchantCountry } from '../lib/merchantCountry.ts';
import {
  TX_TYPES,
  type AggregateResult,
  type CanonicalRow,
  type ColumnMap,
  type CorridorAgg,
  type CountryAggPosted,
  type MainToWorker,
  type Totals,
  type TxType,
  type UserAgg,
  type WorkerToMain,
} from '../types.ts';

const TX_SAMPLE_CAP = 5_000;
const AMOUNT_SAMPLE_CAP = 50_000;
const PROGRESS_EVERY = 25_000;

interface CountryAccum {
  txCount: number;
  sumGbp: number;
  userIds: Set<string>;
  perUserTx: Map<string, number>;
  fraudTxCount: number;
  byType: Record<TxType, number>;
}

function emptyByTypeCount(): Record<TxType, number> {
  const r = {} as Record<TxType, number>;
  for (const t of TX_TYPES) r[t] = 0;
  return r;
}

function emptyByTypeAgg(): Record<TxType, { count: number; sumGbp: number; maxGbp: number }> {
  const r = {} as Record<TxType, { count: number; sumGbp: number; maxGbp: number }>;
  for (const t of TX_TYPES) r[t] = { count: 0, sumGbp: 0, maxGbp: 0 };
  return r;
}

// Deterministic 32-bit generator for the reservoir sampling (keeps repeated
// runs of the same file comparable).
function makeRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function normalizeType(raw: string | undefined): TxType {
  const t = (raw ?? '').toUpperCase().trim() as TxType;
  return (TX_TYPES as readonly string[]).includes(t) && t !== 'OTHER' ? t : 'OTHER';
}

function parseBool(raw: string | undefined): boolean {
  const v = (raw ?? '').toLowerCase().trim();
  return v === 'true' || v === '1' || v === 'yes' || v === 'y';
}

function run(file: File | string, columnMap: ColumnMap) {
  const rng = makeRng(0xf5a17);
  const users = new Map<string, UserAgg>();
  const residence = new Map<string, CountryAccum>();
  const merchant = new Map<string, CountryAccum>();
  const corridors = new Map<string, CorridorAgg & { userIds: Set<string> }>();
  const txSample: CanonicalRow[] = [];
  const amountSamples: Record<TxType, number[]> = {} as Record<TxType, number[]>;
  const amountSeen: Record<TxType, number> = {} as Record<TxType, number>;
  for (const t of TX_TYPES) {
    amountSamples[t] = [];
    amountSeen[t] = 0;
  }

  const totals: Totals = {
    rows: 0,
    users: 0,
    sumGbp: 0,
    unconvertedTx: 0,
    unparsedMerchant: 0,
    merchantValues: 0,
    nonPositiveAmounts: 0,
    byType: emptyByTypeCount(),
    hasLabels: columnMap.IS_FRAUD !== null,
    hasKyc: columnMap.KYC !== null,
    hasMerchant: columnMap.MERCHANT_COUNTRY !== null,
    hasBirthYear: columnMap.BIRTH_YEAR !== null,
  };

  const totalBytes = typeof file === 'string' ? file.length : file.size;
  let lastProgressAt = 0;

  const countryBucket = (map: Map<string, CountryAccum>, iso2: string): CountryAccum => {
    let b = map.get(iso2);
    if (!b) {
      b = {
        txCount: 0,
        sumGbp: 0,
        userIds: new Set(),
        perUserTx: new Map(),
        fraudTxCount: 0,
        byType: emptyByTypeCount(),
      };
      map.set(iso2, b);
    }
    return b;
  };

  const handleRow = (raw: Record<string, string>, bytesRead: number) => {
    const userId = raw[columnMap.USER_ID!];
    if (!userId) return;

    const type = normalizeType(raw[columnMap.TYPE!]);
    const currency = (raw[columnMap.CURRENCY!] ?? '').toUpperCase().trim();
    const amountMinor = Number(raw[columnMap.AMOUNT!]);
    const res = (raw[columnMap.COUNTRY!] ?? '').toUpperCase().trim();
    const gbp = Number.isFinite(amountMinor) ? toGbp(amountMinor, currency) : null;

    const rawMerchant = columnMap.MERCHANT_COUNTRY ? raw[columnMap.MERCHANT_COUNTRY] : null;
    let mer: string | null = null;
    if (rawMerchant !== null && rawMerchant !== undefined && rawMerchant.trim() !== '') {
      totals.merchantValues += 1;
      mer = normalizeMerchantCountry(rawMerchant);
      if (mer === null) totals.unparsedMerchant += 1;
    }

    const kyc = columnMap.KYC ? (raw[columnMap.KYC] ?? '').toUpperCase().trim() || null : null;
    const birthYearRaw = columnMap.BIRTH_YEAR ? Number(raw[columnMap.BIRTH_YEAR]) : NaN;
    const birthYear = Number.isFinite(birthYearRaw) ? birthYearRaw : null;
    const isFraud = columnMap.IS_FRAUD ? parseBool(raw[columnMap.IS_FRAUD]) : null;

    totals.rows += 1;
    totals.byType[type] += 1;

    let u = users.get(userId);
    if (!u) {
      u = {
        userId,
        residence: res,
        kyc,
        birthYear,
        txCount: 0,
        sumGbp: 0,
        maxGbp: 0,
        byType: emptyByTypeAgg(),
        merchantCountries: {},
        tinyCardPayments: 0,
        unconvertedTx: 0,
        fraudTxCount: 0,
      };
      users.set(userId, u);
    }
    u.txCount += 1;
    u.byType[type].count += 1;
    if (gbp === null) {
      totals.unconvertedTx += 1;
      u.unconvertedTx += 1;
    } else {
      totals.sumGbp += gbp;
      u.sumGbp += gbp;
      u.byType[type].sumGbp += gbp;
      if (gbp > u.byType[type].maxGbp) u.byType[type].maxGbp = gbp;
      if (gbp > u.maxGbp) u.maxGbp = gbp;
      if (type === 'CARD_PAYMENT' && gbp < 1) u.tinyCardPayments += 1;
      if (gbp <= 0) {
        totals.nonPositiveAmounts += 1;
      } else {
        // Reservoir sample of positive GBP amounts per type.
        amountSeen[type] += 1;
        const pool = amountSamples[type];
        if (pool.length < AMOUNT_SAMPLE_CAP) {
          pool.push(gbp);
        } else {
          const j = Math.floor(rng() * amountSeen[type]);
          if (j < AMOUNT_SAMPLE_CAP) pool[j] = gbp;
        }
      }
    }
    if (isFraud) u.fraudTxCount += 1;

    if (res) {
      const b = countryBucket(residence, res);
      b.txCount += 1;
      if (gbp !== null) b.sumGbp += gbp;
      b.userIds.add(userId);
      b.perUserTx.set(userId, (b.perUserTx.get(userId) ?? 0) + 1);
      if (isFraud) b.fraudTxCount += 1;
      b.byType[type] += 1;
    }
    if (mer) {
      u.merchantCountries[mer] = (u.merchantCountries[mer] ?? 0) + 1;
      const b = countryBucket(merchant, mer);
      b.txCount += 1;
      if (gbp !== null) b.sumGbp += gbp;
      b.userIds.add(userId);
      b.perUserTx.set(userId, (b.perUserTx.get(userId) ?? 0) + 1);
      if (isFraud) b.fraudTxCount += 1;
      b.byType[type] += 1;
      if (res) {
        const key = `${res}>${mer}`;
        let c = corridors.get(key);
        if (!c) {
          c = { txCount: 0, userCount: 0, fraudTxCount: 0, userIds: new Set() };
          corridors.set(key, c);
        }
        c.txCount += 1;
        c.userIds.add(userId);
        if (isFraud) c.fraudTxCount += 1;
      }
    }

    // Reservoir sample of canonical rows for the country drawer.
    if (txSample.length < TX_SAMPLE_CAP) {
      txSample.push({ userId, type, amountGbp: gbp ?? 0, currency, residence: res, merchant: mer, kyc, birthYear, isFraud });
    } else {
      const j = Math.floor(rng() * totals.rows);
      if (j < TX_SAMPLE_CAP) {
        txSample[j] = { userId, type, amountGbp: gbp ?? 0, currency, residence: res, merchant: mer, kyc, birthYear, isFraud };
      }
    }

    if (totals.rows - lastProgressAt >= PROGRESS_EVERY) {
      lastProgressAt = totals.rows;
      post({ type: 'progress', rowsParsed: totals.rows, bytesRead, totalBytes });
    }
  };

  Papa.parse<Record<string, string>>(file as never, {
    header: true,
    skipEmptyLines: true,
    chunk: (chunk, parser) => {
      try {
        const cursor = chunk.meta.cursor ?? 0;
        for (const row of chunk.data) handleRow(row, cursor);
      } catch (err) {
        parser.abort();
        post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    },
    complete: () => {
      totals.users = users.size;
      const postCountry = (map: Map<string, CountryAccum>) => {
        const out = new Map<string, CountryAggPosted>();
        for (const [iso2, b] of map) {
          let topUserId = '';
          let topTx = 0;
          for (const [uid, n] of b.perUserTx) {
            if (n > topTx) {
              topTx = n;
              topUserId = uid;
            }
          }
          out.set(iso2, {
            iso2,
            txCount: b.txCount,
            sumGbp: b.sumGbp,
            userCount: b.userIds.size,
            fraudTxCount: b.fraudTxCount,
            byType: b.byType,
            topUserId,
            topUserTxShare: b.txCount > 0 ? topTx / b.txCount : 0,
          });
        }
        return out;
      };
      const corridorsOut: Record<string, CorridorAgg> = {};
      for (const [key, c] of corridors) {
        corridorsOut[key] = { txCount: c.txCount, userCount: c.userIds.size, fraudTxCount: c.fraudTxCount };
      }
      const result: AggregateResult = {
        users,
        residenceCountries: postCountry(residence),
        merchantCountries: postCountry(merchant),
        corridors: corridorsOut,
        txSample,
        amountSamples,
        totals,
      };
      post({ type: 'complete', result });
    },
    error: (err: Error) => post({ type: 'error', message: err.message }),
  });
}

function post(msg: WorkerToMain) {
  (self as unknown as Worker).postMessage(msg);
}

// On-demand: stream the file again and keep only one user's raw rows. Memory
// stays tiny (a single user has at most a few thousand transactions), so this
// avoids retaining every row up front just to support the drill-down.
function fetchUser(file: File | string, userIdColumn: string, userId: string) {
  const rows: Record<string, string>[] = [];
  let headers: string[] = [];
  Papa.parse<Record<string, string>>(file as never, {
    header: true,
    skipEmptyLines: true,
    chunk: (chunk) => {
      if (headers.length === 0 && chunk.meta.fields) headers = chunk.meta.fields;
      for (const row of chunk.data) {
        if (row[userIdColumn] === userId) rows.push(row);
      }
    },
    complete: () => post({ type: 'userRows', userId, headers, rows }),
    error: (err: Error) => post({ type: 'error', message: err.message }),
  });
}

self.onmessage = (e: MessageEvent<MainToWorker>) => {
  try {
    if (e.data.type === 'parse') {
      run(e.data.file, e.data.columnMap);
    } else if (e.data.type === 'fetchUser') {
      fetchUser(e.data.file, e.data.userIdColumn, e.data.userId);
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
