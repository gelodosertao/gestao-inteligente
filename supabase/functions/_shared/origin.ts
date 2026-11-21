function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchesOriginPattern(pattern: string, origin: string): boolean {
  if (!pattern.includes('*')) return false;
  const expression = pattern.split('*').map(escapeRegExp).join('[^/\\s]+');
  return new RegExp(`^${expression}$`, 'i').test(origin);
}

export function isOriginAllowed(origin: string, entries: readonly string[]): boolean {
  const normalized = origin.trim().replace(/\/+$/, '');
  return entries.some(
    (entry) => entry.toLowerCase() === normalized.toLowerCase() || matchesOriginPattern(entry, normalized),
  );
}

export function normalizeOriginEntries(values: Array<string | undefined>): string[] {
  return values
    .join(',')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}
