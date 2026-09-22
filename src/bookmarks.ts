import type { DashboardGroup, Shortcut, ShortcutSection } from './types';

export interface BookmarkImportNode {
  id: string;
  title: string;
  url?: string;
  children: BookmarkImportNode[];
}

function isChromeExtension() {
  return (
    typeof chrome !== 'undefined' &&
    Boolean(chrome.runtime?.id) &&
    Boolean(chrome.permissions)
  );
}

function toImportNode(node: chrome.bookmarks.BookmarkTreeNode): BookmarkImportNode {
  return {
    id: node.id,
    title: node.title || (node.url ? node.url : '未命名文件夹'),
    url: node.url,
    children: (node.children ?? []).map(toImportNode),
  };
}

export async function requestChromeBookmarks(): Promise<BookmarkImportNode[]> {
  if (!isChromeExtension()) {
    throw new Error('请在已安装的 Chrome 扩展中使用书签导入功能。');
  }

  const granted = await chrome.permissions.request({ permissions: ['bookmarks'] });
  if (!granted) {
    throw new Error('未获得书签读取权限，无法继续导入。');
  }

  if (!chrome.bookmarks) {
    throw new Error('书签权限已授权，但 Chrome 书签 API 暂不可用。请重新加载扩展后再试。');
  }

  const tree = await chrome.bookmarks.getTree();
  return tree.flatMap((node) => (node.children ?? []).map(toImportNode));
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function collectBookmarks(
  node: BookmarkImportNode,
  selectedIds: Set<string>,
): BookmarkImportNode[] {
  if (node.url) return selectedIds.has(node.id) ? [node] : [];
  return node.children.flatMap((child) => collectBookmarks(child, selectedIds));
}

function toShortcut(node: BookmarkImportNode): Shortcut | null {
  if (!node.url) return null;
  return {
    id: makeId('shortcut'),
    title: node.title || node.url,
    url: node.url,
    icon: 'globe',
    tone: '#1d4ed8',
  };
}

function makeSection(title: string, nodes: BookmarkImportNode[]): ShortcutSection | null {
  const shortcuts = nodes.map(toShortcut).filter((item): item is Shortcut => item !== null);
  if (shortcuts.length === 0) return null;
  return { id: makeId('section'), title, shortcuts };
}

function folderToGroup(
  folder: BookmarkImportNode,
  selectedIds: Set<string>,
): DashboardGroup | null {
  const directBookmarks = folder.children.filter(
    (child) => child.url && selectedIds.has(child.id),
  );
  const childFolders = folder.children.filter((child) => !child.url);
  const sections: ShortcutSection[] = [];

  const directSection = makeSection('书签', directBookmarks);
  if (directSection) sections.push(directSection);

  for (const childFolder of childFolders) {
    const section = makeSection(
      childFolder.title,
      collectBookmarks(childFolder, selectedIds),
    );
    if (section) sections.push(section);
  }

  if (sections.length === 0) return null;
  return {
    id: makeId('group'),
    title: folder.title || 'Chrome 书签',
    sections,
  };
}

function findSelectedRoots(
  nodes: BookmarkImportNode[],
  selectedIds: Set<string>,
  ancestorSelected = false,
): BookmarkImportNode[] {
  return nodes.flatMap((node) => {
    const selected = selectedIds.has(node.id);
    if (selected && !ancestorSelected) return [node];
    return findSelectedRoots(node.children, selectedIds, ancestorSelected || selected);
  });
}

export function buildGroupsFromBookmarks(
  tree: BookmarkImportNode[],
  selectedIds: Set<string>,
): DashboardGroup[] {
  const selectedRoots = findSelectedRoots(tree, selectedIds);
  const groups: DashboardGroup[] = [];
  const looseBookmarks: BookmarkImportNode[] = [];

  for (const node of selectedRoots) {
    if (node.url) {
      looseBookmarks.push(node);
      continue;
    }
    const group = folderToGroup(node, selectedIds);
    if (group) groups.push(group);
  }

  const looseSection = makeSection('已选择书签', looseBookmarks);
  if (looseSection) {
    groups.push({
      id: makeId('group'),
      title: 'Chrome 书签',
      sections: [looseSection],
    });
  }

  return groups;
}
