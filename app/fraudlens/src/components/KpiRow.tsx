import './KpiRow.css';
import { getDerived } from '../lib/derived.ts';
import { fmtCount, fmtGbp } from '../lib/format.ts';
import { useStore } from '../store.ts';

export default function KpiRow() {
  const result = useStore((s) => s.result);
  const ruleConfig = useStore((s) => s.ruleConfig);
  if (!result) return null;
  const derived = getDerived(result, ruleConfig);
  const { totals } = result;

  const tiles = [
    { label: 'Transactions', value: fmtCount(totals.rows) },
    { label: 'Users', value: fmtCount(totals.users) },
    { label: 'Flagged users', value: fmtCount(derived.rules.flags.size), danger: derived.rules.flags.size > 0 },
    { label: 'Est. exposure', value: fmtGbp(derived.flaggedExposureGbp), danger: derived.flaggedExposureGbp > 0 },
  ];

  return (
    <div className="kpi-row">
      {tiles.map((t) => (
        <div key={t.label} className="card kpi-tile">
          <div className="kpi-label">{t.label}</div>
          <div className={`kpi-value num ${t.danger ? 'kpi-danger' : ''}`}>{t.value}</div>
        </div>
      ))}
      {totals.unconvertedTx > 0 && (
        <div className="kpi-footnote muted num">
          {fmtCount(totals.unconvertedTx)} tx in unsupported currencies excluded from GBP figures
        </div>
      )}
    </div>
  );
}
