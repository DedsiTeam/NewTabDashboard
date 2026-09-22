export type ShortcutIcon =
  | 'mail'
  | 'calendar'
  | 'file'
  | 'table'
  | 'presentation'
  | 'cloud'
  | 'list'
  | 'check'
  | 'folder'
  | 'palette'
  | 'code'
  | 'message'
  | 'chart'
  | 'pie'
  | 'trend'
  | 'database'
  | 'book'
  | 'play'
  | 'link'
  | 'image'
  | 'heart'
  | 'music'
  | 'game'
  | 'shopping'
  | 'home'
  | 'star'
  | 'lightbulb'
  | 'activity'
  | 'bell'
  | 'bike'
  | 'bookmark'
  | 'briefcase'
  | 'building'
  | 'calculator'
  | 'camera'
  | 'car'
  | 'clock'
  | 'coffee'
  | 'credit-card'
  | 'download'
  | 'dumbbell'
  | 'gift'
  | 'globe'
  | 'headphones'
  | 'key'
  | 'laptop'
  | 'lock'
  | 'map'
  | 'map-pin'
  | 'mic'
  | 'monitor'
  | 'package'
  | 'phone'
  | 'plane'
  | 'radio'
  | 'rss'
  | 'shield'
  | 'shopping-cart'
  | 'smartphone'
  | 'terminal'
  | 'trophy'
  | 'upload'
  | 'user'
  | 'users'
  | 'utensils'
  | 'video'
  | 'wallet'
  | 'wifi'
  | 'zap';

export interface Shortcut {
  id: string;
  title: string;
  url: string;
  icon: ShortcutIcon;
  tone: string;
}

export interface ShortcutSection {
  id: string;
  title: string;
  shortcuts: Shortcut[];
  columns?: 1 | 2;
}

export interface DashboardGroup {
  id: string;
  title: string;
  sections: ShortcutSection[];
}

export interface TodoItem {
  id: string;
  title: string;
  content: string;
  color: string;
}

export interface DashboardState {
  groups: DashboardGroup[];
  userName: string;
  todos: TodoItem[];
  todoCollapsed: boolean;
  collapsedSectionIds: string[];
}
