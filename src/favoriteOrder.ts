export function reorderFavorites(ids: string[], sourceId: string, targetId: string, after: boolean): string[] {
  if (sourceId === targetId || !ids.includes(sourceId) || !ids.includes(targetId)) return ids;
  const next = ids.filter((id) => id !== sourceId);
  const targetIndex = next.indexOf(targetId);
  next.splice(targetIndex + (after ? 1 : 0), 0, sourceId);
  return next;
}
