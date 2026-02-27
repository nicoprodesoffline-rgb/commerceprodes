const RECENT_KEY = "prodes_recent";
const MAX_RECENT = 12;

export function addRecentlyViewed(handle: string): void {
  if (typeof window === "undefined") return;
  try {
    const existing: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    const filtered = existing.filter((h) => h !== handle);
    const updated = [handle, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

export function getRecentlyViewed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}
