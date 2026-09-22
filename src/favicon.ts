function normalizePageUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function getDirectFaviconUrl(pageUrl: string) {
  const normalizedUrl = normalizePageUrl(pageUrl);
  if (!normalizedUrl) return '';

  try {
    return new URL('/favicon.ico', normalizedUrl).toString();
  } catch {
    return '';
  }
}

export function getFaviconUrl(pageUrl: string, size = 32) {
  const normalizedUrl = normalizePageUrl(pageUrl);
  if (!normalizedUrl) return '';

  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    const faviconUrl = new URL(chrome.runtime.getURL('/_favicon/'));
    faviconUrl.searchParams.set('pageUrl', normalizedUrl);
    faviconUrl.searchParams.set('size', String(size));
    return faviconUrl.toString();
  }

  return getDirectFaviconUrl(normalizedUrl);
}

export function getFaviconCandidates(pageUrl: string, size = 32) {
  const candidates = [getFaviconUrl(pageUrl, size), getDirectFaviconUrl(pageUrl)];
  return candidates.filter((candidate, index) => candidate && candidates.indexOf(candidate) === index);
}
