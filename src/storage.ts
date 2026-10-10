import type { DashboardState } from './types';
import { validPosition } from './cardLayout';

const STORAGE_KEY = 'dashboardState';
const DEV_STORAGE_KEY = 'new-tab-dashboard:storage:v1';
const LEGACY_STORAGE_KEY = 'new-tab-dashboard:v2';
const SCHEMA_VERSION = 1;

interface PersistedDashboard {
  schemaVersion: number;
  data: DashboardState;
}

const emptyState = (): DashboardState => ({
  groups: [{ id: 'dashboard', title: '快捷入口', sections: [] }],
  userName: '',
});

function hasChromeStorage() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function isDashboardState(value: unknown): value is DashboardState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DashboardState>;
  return Array.isArray(candidate.groups);
}

function normalizeDashboardState(value: DashboardState): DashboardState {
  const legacyPosition = (section: DashboardState['groups'][number]['sections'][number]) => {
    const closest = Object.entries(section.layouts ?? {})
      .filter(([key, position]) => /^\d+$/.test(key) && position)
      .sort(([a], [b]) => Math.abs(Number(a) - 12) - Math.abs(Number(b) - 12))[0]?.[1];
    return closest ?? section.layouts?.wide ?? section.layouts?.regular
      ?? section.layouts?.narrow ?? section.layout;
  };

  const sections = value.groups.flatMap((group) => Array.isArray(group.sections) ? group.sections : [])
    .map((section, index) => ({ section, index, position: legacyPosition(section) }))
    .sort((a, b) => {
      if (!a.position || !b.position) return a.position ? -1 : b.position ? 1 : a.index - b.index;
      return a.position.y - b.position.y || a.position.x - b.position.x || a.index - b.index;
    })
    .map(({ section }) => ({
      ...section,
      gridPositionUnit: 1,
      gridPositions: Object.fromEntries(Object.entries(section.gridPositions ?? {})
        .filter(([key, position]) => /^[1-9]\d*$/.test(key) && validPosition(position))
        .map(([key, position]) => [key, { x: position!.x, y: position!.y * (section.gridPositionUnit === 1 ? 1 : 22) }])),
      columns: undefined,
      layout: undefined,
      layouts: undefined,
    }));

  return {
    userName: typeof value.userName === 'string' ? value.userName.trim() : '',
    // Keep every existing link while converting older two-level layouts to one card grid.
    groups: [{
      id: 'dashboard',
      title: '快捷入口',
      sections,
    }],
  };
}

function unpack(value: unknown): DashboardState | null {
  if (!value || typeof value !== 'object') return null;
  const persisted = value as Partial<PersistedDashboard>;
  if (persisted.schemaVersion !== SCHEMA_VERSION || !isDashboardState(persisted.data)) {
    return null;
  }
  return normalizeDashboardState(persisted.data);
}

function readLocalStorage(key: string): unknown {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export async function loadDashboardState(): Promise<DashboardState> {
  if (hasChromeStorage()) {
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const state = unpack(stored[STORAGE_KEY]);
      if (state) return state;
    } catch {
      // Continue to the legacy migration and safe default.
    }
  } else {
    const state = unpack(readLocalStorage(DEV_STORAGE_KEY));
    if (state) return state;
  }

  // Migrate the previous localStorage format once without losing user data.
  const legacyState = readLocalStorage(LEGACY_STORAGE_KEY);
  if (isDashboardState(legacyState)) {
    const normalizedState = normalizeDashboardState(legacyState);
    await saveDashboardState(normalizedState);
    return normalizedState;
  }

  return emptyState();
}

export async function saveDashboardState(state: DashboardState): Promise<void> {
  const persisted: PersistedDashboard = {
    schemaVersion: SCHEMA_VERSION,
    data: state,
  };

  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [STORAGE_KEY]: persisted });
    return;
  }

  localStorage.setItem(DEV_STORAGE_KEY, JSON.stringify(persisted));
}

export function downloadDashboardBackup(state: DashboardState) {
  const backup: PersistedDashboard & { exportedAt: string } = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: state,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `new-tab-backup-${date}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readDashboardBackup(file: File): Promise<DashboardState> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('文件不是有效的 JSON。');
  }

  const state = unpack(parsed);
  if (!state) {
    throw new Error('备份文件格式或版本不受支持。');
  }
  return state;
}
