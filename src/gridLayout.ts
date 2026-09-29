export interface GridItem {
  id: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export interface GridPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function placeGridItems(items: GridItem[], columns: number, priorityId?: string) {
  const placed: Record<string, GridPlacement> = {};
  const safeColumns = Math.max(1, columns);
  const ordered = [...items].sort((a, b) => {
    if (a.id === priorityId) return -1;
    if (b.id === priorityId) return 1;
    const aFixed = Number.isFinite(a.x) && Number.isFinite(a.y);
    const bFixed = Number.isFinite(b.x) && Number.isFinite(b.y);
    if (aFixed !== bFixed) return aFixed ? -1 : 1;
    if (!aFixed || !bFixed) return 0;
    return (a.y! - b.y!) || (a.x! - b.x!);
  });

  function free(x: number, y: number, width: number, height: number) {
    return Object.values(placed).every((other) =>
      x + width <= other.x || other.x + other.width <= x ||
      y + height <= other.y || other.y + other.height <= y,
    );
  }

  for (const item of ordered) {
    const width = Math.min(safeColumns, Math.max(1, item.width));
    const height = Math.max(1, item.height);
    let x = Number.isFinite(item.x) ? Math.min(safeColumns - width, Math.max(0, item.x!)) : 0;
    let y = Number.isFinite(item.y) ? Math.max(0, item.y!) : 0;

    if (Number.isFinite(item.x) && Number.isFinite(item.y)) {
      while (!free(x, y, width, height)) y += 1;
    } else {
      while (true) {
        let found = false;
        for (x = 0; x <= safeColumns - width; x += 1) {
          if (free(x, y, width, height)) {
            found = true;
            break;
          }
        }
        if (found) break;
        y += 1;
      }
    }

    placed[item.id] = { x, y, width, height };
  }

  return placed;
}
