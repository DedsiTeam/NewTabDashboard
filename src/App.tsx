import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
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
  TodoDetailDialog,
  TodoDialog,
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
import { TodoPanel } from './TodoPanel';
import type { DashboardGroup, Shortcut, TodoItem } from './types';

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

type TodoDialogTarget = { mode: 'add' } | { mode: 'edit'; todo: TodoItem };

type SectionSettingsTarget = {
  groupId: string;
  sectionId: string;
  title: string;
  columns: 1 | 2;
};

type NameDialogState =
  | { kind: 'group' }
  | { kind: 'edit-group'; groupId: string; title: string }
  | { kind: 'section'; groupId: string }
  | { kind: 'edit-section'; groupId: string; sectionId: string; title: string }
  | { kind: 'user' }
  | null;

type ConfirmDialogState =
  | { kind: 'group'; groupId: string; title: string }
  | { kind: 'section'; groupId: string; sectionId: string; title: string }
  | { kind: 'shortcut'; groupId: string; sectionId: string; shortcutId: string; title: string }
  | { kind: 'todo'; todoId: string; title: string }
  | null;

type DraggedSection = { groupId: string; sectionId: string };
type SectionDropTarget = {
  groupId: string;
  sectionId: string | null;
  position: 'before' | 'after';
};
type GroupDropTarget = { groupId: string; position: 'before' | 'after' };
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
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todoQuery, setTodoQuery] = useState('');
  const [todoDialog, setTodoDialog] = useState<TodoDialogTarget | null>(null);
  const [viewingTodo, setViewingTodo] = useState<TodoItem | null>(null);
  const [todoCollapsed, setTodoCollapsed] = useState(true);
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<string[]>([]);
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
  const [sectionDropTarget, setSectionDropTarget] = useState<SectionDropTarget | null>(null);
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [groupDropTarget, setGroupDropTarget] = useState<GroupDropTarget | null>(null);
  const [draggedShortcut, setDraggedShortcut] = useState<DraggedShortcut | null>(null);
  const [shortcutDropTarget, setShortcutDropTarget] = useState<ShortcutDropTarget | null>(null);
  const [shortcutTooltip, setShortcutTooltip] = useState<ShortcutTooltip | null>(null);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void loadDashboardState().then((state) => {
      if (cancelled) return;
      setGroups(state.groups);
      setUserName(state.userName);
      setTodos(state.todos);
      setTodoCollapsed(state.todoCollapsed);
      setCollapsedSectionIds(state.collapsedSectionIds);
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
    void saveDashboardState({ groups, userName, todos, todoCollapsed, collapsedSectionIds }).catch((error) => {
      console.error('Failed to save dashboard state:', error);
    });
  }, [collapsedSectionIds, groups, isHydrated, todoCollapsed, todos, userName]);

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

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const updateOverflow = () => {
      setHasHorizontalOverflow(rail.scrollWidth > rail.clientWidth + 1);
    };

    updateOverflow();
    const frame = window.requestAnimationFrame(updateOverflow);
    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(rail);
    Array.from(rail.children).forEach((child) => resizeObserver.observe(child));

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [groups, isHydrated]);

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
      items.push({
        id: group.id,
        kind: 'group',
        title: group.title,
        subtitle: `${group.sections.length} 个小分组`,
        searchText: group.title,
      });
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
            subtitle: `${group.title} / ${section.title} · ${shortcut.url}`,
            searchText: `${shortcut.title} ${shortcut.url} ${group.title} ${section.title}`,
          });
        }
      }
    }
    for (const todo of todos) {
      items.push({
        id: todo.id,
        kind: 'todo',
        title: todo.title,
        subtitle: todo.content,
        searchText: `${todo.title} ${todo.content}`,
      });
    }
    return items;
  }, [groups, todos]);

  function toggleSectionCollapsed(sectionId: string) {
    setCollapsedSectionIds((current) =>
      current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId],
    );
  }

  function setGroupSectionsCollapsed(group: DashboardGroup, collapsed: boolean) {
    const sectionIds = new Set(group.sections.map((section) => section.id));
    setCollapsedSectionIds((current) => {
      const withoutGroup = current.filter((id) => !sectionIds.has(id));
      return collapsed ? [...withoutGroup, ...sectionIds] : withoutGroup;
    });
  }

  function selectGlobalSearchItem(item: GlobalSearchItem) {
    if (item.kind === 'shortcut') {
      const shortcut = groups
        .flatMap((group) => group.sections)
        .flatMap((section) => section.shortcuts)
        .find((candidate) => candidate.id === item.id);
      if (shortcut) window.open(shortcut.url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (item.kind === 'todo') {
      const todo = todos.find((candidate) => candidate.id === item.id);
      if (todo) setViewingTodo(todo);
      return;
    }

    if (item.kind === 'section') {
      setCollapsedSectionIds((current) => current.filter((id) => id !== item.id));
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

  function scrollRail(direction: -1 | 1) {
    const rail = railRef.current;
    if (!rail) return;
    const firstColumn = rail.querySelector<HTMLElement>('.group-column');
    const distance = (firstColumn?.offsetWidth ?? 420) + 16;
    rail.scrollBy({ left: direction * distance, behavior: 'smooth' });
  }

  function moveSection() {
    if (!draggedSection || !sectionDropTarget) return;
    if (draggedSection.sectionId === sectionDropTarget.sectionId) {
      setSectionDropTarget(null);
      return;
    }

    commitWithAnimation(() => {
      setGroups((current) => {
        const sourceGroup = current.find((group) => group.id === draggedSection.groupId);
        const movedSection = sourceGroup?.sections.find(
          (section) => section.id === draggedSection.sectionId,
        );
        if (!movedSection) return current;

        const withoutSource = current.map((group) =>
          group.id === draggedSection.groupId
            ? {
                ...group,
                sections: group.sections.filter((section) => section.id !== draggedSection.sectionId),
              }
            : group,
        );

        return withoutSource.map((group) => {
          if (group.id !== sectionDropTarget.groupId) return group;
          const sections = [...group.sections];
          const targetIndex = sectionDropTarget.sectionId
            ? sections.findIndex((section) => section.id === sectionDropTarget.sectionId)
            : -1;
          const insertIndex =
            targetIndex < 0
              ? sections.length
              : targetIndex + (sectionDropTarget.position === 'after' ? 1 : 0);
          sections.splice(insertIndex, 0, movedSection);
          return { ...group, sections };
        });
      });
    });

    setDraggedSection(null);
    setSectionDropTarget(null);
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

  function moveGroup() {
    if (!draggedGroupId || !groupDropTarget || draggedGroupId === groupDropTarget.groupId) {
      setGroupDropTarget(null);
      return;
    }

    commitWithAnimation(() => {
      setGroups((current) => {
        const sourceIndex = current.findIndex((group) => group.id === draggedGroupId);
        if (sourceIndex < 0) return current;

        const nextGroups = [...current];
        const [movedGroup] = nextGroups.splice(sourceIndex, 1);
        const targetIndex = nextGroups.findIndex(
          (group) => group.id === groupDropTarget.groupId,
        );
        if (targetIndex < 0) return current;

        const insertIndex = groupDropTarget.position === 'after' ? targetIndex + 1 : targetIndex;
        nextGroups.splice(insertIndex, 0, movedGroup);
        return nextGroups;
      });
    });

    setDraggedGroupId(null);
    setGroupDropTarget(null);
  }

  function saveName(title: string) {
    if (!nameDialog) return;

    if (nameDialog.kind === 'user') {
      setUserName(title);
    } else if (nameDialog.kind === 'group') {
      setGroups((current) => [
        ...current,
        { id: makeId('group'), title, sections: [] },
      ]);
    } else if (nameDialog.kind === 'edit-group') {
      setGroups((current) =>
        current.map((group) =>
          group.id === nameDialog.groupId ? { ...group, title } : group,
        ),
      );
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

    if (confirmDialog.kind === 'group') {
      setGroups((current) => current.filter((group) => group.id !== confirmDialog.groupId));
    } else if (confirmDialog.kind === 'section') {
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
    } else {
      setTodos((current) => current.filter((todo) => todo.id !== confirmDialog.todoId));
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

  function saveSectionSettings(columns: 1 | 2) {
    if (!sectionSettings) return;
    setGroups((current) =>
      current.map((group) =>
        group.id === sectionSettings.groupId
          ? {
              ...group,
              sections: group.sections.map((section) =>
                section.id === sectionSettings.sectionId ? { ...section, columns } : section,
              ),
            }
          : group,
      ),
    );
    setSectionSettings(null);
  }

  function saveTodo(value: Pick<TodoItem, 'title' | 'content' | 'color'>) {
    if (!todoDialog) return;
    setTodos((current) =>
      todoDialog.mode === 'edit'
        ? current.map((todo) =>
            todo.id === todoDialog.todo.id ? { ...todo, ...value } : todo,
          )
        : [
            { id: makeId('todo'), ...value },
            ...current,
          ],
    );
    setTodoDialog(null);
  }

  function moveTodo(sourceId: string, targetId: string, position: 'before' | 'after') {
    if (sourceId === targetId) return;
    commitWithAnimation(() => {
      setTodos((current) => {
        const sourceIndex = current.findIndex((todo) => todo.id === sourceId);
        if (sourceIndex < 0) return current;

        const nextTodos = [...current];
        const [movedTodo] = nextTodos.splice(sourceIndex, 1);
        const targetIndex = nextTodos.findIndex((todo) => todo.id === targetId);
        if (targetIndex < 0) return current;

        const insertIndex = targetIndex + (position === 'after' ? 1 : 0);
        nextTodos.splice(insertIndex, 0, movedTodo);
        return nextTodos;
      });
    });
  }

  function exportBackup() {
    downloadDashboardBackup({ groups, userName, todos, todoCollapsed, collapsedSectionIds });
  }

  async function importBackup(file: File) {
    const state = await readDashboardBackup(file);
    await saveDashboardState(state);
    setGroups(state.groups);
    setUserName(state.userName);
    setTodos(state.todos);
    setTodoCollapsed(state.todoCollapsed);
    setCollapsedSectionIds(state.collapsedSectionIds);
  }

  async function openBookmarkImport() {
    const tree = await requestChromeBookmarks();
    setBackupDialogOpen(false);
    setBookmarkTree(tree);
  }

  function importBookmarks(selectedIds: Set<string>) {
    if (!bookmarkTree) return;
    const importedGroups = buildGroupsFromBookmarks(bookmarkTree, selectedIds);
    if (importedGroups.length === 0) return;
    setGroups((current) => [...current, ...importedGroups]);
    setBookmarkTree(null);
  }

  return (
    <main className={`app-shell${isEditMode ? ' is-edit-mode' : ' is-use-mode'}`}>
      <header className="topbar">
        <div className="clock-block" aria-label={`${time}，${date}`}>
          <strong>{time}</strong>
          <div>
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
          {(isEditMode || (isHydrated && groups.length === 0)) && (
            <button
              className="add-group-button"
              type="button"
              onClick={() => setNameDialog({ kind: 'group' })}
            >
              <Plus size={17} />
              <span>新建分组</span>
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
        className={`dashboard-region${todoCollapsed ? ' todo-is-collapsed' : ''}`}
        aria-label="快捷入口分组"
      >
        <TodoPanel
          todos={todos}
          query={todoQuery}
          onQueryChange={setTodoQuery}
          onAdd={() => setTodoDialog({ mode: 'add' })}
          onEdit={(todo) => setTodoDialog({ mode: 'edit', todo })}
          onDelete={(todo) =>
            setConfirmDialog({ kind: 'todo', todoId: todo.id, title: todo.title })
          }
          onView={setViewingTodo}
          onMove={moveTodo}
          collapsed={todoCollapsed}
          onToggleCollapsed={() => setTodoCollapsed((current) => !current)}
        />

        {hasHorizontalOverflow && (
          <button
            type="button"
            className="rail-arrow rail-arrow-left"
            onClick={() => scrollRail(-1)}
            aria-label="向左查看分组"
          >
            <ChevronLeft size={22} />
          </button>
        )}

        <div className="group-rail" ref={railRef}>
          {isHydrated && groups.length === 0 && (
            <div className="empty-dashboard">
              <div className="empty-dashboard-icon">
                <Plus size={30} />
              </div>
              <h2>创建你的第一个分组</h2>
              <p>把常用网站按工作、学习或任何你喜欢的方式整理起来。</p>
              <button
                type="button"
                className="primary-button empty-dashboard-button"
                onClick={() => setNameDialog({ kind: 'group' })}
              >
                <Plus size={18} /> 新建分组
              </button>
            </div>
          )}
          {groups.map((group) => {
            const isDraggingGroup = draggedGroupId === group.id;
            const areAllSectionsCollapsed =
              group.sections.length > 0 &&
              group.sections.every((section) => collapsedSectionIds.includes(section.id));
            const groupDropPosition =
              groupDropTarget?.groupId === group.id ? groupDropTarget.position : null;

            return (
            <article
              id={`group-${group.id}`}
              className={`group-column${isDraggingGroup ? ' is-dragging' : ''}${groupDropPosition ? ` drop-${groupDropPosition}` : ''}`}
              key={group.id}
              style={{ viewTransitionName: `group-${group.id}` } as CSSProperties}
              onDragOver={(event) => {
                if (!draggedGroupId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const bounds = event.currentTarget.getBoundingClientRect();
                const position =
                  event.clientX < bounds.left + bounds.width / 2 ? 'before' : 'after';
                setGroupDropTarget({ groupId: group.id, position });
              }}
              onDrop={(event) => {
                if (!draggedGroupId) return;
                event.preventDefault();
                moveGroup();
              }}
            >
              <header className="group-header">
                <div className="group-title-row">
                  {isEditMode && (
                    <button
                      type="button"
                      className="group-drag-handle"
                      draggable
                      aria-label={`拖动调整${group.title}的顺序`}
                      title="拖动调整大分组顺序"
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', group.id);
                        const groupElement = event.currentTarget.closest('.group-column');
                        if (groupElement) {
                          event.dataTransfer.setDragImage(groupElement, 24, 24);
                        }
                        setDraggedGroupId(group.id);
                      }}
                      onDragEnd={() => {
                        setDraggedGroupId(null);
                        setGroupDropTarget(null);
                      }}
                    >
                      <GripVertical size={18} />
                    </button>
                  )}
                  <h2>{group.title}</h2>
                </div>
                <div className="group-actions">
                  {group.sections.length > 0 && (
                    <button
                      type="button"
                      className="square-button group-collapse-all-button"
                      onClick={() => setGroupSectionsCollapsed(group, !areAllSectionsCollapsed)}
                      aria-label={areAllSectionsCollapsed ? `展开${group.title}中的全部小分组` : `折叠${group.title}中的全部小分组`}
                      title={areAllSectionsCollapsed ? '全部展开' : '全部折叠'}
                    >
                      {areAllSectionsCollapsed ? (
                        <ChevronsUpDown size={17} />
                      ) : (
                        <ChevronsDownUp size={17} />
                      )}
                    </button>
                  )}
                  {isEditMode && <>
                  <button
                    type="button"
                    className="square-button group-edit-button"
                    onClick={() =>
                      setNameDialog({
                        kind: 'edit-group',
                        groupId: group.id,
                        title: group.title,
                      })
                    }
                    aria-label={`修改${group.title}的名称`}
                    title="修改大分组名称"
                  >
                    <Pencil size={17} />
                  </button>
                  <button
                    type="button"
                    className="square-button group-add-section-button"
                    onClick={() => setNameDialog({ kind: 'section', groupId: group.id })}
                    aria-label={`在${group.title}中添加小分组`}
                    title="添加小分组"
                  >
                    <Plus size={19} />
                  </button>
                  <button
                    className="square-button group-delete-button"
                    type="button"
                    aria-label={`删除${group.title}`}
                    title="删除大分组"
                    onClick={() =>
                      setConfirmDialog({ kind: 'group', groupId: group.id, title: group.title })
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                  </>}
                </div>
              </header>

              <div className="section-scroll-area">
                {group.sections.map((section) => {
                  const isCollapsed = collapsedSectionIds.includes(section.id);
                  const isDragging =
                    draggedSection?.groupId === group.id &&
                    draggedSection.sectionId === section.id;
                  const dropPosition =
                    sectionDropTarget?.groupId === group.id &&
                    sectionDropTarget.sectionId === section.id
                      ? sectionDropTarget.position
                      : null;

                  return (
                  <section
                    id={`section-${section.id}`}
                    className={`shortcut-section${isCollapsed ? ' is-collapsed' : ''}${isDragging ? ' is-dragging' : ''}${dropPosition ? ` drop-${dropPosition}` : ''}`}
                    key={section.id}
                    style={{ viewTransitionName: `section-${section.id}` } as CSSProperties}
                    onDragOver={(event) => {
                      if (!draggedSection) return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = 'move';
                      const bounds = event.currentTarget.getBoundingClientRect();
                      const position =
                        event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
                      setSectionDropTarget({
                        groupId: group.id,
                        sectionId: section.id,
                        position,
                      });
                    }}
                    onDrop={(event) => {
                      if (!draggedSection) return;
                      event.preventDefault();
                      event.stopPropagation();
                      moveSection();
                    }}
                  >
                    <header className="section-header">
                      <div className="section-title-row">
                        {isEditMode && (
                          <button
                            type="button"
                            className="section-drag-handle"
                            draggable
                            aria-label={`拖动调整${section.title}的顺序`}
                            title="拖动调整顺序"
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('text/plain', section.id);
                              const sectionElement = event.currentTarget.closest('.shortcut-section');
                              if (sectionElement) {
                                event.dataTransfer.setDragImage(sectionElement, 24, 24);
                              }
                              setDraggedSection({ groupId: group.id, sectionId: section.id });
                            }}
                            onDragEnd={() => {
                              setDraggedSection(null);
                              setSectionDropTarget(null);
                            }}
                          >
                            <GripVertical size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="section-collapse-button"
                          onClick={() => toggleSectionCollapsed(section.id)}
                          aria-expanded={!isCollapsed}
                          title={isCollapsed ? '展开小分组' : '折叠小分组'}
                        >
                          {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                          <h3>{section.title}</h3>
                        </button>
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
                          title="修改小分组名称"
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
                              columns: section.columns === 1 ? 1 : 2,
                            })
                          }
                          aria-label={`设置${section.title}的布局`}
                          title="小分组设置"
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
                          title="删除小分组"
                        >
                          <X size={16} />
                        </button>
                      </div>}
                    </header>

                    {!isCollapsed && (section.shortcuts.length > 0 ? (
                      <div
                        className={`shortcut-grid${section.columns === 1 ? ' is-single-column' : ''}${shortcutDropTarget?.groupId === group.id && shortcutDropTarget.sectionId === section.id && shortcutDropTarget.shortcutId === null ? ' is-drop-target' : ''}`}
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
                    ))}
                  </section>
                  );
                })}
                {draggedSection && (
                  <div
                    className={`section-drop-zone${sectionDropTarget?.groupId === group.id && sectionDropTarget.sectionId === null ? ' is-active' : ''}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = 'move';
                      setSectionDropTarget({
                        groupId: group.id,
                        sectionId: null,
                        position: 'after',
                      });
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      moveSection();
                    }}
                  >
                    移到此大分组
                  </div>
                )}
              </div>
            </article>
            );
          })}
        </div>

        {hasHorizontalOverflow && (
          <button
            type="button"
            className="rail-arrow rail-arrow-right"
            onClick={() => scrollRail(1)}
            aria-label="向右查看分组"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </section>

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

      <TodoDialog
        open={todoDialog !== null}
        initialValue={todoDialog?.mode === 'edit' ? todoDialog.todo : undefined}
        onClose={() => setTodoDialog(null)}
        onSave={saveTodo}
      />

      <TodoDetailDialog todo={viewingTodo} onClose={() => setViewingTodo(null)} />

      <NameDialog
        open={nameDialog !== null}
        title={
          nameDialog?.kind === 'user'
            ? '设置姓名'
            : nameDialog?.kind === 'edit-group'
              ? '修改大分组名称'
            : nameDialog?.kind === 'edit-section'
              ? '修改小分组名称'
            : nameDialog?.kind === 'section'
              ? '新建小分组'
              : '新建大分组'
        }
        label={nameDialog?.kind === 'user' ? '你的姓名' : '分组名称'}
        placeholder={
          nameDialog?.kind === 'user'
            ? '请输入姓名'
            : nameDialog?.kind === 'section' || nameDialog?.kind === 'edit-section'
              ? '例如：常用工具'
              : '例如：工作台'
        }
        initialValue={
          nameDialog?.kind === 'user'
            ? userName
            : nameDialog?.kind === 'edit-group' || nameDialog?.kind === 'edit-section'
              ? nameDialog.title
              : ''
        }
        submitText={
          nameDialog?.kind === 'user' ||
          nameDialog?.kind === 'edit-group' ||
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
        initialColumns={sectionSettings?.columns ?? 2}
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
