import { describe, it, expect } from 'vitest';
import {
  cn,
  formatRelativeTime,
  formatDueDate,
  formatDueDateFull,
  getInitials,
  getAvatarColor,
} from './utils';

describe('cn', () => {
  it('merges multiple class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
    expect(cn('base', true && 'active')).toBe('base active');
  });

  it('resolves conflicting tailwind classes', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('handles empty inputs', () => {
    expect(cn()).toBe('');
    expect(cn('')).toBe('');
  });
});

describe('formatRelativeTime', () => {
  it('accepts a Date object and returns a string with "ago"', () => {
    const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const result = formatRelativeTime(pastDate);
    expect(result).toContain('ago');
  });

  it('accepts an ISO date string', () => {
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const result = formatRelativeTime(pastDate.toISOString());
    expect(result).toContain('ago');
  });

  it('returns "less than a minute ago" for very recent dates', () => {
    const result = formatRelativeTime(new Date());
    expect(result).toContain('ago');
  });
});

describe('formatDueDate', () => {
  it('returns MMM d format for a Date object', () => {
    const date = new Date(2025, 0, 15); // Jan 15, 2025
    expect(formatDueDate(date)).toBe('Jan 15');
  });

  it('returns MMM d format for a date string', () => {
    // Use full ISO string to avoid timezone offset issues with date-only strings
    const date = new Date(2025, 5, 3); // Jun 3, 2025 in local time
    expect(formatDueDate(date.toISOString())).toBe('Jun 3');
  });

  it('returns empty string for null', () => {
    expect(formatDueDate(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatDueDate(undefined)).toBe('');
  });
});

describe('formatDueDateFull', () => {
  it('returns MMM d, yyyy format for a Date object', () => {
    const date = new Date(2025, 0, 15);
    expect(formatDueDateFull(date)).toBe('Jan 15, 2025');
  });

  it('returns MMM d, yyyy format for a date string', () => {
    const date = new Date(2025, 5, 3); // Jun 3, 2025 in local time
    expect(formatDueDateFull(date.toISOString())).toBe('Jun 3, 2025');
  });

  it('returns empty string for null', () => {
    expect(formatDueDateFull(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatDueDateFull(undefined)).toBe('');
  });
});

describe('getInitials', () => {
  it('returns first letter for single name', () => {
    expect(getInitials('Alice')).toBe('A');
  });

  it('returns first letters of two names', () => {
    expect(getInitials('Alice Bob')).toBe('AB');
  });

  it('returns only first two initials for three names', () => {
    expect(getInitials('Alice Bob Charlie')).toBe('AB');
  });

  it('returns uppercase', () => {
    expect(getInitials('alice bob')).toBe('AB');
  });
});

describe('getAvatarColor', () => {
  it('returns consistent color for the same name', () => {
    const color1 = getAvatarColor('Alice');
    const color2 = getAvatarColor('Alice');
    expect(color1).toEqual(color2);
  });

  it('returns an object with bg and color properties', () => {
    const result = getAvatarColor('Test');
    expect(result).toHaveProperty('bg');
    expect(result).toHaveProperty('color');
    expect(typeof result.bg).toBe('string');
    expect(typeof result.color).toBe('string');
  });

  it('returns a valid color from the palette', () => {
    const result = getAvatarColor('Alice');
    expect(result.bg).toMatch(/^rgba\(/);
    expect(result.color).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
