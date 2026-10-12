export function matchesShortcutSearch(text: string, query: string): boolean {
  const normalized = text.toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).every((word) => {
    let index = 0;
    for (const character of normalized) {
      if (character === word[index]) index += 1;
      if (index === word.length) return true;
    }
    return word.length === 0;
  });
}
