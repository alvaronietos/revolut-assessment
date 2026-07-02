// Threat score over the flagged population. Rule-driven and label-optional
// on purpose: it has to work on any transactions CSV, labelled or not.

import { MAX_SEV_SUM } from './rules.ts';
import type { CorridorShare, RuleResult, ScoredUser, UserAgg } from '../types.ts';

/** Percentile rank (0-100) of each value within its own population. */
export function percentileRank(values: number[]): Map<number, number> {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = new Map<number, number>();
  for (let i = 0; i < sorted.length; i++) {
    // Last occurrence wins: ties share the highest rank of the run.
    rank.set(sorted[i], sorted.length > 1 ? (i / (sorted.length - 1)) * 100 : 100);
  }
  return rank;
}

export function computeThreatScores(
  users: Map<string, UserAgg>,
  flags: Map<string, RuleResult[]>,
  corridorShares: Map<string, CorridorShare>,
  hasLabels: boolean,
): ScoredUser[] {
  const flagged = [...flags.keys()]
    .map((id) => users.get(id)!)
    .filter(Boolean);
  if (flagged.length === 0) return [];

  const sumRank = percentileRank(flagged.map((u) => u.sumGbp));
  const txRank = percentileRank(flagged.map((u) => u.txCount));
  const offending = (u: UserAgg, fired: RuleResult[]) => {
    let n = 0;
    for (const f of fired) {
      if (f.ruleId === 'CARD_TESTER') n += u.tinyCardPayments;
      if (f.ruleId === 'MULE') n += u.byType.ATM.count;
      if (f.ruleId === 'AMOUNT_OUTLIER') n += 1;
    }
    return n;
  };
  const offRank = percentileRank(flagged.map((u) => offending(u, flags.get(u.userId)!)));

  const weights = hasLabels
    ? { sum: 0.10, tx: 0.10, sev: 0.35, off: 0.10, corridor: 0.15, fraud: 0.20 }
    : { sum: 0.125, tx: 0.125, sev: 0.4375, off: 0.125, corridor: 0.1875, fraud: 0 };

  const scored: ScoredUser[] = flagged.map((u) => {
    const fired = flags.get(u.userId)!;
    const sevSum = fired.reduce((acc, f) => acc + f.severity, 0);
    const corridor = corridorShares.get(u.userId) ?? null;
    const fraudRate = u.txCount > 0 ? u.fraudTxCount / u.txCount : 0;
    const breakdown: Record<string, number> = {
      volume: weights.sum * (sumRank.get(u.sumGbp) ?? 0),
      activity: weights.tx * (txRank.get(u.txCount) ?? 0),
      severity: weights.sev * (sevSum / MAX_SEV_SUM) * 100,
      'repeat offences': weights.off * (offRank.get(offending(u, fired)) ?? 0),
      corridor: weights.corridor * (corridor ? corridor.share * 100 : 0),
    };
    if (hasLabels) breakdown['confirmed fraud'] = weights.fraud * fraudRate * 100;
    const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
    return { user: u, rules: fired, score, breakdown, maxCorridor: corridor };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}
