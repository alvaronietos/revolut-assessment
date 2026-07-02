import * as Papa from 'papaparse';
import { create } from 'zustand';

import { guessColumnMap } from './lib/columnGuess.ts';
import { DEFAULT_CONFIG } from './lib/rules.ts';
import {
  REQUIRED_FIELDS,
  type AggregateResult,
  type CanonicalField,
  type ColumnMap,
  type RuleConfig,
  type WorkerToMain,
} from './types.ts';

export type View = 'landing' | 'mapping' | 'dashboard';
export type Lens = 'residence' | 'merchant';
export type MapMetric = 'count' | 'rate' | 'exposure';

interface Progress {
  rowsParsed: number;
  bytesRead: number;
  totalBytes: number;
}

interface State {
  view: View;
  fileName: string;
  pendingFile: File | string | null;
  headers: string[];
  previewRows: Record<string, string>[];
  columnMap: ColumnMap | null;
  progress: Progress | null;
  result: AggregateResult | null;
  ruleConfig: RuleConfig;
  error: string | null;
  lens: Lens;
  metric: MapMetric;
  drawerCountry: string | null;
  openFile: (file: File | string, name: string) => void;
  setMapping: (field: CanonicalField, header: string | null) => void;
  startAnalysis: () => void;
  setRuleConfig: (patch: Partial<RuleConfig>) => void;
  toggleRule: (ruleId: keyof RuleConfig['enabled']) => void;
  setLens: (lens: Lens) => void;
  setMetric: (metric: MapMetric) => void;
  openDrawer: (iso2: string | null) => void;
  reset: () => void;
}

let worker: Worker | null = null;

export function mappingIsValid(map: ColumnMap | null): boolean {
  if (!map) return false;
  const chosen = REQUIRED_FIELDS.map((f) => map[f]);
  if (chosen.some((h) => !h)) return false;
  return new Set(chosen).size === chosen.length;
}

export const useStore = create<State>((set, get) => ({
  view: 'landing',
  fileName: '',
  pendingFile: null,
  headers: [],
  previewRows: [],
  columnMap: null,
  progress: null,
  result: null,
  ruleConfig: DEFAULT_CONFIG,
  error: null,
  lens: 'residence',
  metric: 'count',
  drawerCountry: null,

  openFile: (file, name) => {
    set({ error: null, fileName: name, pendingFile: file });
    Papa.parse<Record<string, string>>(file as never, {
      header: true,
      preview: 50,
      skipEmptyLines: true,
      complete: (res) => {
        const headers = res.meta.fields ?? [];
        if (headers.length < 5) {
          set({ error: 'That file has fewer than 5 columns — is it really a transactions CSV?', pendingFile: null });
          return;
        }
        set({
          headers,
          previewRows: res.data.slice(0, 5),
          columnMap: guessColumnMap(headers),
          view: 'mapping',
        });
      },
      error: (err: Error) => set({ error: err.message, pendingFile: null }),
    });
  },

  setMapping: (field, header) => {
    const map = get().columnMap;
    if (!map) return;
    set({ columnMap: { ...map, [field]: header } });
  },

  startAnalysis: () => {
    const { pendingFile, columnMap } = get();
    if (!pendingFile || !mappingIsValid(columnMap)) return;
    worker?.terminate();
    worker = new Worker(new URL('./workers/parse.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorkerToMain>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        set({ progress: { rowsParsed: msg.rowsParsed, bytesRead: msg.bytesRead, totalBytes: msg.totalBytes } });
      } else if (msg.type === 'error') {
        set({ error: msg.message, progress: null });
      } else {
        set({ result: msg.result, progress: null, view: 'dashboard', drawerCountry: null });
      }
    };
    worker.onerror = (e) => set({ error: e.message, progress: null });
    set({ progress: { rowsParsed: 0, bytesRead: 0, totalBytes: 1 } });
    worker.postMessage({ type: 'parse', file: pendingFile, columnMap });
  },

  setRuleConfig: (patch) => set({ ruleConfig: { ...get().ruleConfig, ...patch } }),

  toggleRule: (ruleId) => {
    const cfg = get().ruleConfig;
    set({ ruleConfig: { ...cfg, enabled: { ...cfg.enabled, [ruleId]: !cfg.enabled[ruleId] } } });
  },

  setLens: (lens) => set({ lens, drawerCountry: null }),
  setMetric: (metric) => set({ metric }),
  openDrawer: (iso2) => set({ drawerCountry: iso2 }),

  reset: () => {
    worker?.terminate();
    worker = null;
    set({
      view: 'landing',
      fileName: '',
      pendingFile: null,
      headers: [],
      previewRows: [],
      columnMap: null,
      progress: null,
      result: null,
      ruleConfig: DEFAULT_CONFIG,
      error: null,
      lens: 'residence',
      metric: 'count',
      drawerCountry: null,
    });
  },
}));

// Console access to the store when the page is opened with ?debug — handy for
// poking at state during development without installing devtools.
if (typeof window !== 'undefined' && window.location.search.includes('debug')) {
  (window as unknown as { __fraudlens?: unknown }).__fraudlens = useStore;
}
