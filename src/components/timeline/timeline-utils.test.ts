import { describe, it, expect } from 'vitest';
import {
  getTaskDateRange,
  computeAutoRange,
  generateTimeColumns,
  dateToX,
  xToDate,
  getTotalWidth,
  getTodayX,
  ZOOM_CONFIGS,
} from './timeline-utils';
import { addDays } from 'date-fns';

// ─── getTaskDateRange ───────────────────────────────────

describe('getTaskDateRange', () => {
  it('returns startDate from createdAt and endDate from dueDate', () => {
    const task = {
      createdAt: '2025-01-01T00:00:00Z',
      dueDate: '2025-01-15T00:00:00Z',
    };
    const range = getTaskDateRange(task);
    expect(range.startDate.getTime()).toBe(new Date('2025-01-01T00:00:00Z').getTime());
    expect(range.endDate.getTime()).toBe(new Date('2025-01-15T00:00:00Z').getTime());
  });

  it('defaults to startDate + 7 days when no dueDate', () => {
    const task = { createdAt: '2025-01-01T00:00:00Z' };
    const range = getTaskDateRange(task);
    const expected = addDays(new Date('2025-01-01T00:00:00Z'), 7);
    expect(range.endDate.getTime()).toBe(expected.getTime());
  });

  it('defaults to startDate + 7 days when dueDate is null', () => {
    const task = { createdAt: '2025-03-01T00:00:00Z', dueDate: null };
    const range = getTaskDateRange(task);
    const expected = addDays(new Date('2025-03-01T00:00:00Z'), 7);
    expect(range.endDate.getTime()).toBe(expected.getTime());
  });

  it('clamps endDate to startDate when endDate < startDate', () => {
    const task = {
      createdAt: '2025-06-15T00:00:00Z',
      dueDate: '2025-06-01T00:00:00Z',
    };
    const range = getTaskDateRange(task);
    expect(range.endDate.getTime()).toBe(range.startDate.getTime());
  });

  it('accepts Date objects', () => {
    const created = new Date(2025, 0, 1);
    const due = new Date(2025, 0, 10);
    const range = getTaskDateRange({ createdAt: created, dueDate: due });
    expect(range.startDate.getTime()).toBe(created.getTime());
    expect(range.endDate.getTime()).toBe(due.getTime());
  });
});

// ─── computeAutoRange ───────────────────────────────────

describe('computeAutoRange', () => {
  it('returns a range around now for empty tasks', () => {
    const { rangeStart, rangeEnd } = computeAutoRange([], 'day');
    expect(rangeStart).toBeInstanceOf(Date);
    expect(rangeEnd).toBeInstanceOf(Date);
    expect(rangeEnd.getTime()).toBeGreaterThan(rangeStart.getTime());
  });

  it('computes range from tasks with padding', () => {
    const tasks = [
      { createdAt: '2025-01-10T00:00:00Z', dueDate: '2025-01-20T00:00:00Z' },
      { createdAt: '2025-01-05T00:00:00Z', dueDate: '2025-02-01T00:00:00Z' },
    ];
    const { rangeStart, rangeEnd } = computeAutoRange(tasks, 'day');
    // rangeStart should be before the earliest task
    expect(rangeStart.getTime()).toBeLessThan(new Date('2025-01-05T00:00:00Z').getTime());
    // rangeEnd should be after the latest task
    expect(rangeEnd.getTime()).toBeGreaterThan(new Date('2025-02-01T00:00:00Z').getTime());
  });
});

// ─── generateTimeColumns ────────────────────────────────

describe('generateTimeColumns', () => {
  it('generates daily columns grouped by month for day zoom', () => {
    const start = new Date(2025, 0, 1); // Jan 1
    const end = new Date(2025, 0, 5); // Jan 5
    const groups = generateTimeColumns(start, end, 'day');

    expect(groups.length).toBeGreaterThanOrEqual(1);
    // All columns should be in the same month group
    const totalCols = groups.reduce((sum, g) => sum + g.columns.length, 0);
    expect(totalCols).toBeGreaterThanOrEqual(5);
  });

  it('generates weekly columns for week zoom', () => {
    const start = new Date(2025, 0, 1);
    const end = new Date(2025, 1, 28);
    const groups = generateTimeColumns(start, end, 'week');
    expect(groups.length).toBeGreaterThanOrEqual(1);
    for (const group of groups) {
      expect(group.width).toBe(group.columns.length * ZOOM_CONFIGS.week.columnWidth);
    }
  });

  it('each column has label, isToday, and groupKey', () => {
    const start = new Date(2025, 0, 1);
    const end = new Date(2025, 0, 3);
    const groups = generateTimeColumns(start, end, 'day');
    for (const group of groups) {
      for (const col of group.columns) {
        expect(col).toHaveProperty('label');
        expect(col).toHaveProperty('isToday');
        expect(col).toHaveProperty('groupKey');
        expect(col).toHaveProperty('date');
      }
    }
  });
});

// ─── dateToX ────────────────────────────────────────────

describe('dateToX', () => {
  const rangeStart = new Date(2025, 0, 1);

  it('returns 0 for rangeStart date', () => {
    expect(dateToX(rangeStart, rangeStart, 'day')).toBe(0);
  });

  it('returns columnWidth for one day offset in day zoom', () => {
    const oneDay = addDays(rangeStart, 1);
    expect(dateToX(oneDay, rangeStart, 'day')).toBe(ZOOM_CONFIGS.day.columnWidth);
  });

  it('returns columnWidth for 7 days offset in week zoom', () => {
    const oneWeek = addDays(rangeStart, 7);
    expect(dateToX(oneWeek, rangeStart, 'week')).toBe(ZOOM_CONFIGS.week.columnWidth);
  });

  it('returns columnWidth for 30 days offset in month zoom', () => {
    const oneMonth = addDays(rangeStart, 30);
    expect(dateToX(oneMonth, rangeStart, 'month')).toBe(ZOOM_CONFIGS.month.columnWidth);
  });

  it('returns columnWidth for 91 days offset in quarter zoom', () => {
    const oneQuarter = addDays(rangeStart, 91);
    expect(dateToX(oneQuarter, rangeStart, 'quarter')).toBe(ZOOM_CONFIGS.quarter.columnWidth);
  });
});

// ─── xToDate ────────────────────────────────────────────

describe('xToDate', () => {
  const rangeStart = new Date(2025, 0, 1);

  it('returns rangeStart for x=0', () => {
    const result = xToDate(0, rangeStart, 'day');
    expect(result.getTime()).toBe(rangeStart.getTime());
  });

  it('is inverse of dateToX for day zoom', () => {
    const date = addDays(rangeStart, 5);
    const x = dateToX(date, rangeStart, 'day');
    const recovered = xToDate(x, rangeStart, 'day');
    expect(recovered.getTime()).toBe(date.getTime());
  });

  it('is inverse of dateToX for week zoom', () => {
    const date = addDays(rangeStart, 14);
    const x = dateToX(date, rangeStart, 'week');
    const recovered = xToDate(x, rangeStart, 'week');
    expect(recovered.getTime()).toBe(date.getTime());
  });

  it('is inverse of dateToX for month zoom', () => {
    const date = addDays(rangeStart, 60);
    const x = dateToX(date, rangeStart, 'month');
    const recovered = xToDate(x, rangeStart, 'month');
    expect(recovered.getTime()).toBe(date.getTime());
  });
});

// ─── getTotalWidth ──────────────────────────────────────

describe('getTotalWidth', () => {
  it('sums group widths', () => {
    const groups = [
      { key: 'a', label: 'A', columns: [], width: 100 },
      { key: 'b', label: 'B', columns: [], width: 200 },
      { key: 'c', label: 'C', columns: [], width: 150 },
    ];
    expect(getTotalWidth(groups)).toBe(450);
  });

  it('returns 0 for empty groups', () => {
    expect(getTotalWidth([])).toBe(0);
  });
});

// ─── getTodayX ──────────────────────────────────────────

describe('getTodayX', () => {
  it('returns a number without crashing', () => {
    const rangeStart = new Date(2025, 0, 1);
    const result = getTodayX(rangeStart, 'day');
    expect(typeof result).toBe('number');
    expect(Number.isFinite(result)).toBe(true);
  });
});
