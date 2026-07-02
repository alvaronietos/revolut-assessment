import { useMemo } from 'react';

import './CountryDrawer.css';
import { getDerived } from '../lib/derived.ts';
import { countryName } from '../lib/countries.ts';
import { fmtCount, fmtGbp, fmtPct } from '../lib/format.ts';
import { useStore } from '../store.ts';
import { TX_TYPES, type UserAgg } from '../types.ts';

export default function CountryDrawer() {
  const result = useStore((s) => s.result);
  const ruleConfig = useStore((s) => s.ruleConfig);
  const lens = useStore((s) => s.lens);
  const iso2 = useStore((s) => s.drawerCountry);
  const openDrawer = useStore((s) => s.openDrawer);
  const openUser = useStore((s) => s.openUser);

  const detail = useMemo(() => {
    if (!result || !iso2) return null;
    const countries = lens === 'residence' ? result.residenceCountries : result.merchantCountries;
    const agg = countries.get(iso2);
    if (!agg) return null;
    const derived = getDerived(result, ruleConfig);
    const hasLabels = result.totals.hasLabels;

    const inCountry = (u: UserAgg) =>
      lens === 'residence' ? u.residence === iso2 : (u.merchantCountries[iso2] ?? 0) > 0;

    const flaggedHere = derived.scored.filter((s) => inCountry(s.user));

    // Suspicious tx in this country: labelled fraud, or flagged users' traffic.
    const userSuspicious = (u: UserAgg) => {
      if (hasLabels) {
        return lens === 'residence' ? u.fraudTxCount : Math.min(u.fraudTxCount, u.merchantCountries[iso2] ?? 0);
      }
      return lens === 'residence' ? u.txCount : (u.merchantCountries[iso2] ?? 0);
    };
    let suspiciousTotal = 0;
    let topUser: UserAgg | null = null;
    let topShareTx = 0;
    const pool = hasLabels
      ? [...result.users.values()].filter((u) => u.fraudTxCount > 0 && inCountry(u))
      : flaggedHere.map((s) => s.user);
    for (const u of pool) {
      const n = userSuspicious(u);
      suspiciousTotal += n;
      if (n > topShareTx) {
        topShareTx = n;
        topUser = u;
      }
    }
    // Country-level dominance: one account owns half or more of the country's
    // suspicious traffic. Corridor dominance can hold on its own even when the
    // country as a whole is spread across several flagged accounts.
    const countryShare =
      topUser && suspiciousTotal > 0 ? topShareTx / suspiciousTotal : 0;
    const touchesCountry = (key: string) =>
      lens === 'residence' ? key.startsWith(`${iso2}>`) : key.endsWith(`>${iso2}`);
    let corridorTop: { userId: string; share: number; corridorKey: string } | null = null;
    for (const u of pool) {
      const c = derived.rules.corridorShares.get(u.userId);
      if (c && c.share >= ruleConfig.concentrationMinShare && touchesCountry(c.corridorKey)) {
        if (!corridorTop || c.share > corridorTop.share) {
          corridorTop = { userId: u.userId, share: c.share, corridorKey: c.corridorKey };
        }
      }
    }
    const concentration =
      countryShare >= 0.5 || corridorTop
        ? {
            countryShare: countryShare >= 0.5 ? countryShare : null,
            corridor:
              corridorTop && (countryShare < 0.5 || corridorTop.userId === topUser?.userId)
                ? corridorTop
                : null,
          }
        : null;

    const exposure = flaggedHere.reduce((acc, s) => acc + s.user.sumGbp, 0);
    return { agg, flaggedHere, suspiciousTotal, concentration, exposure, hasLabels };
  }, [result, ruleConfig, lens, iso2]);

  if (!result || !iso2 || !detail) return null;
  const { agg, flaggedHere, suspiciousTotal, concentration, exposure, hasLabels } = detail;
  const word = hasLabels ? 'fraud' : 'flagged';
  const maxType = Math.max(1, ...TX_TYPES.map((t) => agg.byType[t]));

  return (
    <>
      <div className="drawer-backdrop" onClick={() => openDrawer(null)} />
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <h3>{countryName(iso2)}</h3>
            <span className="muted">
              {lens === 'residence' ? 'user residence' : 'merchant country'} view
            </span>
          </div>
          <button className="btn drawer-close" onClick={() => openDrawer(null)}>✕</button>
        </div>

        <div className="drawer-stats">
          <div><span className="muted">Transactions</span><strong className="num">{fmtCount(agg.txCount)}</strong></div>
          <div><span className="muted">Users</span><strong className="num">{fmtCount(agg.userCount)}</strong></div>
          <div><span className="muted">{word} tx</span><strong className="num">{fmtCount(suspiciousTotal)}</strong></div>
          <div>
            <span className="muted">{word} rate</span>
            <strong className="num">{fmtPct(agg.txCount > 0 ? suspiciousTotal / agg.txCount : 0)}</strong>
          </div>
          <div><span className="muted">Flagged exposure</span><strong className="num">{fmtGbp(exposure)}</strong></div>
        </div>

        {concentration && (
          <div className="drawer-alert">
            {concentration.countryShare !== null ? (
              <>
                1 user accounts for {Math.round(concentration.countryShare * 100)}% of{' '}
                {countryName(iso2)}&apos;s {word} transactions
                {concentration.corridor && (
                  <>
                    {' '}and {Math.round(concentration.corridor.share * 100)}% of the{' '}
                    {concentration.corridor.corridorKey.replace('>', '→')} corridor
                  </>
                )}
              </>
            ) : (
              concentration.corridor && (
                <>
                  1 user accounts for {Math.round(concentration.corridor.share * 100)}% of the{' '}
                  {concentration.corridor.corridorKey.replace('>', '→')} corridor
                </>
              )
            )}
          </div>
        )}

        <div className="drawer-section">
          <div className="card-title">Transaction mix</div>
          {TX_TYPES.filter((t) => agg.byType[t] > 0).map((t) => (
            <div key={t} className="drawer-bar-row">
              <span className="drawer-bar-label">{t.replaceAll('_', ' ').toLowerCase()}</span>
              <div className="drawer-bar">
                <div className="drawer-bar-fill" style={{ width: `${(agg.byType[t] / maxType) * 100}%` }} />
              </div>
              <span className="muted num">{fmtCount(agg.byType[t])}</span>
            </div>
          ))}
        </div>

        <div className="drawer-section">
          <div className="card-title">Top flagged users here</div>
          {flaggedHere.length === 0 && <div className="muted">No flagged users in this country.</div>}
          {flaggedHere.slice(0, 5).map((s) => (
            <button
              key={s.user.userId}
              className="drawer-user"
              title={`${s.user.userId} — view transactions`}
              onClick={() => openUser(s.user.userId)}
            >
              <span className="num drawer-user-id">{s.user.userId.slice(0, 8)}…</span>
              <span className="muted num">{fmtCount(s.user.txCount)} tx</span>
              <span className="muted num">{fmtGbp(s.user.sumGbp)}</span>
              <span className="badge drawer-score num">{Math.round(s.score)}</span>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}
