export type DatePreset = 'today' | 'week' | 'month' | 'all';

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  week: '7 Days',
  month: '30 Days',
  all: 'All',
};

/** Rolling-window start, matching the convention already used for the sales period selector. */
export function presetStartMs(preset: DatePreset): number {
  const now = Date.now();
  if (preset === 'today') return new Date().setHours(0, 0, 0, 0);
  if (preset === 'week') return now - 6 * 86400000;
  if (preset === 'month') return now - 29 * 86400000;
  return 0; // 'all'
}

export function filterByDatePreset<T>(
  items: T[],
  preset: DatePreset,
  getTimestamp: (item: T) => string
): T[] {
  if (preset === 'all') return items;
  const start = presetStartMs(preset);
  return items.filter((item) => new Date(getTimestamp(item)).getTime() >= start);
}

/** Compact open-duration label: "12m", "3h 20m", "2d 4h". */
export function formatDuration(sinceIso: string, nowMs: number = Date.now()): string {
  const ms = Math.max(0, nowMs - new Date(sinceIso).getTime());
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return `${hours}h ${remMins}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

/**
 * How long a ticket's been open, as a severity tier — an open ticket is
 * expected to close out within a normal dining window, so the longer it
 * sits, the more likely it's a forgotten table rather than a real one.
 */
export function ticketSeverity(sinceIso: string, nowMs: number = Date.now()): 'normal' | 'caution' | 'danger' {
  const hours = (nowMs - new Date(sinceIso).getTime()) / 3600000;
  if (hours >= 4) return 'danger';
  if (hours >= 2) return 'caution';
  return 'normal';
}

/** "Today" / "Yesterday" / "3 days ago", falling back to a plain date past a week. */
export function formatRelativeDate(iso: string, nowMs: number = Date.now()): string {
  const date = new Date(iso);
  const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
  const dayDiff = Math.round((startOfDay(nowMs) - startOfDay(date.getTime())) / 86400000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff > 1 && dayDiff <= 6) return `${dayDiff} days ago`;
  return date.toLocaleDateString([], {
    day: '2-digit',
    month: 'short',
    year: dayDiff > 365 ? 'numeric' : undefined,
  });
}

/** Age in whole days — used for the accounts-receivable-style 30-day aging flag on credit tabs. */
export function ageInDays(iso: string, nowMs: number = Date.now()): number {
  return Math.floor((nowMs - new Date(iso).getTime()) / 86400000);
}