export const CARD_GAP = 14;
export const CARD_ROW_HEIGHT = 1;
export const CARD_ROW_STEP = CARD_ROW_HEIGHT;

export type CardPosition = { x: number; y: number };
export type LayoutCard = CardPosition & { id: string; rows: number };

export function validPosition(value: unknown): value is CardPosition {
  if (!value || typeof value !== 'object') return false;
  const { x, y } = value as CardPosition;
  return Number.isInteger(x) && x >= 0 && Number.isInteger(y) && y >= 0;
}

function overlaps(a: LayoutCard, b: LayoutCard) {
  return a.x === b.x && a.y < b.y + b.rows && b.y < a.y + a.rows;
}

export function buildCardLayout(
  cards: { id: string; rows: number; position?: CardPosition }[], columns: number,
): LayoutCard[] {
  const placed: LayoutCard[] = [];
  const initialRows: number[] = [];
  // Unsaved cards retain the previous row-based order until moved by the user.
  cards.forEach((card, index) => {
    const row = Math.floor(index / columns);
    initialRows[row] = Math.max(initialRows[row] ?? 0, card.rows);
  });
  const place = (card: typeof cards[number], index: number) => {
    const position = validPosition(card.position) ? card.position : {
      x: index % columns,
      y: initialRows.slice(0, Math.floor(index / columns)).reduce((sum, rows) => sum + rows, 0),
    };
    const next = { id: card.id, rows: card.rows, x: Math.min(position.x, columns - 1), y: position.y };
    let collision: LayoutCard | undefined;
    while ((collision = placed.find((other) => overlaps(next, other)))) {
      next.y = collision.y + collision.rows;
    }
    placed.push(next);
  };
  cards.forEach((card, index) => { if (validPosition(card.position)) place(card, index); });
  cards.forEach((card, index) => { if (!validPosition(card.position)) place(card, index); });
  return cards.map((card) => placed.find((item) => item.id === card.id)!);
}

export function moveLayoutCard(layout: LayoutCard[], id: string, target: CardPosition): LayoutCard[] {
  const moving = layout.find((card) => card.id === id);
  if (!moving) return layout;
  const placed = [{ ...moving, ...target }];
  // Only cards obstructing the requested space move down; never compact gaps.
  for (const card of layout.filter((item) => item.id !== id).sort((a, b) => a.y - b.y)) {
    const next = { ...card };
    let collision: LayoutCard | undefined;
    while ((collision = placed.find((other) => overlaps(next, other)))) {
      next.y = collision.y + collision.rows;
    }
    placed.push(next);
  }
  return layout.map((card) => placed.find((item) => item.id === card.id)!);
}

// Snap near either neighbour edge without automatically compacting the column.
export function snapCardPosition(layout: LayoutCard[], id: string, target: CardPosition): CardPosition {
  const moving = layout.find((card) => card.id === id);
  if (!moving) return target;
  const edges = [0, ...layout.filter((card) => card.id !== id && card.x === target.x)
    .flatMap((card) => [card.y + card.rows, card.y - moving.rows])].filter((y) => y >= 0);
  const nearest = edges.sort((a, b) => Math.abs(a - target.y) - Math.abs(b - target.y))[0];
  return Math.abs(nearest - target.y) <= 24 ? { ...target, y: nearest } : target;
}
