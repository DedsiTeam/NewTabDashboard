import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertTriangle,
  Bookmark,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  Folder,
  Search,
  Upload,
  X,
} from 'lucide-react';
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useMemo,
  useRef,
  useEffect,
  useState,
} from 'react';
import type { BookmarkImportNode } from './bookmarks';
import type { Shortcut } from './types';

const shortcutToneOptions = [
  '#1d4ed8',
  '#0891b2',
  '#0d9488',
  '#16a34a',
  '#ca8a04',
  '#ea580c',
  '#dc2626',
  '#db2777',
  '#7c3aed',
  '#475569',
];

function normalizeTone(tone?: string) {
  return tone && /^#[0-9a-f]{6}$/i.test(tone) ? tone : '#1d4ed8';
}

interface DialogFrameProps {
  open: boolean;
  title: string;
  description?: string;
  contentClassName?: string;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
}

function DialogFrame({
  open,
  title,
  description,
  contentClassName,
  children,
  onOpenChange,
}: DialogFrameProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className={`dialog-content${contentClassName ? ` ${contentClassName}` : ''}`}
        >
          <div className="dialog-title-row">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && <Dialog.Description>{description}</Dialog.Description>}
            </div>
            <Dialog.Close className="dialog-close" aria-label="关闭">
              <X size={19} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function NameDialog({
  open,
  title,
  label,
  placeholder,
  initialValue = '',
  submitText = '创建',
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  label: string;
  placeholder: string;
  initialValue?: string;
  submitText?: string;
  onClose: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [initialValue, open]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    onSubmit(value.trim());
  }

  return (
    <DialogFrame open={open} title={title} onOpenChange={(next) => !next && onClose()}>
      <form className="dialog-form" onSubmit={submit}>
        <label>
          {label}
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            autoFocus
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="primary-button" disabled={!value.trim()}>
            {submitText}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确定',
  danger = true,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogFrame
      open={open}
      title={title}
      description={description}
      onOpenChange={(next) => !next && onClose()}
    >
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className={danger ? 'danger-button' : 'primary-button'}
          onClick={onConfirm}
          autoFocus
        >
          {confirmText}
        </button>
      </div>
    </DialogFrame>
  );
}

export function ShortcutDialog({
  open,
  initialValue,
  onClose,
  onSave,
}: {
  open: boolean;
  initialValue?: Shortcut;
  onClose: () => void;
  onSave: (shortcut: Omit<Shortcut, 'id'>) => void;
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (open) {
      setTitle(initialValue?.title ?? '');
      setUrl(initialValue?.url ?? '');
    }
  }, [initialValue, open]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !url.trim()) return;
    const normalizedUrl = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    onSave({
      title: title.trim(),
      url: normalizedUrl,
      icon: initialValue?.icon ?? 'globe',
      tone: initialValue?.tone ?? '#1d4ed8',
    });
  }

  return (
    <DialogFrame
      open={open}
      title={initialValue ? '编辑快捷入口' : '添加快捷入口'}
      description={initialValue ? '修改名称或网址，网站图标会自动更新。' : '将自动使用网站图标并保存在当前浏览器中。'}
      contentClassName="shortcut-dialog"
      onOpenChange={(next) => !next && onClose()}
    >
      <form className="dialog-form" onSubmit={submit}>
        <label>
          名称
          <input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
        </label>
        <label>
          网址
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="example.com"
            inputMode="url"
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="primary-button" disabled={!title.trim() || !url.trim()}>
            {initialValue ? '保存修改' : '添加'}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
}

export function BackupDialog({
  open,
  onClose,
  onExport,
  onImport,
  onImportBookmarks,
}: {
  open: boolean;
  onClose: () => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
  onImportBookmarks: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) {
      setError('');
      setIsImporting(false);
      setIsLoadingBookmarks(false);
      setPendingImportFile(null);
    }
  }, [open]);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError('');
    setPendingImportFile(file);
  }

  async function confirmImportFile() {
    if (!pendingImportFile) return;
    setError('');
    setIsImporting(true);
    try {
      await onImport(pendingImportFile);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '导入失败，请检查备份文件。');
    } finally {
      setIsImporting(false);
    }
  }

  async function openBookmarkImport() {
    setError('');
    setIsLoadingBookmarks(true);
    try {
      await onImportBookmarks();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '读取 Chrome 书签失败。');
    } finally {
      setIsLoadingBookmarks(false);
    }
  }

  return (
    <DialogFrame
      open={open}
      title="数据备份与迁移"
      contentClassName="backup-dialog"
      onOpenChange={(next) => !next && onClose()}
    >
      <div className="backup-options">
        <section className="backup-section">
          <div className="backup-section-heading">
            <strong>Chrome 书签</strong>
            <small>只会追加快捷入口，不影响当前数据</small>
          </div>
          <button
            type="button"
            className="backup-option is-bookmark-import"
            onClick={openBookmarkImport}
            disabled={isLoadingBookmarks}
          >
            <span className="backup-option-icon"><BookOpen size={22} /></span>
            <span>
              <strong>{isLoadingBookmarks ? '正在读取书签…' : '从 Chrome 书签添加入口'}</strong>
              <small>选择书签或文件夹，追加到当前快捷入口</small>
            </span>
          </button>
        </section>

        <section className="backup-section is-data-backup">
          <div className="backup-section-heading">
            <strong>完整数据备份</strong>
            <small>用于备份、迁移或恢复整个新标签页</small>
          </div>
          <div className="backup-data-actions">
            <button
              type="button"
              className="backup-option is-export"
              onClick={() => {
                onExport();
                onClose();
              }}
            >
              <span className="backup-option-icon"><Download size={22} /></span>
              <span>
                <strong>下载完整备份</strong>
                <small>将当前全部数据保存为 JSON 文件</small>
              </span>
            </button>

            <label className={isImporting ? 'backup-option is-disabled is-restore' : 'backup-option is-restore'}>
              <span className="backup-option-icon"><Upload size={22} /></span>
              <span>
                <strong>{isImporting ? '正在恢复…' : '从备份文件恢复'}</strong>
                <small>需要再次确认，确认后才会替换当前数据</small>
              </span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={importFile}
                disabled={isImporting}
              />
            </label>
          </div>
        </section>
      </div>
      {pendingImportFile && (
        <div className="backup-restore-confirmation" role="alert">
          <AlertTriangle size={21} />
          <div>
            <strong>确定恢复“{pendingImportFile.name}”吗？</strong>
            <p>当前姓名、卡片和快捷入口将被备份文件替换。</p>
          </div>
          <div className="backup-confirm-actions">
            <button type="button" onClick={() => setPendingImportFile(null)} disabled={isImporting}>
              取消
            </button>
            <button type="button" onClick={confirmImportFile} disabled={isImporting}>
              {isImporting ? '正在恢复…' : '确认恢复'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="backup-error">{error}</p>}
    </DialogFrame>
  );
}

function getDescendantIds(node: BookmarkImportNode): string[] {
  return [node.id, ...node.children.flatMap(getDescendantIds)];
}

function getBookmarkCount(node: BookmarkImportNode): number {
  return node.url ? 1 : node.children.reduce((sum, child) => sum + getBookmarkCount(child), 0);
}

function filterBookmarkTree(nodes: BookmarkImportNode[], query: string): BookmarkImportNode[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return nodes;

  return nodes.flatMap((node) => {
    const children = filterBookmarkTree(node.children, query);
    const matches =
      node.title.toLowerCase().includes(normalizedQuery) ||
      node.url?.toLowerCase().includes(normalizedQuery);
    return matches || children.length > 0 ? [{ ...node, children }] : [];
  });
}

function BookmarkCheckbox({
  checked,
  mixed,
  onChange,
}: {
  checked: boolean;
  mixed: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(event) => event.stopPropagation()}
      aria-label="选择此项"
    />
  );
}

function BookmarkTreeRow({
  node,
  depth,
  selectedIds,
  expandedIds,
  forceExpanded,
  onToggleSelected,
  onToggleExpanded,
}: {
  node: BookmarkImportNode;
  depth: number;
  selectedIds: Set<string>;
  expandedIds: Set<string>;
  forceExpanded: boolean;
  onToggleSelected: (node: BookmarkImportNode) => void;
  onToggleExpanded: (id: string) => void;
}) {
  const descendantIds = getDescendantIds(node);
  const selectedCount = descendantIds.filter((id) => selectedIds.has(id)).length;
  const checked = selectedCount === descendantIds.length;
  const mixed = selectedCount > 0 && !checked;
  const isFolder = !node.url;
  const expanded = forceExpanded || expandedIds.has(node.id);

  return (
    <li>
      <div className="bookmark-tree-row" style={{ '--bookmark-depth': depth } as React.CSSProperties}>
        {isFolder ? (
          <button
            type="button"
            className="bookmark-expand-button"
            onClick={() => onToggleExpanded(node.id)}
            aria-label={expanded ? '收起文件夹' : '展开文件夹'}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span className="bookmark-expand-placeholder" />
        )}
        <BookmarkCheckbox
          checked={checked}
          mixed={mixed}
          onChange={() => onToggleSelected(node)}
        />
        <span className="bookmark-node-icon">
          {isFolder ? <Folder size={17} /> : <Bookmark size={17} />}
        </span>
        <button
          type="button"
          className="bookmark-node-label"
          onClick={() => (isFolder ? onToggleExpanded(node.id) : onToggleSelected(node))}
        >
          <strong>{node.title}</strong>
          {node.url ? <small>{node.url}</small> : <small>{getBookmarkCount(node)} 个书签</small>}
        </button>
      </div>
      {isFolder && expanded && node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <BookmarkTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              expandedIds={expandedIds}
              forceExpanded={forceExpanded}
              onToggleSelected={onToggleSelected}
              onToggleExpanded={onToggleExpanded}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function BookmarkImportDialog({
  tree,
  onClose,
  onImport,
}: {
  tree: BookmarkImportNode[] | null;
  onClose: () => void;
  onImport: (selectedIds: Set<string>) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const filteredTree = useMemo(() => filterBookmarkTree(tree ?? [], query), [query, tree]);

  useEffect(() => {
    if (!tree) return;
    setQuery('');
    setSelectedIds(new Set());
    setExpandedIds(new Set(tree.map((node) => node.id)));
  }, [tree]);

  const selectedBookmarkCount = useMemo(() => {
    function count(nodes: BookmarkImportNode[]): number {
      return nodes.reduce(
        (sum, node) => sum + (node.url && selectedIds.has(node.id) ? 1 : count(node.children)),
        0,
      );
    }
    return count(tree ?? []);
  }, [selectedIds, tree]);

  function toggleSelected(node: BookmarkImportNode) {
    const ids = getDescendantIds(node);
    const shouldSelect = ids.some((id) => !selectedIds.has(id));
    setSelectedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => (shouldSelect ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set((tree ?? []).flatMap(getDescendantIds)));
  }

  return (
    <DialogFrame
      open={tree !== null}
      title="导入 Chrome 书签"
      description="选择需要导入的文件夹或书签。只会追加到当前页面，不会修改原书签。"
      contentClassName="bookmark-import-dialog"
      onOpenChange={(next) => !next && onClose()}
    >
      <div className="bookmark-toolbar">
        <label className="bookmark-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索书签名称或网址…"
            autoFocus
          />
        </label>
        <div className="bookmark-selection-actions">
          <button type="button" onClick={selectAll}>全选</button>
          <button type="button" onClick={() => setSelectedIds(new Set())}>清空</button>
        </div>
      </div>

      <div className="bookmark-tree" role="tree" aria-label="Chrome 书签">
        {filteredTree.length > 0 ? (
          <ul>
            {filteredTree.map((node) => (
              <BookmarkTreeRow
                key={node.id}
                node={node}
                depth={0}
                selectedIds={selectedIds}
                expandedIds={expandedIds}
                forceExpanded={Boolean(query.trim())}
                onToggleSelected={toggleSelected}
                onToggleExpanded={toggleExpanded}
              />
            ))}
          </ul>
        ) : (
          <div className="bookmark-empty">{query ? '没有匹配的书签' : 'Chrome 中暂无书签'}</div>
        )}
      </div>

      <div className="bookmark-import-footer">
        <span>已选择 {selectedBookmarkCount} 个书签</span>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={onClose}>取消</button>
          <button
            type="button"
            className="primary-button"
            disabled={selectedBookmarkCount === 0}
            onClick={() => onImport(selectedIds)}
          >
            导入所选
          </button>
        </div>
      </div>
    </DialogFrame>
  );
}

export interface GlobalSearchItem {
  id: string;
  kind: 'shortcut' | 'section';
  title: string;
  subtitle: string;
  searchText: string;
}

const globalSearchIcons = {
  shortcut: Bookmark,
  section: Folder,
};

const globalSearchLabels = {
  shortcut: '快捷入口',
  section: '卡片',
};

export function GlobalSearchDialog({
  open,
  items,
  onClose,
  onSelect,
}: {
  open: boolean;
  items: GlobalSearchItem[];
  onClose: () => void;
  onSelect: (item: GlobalSearchItem) => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items.slice(0, 12);
    return items
      .filter((item) => item.searchText.toLowerCase().includes(normalized))
      .slice(0, 30);
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function select(item: GlobalSearchItem) {
    onSelect(item);
    onClose();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay global-search-overlay" />
        <Dialog.Content
          className="global-search-dialog"
          aria-describedby={undefined}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((current) => Math.min(current + 1, results.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
            } else if (event.key === 'Enter' && results[activeIndex]) {
              event.preventDefault();
              select(results[activeIndex]);
            }
          }}
        >
          <Dialog.Title className="global-search-title">全局搜索</Dialog.Title>
          <label className="global-search-input">
            <Search size={21} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索卡片、快捷入口或网址…"
              autoFocus
            />
            <kbd>ESC</kbd>
          </label>
          <div className="global-search-results" role="listbox">
            {results.length > 0 ? (
              results.map((item, index) => {
                const Icon = globalSearchIcons[item.kind];
                return (
                  <button
                    type="button"
                    key={`${item.kind}-${item.id}`}
                    className={`global-search-result${index === activeIndex ? ' is-active' : ''}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => select(item)}
                    role="option"
                    aria-selected={index === activeIndex}
                  >
                    <span className="global-search-result-icon"><Icon size={19} /></span>
                    <span className="global-search-result-copy">
                      <strong>{item.title}</strong>
                      <small>{item.subtitle}</small>
                    </span>
                    <span className="global-search-result-kind">{globalSearchLabels[item.kind]}</span>
                  </button>
                );
              })
            ) : (
              <div className="global-search-empty">
                <Search size={28} />
                <span>没有找到相关内容</span>
              </div>
            )}
          </div>
          <div className="global-search-hint">
            <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
            <span><kbd>Enter</kbd> 打开</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
