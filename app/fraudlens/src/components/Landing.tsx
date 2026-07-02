import { useRef, useState } from 'react';

import './Landing.css';
import { generateDemoCsv } from '../lib/demoData.ts';
import { useStore } from '../store.ts';

const MAX_BYTES = 500 * 1024 * 1024;

export default function Landing() {
  const openFile = useStore((s) => s.openFile);
  const storeError = useStore((s) => s.error);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setLocalError('Only .csv files are supported.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError('That file is over 500 MB — too large for in-browser analysis.');
      return;
    }
    setLocalError(null);
    openFile(file, file.name);
  };

  const error = localError ?? storeError;

  return (
    <div className="landing">
      <header className="landing-brand">fraudlens<span className="landing-dot">.</span></header>
      <h1 className="landing-title">Upload transactions. See the fraud.</h1>
      <p className="landing-sub muted">
        Everything runs in your browser — no data leaves this page. Map your columns once,
        then explore flagged accounts on a world map, tune the detection rules live and
        get a reasoned threat ranking.
      </p>
      <div
        className={`landing-drop ${dragOver ? 'landing-drop-active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) accept(file);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <div className="landing-drop-icon">⇪</div>
        <div>Drop a transactions CSV here, or click to browse</div>
        <div className="muted" style={{ fontSize: 12 }}>
          Needs user, type, amount, currency and country columns; fraud labels optional
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) accept(file);
            e.target.value = '';
          }}
        />
      </div>
      {error && <div className="landing-error">{error}</div>}
      <button
        className="btn"
        onClick={() => openFile(generateDemoCsv(), 'demo dataset')}
      >
        Try the demo dataset
      </button>
    </div>
  );
}
