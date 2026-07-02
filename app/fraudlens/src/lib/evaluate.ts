// How well do the rules line up with the dataset's own labels?
// Truth = user has at least one labelled fraud transaction.
// Prediction = at least one rule fired for that user.

import type { RuleResult, UserAgg } from '../types.ts';

export interface Evaluation {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  f1: number;
}

export function evaluateAgainstLabels(
  users: Map<string, UserAgg>,
  flags: Map<string, RuleResult[]>,
): Evaluation {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const user of users.values()) {
    const truth = user.fraudTxCount > 0;
    const flagged = flags.has(user.userId);
    if (truth && flagged) tp += 1;
    else if (!truth && flagged) fp += 1;
    else if (truth && !flagged) fn += 1;
    else tn += 1;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp, fn, tn, precision, recall, f1 };
}
