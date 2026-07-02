import { fmtCount } from '../lib/format.ts';
import { useStore } from '../store.ts';
import type { DrillView } from '../types.ts';

export default function TxListView({ view }: { view: Extract<DrillView, { kind: 'txList' }> }) {
  const filtered = useStore((s) => s.filtered);
  const loading = useStore((s) => s.drillLoading);
  const columnMap = useStore((s) => s.columnMap);
  const exportBusy = useStore((s) => s.exportBusy);
  const exportSpec = useStore((s) => s.exportSpec);
  const openUser = useStore((s) => s.openUser);

  const ready = filtered && JSON.stringify(filtered.spec) === JSON.stringify(view.spec);
  const userCol = columnMap?.USER_ID ?? null;

  return (
    <div>
      <div className="up-tx-head">
        <div className="muted num">
          {ready ? `${fmtCount(filtered!.total)} transactions` : 'Loading…'}
        </div>
        <button className="btn btn-primary" disabled={exportBusy} onClick={() => exportSpec(view.spec)}>
          {exportBusy ? 'Preparing…' : 'Download CSV'}
        </button>
      </div>

      {!ready && loading && <div className="dm-loading"><div className="dm-spinner" /><div className="muted">Filtering the file…</div></div>}

      {ready && (
        <>
          <div className="dm-table-wrap">
            <table>
              <thead><tr>{filtered!.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered!.rows.map((row, i) => (
                  <tr key={i}>
                    {filtered!.headers.map((h) => (
                      <td key={h} className="num">
                        {userCol && h === userCol ? (
                          <button className="dm-linkid" onClick={() => openUser(String(row[h]))}>{String(row[h] ?? '')}</button>
                        ) : (
                          String(row[h] ?? '')
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="dm-foot muted num">
            <span>{filtered!.capped ? `showing first ${fmtCount(filtered!.rows.length)} of ${fmtCount(filtered!.total)}` : `${fmtCount(filtered!.total)} rows`} — download for the full set</span>
          </div>
        </>
      )}
    </div>
  );
}
