import ColumnMapping from './components/ColumnMapping.tsx';
import Dashboard from './components/Dashboard.tsx';
import Landing from './components/Landing.tsx';
import ProgressOverlay from './components/ProgressOverlay.tsx';
import { useStore } from './store.ts';

export default function App() {
  const view = useStore((s) => s.view);
  const parsing = useStore((s) => s.progress !== null);

  return (
    <>
      {view === 'landing' && <Landing />}
      {view === 'mapping' && <ColumnMapping />}
      {view === 'dashboard' && <Dashboard />}
      {parsing && <ProgressOverlay />}
    </>
  );
}
