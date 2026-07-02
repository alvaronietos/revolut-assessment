// The explainable rules engine. Pure and synchronous so the sliders can
// re-run it live. Default thresholds were tuned against a real 688k-row
// transactions file; on that file they flag roughly 975 of 8,021 users.

import { fmtGbp } from './format.ts';
import {
  type AggregateResult,
  type CorridorShare,
  type RuleConfig,
  type RuleId,
  type RuleResult,
} from '../types.ts';

export const SEVERITY: Record<RuleId, 1 | 2 | 3> = {
  MULE: 3,
  CARD_TESTER: 2,
  EXOTIC_CORRIDOR: 2,
  AMOUNT_OUTLIER: 2,
  KYC_ANOMALY: 3,
  CONCENTRATION: 2,
};

export const MAX_SEV_SUM = 14; // 3+2+2+2+3+2

export const DEFAULT_CONFIG: RuleConfig = {
  enabled: {
    MULE: true,
    CARD_TESTER: true,
    EXOTIC_CORRIDOR: true,
    AMOUNT_OUTLIER: true,
    KYC_ANOMALY: true,
    CONCENTRATION: true,
  },
  muleMinTopupGbp: 500,
  muleMinRatio: 0.7,
  muleMinAtmCount: 3,
  testerMinTinyCount: 25,
  corridorMinCountries: 15,
  outlierPercentile: 0.999,
  kycMinSumGbp: 5_000,
  concentrationMinShare: 0.6,
  concentrationMinTx: 50,
};

export const RULE_LABELS: Record<RuleId, string> = {
  MULE: 'Mule pass-through',
  CARD_TESTER: 'Card testing',
  EXOTIC_CORRIDOR: 'Merchant-country spread',
  AMOUNT_OUTLIER: 'Amount outlier',
  KYC_ANOMALY: 'KYC anomaly',
  CONCENTRATION: 'Corridor concentration',
};

export interface RulesOutput {
  flags: Map<string, RuleResult[]>;
  corridorShares: Map<string, CorridorShare>;
  outlierThresholds: Partial<Record<string, number>>;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return Infinity;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

/**
 * For each user, the (residence -> merchant) corridor where they hold the
 * largest share of all traffic, subject to the corridor size floor.
 */
function computeCorridorShares(result: AggregateResult, config: RuleConfig): Map<string, CorridorShare> {
  const shares = new Map<string, CorridorShare>();
  for (const user of result.users.values()) {
    let best: CorridorShare | null = null;
    for (const [mer, userTx] of Object.entries(user.merchantCountries)) {
      const key = `${user.residence}>${mer}`;
      const corridor = result.corridors[key];
      if (!corridor) continue;
      if (corridor.txCount < config.concentrationMinTx || corridor.userCount < 3) continue;
      const share = userTx / corridor.txCount;
      if (!best || share > best.share) {
        best = { share, corridorKey: key, userTx, corridorTx: corridor.txCount };
      }
    }
    if (best) shares.set(user.userId, best);
  }
  return shares;
}

export function runRules(result: AggregateResult, config: RuleConfig): RulesOutput {
  const flags = new Map<string, RuleResult[]>();
  const corridorShares = computeCorridorShares(result, config);

  // Per-type outlier thresholds from the positive-amount samples.
  const outlierThresholds: Partial<Record<string, number>> = {};
  for (const [type, samples] of Object.entries(result.amountSamples)) {
    if (samples.length >= 100) {
      outlierThresholds[type] = percentile([...samples].sort((a, b) => a - b), config.outlierPercentile);
    }
  }

  const pct = (x: number) => `${Math.round(x * 100)}`;

  for (const user of result.users.values()) {
    const fired: RuleResult[] = [];
    const topup = user.byType.TOPUP;
    const atm = user.byType.ATM;

    if (
      config.enabled.MULE &&
      topup.sumGbp >= config.muleMinTopupGbp &&
      topup.sumGbp > 0 &&
      atm.sumGbp / topup.sumGbp >= config.muleMinRatio &&
      atm.count >= config.muleMinAtmCount
    ) {
      fired.push({
        ruleId: 'MULE',
        severity: SEVERITY.MULE,
        reason: `Withdrew ${fmtGbp(atm.sumGbp)} via ATM against ${fmtGbp(topup.sumGbp)} of top-ups (${pct(atm.sumGbp / topup.sumGbp)}% pass-through)`,
      });
    }

    if (config.enabled.CARD_TESTER && user.tinyCardPayments >= config.testerMinTinyCount) {
      fired.push({
        ruleId: 'CARD_TESTER',
        severity: SEVERITY.CARD_TESTER,
        reason: `${user.tinyCardPayments} card payments under £1 — card-testing pattern`,
      });
    }

    const nCountries = Object.keys(user.merchantCountries).length;
    if (config.enabled.EXOTIC_CORRIDOR && nCountries >= config.corridorMinCountries) {
      fired.push({
        ruleId: 'EXOTIC_CORRIDOR',
        severity: SEVERITY.EXOTIC_CORRIDOR,
        reason: `Transacted in ${nCountries} merchant countries`,
      });
    }

    if (config.enabled.AMOUNT_OUTLIER) {
      // Each type's own maximum is judged against that type's own threshold.
      let worst: { type: string; amount: number; excess: number } | null = null;
      for (const [type, agg] of Object.entries(user.byType)) {
        const threshold = outlierThresholds[type];
        if (threshold !== undefined && agg.maxGbp > threshold) {
          const excess = agg.maxGbp / threshold;
          if (!worst || excess > worst.excess) worst = { type, amount: agg.maxGbp, excess };
        }
      }
      if (worst) {
        fired.push({
          ruleId: 'AMOUNT_OUTLIER',
          severity: SEVERITY.AMOUNT_OUTLIER,
          reason: `${fmtGbp(worst.amount)} ${worst.type.replaceAll('_', ' ').toLowerCase()} exceeds the 99.9th percentile for that type`,
        });
      }
    }

    const corridor = corridorShares.get(user.userId);
    if (
      config.enabled.CONCENTRATION &&
      corridor &&
      corridor.share >= config.concentrationMinShare
    ) {
      const [res, mer] = corridor.corridorKey.split('>');
      fired.push({
        ruleId: 'CONCENTRATION',
        severity: SEVERITY.CONCENTRATION,
        reason: `Owns ${pct(corridor.share)}% of the ${res}→${mer} corridor (${corridor.userTx} of ${corridor.corridorTx} tx)`,
      });
    }

    // Evaluated last: its volume is downstream of the base rules.
    if (config.enabled.KYC_ANOMALY) {
      if (user.kyc === 'PASSED' && fired.length >= 2) {
        fired.push({
          ruleId: 'KYC_ANOMALY',
          severity: SEVERITY.KYC_ANOMALY,
          reason: `Passed KYC yet triggers ${fired.length} behavioural rules`,
        });
      } else if ((user.kyc === 'NONE' || user.kyc === 'FAILED') && user.sumGbp >= config.kycMinSumGbp) {
        fired.push({
          ruleId: 'KYC_ANOMALY',
          severity: SEVERITY.KYC_ANOMALY,
          reason: `Moved ${fmtGbp(user.sumGbp)} without passing identity checks (KYC ${user.kyc})`,
        });
      }
    }

    if (fired.length > 0) flags.set(user.userId, fired);
  }

  return { flags, corridorShares, outlierThresholds };
}

