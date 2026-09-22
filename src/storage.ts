import type { DashboardState } from './types';

const STORAGE_KEY = 'dashboardState';
const DEV_STORAGE_KEY = 'new-tab-dashboard:storage:v1';
const LEGACY_STORAGE_KEY = 'new-tab-dashboard:v2';
const SCHEMA_VERSION = 1;

interface PersistedDashboard {
  schemaVersion: number;
  data: DashboardState;
}

const emptyState = (): DashboardState => ({
  groups: [],
  userName: '',
  todos: [],
  todoCollapsed: true,
  collapsedSectionIds: [],
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
  return {
    groups: value.groups,
    userName: typeof value.userName === 'string' ? value.userName.trim() : '',
    todoCollapsed:
      typeof value.todoCollapsed === 'boolean' ? value.todoCollapsed : true,
    collapsedSectionIds: Array.isArray(value.collapsedSectionIds)
      ? value.collapsedSectionIds.filter((id): id is string => typeof id === 'string')
      : [],
    todos: Array.isArray(value.todos)
      ? value.todos
          .filter(
            (todo) =>
              todo &&
              typeof todo === 'object' &&
              typeof todo.id === 'string' &&
              typeof todo.title === 'string',
          )
          .map((todo) => ({
            id: todo.id,
            title: todo.title,
            content: typeof todo.content === 'string' ? todo.content : '',
            color:
              typeof todo.color === 'string' && /^#[0-9a-f]{6}$/i.test(todo.color)
                ? todo.color
                : '#1d4ed8',
          }))
      : [],
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
