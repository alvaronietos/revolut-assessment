import { useMemo } from 'react';

import './UserProfile.css';
import { getDerived } from '../lib/derived.ts';
import { ERA_YEAR } from '../lib/constants.ts';
import { countryName } from '../lib/countries.ts';
import { fmtCount, fmtGbp } from '../lib/format.ts';
import { RULE_LABELS } from '../lib/rules.ts';
import { useStore } from '../store.ts';
import { TX_TYPES } from '../types.ts';

const OUT_TYPES = ['ATM', 'P2P', 'BANK_TRANSFER'] as const;

export default function UserProfile({ userId }: { userId: string }) {
  const result = useStore((s) => s.result);
  const ruleConfig = useStore((s) => s.ruleConfig);
  const userRows = useStore((s) => s.userRows);
  const loading = useStore((s) => s.drillLoading);
  const exportBusy = useStore((s) => s.exportBusy);
  const exportSpec = useStore((s) => s.exportSpec);

  const info = useMemo(() => {
    if (!result) return null;
    const user = result.users.get(userId);
    if (!user) return null;
    const scored = getDerived(result, ruleConfig).scored.find((s) => s.user.userId === userId) ?? null;
    const moneyIn = user.byType.TOPUP.sumGbp;
    const cashOut = OUT_TYPES.reduce((a, t) => a + user.byType[t].sumGbp, 0);
    const cardSpend = user.byType.CARD_PAYMENT.sumGbp;
    const topMerchant = Object.entries(user.merchantCountries).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { user, scored, moneyIn, cashOut, cardSpend, topMerchant, hasLabels: result.totals.hasLabels };
  }, [result, ruleConfig, userId]);

  if (!info) return <div className="dm-loading muted">Account not found in the current dataset.</div>;
  const { user, scored, moneyIn, cashOut, cardSpend, topMerchant, hasLabels } = info;
  const age = user.birthYear ? ERA_YEAR - user.birthYear : null;
  const passThrough = moneyIn > 0 ? cashOut / moneyIn : null;
  const maxType = Math.max(1, ...TX_TYPES.map((t) => user.byType[t].count));
  const maxMerchant = Math.max(1, ...topMerchant.map(([, n]) => n));
  const rowsReady = userRows && userRows.userId === userId;

  return (
    <div className="up">
      <div className="up-header">
        <div>
          <div className="up-id num">{user.userId}</div>
          <div className="up-tags">
            <span className="up-tag">{countryName(user.residence)}</span>
            {user.kyc && <span className={`up-tag up-kyc-${(user.kyc || '').toLowerCase()}`}>KYC {user.kyc}</span>}
            {age !== null && <span className="up-tag">age {age}</span>}
            {hasLabels && user.fraudTxCount > 0 && <span className="up-tag up-fraud">confirmed fraud</span>}
          </div>
        </div>
        {scored && <div className="up-score num" title="threat score">{Math.round(scored.score)}</div>}
      </div>

      {scored && scored.rules.length > 0 && (
        <div className="up-rules">
          {scored.rules.map((r) => (
            <div key={r.ruleId} className="up-rule">
              <span className={`badge up-chip up-sev${r.severity}`}>{RULE_LABELS[r.ruleId]}</span>
              <span className="muted">{r.reason}</span>
            </div>
          ))}
        </div>
      )}

      <div className="up-kpis">
        {[
          { label: 'Transactions', value: fmtCount(user.txCount) },
          { label: 'Total (GBP)', value: fmtGbp(user.sumGbp) },
          { label: 'Largest tx', value: fmtGbp(user.maxGbp) },
          { label: 'Tiny card <£1', value: fmtCount(user.tinyCardPayments), warn: user.tinyCardPayments > 0 },
          { label: 'Merchant countries', value: fmtCount(Object.keys(user.merchantCountries).length) },
          ...(hasLabels ? [{ label: 'Fraud tx', value: fmtCount(user.fraudTxCount), danger: user.fraudTxCount > 0 }] : []),
        ].map((k) => (
          <div key={k.label} className="up-kpi">
            <div className="up-kpi-label">{k.label}</div>
            <div className={`up-kpi-value num ${k.danger ? 'up-red' : ''} ${k.warn ? 'up-amber' : ''}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="up-cols">
        <div className="up-block">
          <div className="card-title">How money moves</div>
          <div className="up-flow">
            <div className="up-flow-row"><span>Funded in (top-ups)</span><span className="num">{fmtGbp(moneyIn)}</span></div>
            <div className="up-flow-row"><span>Cash / transfer out</span><span className="num">{fmtGbp(cashOut)}</span></div>
            <div className="up-flow-row"><span>Card spend</span><span className="num">{fmtGbp(cardSpend)}</span></div>
            <div className="up-flow-row up-flow-key">
              <span>Pass-through ratio</span>
              <span className={`num ${passThrough !== null && passThrough >= 0.7 ? 'up-red' : ''}`}>
                {passThrough !== null ? passThrough.toFixed(2) : '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="up-block">
          <div className="card-title">Where they operate</div>
          {topMerchant.length === 0 && <div className="muted">No merchant countries.</div>}
          {topMerchant.map(([iso2, n]) => (
            <div key={iso2} className="up-bar-row">
              <span className="up-bar-label">{iso2 === 'US' || iso2 === 'CA' ? iso2 : countryName(iso2)}</span>
              <div className="up-bar"><div className="up-bar-fill" style={{ width: `${(n / maxMerchant) * 100}%` }} /></div>
              <span className="num muted">{fmtCount(n)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="up-block">
        <div className="card-title">Transaction mix</div>
        <div className="up-typemix">
          {TX_TYPES.filter((t) => user.byType[t].count > 0).map((t) => (
            <div key={t} className="up-bar-row">
              <span className="up-bar-label">{t.replaceAll('_', ' ').toLowerCase()}</span>
              <div className="up-bar"><div className="up-bar-fill" style={{ width: `${(user.byType[t].count / maxType) * 100}%` }} /></div>
              <span className="num muted">{fmtCount(user.byType[t].count)}</span>
              <span className="num muted up-typesum">{fmtGbp(user.byType[t].sumGbp)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="up-block">
        <div className="up-tx-head">
          <div className="card-title" style={{ margin: 0 }}>Transactions</div>
          <button className="btn btn-primary" disabled={exportBusy} onClick={() => exportSpec({ kind: 'user', userId })}>
            {exportBusy ? 'Preparing…' : 'Download CSV'}
          </button>
        </div>
        {!rowsReady && loading && <div className="dm-loading"><div className="dm-spinner" /><div className="muted">Reading transactions…</div></div>}
        {rowsReady && (
          <>
            <div className="dm-table-wrap">
              <table>
                <thead><tr>{userRows!.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {userRows!.rows.slice(0, 500).map((row, i) => (
                    <tr key={i}>{userRows!.headers.map((h) => <td key={h} className="num">{String(row[h] ?? '')}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            {userRows!.rows.length > 500 && (
              <div className="muted dm-foot"><span className="num">showing first 500 of {fmtCount(userRows!.rows.length)} — download for all</span></div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
