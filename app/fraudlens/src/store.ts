import * as Papa from 'papaparse';
import { create } from 'zustand';

import { guessColumnMap } from './lib/columnGuess.ts';
import { DEFAULT_CONFIG } from './lib/rules.ts';
import { downloadCsvText } from './lib/csv.ts';
import {
  REQUIRED_FIELDS,
  type AggregateResult,
  type CanonicalField,
  type ColumnMap,
  type DrillView,
  type FilterSpec,
  type FilteredResult,
  type RuleConfig,
  type UserDetail,
  type WorkerToMain,
} from './types.ts';

const PREVIEW_CAP = 2000;

function specKey(s: FilterSpec): string {
  return s.kind === 'user' ? `u:${s.userId}` : s.kind === 'type' ? `t:${s.txType}` : `a:${s.min}-${s.max}`;
}

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
  mapFocus: string | null;          // ISO2 the map is zoomed to, null = world
  drillStack: DrillView[];          // drill-down modal view stack, empty = closed
  userRows: UserDetail | null;      // fetched rows backing the current profile
  filtered: FilteredResult | null;  // fetched rows backing the current tx list
  drillLoading: boolean;
  exportBusy: boolean;
  openFile: (file: File | string, name: string) => void;
  setMapping: (field: CanonicalField, header: string | null) => void;
  startAnalysis: () => void;
  setRuleConfig: (patch: Partial<RuleConfig>) => void;
  toggleRule: (ruleId: keyof RuleConfig['enabled']) => void;
  setLens: (lens: Lens) => void;
  setMetric: (metric: MapMetric) => void;
  openDrawer: (iso2: string | null) => void;
  focusCountry: (iso2: string | null) => void;
  openUser: (userId: string) => void;
  openTxList: (spec: FilterSpec, title: string) => void;
  openUserList: (ids: string[], title: string) => void;
  exportSpec: (spec: FilterSpec) => void;
  popDrill: () => void;
  closeDrill: () => void;
  reset: () => void;
}

let worker: Worker | null = null;
let drillWorker: Worker | null = null;
const userCache = new Map<string, UserDetail>();

function getDrillWorker(): Worker {
  if (!drillWorker) {
    drillWorker = new Worker(new URL('./workers/parse.worker.ts', import.meta.url), { type: 'module' });
  }
  return drillWorker;
}

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
  mapFocus: null,
  drillStack: [],
  userRows: null,
  filtered: null,
  drillLoading: false,
  exportBusy: false,

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
      } else if (msg.type === 'complete') {
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

  setLens: (lens) => set({ lens, drawerCountry: null, mapFocus: null }),
  setMetric: (metric) => set({ metric }),
  openDrawer: (iso2) => set({ drawerCountry: iso2 }),

  focusCountry: (iso2) => set({ mapFocus: iso2, drawerCountry: iso2 }),

  openUser: (userId) => {
    set((s) => ({ drillStack: [...s.drillStack, { kind: 'profile', userId }] }));
    const cached = userCache.get(userId);
    if (cached) {
      set({ userRows: cached, drillLoading: false });
      return;
    }
    const { pendingFile, columnMap } = get();
    if (!pendingFile || !columnMap?.USER_ID) return;
    set({ drillLoading: true });
    fetchSpec(get, set, { kind: 'user', userId });
  },

  openTxList: (spec, title) => {
    set((s) => ({ drillStack: [...s.drillStack, { kind: 'txList', spec, title }] }));
    if (get().filtered && specKey(get().filtered!.spec) === specKey(spec)) {
      set({ drillLoading: false });
      return;
    }
    set({ drillLoading: true, filtered: null });
    fetchSpec(get, set, spec);
  },

  openUserList: (ids, title) => {
    set((s) => ({ drillStack: [...s.drillStack, { kind: 'userList', ids, title }], drillLoading: false }));
  },

  exportSpec: (spec) => {
    const { pendingFile, columnMap } = get();
    if (!pendingFile || !columnMap) return;
    set({ exportBusy: true });
    const w = getDrillWorker();
    const prev = w.onmessage;
    w.onmessage = (e: MessageEvent<WorkerToMain>) => {
      const msg = e.data;
      if (msg.type === 'exportReady') {
        downloadCsvText(msg.csv, msg.filename);
        set({ exportBusy: false });
        w.onmessage = prev;
      } else if (msg.type === 'error') {
        set({ error: msg.message, exportBusy: false });
        w.onmessage = prev;
      }
    };
    w.postMessage({ type: 'exportFiltered', file: pendingFile, columnMap, spec });
  },

  popDrill: () => {
    set((s) => ({ drillStack: s.drillStack.slice(0, -1) }));
    const top = get().drillStack.at(-1);
    if (!top) return;
    if (top.kind === 'profile') {
      const cached = userCache.get(top.userId);
      if (cached) set({ userRows: cached, drillLoading: false });
      else { set({ drillLoading: true }); fetchSpec(get, set, { kind: 'user', userId: top.userId }); }
    } else if (top.kind === 'txList') {
      if (get().filtered && specKey(get().filtered!.spec) === specKey(top.spec)) set({ drillLoading: false });
      else { set({ drillLoading: true }); fetchSpec(get, set, top.spec); }
    }
  },

  closeDrill: () => set({ drillStack: [], drillLoading: false }),

  reset: () => {
    worker?.terminate();
    worker = null;
    drillWorker?.terminate();
    drillWorker = null;
    userCache.clear();
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
      mapFocus: null,
      drillStack: [],
      userRows: null,
      filtered: null,
      drillLoading: false,
      exportBusy: false,
    });
  },
}));

type Get = () => State;
type Set = (partial: Partial<State> | ((s: State) => Partial<State>)) => void;

// Shared fetch: re-reads the file filtered by the spec and stores the result on
// the matching slot (profile rows for a user spec, tx list otherwise). Ignores
// stale responses once the stack has moved on.
function fetchSpec(get: Get, set: Set, spec: FilterSpec) {
  const { pendingFile, columnMap } = get();
  if (!pendingFile || !columnMap) return;
  const w = getDrillWorker();
  w.onmessage = (e: MessageEvent<WorkerToMain>) => {
    const msg = e.data;
    if (msg.type === 'filteredRows') {
      const top = get().drillStack.at(-1);
      if (msg.spec.kind === 'user') {
        const detail: UserDetail = { userId: msg.spec.userId, headers: msg.headers, rows: msg.rows };
        userCache.set(msg.spec.userId, detail);
        if (top?.kind === 'profile' && top.userId === msg.spec.userId) set({ userRows: detail, drillLoading: false });
      } else {
        const res: FilteredResult = { spec: msg.spec, headers: msg.headers, rows: msg.rows, total: msg.total, capped: msg.capped };
        if (top?.kind === 'txList' && specKey(top.spec) === specKey(msg.spec)) set({ filtered: res, drillLoading: false });
      }
    } else if (msg.type === 'error') {
      set({ error: msg.message, drillLoading: false });
    }
  };
  const cap = spec.kind === 'user' ? 100000 : PREVIEW_CAP;
  w.postMessage({ type: 'fetchFiltered', file: pendingFile, columnMap, spec, cap });
}

// Console access to the store when the page is opened with ?debug — handy for
// poking at state during development without installing devtools.
if (typeof window !== 'undefined' && window.location.search.includes('debug')) {
  (window as unknown as { __fraudlens?: unknown }).__fraudlens = useStore;
}
