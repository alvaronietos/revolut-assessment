import './DrillModal.css';
import TxListView from './TxListView.tsx';
import UserListView from './UserListView.tsx';
import UserProfile from './UserProfile.tsx';
import { useStore } from '../store.ts';
import type { DrillView } from '../types.ts';

function title(view: DrillView): string {
  if (view.kind === 'profile') return `Account ${view.userId.slice(0, 8)}…`;
  return view.title;
}

export default function DrillModal() {
  const stack = useStore((s) => s.drillStack);
  const popDrill = useStore((s) => s.popDrill);
  const closeDrill = useStore((s) => s.closeDrill);
  if (stack.length === 0) return null;
  const top = stack[stack.length - 1];

  return (
    <div className="dm-backdrop" onClick={closeDrill}>
      <div className="dm-panel card" onClick={(e) => e.stopPropagation()}>
        <div className="dm-head">
          <div className="dm-crumbs">
            {stack.map((v, i) => (
              <span key={i} className="dm-crumb">
                {i > 0 && <span className="dm-sep">›</span>}
                <span className={i === stack.length - 1 ? 'dm-crumb-active' : 'muted'}>{title(v)}</span>
              </span>
            ))}
          </div>
          <div className="dm-actions">
            {stack.length > 1 && <button className="btn" onClick={popDrill}>Back</button>}
            <button className="btn" onClick={closeDrill}>Close</button>
          </div>
        </div>
        <div className="dm-body">
          {top.kind === 'profile' && <UserProfile userId={top.userId} />}
          {top.kind === 'txList' && <TxListView view={top} />}
          {top.kind === 'userList' && <UserListView view={top} />}
        </div>
      </div>
    </div>
  );
}
