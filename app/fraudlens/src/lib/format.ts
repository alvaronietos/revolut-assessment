// Every number shown in the UI goes through one of these three.

export function fmtCount(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toLocaleString('en-GB');
}

export function fmtGbp(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `£${(n / 1_000).toFixed(0)}k`;
  if (abs >= 100) return `£${Math.round(n).toLocaleString('en-GB')}`;
  return `£${n.toFixed(2)}`;
}

export function fmtPct(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return '—';
  return `${(fraction * 100).toFixed(digits)}%`;
}
