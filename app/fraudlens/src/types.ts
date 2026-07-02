// Shared contracts for the whole app: worker protocol, aggregate shapes and
// rule types. Everything that crosses a module boundary is defined here.

export const TX_TYPES = ['CARD_PAYMENT', 'TOPUP', 'P2P', 'ATM', 'BANK_TRANSFER', 'OTHER'] as const;
export type TxType = (typeof TX_TYPES)[number];

export const CANONICAL_FIELDS = [
  'USER_ID', 'TYPE', 'AMOUNT', 'CURRENCY', 'COUNTRY',
  'MERCHANT_COUNTRY', 'KYC', 'BIRTH_YEAR', 'IS_FRAUD',
] as const;
export type CanonicalField = (typeof CANONICAL_FIELDS)[number];
export const REQUIRED_FIELDS: CanonicalField[] = ['USER_ID', 'TYPE', 'AMOUNT', 'CURRENCY', 'COUNTRY'];

/** Maps each canonical field to a CSV header name (null = not present). */
export type ColumnMap = Record<CanonicalField, string | null>;

export interface CanonicalRow {
  userId: string;
  type: TxType;
  amountGbp: number;
  currency: string;
  residence: string;
  merchant: string | null;
  kyc: string | null;
  birthYear: number | null;
  isFraud: boolean | null;
}

export interface UserAgg {
  userId: string;
  residence: string;
  kyc: string | null;
  birthYear: number | null;
  txCount: number;
  sumGbp: number;
  maxGbp: number;
  byType: Record<TxType, { count: number; sumGbp: number; maxGbp: number }>;
  /** ISO2 -> tx count. The corridor rule needs the full record, not a count. */
  merchantCountries: Record<string, number>;
  tinyCardPayments: number; // CARD_PAYMENT under 1 GBP, zero included
  unconvertedTx: number;    // rows in currencies outside the FX table
  fraudTxCount: number;     // stays 0 when the dataset has no labels
}

/** Per-country aggregate as posted to the main thread (no Sets, no Maps). */
export interface CountryAggPosted {
  iso2: string;
  txCount: number;
  sumGbp: number;
  userCount: number;
  fraudTxCount: number;
  byType: Record<TxType, number>;
  topUserId: string;
  topUserTxShare: number; // 0-1, busiest user's share of the country's tx
}

/** Corridor = residence ISO2 + '>' + merchant ISO2. */
export interface CorridorAgg {
  txCount: number;
  userCount: number;
  fraudTxCount: number;
}

/** A user's raw transactions, fetched on demand for the detail view. */
export interface UserDetail {
  userId: string;
  headers: string[];
  rows: Record<string, string>[];
}

/** Predicate for an on-demand re-read of the file. */
export type FilterSpec =
  | { kind: 'user'; userId: string }
  | { kind: 'type'; txType: string }
  | { kind: 'amount'; min: number; max: number; label: string }; // GBP, [min, max)

/** Result of a filtered re-read: a capped preview plus the true total. */
export interface FilteredResult {
  spec: FilterSpec;
  headers: string[];
  rows: Record<string, string>[];
  total: number;
  capped: boolean;
}

/** One level of the drill-down modal's view stack. */
export type DrillView =
  | { kind: 'profile'; userId: string }
  | { kind: 'txList'; spec: FilterSpec; title: string }
  | { kind: 'userList'; ids: string[]; title: string };

export interface Totals {
  rows: number;
  users: number;
  sumGbp: number;
  unconvertedTx: number;
  unparsedMerchant: number;
  merchantValues: number;      // non-null merchant cells, denominator for the note
  nonPositiveAmounts: number;  // rows with amount <= 0, kept out of the histogram
  byType: Record<TxType, number>;
  hasLabels: boolean;
  hasKyc: boolean;
  hasMerchant: boolean;
  hasBirthYear: boolean;
}

export interface AggregateResult {
  users: Map<string, UserAgg>;
  residenceCountries: Map<string, CountryAggPosted>;
  merchantCountries: Map<string, CountryAggPosted>;
  corridors: Record<string, CorridorAgg>;
  txSample: CanonicalRow[];                  // reservoir, cap 5,000
  amountSamples: Record<TxType, number[]>;   // reservoir per type, cap 50,000, gbp > 0 only
  totals: Totals;
}

export type MainToWorker =
  | { type: 'parse'; file: File | string; columnMap: ColumnMap }
  | { type: 'fetchFiltered'; file: File | string; columnMap: ColumnMap; spec: FilterSpec; cap: number }
  | { type: 'exportFiltered'; file: File | string; columnMap: ColumnMap; spec: FilterSpec };

export type WorkerToMain =
  | { type: 'progress'; rowsParsed: number; bytesRead: number; totalBytes: number }
  | { type: 'error'; message: string }
  | { type: 'complete'; result: AggregateResult }
  | { type: 'filteredRows'; spec: FilterSpec; headers: string[]; rows: Record<string, string>[]; total: number; capped: boolean }
  | { type: 'exportReady'; csv: string; filename: string };

export const RULE_IDS = [
  'MULE', 'CARD_TESTER', 'EXOTIC_CORRIDOR', 'AMOUNT_OUTLIER', 'KYC_ANOMALY', 'CONCENTRATION',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export interface RuleResult {
  ruleId: RuleId;
  severity: 1 | 2 | 3;
  reason: string;
}

export interface RuleConfig {
  enabled: Record<RuleId, boolean>;
  /** Slider-tunable thresholds; severities are fixed. */
  muleMinTopupGbp: number;
  muleMinRatio: number;
  muleMinAtmCount: number;
  testerMinTinyCount: number;
  corridorMinCountries: number;
  outlierPercentile: number;      // 0-1, per-type amount percentile
  kycMinSumGbp: number;
  concentrationMinShare: number;  // 0-1
  concentrationMinTx: number;
}

export interface CorridorShare {
  share: number; // 0-1
  corridorKey: string;
  userTx: number;
  corridorTx: number;
}

export interface ScoredUser {
  user: UserAgg;
  rules: RuleResult[];
  score: number;
  breakdown: Record<string, number>; // weighted contribution per score term
  maxCorridor: CorridorShare | null;
}
