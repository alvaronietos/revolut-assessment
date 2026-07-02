import './ProgressOverlay.css';
import { fmtCount } from '../lib/format.ts';
import { useStore } from '../store.ts';

export default function ProgressOverlay() {
  const progress = useStore((s) => s.progress);
  if (!progress) return null;
  const pct = progress.totalBytes > 0 ? Math.min(1, progress.bytesRead / progress.totalBytes) : 0;

  return (
    <div className="progress-overlay">
      <div className="progress-card card">
        <div className="card-title">Analysing</div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${Math.max(2, pct * 100)}%` }} />
        </div>
        <div className="muted num">{fmtCount(progress.rowsParsed)} rows parsed</div>
      </div>
    </div>
  );
}
