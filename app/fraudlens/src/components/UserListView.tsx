import { useMemo } from 'react';

import { ERA_YEAR } from '../lib/constants.ts';
import { countryName } from '../lib/countries.ts';
import { downloadCsv } from '../lib/csv.ts';
import { fmtCount, fmtGbp } from '../lib/format.ts';
import { useStore } from '../store.ts';
import type { DrillView } from '../types.ts';

export default function UserListView({ view }: { view: Extract<DrillView, { kind: 'userList' }> }) {
  const result = useStore((s) => s.result);
  const openUser = useStore((s) => s.openUser);
  const hasLabels = result?.totals.hasLabels ?? false;

  const rows = useMemo(() => {
    if (!result) return [];
    return view.ids
      .map((id) => result.users.get(id))
      .filter((u): u is NonNullable<typeof u> => !!u)
      .sort((a, b) => b.sumGbp - a.sumGbp);
  }, [result, view.ids]);

  const exportCsv = () => {
    const headers = ['USER_ID', 'COUNTRY', 'KYC', 'AGE', 'TX_COUNT', 'SUM_GBP', 'FRAUD_TX'];
    const data = rows.map((u) => [
      u.userId, u.residence, u.kyc ?? '', u.birthYear ? ERA_YEAR - u.birthYear : '',
      u.txCount, Math.round(u.sumGbp), u.fraudTxCount,
    ]);
    downloadCsv(`${view.title.replace(/\W+/g, '_').toLowerCase()}_users.csv`, headers, data);
  };

  return (
    <div>
      <div className="up-tx-head">
        <div className="muted num">{fmtCount(rows.length)} users</div>
        <button className="btn btn-primary" onClick={exportCsv}>Download CSV</button>
      </div>
      <div className="dm-table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th><th>Country</th><th>KYC</th><th>Age</th>
              <th>Tx</th><th>Total</th>{hasLabels && <th>Fraud tx</th>}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 1000).map((u) => (
              <tr key={u.userId}>
                <td><button className="dm-linkid num" onClick={() => openUser(u.userId)}>{u.userId.slice(0, 8)}…</button></td>
                <td>{countryName(u.residence)}</td>
                <td className="muted">{u.kyc ?? '—'}</td>
                <td className="num">{u.birthYear ? ERA_YEAR - u.birthYear : '—'}</td>
                <td className="num">{fmtCount(u.txCount)}</td>
                <td className="num">{fmtGbp(u.sumGbp)}</td>
                {hasLabels && <td className="num">{u.fraudTxCount}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 1000 && (
        <div className="dm-foot muted num"><span>showing first 1,000 of {fmtCount(rows.length)} — download for all</span></div>
      )}
    </div>
  );
}
