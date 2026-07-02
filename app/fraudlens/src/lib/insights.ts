// Derived data for the four insight panels under the map. All computed from
// aggregates already in memory: corridor flows, money-in vs money-out per
// user, how often rules co-fire, and how much exposure the rules cover.

import type { AggregateResult, RuleId, RuleResult, UserAgg } from '../types.ts';
import { RULE_IDS } from '../types.ts';

export interface CorridorRow {
  res: string;
  mer: string;
  txCount: number;
  userCount: number;
  fraudRate: number; // 0-1
}

/** Top corridors (residence -> merchant), ranked by fraud rate then volume. */
export function topCorridors(result: AggregateResult, minTx = 20, limit = 8): CorridorRow[] {
  const rows: CorridorRow[] = [];
  for (const [key, c] of Object.entries(result.corridors)) {
    if (c.txCount < minTx) continue;
    const [res, mer] = key.split('>');
    rows.push({ res, mer, txCount: c.txCount, userCount: c.userCount, fraudRate: c.fraudTxCount / c.txCount });
  }
  const hasLabels = result.totals.hasLabels;
  rows.sort((a, b) => (hasLabels ? b.fraudRate - a.fraudRate || b.txCount - a.txCount : b.txCount - a.txCount));
  return rows.slice(0, limit);
}

export interface InOutPoint {
  userId: string;
  moneyIn: number;
  moneyOut: number;
  flagged: boolean;
  fraud: boolean;
}

/**
 * Money in (top-ups) vs money out through cash and transfers (ATM + transfer +
 * P2P, excluding ordinary card spend). Mules sit high on both, near the
 * diagonal; normal spenders route through card payments and stay low on Y.
 */
export function inOutPoints(users: Map<string, UserAgg>, flagged: Set<string>): InOutPoint[] {
  const pts: InOutPoint[] = [];
  for (const u of users.values()) {
    const moneyIn = u.byType.TOPUP.sumGbp;
    const moneyOut = u.byType.ATM.sumGbp + u.byType.BANK_TRANSFER.sumGbp + u.byType.P2P.sumGbp;
    if (moneyIn <= 0 && moneyOut <= 0) continue;
    pts.push({ userId: u.userId, moneyIn, moneyOut, flagged: flagged.has(u.userId), fraud: u.fraudTxCount > 0 });
  }
  return pts;
}

/** Symmetric 6x6 count of users flagged by each pair of rules; diagonal = total. */
export function ruleCoOccurrence(flags: Map<string, RuleResult[]>): number[][] {
  const idx: Record<RuleId, number> = {} as Record<RuleId, number>;
  RULE_IDS.forEach((r, i) => (idx[r] = i));
  const m = RULE_IDS.map(() => RULE_IDS.map(() => 0));
  for (const fired of flags.values()) {
    const ids = [...new Set(fired.map((f) => f.ruleId))];
    for (let a = 0; a < ids.length; a++) {
      for (let b = 0; b < ids.length; b++) {
        m[idx[ids[a]]][idx[ids[b]]] += 1;
      }
    }
  }
  return m;
}

export interface Coverage {
  totalExposure: number;
  flaggedExposure: number;
  flaggedUserShare: number;     // 0-1
  flaggedExposureShare: number; // 0-1
  totalUsers: number;
  flaggedUsers: number;
}

/** How the flagged population maps onto money at risk. */
export function coverage(
  users: Map<string, UserAgg>,
  flagged: Set<string>,
  flaggedExposure: number,
): Coverage {
  let totalExposure = 0;
  for (const u of users.values()) totalExposure += u.sumGbp;
  return {
    totalExposure,
    flaggedExposure,
    flaggedUserShare: users.size > 0 ? flagged.size / users.size : 0,
    flaggedExposureShare: totalExposure > 0 ? flaggedExposure / totalExposure : 0,
    totalUsers: users.size,
    flaggedUsers: flagged.size,
  };
}
