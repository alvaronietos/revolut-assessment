import './ColumnMapping.css';
import { mappingIsValid, useStore } from '../store.ts';
import { CANONICAL_FIELDS, REQUIRED_FIELDS, type CanonicalField } from '../types.ts';

const DESCRIPTIONS: Record<CanonicalField, string> = {
  USER_ID: 'unique account identifier',
  TYPE: 'transaction type (card, top-up, ATM…)',
  AMOUNT: 'amount in minor units (pence, cents)',
  CURRENCY: 'ISO currency code',
  COUNTRY: 'user residence country',
  MERCHANT_COUNTRY: 'where the money went (optional)',
  KYC: 'identity-check status (optional)',
  BIRTH_YEAR: 'year of birth (optional)',
  IS_FRAUD: 'confirmed-fraud label (optional)',
};

export default function ColumnMapping() {
  const headers = useStore((s) => s.headers);
  const previewRows = useStore((s) => s.previewRows);
  const columnMap = useStore((s) => s.columnMap);
  const fileName = useStore((s) => s.fileName);
  const setMapping = useStore((s) => s.setMapping);
  const startAnalysis = useStore((s) => s.startAnalysis);
  const reset = useStore((s) => s.reset);
  if (!columnMap) return null;

  const valid = mappingIsValid(columnMap);
  const previewHeaders = headers.slice(0, 8);

  return (
    <div className="mapping">
      <div className="mapping-head">
        <div>
          <h2>Map your columns</h2>
          <p className="muted">
            Tell FraudLens what each column in <strong>{fileName}</strong> means.
            Fields marked * are required; the rest degrade gracefully when missing.
          </p>
        </div>
        <button className="btn" onClick={reset}>Back</button>
      </div>

      <div className="mapping-grid">
        {CANONICAL_FIELDS.map((field) => {
          const required = REQUIRED_FIELDS.includes(field);
          return (
            <label key={field} className="mapping-field card">
              <span className="mapping-label">
                {field}
                {required && <span className="mapping-req">*</span>}
              </span>
              <span className="muted mapping-desc">{DESCRIPTIONS[field]}</span>
              <select
                value={columnMap[field] ?? ''}
                onChange={(e) => setMapping(field, e.target.value || null)}
              >
                <option value="">— none —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </label>
          );
        })}
      </div>

      <div className="card">
        <div className="card-title">First rows of the file</div>
        <div className="mapping-preview">
          <table>
            <thead>
              <tr>{previewHeaders.map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i}>
                  {previewHeaders.map((h) => <td key={h}>{String(row[h] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mapping-actions">
        {!valid && (
          <span className="muted">Required fields must map to five distinct columns.</span>
        )}
        <button className="btn btn-primary" disabled={!valid} onClick={startAnalysis}>
          Analyze
        </button>
      </div>
    </div>
  );
}
