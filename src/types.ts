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
  gridPositionUnit?: number;
  gridPositions?: Record<string, { x: number; y: number } | undefined>;
  // Legacy free-layout positions are only read when migrating older saved data.
  layouts?: Record<string, { x: number; y: number; columns: number } | undefined>;
  layout?: { x: number; y: number };
}

export interface DashboardGroup {
  id: string;
  title: string;
  sections: ShortcutSection[];
  columns?: number;
}

export interface DashboardState {
  groups: DashboardGroup[];
  userName: string;
}
