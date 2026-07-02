import './ModelQualityCard.css';
import { getDerived } from '../lib/derived.ts';
import { fmtPct } from '../lib/format.ts';
import { useStore } from '../store.ts';

export default function ModelQualityCard() {
  const result = useStore((s) => s.result);
  const ruleConfig = useStore((s) => s.ruleConfig);
  if (!result || !result.totals.hasLabels) return null;
  const { evaluation } = getDerived(result, ruleConfig);
  if (!evaluation) return null;

  let fraudUsers = 0;
  let fraudPassedKyc = 0;
  for (const u of result.users.values()) {
    if (u.fraudTxCount > 0) {
      fraudUsers += 1;
      if (u.kyc === 'PASSED') fraudPassedKyc += 1;
    }
  }

  return (
    <div className="card mq">
      <div className="card-title">Rules vs confirmed labels</div>
      <div className="mq-stats">
        <div><span className="muted">Precision</span><strong className="num">{fmtPct(evaluation.precision)}</strong></div>
        <div><span className="muted">Recall</span><strong className="num">{fmtPct(evaluation.recall)}</strong></div>
        <div><span className="muted">F1</span><strong className="num">{fmtPct(evaluation.f1)}</strong></div>
      </div>
      <div className="mq-grid num">
        <div className="mq-cell mq-head" />
        <div className="mq-cell mq-head">flagged</div>
        <div className="mq-cell mq-head">not flagged</div>
        <div className="mq-cell mq-head">fraud</div>
        <div className="mq-cell mq-tp">{evaluation.tp.toLocaleString('en-GB')}</div>
        <div className="mq-cell mq-fn">{evaluation.fn.toLocaleString('en-GB')}</div>
        <div className="mq-cell mq-head">clean</div>
        <div className="mq-cell mq-fp">{evaluation.fp.toLocaleString('en-GB')}</div>
        <div className="mq-cell">{evaluation.tn.toLocaleString('en-GB')}</div>
      </div>
      {fraudUsers > 0 && (
        <div className="muted mq-note num">
          {fraudPassedKyc.toLocaleString('en-GB')} of {fraudUsers.toLocaleString('en-GB')} confirmed
          fraud users had passed KYC — identity checks alone don&apos;t stop them.
        </div>
      )}
    </div>
  );
}
