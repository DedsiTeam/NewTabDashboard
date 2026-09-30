import {
  Check,
  Database,
  GripVertical,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  BackupDialog,
  BookmarkImportDialog,
  ConfirmDialog,
  GlobalSearchDialog,
  type GlobalSearchItem,
  NameDialog,
  SectionSettingsDialog,
  ShortcutDialog,
} from './dialogs';
import {
  buildGroupsFromBookmarks,
  requestChromeBookmarks,
  type BookmarkImportNode,
} from './bookmarks';
import { getFaviconCandidates } from './favicon';
import { shortcutIconMap } from './iconCatalog';
import {
  downloadDashboardBackup,
  loadDashboardState,
  readDashboardBackup,
  saveDashboardState,
} from './storage';
import type { DashboardGroup, Shortcut } from './types';

const CARD_GAP = 14;
const GRID_COLUMN_MIN = 104;
const GRID_ROW_HEIGHT = 1;

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => unknown;
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
  | { mode: 'add'; groupId: string; sectionId: string }
  | { mode: 'edit'; groupId: string; sectionId: string; shortcut: Shortcut };

type SectionSettingsTarget = {
  groupId: string;
  sectionId: string;
  title: string;
  columns: number;
};

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
type CardDropTarget = { sectionId: string; position: 'before' | 'after' };
type DraggedShortcut = DraggedSection & { shortcutId: string };
type ShortcutDropTarget = DraggedSection & {
  shortcutId: string | null;
  position: 'before' | 'after';
};
type ShortcutTooltip = {
  shortcutId: string;
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
  const [groups, setGroups] = useState<DashboardGroup[]>([]);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [userName, setUserName] = useState('');
  const [isHydrated, setIsHydrated] = useState(false);
  const [now, setNow] = useState(new Date());
  const [shortcutDialog, setShortcutDialog] = useState<ShortcutDialogTarget | null>(null);
  const [sectionSettings, setSectionSettings] = useState<SectionSettingsTarget | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const [bookmarkTree, setBookmarkTree] = useState<BookmarkImportNode[] | null>(null);
  const [draggedSection, setDraggedSection] = useState<DraggedSection | null>(null);
  const [cardDragPoint, setCardDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [cardDropTarget, setCardDropTarget] = useState<CardDropTarget | null>(null);
  const [railColumns, setRailColumns] = useState(1);
  const [cardMeasurements, setCardMeasurements] = useState<Record<string, { signature: string; height: number }>>({});
  const railRef = useRef<HTMLDivElement>(null);
  const [draggedShortcut, setDraggedShortcut] = useState<DraggedShortcut | null>(null);
  const [shortcutDropTarget, setShortcutDropTarget] = useState<ShortcutDropTarget | null>(null);
  const [shortcutTooltip, setShortcutTooltip] = useState<ShortcutTooltip | null>(null);
  const cardDragRef = useRef<{
    source: DraggedSection;
    startX: number;
    startY: number;
    target: CardDropTarget | null;
    active: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadDashboardState().then((state) => {
      if (cancelled) return;
      setGroups(state.groups);
      setUserName(state.userName);
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
    void saveDashboardState({ groups, userName }).catch((error) => {
      console.error('Failed to save dashboard state:', error);
    });
  }, [groups, isHydrated, userName]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const cards = [...rail.querySelectorAll<HTMLElement>('.shortcut-section')];

    function measure() {
      if (!rail) return;
      const columns = Math.max(1, Math.floor((rail.clientWidth + CARD_GAP) / (GRID_COLUMN_MIN + CARD_GAP)));
      setRailColumns((current) => current === columns ? current : columns);
      const measurements: Record<string, { signature: string; height: number }> = {};
      for (const card of cards) {
        const id = card.dataset.sectionId;
        const signature = card.dataset.layoutSignature;
        if (!id || !signature) continue;
        // Measure intrinsic contents; the outer card stretches to its rounded grid span.
        const height = [...card.children].reduce((total, child) => {
          const element = child as HTMLElement;
          const style = getComputedStyle(element);
          return total + element.offsetHeight + (parseFloat(style.marginTop) || 0)
            + (parseFloat(style.marginBottom) || 0);
        }, card.offsetHeight - card.clientHeight);
        measurements[id] = { signature, height };
      }
      setCardMeasurements((current) => Object.entries(measurements).some(([id, value]) =>
        current[id]?.signature !== value.signature || current[id]?.height !== value.height,
      ) ? { ...current, ...measurements } : current);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    cards.forEach((card) => {
      observer.observe(card);
      [...card.children].forEach((child) => observer.observe(child));
    });
    measure();
    return () => observer.disconnect();
  }, [groups, isEditMode, railColumns]);

  useEffect(() => {
    function handleGlobalSearchShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setGlobalSearchOpen(true);
      }
    }
    window.addEventListener('keydown', handleGlobalSearchShortcut);
    return () => window.removeEventListener('keydown', handleGlobalSearchShortcut);
  }, []);

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

  const globalSearchItems = useMemo<GlobalSearchItem[]>(() => {
    const items: GlobalSearchItem[] = [];
    for (const group of groups) {
      for (const section of group.sections) {
        items.push({
          id: section.id,
          kind: 'section',
          title: section.title,
          subtitle: group.title,
          searchText: `${section.title} ${group.title}`,
        });
        for (const shortcut of section.shortcuts) {
          items.push({
            id: shortcut.id,
            kind: 'shortcut',
            title: shortcut.title,
            subtitle: `${section.title} · ${shortcut.url}`,
            searchText: `${shortcut.title} ${shortcut.url} ${section.title}`,
          });
        }
      }
    }
    return items;
  }, [groups]);

  function selectGlobalSearchItem(item: GlobalSearchItem) {
    if (item.kind === 'shortcut') {
      const shortcut = groups
        .flatMap((group) => group.sections)
        .flatMap((section) => section.shortcuts)
        .find((candidate) => candidate.id === item.id);
      if (shortcut) window.open(shortcut.url, '_blank', 'noopener,noreferrer');
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(`${item.kind}-${item.id}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center',
        });
      });
    });
  }

  function moveSection(source: DraggedSection, target: CardDropTarget) {
    if (source.sectionId === target.sectionId) return;
    commitWithAnimation(() => {
      setGroups((current) => {
        const sections = current.flatMap((group) => group.sections);
        const sourceIndex = sections.findIndex((section) => section.id === source.sectionId);
        if (sourceIndex < 0) return current;
        const [moving] = sections.splice(sourceIndex, 1);
        const targetIndex = sections.findIndex((section) => section.id === target.sectionId);
        if (targetIndex < 0) return current;
        sections.splice(targetIndex + (target.position === 'after' ? 1 : 0), 0, moving);
        return [{ ...current[0], sections }];
      });
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

  function showShortcutTooltip(element: HTMLElement, shortcutId: string, url: string) {
    const bounds = element.getBoundingClientRect();
    const above = bounds.bottom + 58 > window.innerHeight;
    setShortcutTooltip({
      shortcutId,
      url,
      left: Math.min(Math.max(bounds.left + bounds.width / 2, 170), window.innerWidth - 170),
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
    setGroups((current) =>
      current.map((group) =>
        group.id === shortcutDialog.groupId
          ? {
              ...group,
              sections: group.sections.map((section) =>
                section.id === shortcutDialog.sectionId
                  ? {
                      ...section,
                      shortcuts:
                        shortcutDialog.mode === 'edit'
                          ? section.shortcuts.map((item) =>
                              item.id === shortcutDialog.shortcut.id
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

  function saveSectionSettings(columns: number) {
    if (!sectionSettings) return;
    const safeColumns = Math.min(5, Math.max(2, columns));
    setGroups((current) =>
      current.map((group) =>
        group.id === sectionSettings.groupId
          ? {
              ...group,
              sections: group.sections.map((section) =>
                section.id === sectionSettings.sectionId ? { ...section, columns: safeColumns } : section,
              ),
            }
          : group,
      ),
    );
    setSectionSettings(null);
  }

  function exportBackup() {
    downloadDashboardBackup({ groups, userName });
  }

  async function importBackup(file: File) {
    const state = await readDashboardBackup(file);
    await saveDashboardState(state);
    setGroups(state.groups);
    setUserName(state.userName);
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

  return (
    <main className={`app-shell${isEditMode ? ' is-edit-mode' : ' is-use-mode'}`}>
      <header className="topbar">
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

        <div className="top-actions">
          <button
            className="top-search-button"
            type="button"
            onClick={() => setGlobalSearchOpen(true)}
            aria-label="全局搜索"
            title="全局搜索（Ctrl + K）"
          >
            <Search size={17} />
            <span>搜索</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button
            className={`mode-toggle-button${isEditMode ? ' is-active' : ''}`}
            type="button"
            onClick={() => setIsEditMode((current) => !current)}
            aria-pressed={isEditMode}
          >
            {isEditMode ? <Check size={17} /> : <Settings2 size={17} />}
            <span>{isEditMode ? '完成编辑' : '编辑布局'}</span>
          </button>
          {(isEditMode || (isHydrated && groups.every((group) => group.sections.length === 0))) && (
            <button
              className="add-group-button"
              type="button"
              onClick={() => setNameDialog({ kind: 'section', groupId: 'dashboard' })}
            >
              <Plus size={17} />
              <span>新建卡片</span>
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

      <section
        className="dashboard-region"
        aria-label="快捷入口卡片"
      >
        <div className="group-rail" ref={railRef} style={{
          '--card-gap': `${CARD_GAP}px`,
          '--grid-column-min': `${GRID_COLUMN_MIN}px`,
          '--grid-row-height': `${GRID_ROW_HEIGHT}px`,
        } as CSSProperties}>
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
                  const columns = Math.min(5, Math.max(2, section.columns ?? 3));
                  const signature = `${columns}:${railColumns}:${section.shortcuts.length}:${isEditMode}`;
                  const measurement = cardMeasurements[section.id];
                  const height = measurement?.signature === signature ? measurement.height
                    : section.shortcuts.length ? 70 + Math.ceil(section.shortcuts.length / columns) * 89 : 140;
                  const rowSpan = Math.max(1, Math.ceil((height + CARD_GAP) / (GRID_ROW_HEIGHT + CARD_GAP)));
                  const isDragging =
                    draggedSection?.groupId === group.id &&
                    draggedSection.sectionId === section.id;
                  const dropPosition = cardDropTarget?.sectionId === section.id
                    ? cardDropTarget.position : null;

                  return (
                  <section
                    id={`section-${section.id}`}
                    data-section-id={section.id}
                    data-layout-signature={signature}
                    className={`shortcut-section${isDragging ? ' is-dragging' : ''}${dropPosition ? ` is-drop-${dropPosition}` : ''}`}
                    key={section.id}
                    style={{
                      viewTransitionName: `section-${section.id}`,
                      '--shortcut-columns': columns,
                      gridColumn: `span ${Math.min(columns, railColumns)}`,
                      gridRow: `span ${rowSpan}`,
                    } as CSSProperties}
                  >
                    <header className="section-header">
                      <div className="section-title-row">
                        {isEditMode && (
                          <button
                            type="button"
                            className="section-drag-handle"
                            aria-label={`拖动调整${section.title}的顺序`}
                            title="拖动卡片调整顺序"
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
                              const candidates = [...rail.querySelectorAll<HTMLElement>('.shortcut-section')]
                                .filter((card) => card.dataset.sectionId !== drag.source.sectionId);
                              const nearest = candidates.map((card) => {
                                const rect = card.getBoundingClientRect();
                                const dx = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right);
                                const dy = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom);
                                return { card, rect, distance: dx * dx + dy * dy };
                              }).sort((a, b) => a.distance - b.distance)[0];
                              drag.target = nearest ? {
                                sectionId: nearest.card.dataset.sectionId!,
                                position: event.clientY < nearest.rect.top ? 'before'
                                  : event.clientY > nearest.rect.bottom ? 'after'
                                    : event.clientX < nearest.rect.left + nearest.rect.width / 2 ? 'before' : 'after',
                              } : null;
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
                        <h3>{section.title}</h3>
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
                            setSectionSettings({
                              groupId: group.id,
                              sectionId: section.id,
                              title: section.title,
                              columns: section.columns ?? 3,
                            })
                          }
                          aria-label={`设置${section.title}的布局`}
                          title="卡片设置"
                        >
                          <Settings2 size={16} />
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
                        style={{ '--shortcut-columns': Math.min(5, Math.max(2, section.columns ?? 3)) } as CSSProperties}
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
                        {section.shortcuts.map((shortcut) => {
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
                                  showShortcutTooltip(event.currentTarget, shortcut.id, shortcut.url)
                                }
                                onMouseLeave={() => setShortcutTooltip(null)}
                                onFocus={(event) =>
                                  showShortcutTooltip(event.currentTarget, shortcut.id, shortcut.url)
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
                  </section>
                  );
                })}
            </div>
          ))}
        </div>

      </section>

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
          {shortcutTooltip.url}
        </div>
      )}

      <GlobalSearchDialog
        open={globalSearchOpen}
        items={globalSearchItems}
        onClose={() => setGlobalSearchOpen(false)}
        onSelect={selectGlobalSearchItem}
      />

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

      <ShortcutDialog
        open={shortcutDialog !== null}
        initialValue={shortcutDialog?.mode === 'edit' ? shortcutDialog.shortcut : undefined}
        onClose={() => setShortcutDialog(null)}
        onSave={saveShortcut}
      />

      <SectionSettingsDialog
        open={sectionSettings !== null}
        sectionTitle={sectionSettings?.title ?? ''}
        initialColumns={sectionSettings?.columns ?? 3}
        onClose={() => setSectionSettings(null)}
        onSave={saveSectionSettings}
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
