import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  addDays,
  addWeeks,
  addMonths,
  addQuarters,
  differenceInDays,
  format,
  isToday,
  getWeek,
} from 'date-fns';

// ─── Types ──────────────────────────────────────────────

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter';

export interface ZoomConfig {
  columnWidth: number; // px per column
  startOf: (d: Date) => Date;
  endOf: (d: Date) => Date;
  add: (d: Date, n: number) => Date;
  formatPrimary: (d: Date) => string; // top row label
  formatSecondary: (d: Date) => string; // bottom row label
  groupKey: (d: Date) => string; // group columns under a primary header
  groupLabel: (d: Date) => string;
}

export interface TimeColumn {
  date: Date;
  label: string;
  isToday: boolean;
  groupKey: string;
}

export interface TimeGroup {
  key: string;
  label: string;
  columns: TimeColumn[];
  width: number;
}

export interface TaskDateRange {
  startDate: Date;
  endDate: Date;
}

// ─── Zoom configs ───────────────────────────────────────

export const ZOOM_CONFIGS: Record<ZoomLevel, ZoomConfig> = {
  day: {
    columnWidth: 40,
    startOf: startOfDay,
    endOf: endOfDay,
    add: addDays,
    formatPrimary: (d) => format(d, 'MMM yyyy'),
    formatSecondary: (d) => format(d, 'd'),
    groupKey: (d) => format(d, 'yyyy-MM'),
    groupLabel: (d) => format(d, 'MMMM yyyy'),
  },
  week: {
    columnWidth: 120,
    startOf: (d) => startOfWeek(d, { weekStartsOn: 1 }),
    endOf: (d) => endOfWeek(d, { weekStartsOn: 1 }),
    add: addWeeks,
    formatPrimary: (d) => format(d, 'MMM yyyy'),
    formatSecondary: (d) => `W${getWeek(d, { weekStartsOn: 1 })}`,
    groupKey: (d) => format(d, 'yyyy-MM'),
    groupLabel: (d) => format(d, 'MMMM yyyy'),
  },
  month: {
    columnWidth: 180,
    startOf: startOfMonth,
    endOf: endOfMonth,
    add: addMonths,
    formatPrimary: (d) => format(d, 'yyyy'),
    formatSecondary: (d) => format(d, 'MMM'),
    groupKey: (d) => format(d, 'yyyy'),
    groupLabel: (d) => format(d, 'yyyy'),
  },
  quarter: {
    columnWidth: 240,
    startOf: startOfQuarter,
    endOf: endOfQuarter,
    add: addQuarters,
    formatPrimary: (d) => format(d, 'yyyy'),
    formatSecondary: (d) => `Q${Math.ceil((d.getMonth() + 1) / 3)}`,
    groupKey: (d) => format(d, 'yyyy'),
    groupLabel: (d) => format(d, 'yyyy'),
  },
};

export const ROW_HEIGHT = 36;
export const LEFT_PANEL_WIDTH = 260;
export const HEADER_HEIGHT = 48; // two-tier header

// ─── Date helpers ───────────────────────────────────────

/** Get the start/end date range for a task (createdAt → dueDate or createdAt + 7d) */
export function getTaskDateRange(task: {
  createdAt: string | Date;
  dueDate?: string | Date | null;
}): TaskDateRange {
  const startDate = new Date(task.createdAt);
  const endDate = task.dueDate
    ? new Date(task.dueDate)
    : addDays(startDate, 7); // default 7-day bar if no due date
  return { startDate, endDate: endDate < startDate ? startDate : endDate };
}

/** Compute auto date range from all tasks with padding */
export function computeAutoRange(
  tasks: Array<{ createdAt: string | Date; dueDate?: string | Date | null }>,
  zoom: ZoomLevel
): { rangeStart: Date; rangeEnd: Date } {
  const config = ZOOM_CONFIGS[zoom];
  const now = new Date();

  if (tasks.length === 0) {
    return {
      rangeStart: config.startOf(addDays(now, -14)),
      rangeEnd: config.endOf(addDays(now, 30)),
    };
  }

  let earliest = now;
  let latest = now;

  for (const task of tasks) {
    const { startDate, endDate } = getTaskDateRange(task);
    if (startDate < earliest) earliest = startDate;
    if (endDate > latest) latest = endDate;
  }

  // Add padding: 2 columns before, 4 columns after
  const rangeStart = config.startOf(config.add(earliest, -2));
  const rangeEnd = config.endOf(config.add(latest, 4));

  return { rangeStart, rangeEnd };
}

/** Generate time columns for a given range and zoom */
export function generateTimeColumns(
  rangeStart: Date,
  rangeEnd: Date,
  zoom: ZoomLevel
): TimeGroup[] {
  const config = ZOOM_CONFIGS[zoom];
  const columns: TimeColumn[] = [];
  let current = config.startOf(rangeStart);

  while (current <= rangeEnd) {
    columns.push({
      date: current,
      label: config.formatSecondary(current),
      isToday: isToday(current),
      groupKey: config.groupKey(current),
    });
    current = config.add(current, 1);
  }

  // Group columns by primary header
  const groupMap = new Map<string, TimeGroup>();
  for (const col of columns) {
    let group = groupMap.get(col.groupKey);
    if (!group) {
      group = {
        key: col.groupKey,
        label: config.groupLabel(col.date),
        columns: [],
        width: 0,
      };
      groupMap.set(col.groupKey, group);
    }
    group.columns.push(col);
    group.width += config.columnWidth;
  }

  return Array.from(groupMap.values());
}

/** Convert a date to an x-position within the timeline */
export function dateToX(
  date: Date,
  rangeStart: Date,
  zoom: ZoomLevel
): number {
  const config = ZOOM_CONFIGS[zoom];
  const days = differenceInDays(date, rangeStart);

  switch (zoom) {
    case 'day':
      return days * config.columnWidth;
    case 'week':
      return (days / 7) * config.columnWidth;
    case 'month':
      return (days / 30) * config.columnWidth;
    case 'quarter':
      return (days / 91) * config.columnWidth;
  }
}

/** Convert an x-position back to a date */
export function xToDate(
  x: number,
  rangeStart: Date,
  zoom: ZoomLevel
): Date {
  const config = ZOOM_CONFIGS[zoom];

  switch (zoom) {
    case 'day':
      return addDays(rangeStart, Math.round(x / config.columnWidth));
    case 'week':
      return addDays(rangeStart, Math.round((x / config.columnWidth) * 7));
    case 'month':
      return addDays(rangeStart, Math.round((x / config.columnWidth) * 30));
    case 'quarter':
      return addDays(rangeStart, Math.round((x / config.columnWidth) * 91));
  }
}

/** Total width of all columns */
export function getTotalWidth(groups: TimeGroup[]): number {
  return groups.reduce((sum, g) => sum + g.width, 0);
}

/** Get today-line x position */
export function getTodayX(rangeStart: Date, zoom: ZoomLevel): number {
  return dateToX(new Date(), rangeStart, zoom);
}
