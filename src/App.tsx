import {
  Check,
  Database,
  GripVertical,
  ImagePlus,
  LayoutGrid,
  PanelRight,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  BackupDialog,
  BookmarkImportDialog,
  ConfirmDialog,
  FavoritesDialog,
  NameDialog,
  ShortcutDialog,
} from './dialogs';
import {
  buildGroupsFromBookmarks,
  requestChromeBookmarks,
  type BookmarkImportNode,
} from './bookmarks';
import { getFaviconCandidates } from './favicon';
import { reorderFavorites } from './favoriteOrder';
import { shortcutIconMap } from './iconCatalog';
import {
  downloadDashboardBackup,
  loadDashboardState,
  readDashboardBackup,
  saveDashboardState,
} from './storage';
import type { DashboardGroup, Shortcut, TodoItem } from './types';
import { TodoPanel } from './TodoPanel';
import { buildCardLayout, fitCardLayout, moveLayoutCard, snapCardPosition, CARD_GAP, CARD_ROW_HEIGHT, CARD_ROW_STEP, type CardPosition } from './cardLayout';

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void>; skipTransition: () => void };
};

function commitWithAnimation(update: () => void) {
  const startViewTransition = (document as ViewTransitionDocument).startViewTransition;
  if (!startViewTransition) {
    update();
    return;
  }

  startViewTransition.call(document, () => flushSync(update));
}

type ShortcutDialogTarget =
  | { mode: 'favorite' }
  | { mode: 'add'; groupId: string; sectionId: string }
  | { mode: 'edit'; groupId: string; sectionId: string; shortcut: Shortcut };

type NameDialogState =
  | { kind: 'section'; groupId: string }
  | { kind: 'edit-section'; groupId: string; sectionId: string; title: string }
  | { kind: 'user' }
  | null;

type ConfirmDialogState =
  | { kind: 'section'; groupId: string; sectionId: string; title: string }
  | { kind: 'shortcut'; groupId: string; sectionId: string; shortcutId: string; title: string }
  | null;

type DraggedSection = { groupId: string; sectionId: string };
type CardDropTarget = CardPosition;
type DraggedShortcut = DraggedSection & { shortcutId: string };
type ShortcutDropTarget = DraggedSection & {
  shortcutId: string | null;
  position: 'before' | 'after';
};
type ShortcutTooltip = {
  shortcutId: string;
  title: string;
  url: string;
  left: number;
  top: number;
  above: boolean;
};

function ShortcutVisual({ shortcut }: { shortcut: Shortcut }) {
  const [faviconCandidateIndex, setFaviconCandidateIndex] = useState(0);
  const Icon = shortcutIconMap.globe;
  const faviconCandidates = getFaviconCandidates(shortcut.url);
  const faviconKey = faviconCandidates.join('|');
  const faviconUrl = faviconCandidates[faviconCandidateIndex];

  useEffect(() => {
    setFaviconCandidateIndex(0);
  }, [faviconKey]);

  if (faviconUrl) {
    return (
      <img
        className="shortcut-favicon"
        src={faviconUrl}
        alt=""
        draggable={false}
        onError={() => setFaviconCandidateIndex((current) => current + 1)}
      />
    );
  }

  return <Icon size={23} />;
}

function App() {
  const [viewMode, setViewMode] = useState<'simple' | 'cards'>('simple');
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [groups, setGroups] = useState<DashboardGroup[]>([]);
  const [favoriteShortcutIds, setFavoriteShortcutIds] = useState<string[]>([]);
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false);
  const [editingFavorites, setEditingFavorites] = useState(false);
  const [draggedFavoriteId, setDraggedFavoriteId] = useState<string | null>(null);
  const [favoriteDropTarget, setFavoriteDropTarget] = useState<{ id: string; after: boolean } | null>(null);
  const [favoritePreviewIds, setFavoritePreviewIds] = useState<string[] | null>(null);
  const favoriteGridRef = useRef<HTMLDivElement>(null);
  const favoritePositionsRef = useRef(new Map<string, DOMRect>());
  const favoriteHoverRef = useRef<string | null>(null);
  const [shortcutSearch, setShortcutSearch] = useState('');
  const [wallpaperUrl, setWallpaperUrl] = useState('https://picsum.photos/1920/1080');
  const [wallpaperLoading, setWallpaperLoading] = useState(false);
  const [wallpaperError, setWallpaperError] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [userName, setUserName] = useState('');
  const simpleView = viewMode === 'simple' && !isEditMode;
  const [isHydrated, setIsHydrated] = useState(false);
  const [now, setNow] = useState(new Date());
  const [shortcutDialog, setShortcutDialog] = useState<ShortcutDialogTarget | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [bookmarkTree, setBookmarkTree] = useState<BookmarkImportNode[] | null>(null);
  const [draggedSection, setDraggedSection] = useState<DraggedSection | null>(null);
  const [cardDragPoint, setCardDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [cardDropTarget, setCardDropTarget] = useState<CardDropTarget | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [railColumns, setRailColumns] = useState(1);
  const [railHeight, setRailHeight] = useState(1);
  const [sectionPages, setSectionPages] = useState<Record<string, number>>({});
  const shortcutRows = Math.max(1, Math.floor((railHeight - CARD_GAP - 104) / 89));
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const sections = groups.flatMap((group) => group.sections);
  const cardLayout = fitCardLayout(buildCardLayout(sections.map((section) => ({
    id: section.id,
    rows: Math.max(1, Math.ceil(((cardHeights[section.id] ?? (section.shortcuts.length
      ? 48 + 20 + Math.ceil(section.shortcuts.length / 4) * 89 : 140)) + CARD_GAP) / CARD_ROW_STEP)),
    position: section.gridPositions?.[railColumns],
  })), railColumns), railHeight);
  const previewLayout = draggedSection && cardDropTarget
    ? fitCardLayout(moveLayoutCard(cardLayout, draggedSection.sectionId, cardDropTarget), railHeight) : cardLayout;
  const canvasColumns = Math.max(railColumns, ...previewLayout.map((card) => card.x + 1));
  const [draggedShortcut, setDraggedShortcut] = useState<DraggedShortcut | null>(null);
  const [shortcutDropTarget, setShortcutDropTarget] = useState<ShortcutDropTarget | null>(null);
  const [shortcutTooltip, setShortcutTooltip] = useState<ShortcutTooltip | null>(null);
  const cardDragRef = useRef<{
    source: DraggedSection;
    startX: number;
    startY: number;
    target: CardDropTarget | null;
    active: boolean;
    offsetY: number;
  } | null>(null);


  useEffect(() => {
    let cancelled = false;
    void loadDashboardState().then((state) => {
      if (cancelled) return;
      setGroups(state.groups);
      setFavoriteShortcutIds(state.favoriteShortcutIds ?? []);
      setUserName(state.userName);
      setTodos(state.todos ?? []);
      setViewMode(state.viewMode ?? 'simple');
      setIsHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    void saveDashboardState({ groups, userName, todos, viewMode, favoriteShortcutIds }).catch((error) => {
      console.error('Failed to save dashboard state:', error);
    });
  }, [groups, isHydrated, userName, todos, viewMode, favoriteShortcutIds]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const measure = () => {
      const width = rail.clientWidth;
      setRailHeight(Math.max(1, rail.clientHeight - 14));
      setRailColumns(Math.max(1, Math.floor((width + CARD_GAP) / (380 + CARD_GAP))));
      const heights: Record<string, number> = {};
      rail.querySelectorAll<HTMLElement>('.shortcut-section').forEach((card) => {
        heights[card.dataset.sectionId!] = card.getBoundingClientRect().height;
      });
      setCardHeights((current) => Object.entries(heights).some(([id, height]) =>
        Math.abs((current[id] ?? 0) - height) > 1) ? heights : current);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    rail.querySelectorAll('.shortcut-section').forEach((card) => observer.observe(card));
    measure();
    return () => observer.disconnect();
  }, [groups, isEditMode, simpleView]);

  const time = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  const date = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(now);

  const shortcutSearchQuery = shortcutSearch.trim().toLocaleLowerCase();
  const allShortcuts = useMemo(() => groups.flatMap((group) => group.sections)
    .flatMap((section) => section.shortcuts), [groups]);
  const favoriteShortcuts = useMemo(() => favoriteShortcutIds.flatMap((id) => {
    const shortcut = allShortcuts.find((item) => item.id === id);
    return shortcut ? [shortcut] : [];
  }), [allShortcuts, favoriteShortcutIds]);
  const displayedFavorites = favoritePreviewIds ? favoritePreviewIds.flatMap((id) => {
    const shortcut = allShortcuts.find((item) => item.id === id);
    return shortcut ? [shortcut] : [];
  }) : favoriteShortcuts;
  const visibleFavorites = displayedFavorites.filter((shortcut) =>
    `${shortcut.title} ${shortcut.url}`.toLocaleLowerCase().includes(shortcutSearchQuery));

  function captureFavoritePositions() {
    favoritePositionsRef.current.clear();
    favoriteGridRef.current?.querySelectorAll<HTMLElement>('[data-favorite-id]').forEach((tile) => {
      favoritePositionsRef.current.set(tile.dataset.favoriteId!, tile.getBoundingClientRect());
    });
  }

  useLayoutEffect(() => {
    const previous = favoritePositionsRef.current;
    if (!previous.size) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    favoriteGridRef.current?.querySelectorAll<HTMLElement>('[data-favorite-id]').forEach((tile) => {
      const before = previous.get(tile.dataset.favoriteId!);
      tile.getAnimations().forEach((animation) => animation.cancel());
      if (!before || reduceMotion) return;
      const after = tile.getBoundingClientRect();
      const x = before.left - after.left;
      const y = before.top - after.top;
      if (Math.abs(x) < 1 && Math.abs(y) < 1) return;
      tile.animate([
        { transform: `translate(${x}px, ${y}px)` },
        { transform: 'translate(0, 0)' },
      ], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
    previous.clear();
  }, [favoritePreviewIds, favoriteShortcutIds]);

  function toggleFavorite(id: string) {
    setFavoriteShortcutIds((current) => current.includes(id)
      ? current.filter((item) => item !== id) : [...current, id]);
    setShortcutTooltip(null);
  }

  function moveSection(source: DraggedSection, target: CardDropTarget) {
    const nextLayout = fitCardLayout(moveLayoutCard(cardLayout, source.sectionId, target), railHeight);
    commitWithAnimation(() => {
      setGroups((current) => current.map((group) => ({
        ...group,
        sections: group.sections.map((section) => {
          const position = nextLayout.find((card) => card.id === section.id);
          return position ? { ...section, gridPositionUnit: 1, gridPositions: {
            ...section.gridPositions, [railColumns]: { x: position.x, y: position.y },
          } } : section;
        }),
      })));
    });
  }

  function moveShortcut() {
    if (!draggedShortcut || !shortcutDropTarget) return;
    if (draggedShortcut.shortcutId === shortcutDropTarget.shortcutId) {
      setShortcutDropTarget(null);
      return;
    }

    commitWithAnimation(() => {
      setGroups((current) => {
        const sourceGroup = current.find((group) => group.id === draggedShortcut.groupId);
        const sourceSection = sourceGroup?.sections.find(
          (section) => section.id === draggedShortcut.sectionId,
        );
        const movedShortcut = sourceSection?.shortcuts.find(
          (shortcut) => shortcut.id === draggedShortcut.shortcutId,
        );
        if (!movedShortcut) return current;

        const withoutSource = current.map((group) => ({
          ...group,
          sections: group.sections.map((section) =>
            group.id === draggedShortcut.groupId && section.id === draggedShortcut.sectionId
              ? {
                  ...section,
                  shortcuts: section.shortcuts.filter(
                    (shortcut) => shortcut.id !== draggedShortcut.shortcutId,
                  ),
                }
              : section,
          ),
        }));

        return withoutSource.map((group) => ({
          ...group,
          sections: group.sections.map((section) => {
            if (
              group.id !== shortcutDropTarget.groupId ||
              section.id !== shortcutDropTarget.sectionId
            ) {
              return section;
            }

            const shortcuts = [...section.shortcuts];
            const targetIndex = shortcutDropTarget.shortcutId
              ? shortcuts.findIndex(
                  (shortcut) => shortcut.id === shortcutDropTarget.shortcutId,
                )
              : -1;
            const insertIndex =
              targetIndex < 0
                ? shortcuts.length
                : targetIndex + (shortcutDropTarget.position === 'after' ? 1 : 0);
            shortcuts.splice(insertIndex, 0, movedShortcut);
            return { ...section, shortcuts };
          }),
        }));
      });
    });

    setDraggedShortcut(null);
    setShortcutDropTarget(null);
  }

  function showShortcutTooltip(element: HTMLElement, shortcutId: string, title: string, url: string) {
    const bounds = element.getBoundingClientRect();
    const above = bounds.bottom + 76 > window.innerHeight;
    const halfWidth = Math.min(440, window.innerWidth - 32) / 2;
    setShortcutTooltip({
      shortcutId,
      title,
      url,
      left: Math.min(Math.max(bounds.left + bounds.width / 2, halfWidth + 16), window.innerWidth - halfWidth - 16),
      top: above ? bounds.top - 8 : bounds.bottom + 8,
      above,
    });
  }

  function saveName(title: string) {
    if (!nameDialog) return;

    if (nameDialog.kind === 'user') {
      setUserName(title);
    } else if (nameDialog.kind === 'edit-section') {
      setGroups((current) =>
        current.map((group) =>
          group.id === nameDialog.groupId
            ? {
                ...group,
                sections: group.sections.map((section) =>
                  section.id === nameDialog.sectionId ? { ...section, title } : section,
                ),
              }
            : group,
        ),
      );
    } else {
      setGroups((current) =>
        current.map((group) =>
          group.id === nameDialog.groupId
            ? {
                ...group,
                sections: [
                  ...group.sections,
                  { id: makeId('section'), title, shortcuts: [] },
                ],
              }
            : group,
        ),
      );
    }

    setNameDialog(null);
  }

  function runConfirmedAction() {
    if (!confirmDialog) return;

    if (confirmDialog.kind === 'section') {
      setGroups((current) =>
        current.map((group) =>
          group.id === confirmDialog.groupId
            ? {
                ...group,
                sections: group.sections.filter(
                  (section) => section.id !== confirmDialog.sectionId,
                ),
              }
            : group,
        ),
      );
    } else if (confirmDialog.kind === 'shortcut') {
      setGroups((current) =>
        current.map((group) =>
          group.id === confirmDialog.groupId
            ? {
                ...group,
                sections: group.sections.map((section) =>
                  section.id === confirmDialog.sectionId
                    ? {
                        ...section,
                        shortcuts: section.shortcuts.filter(
                          (item) => item.id !== confirmDialog.shortcutId,
                        ),
                      }
                    : section,
                ),
              }
            : group,
        ),
      );
    }

    setConfirmDialog(null);
  }

  function saveShortcut(shortcut: Omit<Shortcut, 'id'>) {
    if (!shortcutDialog) return;
    if (shortcutDialog.mode === 'favorite') {
      const newShortcut = { ...shortcut, id: makeId('shortcut') };
      setGroups((current) => current.map((group) => {
        if (group.id !== 'dashboard') return group;
        const section = group.sections.find((item) => item.title === '常用');
        return { ...group, sections: section
          ? group.sections.map((item) => item.id === section.id
            ? { ...item, shortcuts: [...item.shortcuts, newShortcut] } : item)
          : [...group.sections, { id: makeId('section'), title: '常用', shortcuts: [newShortcut] }] };
      }));
      setFavoriteShortcutIds((current) => [...current, newShortcut.id]);
      setShortcutDialog(null);
      return;
    }
    const target = shortcutDialog;
    setGroups((current) =>
      current.map((group) =>
        group.id === target.groupId
          ? {
              ...group,
              sections: group.sections.map((section) =>
                section.id === target.sectionId
                  ? {
                      ...section,
                      shortcuts:
                        target.mode === 'edit'
                          ? section.shortcuts.map((item) =>
                              item.id === target.shortcut.id
                                ? { ...shortcut, id: item.id }
                                : item,
                            )
                          : [
                              ...section.shortcuts,
                              { ...shortcut, id: makeId('shortcut') },
                            ],
                    }
                  : section,
              ),
            }
          : group,
      ),
    );
    setShortcutDialog(null);
  }

  function exportBackup() {
    downloadDashboardBackup({ groups, userName, todos, viewMode, favoriteShortcutIds });
  }

  async function importBackup(file: File) {
    const state = await readDashboardBackup(file);
    await saveDashboardState(state);
    setGroups(state.groups);
    setFavoriteShortcutIds(state.favoriteShortcutIds ?? []);
    setUserName(state.userName);
    setTodos(state.todos ?? []);
    setViewMode(state.viewMode ?? 'simple');
  }

  async function openBookmarkImport() {
    const tree = await requestChromeBookmarks();
    setBackupDialogOpen(false);
    setBookmarkTree(tree);
  }

  function importBookmarks(selectedIds: Set<string>) {
    if (!bookmarkTree) return;
    const importedGroups = buildGroupsFromBookmarks(bookmarkTree, selectedIds);
    const importedSections = importedGroups.flatMap((group) => group.sections);
    if (importedSections.length === 0) return;
    setGroups((current) => current.map((group) => group.id === 'dashboard'
      ? { ...group, sections: [...group.sections, ...importedSections] } : group));
    setBookmarkTree(null);
  }

  function switchLayout() {
    setIsEditMode(false);
    setViewMode((current) => current === 'simple' ? 'cards' : 'simple');
    setShortcutTooltip(null);
    void changeWallpaper();
  }

  async function changeWallpaper() {
    if (wallpaperLoading) return;
    setWallpaperLoading(true);
    setWallpaperError('');
    const url = `https://picsum.photos/1920/1080?random=${crypto.randomUUID()}`;
    try {
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        const finish = (error?: Error) => {
          window.clearTimeout(timeout);
          image.onload = null;
          image.onerror = null;
          if (error) reject(error);
          else resolve();
        };
        const timeout = window.setTimeout(() => finish(new Error('timeout')), 20_000);
        image.onload = () => finish();
        image.onerror = () => finish(new Error('load failed'));
        image.src = url;
      });
      setWallpaperUrl(url);
    } catch {
      setWallpaperError('壁纸加载失败，请重试');
    } finally {
      setWallpaperLoading(false);
    }
  }

  const clockBlock = (
        <div className="clock-block" aria-label={`${time}，${date}`}>
          <strong>{time}</strong>
          <div className="clock-details">
            <p>{date}</p>
            <span className="clock-greeting">
              {userName ? (
                <>
                  你好啊，<b className="greeting-user-name">{userName}</b>！新的一天，从专注开始。
                </>
              ) : (
                '你好啊！新的一天，从专注开始。'
              )}
            </span>
          </div>
        </div>
  );

  return (
    <main
      className={`app-shell${simpleView ? ' is-simple-view' : ''}${isEditMode ? ' is-edit-mode' : ' is-use-mode'}`}
      style={{ '--wallpaper-image': `url("${wallpaperUrl}")` } as CSSProperties}
    >
      <header className="topbar">
        <div className="menu-clock" aria-label={`${date}，${time}`}>
          <span>{date}</span>
          <time>{time}</time>
        </div>
        <div className="top-actions">
          <button className="icon-button view-mode-toggle" type="button" title={viewMode === 'simple' ? '切换到卡片版' : '切换到简洁版'}
            aria-label={viewMode === 'simple' ? '切换到卡片版' : '切换到简洁版'}
            onClick={switchLayout}>
            {viewMode === 'simple' ? <LayoutGrid size={18} /> : <PanelRight size={18} />}
          </button>
          <button
            className="icon-button wallpaper-button"
            type="button"
            onClick={() => void changeWallpaper()}
            aria-label={wallpaperLoading ? '正在更换壁纸' : '更换壁纸'}
            title={wallpaperLoading ? '正在更换壁纸…' : '更换壁纸'}
            aria-busy={wallpaperLoading}
            disabled={wallpaperLoading}
          >
            {wallpaperLoading ? <LoaderCircle size={18} className="wallpaper-spinner" /> : <ImagePlus size={18} />}
          </button>
          {wallpaperError && <span className="wallpaper-error" role="alert">{wallpaperError}</span>}
          <button
            className={`icon-button mode-toggle-button${isEditMode ? ' is-active' : ''}`}
            type="button"
            onClick={() => setIsEditMode((current) => !current)}
            aria-pressed={isEditMode}
            aria-label={isEditMode ? '完成编辑' : '编辑布局'}
            title={isEditMode ? '完成编辑' : '编辑布局'}
          >
            {isEditMode ? <Check size={17} /> : <Settings2 size={17} />}
          </button>
          {(isEditMode || (isHydrated && groups.every((group) => group.sections.length === 0))) && (
            <button
              className="icon-button add-group-button"
              type="button"
              aria-label="新建卡片"
              title="新建卡片"
              onClick={() => setNameDialog({ kind: 'section', groupId: 'dashboard' })}
            >
              <Plus size={17} />
            </button>
          )}
          <button
            className="icon-button"
            type="button"
            onClick={() => setBackupDialogOpen(true)}
            aria-label="数据备份与迁移"
            title="数据备份与迁移"
            disabled={!isHydrated}
          >
            <Database size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => setNameDialog({ kind: 'user' })}
            aria-label="设置姓名"
            title="设置姓名"
            disabled={!isHydrated}
          >
            <UserRound size={18} />
          </button>
        </div>
      </header>

      {simpleView ? <div className="simple-dashboard">
        <section className="simple-start" aria-label="时间与快捷入口">
          {clockBlock}
          <div className="simple-shortcut-search" role="search" aria-label="搜索常用入口">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label="搜索常用入口"
              aria-controls="simple-shortcut-results"
              placeholder="搜索常用入口…"
              value={shortcutSearch}
              onChange={(event) => { setShortcutSearch(event.target.value); setShortcutTooltip(null); }}
              onKeyDown={(event) => { if (event.key === 'Escape') setShortcutSearch(''); }}
            />
            {shortcutSearch && <button type="button" aria-label="清空搜索" onClick={() => setShortcutSearch('')}><X size={16} /></button>}
          </div>
          <section className="simple-link-group" aria-label="常用入口">
              <div className="favorites-heading">
                <h2>常用</h2>
                <div className="favorites-actions">
                  {favoriteShortcuts.length > 0 && <button type="button" aria-pressed={editingFavorites} onClick={() => { setEditingFavorites((current) => !current); setShortcutTooltip(null); }}>{editingFavorites ? <Check size={14} /> : <Pencil size={14} />}{editingFavorites ? '完成' : '管理'}</button>}
                  <button type="button" disabled={!isHydrated} onClick={() => setFavoritesDialogOpen(true)}><Plus size={15} />添加常用</button>
                </div>
              </div>
            <div id="simple-shortcut-results" className="simple-shortcuts" onScroll={() => setShortcutTooltip(null)}
              onDragOver={(event) => { if (draggedFavoriteId) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
              onDrop={(event) => {
                if (!draggedFavoriteId) return;
                event.preventDefault();
                if (favoritePreviewIds) setFavoriteShortcutIds(favoritePreviewIds);
                setFavoritePreviewIds(null);
                setDraggedFavoriteId(null);
                setFavoriteDropTarget(null);
                favoriteHoverRef.current = null;
              }}>
              <div ref={favoriteGridRef} className={`simple-link-grid${editingFavorites ? ' is-sorting-favorites' : ''}`}>{visibleFavorites.map((shortcut) => <div
                className={`favorite-link-wrap${draggedFavoriteId === shortcut.id ? ' is-dragging' : ''}${favoriteDropTarget?.id === shortcut.id ? (favoriteDropTarget.after ? ' drop-after' : ' drop-before') : ''}`}
                key={shortcut.id}
                data-favorite-id={shortcut.id}
                onDragOver={(event) => {
                  if (!editingFavorites || !draggedFavoriteId || draggedFavoriteId === shortcut.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  if (favoriteHoverRef.current === shortcut.id) return;
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const after = event.clientX >= bounds.left + bounds.width / 2;
                  favoriteHoverRef.current = shortcut.id;
                  captureFavoritePositions();
                  setFavoritePreviewIds((current) => reorderFavorites(current ?? favoriteShortcutIds, draggedFavoriteId, shortcut.id, after));
                  setFavoriteDropTarget({ id: shortcut.id, after });
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setFavoriteDropTarget((current) => current?.id === shortcut.id ? null : current);
                  }
                }}
                onDrop={(event) => {
                  if (!editingFavorites || !draggedFavoriteId) return;
                  event.preventDefault();
                  event.stopPropagation();
                  if (favoritePreviewIds) setFavoriteShortcutIds(favoritePreviewIds);
                  setFavoritePreviewIds(null);
                  setDraggedFavoriteId(null);
                  setFavoriteDropTarget(null);
                  favoriteHoverRef.current = null;
                }}><a className="simple-link" href={shortcut.url} target="_blank" rel="noreferrer"
                draggable={editingFavorites}
                onClick={(event) => { if (editingFavorites) event.preventDefault(); }}
                onDragStart={(event) => {
                  if (!editingFavorites) return;
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', shortcut.id);
                  setDraggedFavoriteId(shortcut.id);
                  setFavoritePreviewIds(favoriteShortcutIds);
                  favoriteHoverRef.current = null;
                  setShortcutTooltip(null);
                }}
                onDragEnd={() => {
                  captureFavoritePositions();
                  setFavoritePreviewIds(null);
                  setDraggedFavoriteId(null);
                  setFavoriteDropTarget(null);
                  favoriteHoverRef.current = null;
                }}
                aria-label={`${shortcut.title}，地址：${shortcut.url}`}
                aria-describedby={shortcutTooltip?.shortcutId === shortcut.id ? 'shortcut-address-tooltip' : undefined}
                onMouseEnter={(event) => { if (!draggedFavoriteId) showShortcutTooltip(event.currentTarget, shortcut.id, shortcut.title, shortcut.url); }}
                onMouseLeave={() => setShortcutTooltip(null)}
                onFocus={(event) => showShortcutTooltip(event.currentTarget, shortcut.id, shortcut.title, shortcut.url)}
                onBlur={() => setShortcutTooltip(null)}>
                <span className="shortcut-icon"><ShortcutVisual shortcut={shortcut} /></span><span className="simple-link-title">{shortcut.title}</span>
              </a>{editingFavorites && <button className="favorite-remove" type="button" aria-label={`从常用移除${shortcut.title}`} title="从常用移除" onClick={() => toggleFavorite(shortcut.id)}><X size={13} /></button>}</div>)}</div>
              {shortcutSearchQuery && visibleFavorites.length === 0 && <p className="simple-search-empty" role="status">未找到匹配的常用入口</p>}
            </div>
          </section>
        </section>
        <TodoPanel items={todos} onChange={setTodos} disabled={!isHydrated} />
      </div> : <section
        className="dashboard-region"
        aria-label="快捷入口卡片"
      >
        <div className={`group-rail${isEditMode ? ' is-position-editing' : ''}`} ref={railRef} style={{
          gridTemplateColumns: `repeat(${canvasColumns}, 380px)`,
          '--card-max-height': `${Math.max(1, railHeight - CARD_GAP)}px`,
          gridAutoRows: `${CARD_ROW_HEIGHT}px`,
        } as CSSProperties}>
          {draggedSection && cardDropTarget && (() => {
            const moving = previewLayout.find((card) => card.id === draggedSection.sectionId);
            return moving && <div className="card-position-placeholder" aria-hidden="true" style={{
              gridColumn: moving.x + 1, gridRow: `${moving.y + 1} / span ${moving.rows}`,
            }} />;
          })()}
          {isHydrated && groups.every((group) => group.sections.length === 0) && (
            <div className="empty-dashboard">
              <div className="empty-dashboard-icon">
                <Plus size={30} />
              </div>
              <h2>创建你的第一张卡片</h2>
              <p>把常用网站按工作、学习或任何你喜欢的方式整理起来。</p>
              <button
                type="button"
                className="primary-button empty-dashboard-button"
                onClick={() => setNameDialog({ kind: 'section', groupId: 'dashboard' })}
              >
                <Plus size={18} /> 新建卡片
              </button>
            </div>
          )}
          {groups.map((group) => (
            <div className="flat-card-container" key={group.id}>
                {group.sections.map((section) => {
                  const pageSize = shortcutRows * 4;
                  const pageCount = Math.max(1, Math.ceil(section.shortcuts.length / pageSize));
                  const page = Math.min(sectionPages[section.id] ?? 0, pageCount - 1);
                  const pageShortcuts = section.shortcuts.slice(page * pageSize, (page + 1) * pageSize);
                  const isDragging =
                    draggedSection?.groupId === group.id &&
                    draggedSection.sectionId === section.id;
                  const position = previewLayout.find((card) => card.id === section.id)!;

                  return (
                  <section
                    id={`section-${section.id}`}
                    data-section-id={section.id}
                    className={`shortcut-section${isDragging ? ' is-dragging' : ''}`}
                    key={section.id}
                    style={{
                      viewTransitionName: `section-${section.id}`,
                      '--section-rows': Math.max(1, Math.ceil(pageShortcuts.length / 4)),
                      gridColumn: position.x + 1,
                      gridRow: `${position.y + 1} / span ${position.rows}`,
                    } as CSSProperties}
                  >
                    <header className="section-header">
                      <div className="section-title-row">
                        {isEditMode && (
                          <button
                            type="button"
                            className="section-drag-handle"
                            aria-label={`拖动调整${section.title}的位置`}
                            title="拖动卡片到空白处"
                            onPointerDown={(event) => {
                              if (event.button !== 0) return;
                              event.preventDefault();
                              event.currentTarget.setPointerCapture(event.pointerId);
                              cardDragRef.current = {
                                source: { groupId: group.id, sectionId: section.id },
                                startX: event.clientX,
                                startY: event.clientY,
                                target: null,
                                active: false,
                                offsetY: event.clientY - event.currentTarget.closest('.shortcut-section')!.getBoundingClientRect().top,
                              };
                            }}
                            onPointerMove={(event) => {
                              const drag = cardDragRef.current;
                              if (!drag) return;
                              if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
                              if (!drag.active) {
                                drag.active = true;
                                setDraggedSection(drag.source);
                              }
                              setCardDragPoint({ x: event.clientX, y: event.clientY });
                              const rail = railRef.current;
                              if (!rail) return;
                              const bounds = rail.getBoundingClientRect();
                              if (event.clientX < bounds.left || event.clientX > bounds.right ||
                                  event.clientY < bounds.top || event.clientY > bounds.bottom) {
                                drag.target = null;
                                setCardDropTarget(null);
                                return;
                              }
                              if (event.clientX > bounds.right - 40) rail.scrollLeft += 20;
                              else if (event.clientX < bounds.left + 40) rail.scrollLeft -= 20;
                              const columnWidth = 380 + CARD_GAP;
                              drag.target = snapCardPosition(cardLayout, drag.source.sectionId, {
                                x: Math.max(0, Math.min(canvasColumns - 1, Math.floor((event.clientX - bounds.left + rail.scrollLeft) / columnWidth))),
                                y: Math.max(0, Math.round((event.clientY - bounds.top - drag.offsetY) / CARD_ROW_STEP)),
                              });
                              setCardDropTarget(drag.target);
                            }}
                            onPointerUp={() => {
                              const drag = cardDragRef.current;
                              if (drag?.active && drag.target) moveSection(drag.source, drag.target);
                              cardDragRef.current = null;
                              setDraggedSection(null);
                              setCardDragPoint(null);
                              setCardDropTarget(null);
                            }}
                            onPointerCancel={() => {
                              cardDragRef.current = null;
                              setDraggedSection(null);
                              setCardDragPoint(null);
                              setCardDropTarget(null);
                            }}
                          >
                            <GripVertical size={16} />
                          </button>
                        )}
                        <h2>{section.title}</h2>
                      </div>
                      {isEditMode && <div className="section-actions">
                        <button
                          type="button"
                          onClick={() =>
                            setNameDialog({
                              kind: 'edit-section',
                              groupId: group.id,
                              sectionId: section.id,
                              title: section.title,
                            })
                          }
                          aria-label={`修改${section.title}的名称`}
                          title="修改卡片名称"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setShortcutDialog({
                              mode: 'add',
                              groupId: group.id,
                              sectionId: section.id,
                            })
                          }
                          aria-label={`向${section.title}添加快捷入口`}
                          title="添加快捷入口"
                        >
                          <Plus size={17} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDialog({
                              kind: 'section',
                              groupId: group.id,
                              sectionId: section.id,
                              title: section.title,
                            })
                          }
                          aria-label={`删除${section.title}`}
                          title="删除卡片"
                        >
                          <X size={16} />
                        </button>
                      </div>}
                    </header>

                    {section.shortcuts.length > 0 ? (
                      <div
                        className={`shortcut-grid${shortcutDropTarget?.groupId === group.id && shortcutDropTarget.sectionId === section.id && shortcutDropTarget.shortcutId === null ? ' is-drop-target' : ''}`}
                        onDragOver={(event) => {
                          if (!draggedShortcut) return;
                          event.preventDefault();
                          event.stopPropagation();
                          event.dataTransfer.dropEffect = 'move';
                          setShortcutDropTarget({
                            groupId: group.id,
                            sectionId: section.id,
                            shortcutId: null,
                            position: 'after',
                          });
                        }}
                        onDrop={(event) => {
                          if (!draggedShortcut) return;
                          event.preventDefault();
                          event.stopPropagation();
                          moveShortcut();
                        }}
                      >
                        {pageShortcuts.map((shortcut) => {
                          const shortcutDropPosition =
                            shortcutDropTarget?.groupId === group.id &&
                            shortcutDropTarget.sectionId === section.id &&
                            shortcutDropTarget.shortcutId === shortcut.id
                              ? shortcutDropTarget.position
                              : null;
                          return (
                            <div
                              className={`shortcut-tile-wrap${draggedShortcut?.shortcutId === shortcut.id ? ' is-dragging' : ''}${shortcutDropPosition ? ` drop-${shortcutDropPosition}` : ''}`}
                              key={shortcut.id}
                              onDragOver={(event) => {
                                if (!draggedShortcut) return;
                                event.preventDefault();
                                event.stopPropagation();
                                event.dataTransfer.dropEffect = 'move';
                                const bounds = event.currentTarget.getBoundingClientRect();
                                const position =
                                  event.clientX < bounds.left + bounds.width / 2
                                    ? 'before'
                                    : 'after';
                                setShortcutDropTarget({
                                  groupId: group.id,
                                  sectionId: section.id,
                                  shortcutId: shortcut.id,
                                  position,
                                });
                              }}
                              onDrop={(event) => {
                                if (!draggedShortcut) return;
                                event.preventDefault();
                                event.stopPropagation();
                                moveShortcut();
                              }}
                                onContextMenu={(event) => {
                                  if (!isEditMode) return;
                                  event.preventDefault();
                                setConfirmDialog({
                                  kind: 'shortcut',
                                  groupId: group.id,
                                  sectionId: section.id,
                                  shortcutId: shortcut.id,
                                  title: shortcut.title,
                                });
                              }}
                            >
                              <a
                                className="shortcut-tile"
                                href={shortcut.url}
                                target="_blank"
                                rel="noreferrer"
                                draggable={isEditMode}
                                aria-label={`${shortcut.title}，地址：${shortcut.url}`}
                                aria-describedby={
                                  shortcutTooltip?.shortcutId === shortcut.id
                                    ? 'shortcut-address-tooltip'
                                    : undefined
                                }
                                onMouseEnter={(event) =>
                                  showShortcutTooltip(event.currentTarget, shortcut.id, shortcut.title, shortcut.url)
                                }
                                onMouseLeave={() => setShortcutTooltip(null)}
                                onFocus={(event) =>
                                  showShortcutTooltip(event.currentTarget, shortcut.id, shortcut.title, shortcut.url)
                                }
                                onBlur={() => setShortcutTooltip(null)}
                                onDragStart={(event) => {
                                  if (!isEditMode) return;
                                  event.dataTransfer.effectAllowed = 'move';
                                  event.dataTransfer.setData('text/plain', shortcut.id);
                                  setShortcutTooltip(null);
                                  setDraggedShortcut({
                                    groupId: group.id,
                                    sectionId: section.id,
                                    shortcutId: shortcut.id,
                                  });
                                }}
                                onDragEnd={() => {
                                  setDraggedShortcut(null);
                                  setShortcutDropTarget(null);
                                }}
                              >
                                <span className="shortcut-icon" style={{ color: shortcut.tone }}>
                                  <ShortcutVisual shortcut={shortcut} />
                                </span>
                                <span>{shortcut.title}</span>
                              </a>
                              {isEditMode && <button
                                type="button"
                                className="shortcut-edit-button"
                                aria-label={`编辑${shortcut.title}`}
                                title="编辑快捷入口"
                                onClick={() =>
                                  setShortcutDialog({
                                    mode: 'edit',
                                    groupId: group.id,
                                    sectionId: section.id,
                                    shortcut,
                                  })
                                }
                              >
                                <Pencil size={14} />
                              </button>}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      isEditMode ? <button
                        type="button"
                        className={`empty-section${shortcutDropTarget?.groupId === group.id && shortcutDropTarget.sectionId === section.id ? ' is-shortcut-drop-target' : ''}`}
                        onDragOver={(event) => {
                          if (!draggedShortcut) return;
                          event.preventDefault();
                          event.stopPropagation();
                          event.dataTransfer.dropEffect = 'move';
                          setShortcutDropTarget({
                            groupId: group.id,
                            sectionId: section.id,
                            shortcutId: null,
                            position: 'after',
                          });
                        }}
                        onDrop={(event) => {
                          if (!draggedShortcut) return;
                          event.preventDefault();
                          event.stopPropagation();
                          moveShortcut();
                        }}
                        onClick={() =>
                          setShortcutDialog({
                            mode: 'add',
                            groupId: group.id,
                            sectionId: section.id,
                          })
                        }
                      >
                        <Plus size={17} /> 添加第一个快捷入口
                      </button> : <div className="empty-section is-readonly">暂无快捷入口</div>
                    )}
                    {pageCount > 1 && <nav className="card-page-controls" aria-label={`${section.title}入口翻页`}>
                      <button type="button" disabled={page === 0} aria-label="上一页"
                        onClick={() => setSectionPages((current) => ({ ...current, [section.id]: page - 1 }))}>‹</button>
                      <span>{page + 1} / {pageCount}</span>
                      <button type="button" disabled={page === pageCount - 1} aria-label="下一页"
                        onClick={() => setSectionPages((current) => ({ ...current, [section.id]: page + 1 }))}>›</button>
                    </nav>}
                  </section>
                  );
                })}
            </div>
          ))}
        </div>

      </section>}

      {draggedSection && cardDragPoint && (
        <div className="card-drag-preview" style={{ left: cardDragPoint.x, top: cardDragPoint.y }} aria-hidden="true">
          <GripVertical size={17} />
          <span>{groups.flatMap((group) => group.sections).find((section) => section.id === draggedSection.sectionId)?.title}</span>
        </div>
      )}

      {shortcutTooltip && (
        <div
          id="shortcut-address-tooltip"
          className={`shortcut-tooltip${shortcutTooltip.above ? ' is-above' : ''}`}
          role="tooltip"
          style={{ left: shortcutTooltip.left, top: shortcutTooltip.top }}
        >
          <strong className="shortcut-tooltip-title">{shortcutTooltip.title}</strong>
          <span className="shortcut-tooltip-url">{shortcutTooltip.url}</span>
        </div>
      )}

      <NameDialog
        open={nameDialog !== null}
        title={
          nameDialog?.kind === 'user'
            ? '设置姓名'
            : nameDialog?.kind === 'edit-section'
              ? '修改卡片名称'
            : nameDialog?.kind === 'section'
              ? '新建卡片'
              : '新建卡片'
        }
        label={nameDialog?.kind === 'user' ? '你的姓名' : '卡片名称'}
        placeholder={
          nameDialog?.kind === 'user'
            ? '请输入姓名'
            : '例如：常用工具'
        }
        initialValue={
          nameDialog?.kind === 'user'
            ? userName
            : nameDialog?.kind === 'edit-section'
              ? nameDialog.title
              : ''
        }
        submitText={
          nameDialog?.kind === 'user' ||
          nameDialog?.kind === 'edit-section'
            ? '保存'
            : '创建'
        }
        onClose={() => setNameDialog(null)}
        onSubmit={saveName}
      />

      <FavoritesDialog
        open={favoritesDialogOpen}
        groups={groups}
        selectedIds={favoriteShortcutIds}
        onToggle={toggleFavorite}
        onSelectMany={(ids, selected) => {
          setFavoriteShortcutIds((current) => selected
            ? [...new Set([...current, ...ids])]
            : current.filter((id) => !ids.includes(id)));
          setShortcutTooltip(null);
        }}
        onClose={() => setFavoritesDialogOpen(false)}
        onCreate={() => { setFavoritesDialogOpen(false); setShortcutDialog({ mode: 'favorite' }); }}
      />

      <ShortcutDialog
        open={shortcutDialog !== null}
        initialValue={shortcutDialog?.mode === 'edit' ? shortcutDialog.shortcut : undefined}
        onClose={() => setShortcutDialog(null)}
        onSave={saveShortcut}
      />

      <ConfirmDialog
        open={confirmDialog !== null}
        title="确认删除？"
        description={
          confirmDialog ? `“${confirmDialog.title}”将从当前浏览器中删除。` : ''
        }
        confirmText="删除"
        onClose={() => setConfirmDialog(null)}
        onConfirm={runConfirmedAction}
      />

      <BackupDialog
        open={backupDialogOpen}
        onClose={() => setBackupDialogOpen(false)}
        onExport={exportBackup}
        onImport={importBackup}
        onImportBookmarks={openBookmarkImport}
      />

      <BookmarkImportDialog
        tree={bookmarkTree}
        onClose={() => setBookmarkTree(null)}
        onImport={importBookmarks}
      />
    </main>
  );
}

export default App;
