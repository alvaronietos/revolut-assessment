import * as Papa from 'papaparse';

import './UserDetail.css';
import { fmtCount } from '../lib/format.ts';
import { useStore } from '../store.ts';

const MAX_TABLE_ROWS = 500;

export default function UserDetail() {
  const detail = useStore((s) => s.userDetail);
  const loading = useStore((s) => s.userLoading);
  const close = useStore((s) => s.closeUser);

  if (loading && !detail) {
    return (
      <div className="ud-backdrop" onClick={close}>
        <div className="ud-loading card" onClick={(e) => e.stopPropagation()}>
          <div className="ud-spinner" />
          <div>Fetching this account&apos;s transactions…</div>
          <div className="muted" style={{ fontSize: 12 }}>Re-reading the file, one moment.</div>
        </div>
      </div>
    );
  }

  if (!detail) return null;

  const download = () => {
    const csv = Papa.unparse({ fields: detail.headers, data: detail.rows });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user_${detail.userId.slice(0, 8)}_transactions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shown = detail.rows.slice(0, MAX_TABLE_ROWS);

  return (
    <div className="ud-backdrop" onClick={close}>
      <div className="ud-panel card" onClick={(e) => e.stopPropagation()}>
        <div className="ud-head">
          <div>
            <div className="card-title" style={{ marginBottom: 4 }}>Account</div>
            <h3 className="num">{detail.userId}</h3>
            <span className="muted num">{fmtCount(detail.rows.length)} transactions</span>
          </div>
          <div className="ud-actions">
            <button className="btn btn-primary" onClick={download}>Download CSV</button>
            <button className="btn" onClick={close}>Close</button>
          </div>
        </div>

        <div className="ud-table-wrap">
          <table>
            <thead>
              <tr>{detail.headers.map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map((row, i) => (
                <tr key={i}>
                  {detail.headers.map((h) => <td key={h} className="num">{String(row[h] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {detail.rows.length > MAX_TABLE_ROWS && (
          <div className="muted ud-foot num">
            showing first {MAX_TABLE_ROWS} of {detail.rows.length.toLocaleString('en-GB')} — download for the full set
          </div>
        )}
      </div>
    </div>
  );
}
