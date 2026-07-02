// Memoized bridge between the raw aggregates and everything the dashboard
// renders. Recomputes only when the parsed result or the rule config changes,
// so slider tweaks re-run the rules without re-parsing anything.

import { evaluateAgainstLabels, type Evaluation } from './evaluate.ts';
import { runRules, type RulesOutput } from './rules.ts';
import { computeThreatScores } from './score.ts';
import type { AggregateResult, RuleConfig, RuleId, ScoredUser } from '../types.ts';

export interface Derived {
  rules: RulesOutput;
  scored: ScoredUser[];
  evaluation: Evaluation | null;
  flaggedExposureGbp: number;
  flaggedPerRule: Record<RuleId, number>;
}

let cachedResult: AggregateResult | null = null;
let cachedConfig = '';
let cachedValue: Derived | null = null;

export function getDerived(result: AggregateResult, config: RuleConfig): Derived {
  const configKey = JSON.stringify(config);
  if (cachedValue && cachedResult === result && cachedConfig === configKey) {
    return cachedValue;
  }
  const rules = runRules(result, config);
  const scored = computeThreatScores(
    result.users,
    rules.flags,
    rules.corridorShares,
    result.totals.hasLabels,
  );
  const evaluation = result.totals.hasLabels
    ? evaluateAgainstLabels(result.users, rules.flags)
    : null;
  let flaggedExposureGbp = 0;
  const flaggedPerRule = {
    MULE: 0, CARD_TESTER: 0, EXOTIC_CORRIDOR: 0,
    AMOUNT_OUTLIER: 0, KYC_ANOMALY: 0, CONCENTRATION: 0,
  } as Record<RuleId, number>;
  for (const [userId, fired] of rules.flags) {
    flaggedExposureGbp += result.users.get(userId)?.sumGbp ?? 0;
    for (const f of fired) flaggedPerRule[f.ruleId] += 1;
  }
  cachedResult = result;
  cachedConfig = configKey;
  cachedValue = { rules, scored, evaluation, flaggedExposureGbp, flaggedPerRule };
  return cachedValue;
}
