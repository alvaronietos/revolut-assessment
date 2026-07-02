import { useEffect, useRef, useState } from 'react';

import './RulesPanel.css';
import { getDerived } from '../lib/derived.ts';
import { RULE_LABELS } from '../lib/rules.ts';
import { useStore } from '../store.ts';
import { RULE_IDS, type RuleConfig } from '../types.ts';

interface SliderSpec {
  key: keyof RuleConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const SLIDERS: SliderSpec[] = [
  { key: 'muleMinRatio', label: 'Mule: min ATM/top-up ratio', min: 0.1, max: 1.5, step: 0.05, format: (v) => v.toFixed(2) },
  { key: 'testerMinTinyCount', label: 'Card testing: min tiny payments', min: 5, max: 100, step: 1, format: (v) => String(v) },
  { key: 'corridorMinCountries', label: 'Spread: min merchant countries', min: 5, max: 30, step: 1, format: (v) => String(v) },
  { key: 'concentrationMinShare', label: 'Concentration: min corridor share', min: 0.3, max: 0.95, step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'concentrationMinTx', label: 'Concentration: min corridor size', min: 10, max: 200, step: 5, format: (v) => `${v} tx` },
];

export default function RulesPanel() {
  const result = useStore((s) => s.result);
  const ruleConfig = useStore((s) => s.ruleConfig);
  const setRuleConfig = useStore((s) => s.setRuleConfig);
  const toggleRule = useStore((s) => s.toggleRule);

  // Sliders write into local state instantly and commit to the store after a
  // 250ms pause, so dragging never re-runs the engine per pixel.
  const [local, setLocal] = useState(ruleConfig);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setLocal(ruleConfig), [ruleConfig]);

  const commit = (patch: Partial<RuleConfig>) => {
    setLocal((prev) => ({ ...prev, ...patch }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRuleConfig(patch), 250);
  };

  if (!result) return null;
  const derived = getDerived(result, ruleConfig);

  return (
    <div className="card rules">
      <div className="card-title">Detection rules</div>
      <div className="rules-list">
        {RULE_IDS.map((id) => (
          <label key={id} className="rules-item">
            <input
              type="checkbox"
              checked={ruleConfig.enabled[id]}
              onChange={() => toggleRule(id)}
            />
            <span className="rules-name">{RULE_LABELS[id]}</span>
            <span className="muted num">{derived.flaggedPerRule[id].toLocaleString('en-GB')}</span>
          </label>
        ))}
      </div>
      <div className="rules-sliders">
        {SLIDERS.map((s) => (
          <div key={s.key} className="rules-slider">
            <div className="rules-slider-head">
              <span>{s.label}</span>
              <span className="num rules-value">{s.format(local[s.key] as number)}</span>
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={local[s.key] as number}
              onChange={(e) => commit({ [s.key]: Number(e.target.value) } as Partial<RuleConfig>)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
