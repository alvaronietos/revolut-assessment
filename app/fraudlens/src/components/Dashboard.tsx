import './Dashboard.css';
import ChartsRow from './ChartsRow.tsx';
import CountryDrawer from './CountryDrawer.tsx';
import KpiRow from './KpiRow.tsx';
import Leaderboard from './Leaderboard.tsx';
import ModelQualityCard from './ModelQualityCard.tsx';
import RulesPanel from './RulesPanel.tsx';
import WorldMap from './WorldMap.tsx';
import { fmtCount } from '../lib/format.ts';
import { useStore } from '../store.ts';

export default function Dashboard() {
  const fileName = useStore((s) => s.fileName);
  const result = useStore((s) => s.result);
  const reset = useStore((s) => s.reset);
  if (!result) return null;

  return (
    <div className="dash">
      <header className="dash-header">
        <div className="dash-brand">fraudlens<span className="dash-dot">.</span></div>
        <div className="dash-file muted num">
          {fileName} · {fmtCount(result.totals.rows)} rows
        </div>
        <button className="btn" onClick={reset}>New file</button>
      </header>

      <KpiRow />

      <div className="dash-main">
        <WorldMap />
        <div className="dash-side">
          <RulesPanel />
          <ModelQualityCard />
        </div>
      </div>

      <ChartsRow />
      <Leaderboard />
      <CountryDrawer />
    </div>
  );
}
