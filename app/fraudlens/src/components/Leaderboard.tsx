import { useMemo, useState } from 'react';

import './Leaderboard.css';
import { getDerived } from '../lib/derived.ts';
import { countryName } from '../lib/countries.ts';
import { fmtCount, fmtGbp } from '../lib/format.ts';
import { RULE_LABELS } from '../lib/rules.ts';
import { useStore } from '../store.ts';
import type { ScoredUser } from '../types.ts';

type SortKey = 'score' | 'sumGbp' | 'txCount';

export default function Leaderboard() {
  const result = useStore((s) => s.result);
  const ruleConfig = useStore((s) => s.ruleConfig);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!result) return [] as ScoredUser[];
    const { scored } = getDerived(result, ruleConfig);
    const sorted = [...scored];
    if (sortKey === 'sumGbp') sorted.sort((a, b) => b.user.sumGbp - a.user.sumGbp);
    else if (sortKey === 'txCount') sorted.sort((a, b) => b.user.txCount - a.user.txCount);
    return sorted.slice(0, 100);
  }, [result, ruleConfig, sortKey]);

  if (!result) return null;
  const total = getDerived(result, ruleConfig).scored.length;

  const header = (key: SortKey, label: string) => (
    <th
      className={`lb-sortable ${sortKey === key ? 'lb-sorted' : ''}`}
      onClick={() => setSortKey(key)}
    >
      {label}
      {sortKey === key ? ' ↓' : ''}
    </th>
  );

  return (
    <div className="card lb">
      <div className="card-title">Threat leaderboard</div>
      {rows.length === 0 ? (
        <div className="muted">No users flagged with the current rules.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>User</th>
              {header('score', 'Score')}
              <th>Country</th>
              <th>KYC</th>
              {header('txCount', 'Tx')}
              {header('sumGbp', 'Volume')}
              <th>Rules</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const isOpen = expanded === s.user.userId;
              return [
                <tr
                  key={s.user.userId}
                  className="lb-row"
                  onClick={() => setExpanded(isOpen ? null : s.user.userId)}
                >
                  <td className="muted num">{i + 1}</td>
                  <td className="num lb-id" title={s.user.userId}>{s.user.userId.slice(0, 8)}…</td>
                  <td>
                    <span className="badge lb-score num">{Math.round(s.score)}</span>
                  </td>
                  <td>{countryName(s.user.residence)}</td>
                  <td className="muted">{s.user.kyc ?? '—'}</td>
                  <td className="num">{fmtCount(s.user.txCount)}</td>
                  <td className="num">{fmtGbp(s.user.sumGbp)}</td>
                  <td>
                    <div className="lb-chips">
                      {s.rules.map((r) => (
                        <span key={r.ruleId} className={`badge lb-chip lb-sev${r.severity}`}>
                          {RULE_LABELS[r.ruleId]}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>,
                isOpen && (
                  <tr key={`${s.user.userId}-detail`} className="lb-detail">
                    <td colSpan={8}>
                      <ul>
                        {s.rules.map((r) => (
                          <li key={r.ruleId}>
                            <span className={`badge lb-chip lb-sev${r.severity}`}>
                              {RULE_LABELS[r.ruleId]}
                            </span>
                            <span>{r.reason}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="muted lb-breakdown num">
                        {Object.entries(s.breakdown)
                          .map(([k, v]) => `${k} ${v.toFixed(1)}`)
                          .join('  ·  ')}
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      )}
      {total > 100 && (
        <div className="muted lb-footer num">showing top 100 of {total.toLocaleString('en-GB')} flagged users</div>
      )}
    </div>
  );
}
