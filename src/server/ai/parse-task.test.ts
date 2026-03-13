import { describe, it, expect, vi } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {},
}));

import {
  fuzzyMatchMember,
  fuzzyMatchProject,
  fuzzyMatchLabels,
} from './parse-task';

const members = [
  { id: '1', name: 'Sarah Chen' },
  { id: '2', name: 'Alex Johnson' },
  { id: '3', name: 'Maria Garcia' },
];

const projects = [
  { id: 'p1', name: 'Frontend Redesign' },
  { id: 'p2', name: 'API Migration' },
  { id: 'p3', name: 'Mobile App' },
];

const labels = [
  { id: 'l1', name: 'Bug' },
  { id: 'l2', name: 'Feature' },
  { id: 'l3', name: 'Design' },
];

// ─── fuzzyMatchMember ───────────────────────────────────

describe('fuzzyMatchMember', () => {
  it('returns null for undefined name', () => {
    expect(fuzzyMatchMember(undefined, members)).toBeNull();
  });

  it('returns null for empty members array', () => {
    expect(fuzzyMatchMember('Sarah', [])).toBeNull();
  });

  it('matches exact name (case insensitive)', () => {
    expect(fuzzyMatchMember('sarah chen', members)).toBe('1');
    expect(fuzzyMatchMember('SARAH CHEN', members)).toBe('1');
  });

  it('matches by first name', () => {
    expect(fuzzyMatchMember('sarah', members)).toBe('1');
    expect(fuzzyMatchMember('Alex', members)).toBe('2');
  });

  it('matches by startsWith', () => {
    expect(fuzzyMatchMember('Mar', members)).toBe('3');
  });

  it('matches by contains', () => {
    expect(fuzzyMatchMember('Chen', members)).toBe('1');
    expect(fuzzyMatchMember('ohnson', members)).toBe('2');
  });

  it('returns null when no match', () => {
    expect(fuzzyMatchMember('Zack', members)).toBeNull();
  });

  it('trims whitespace', () => {
    expect(fuzzyMatchMember('  sarah chen  ', members)).toBe('1');
  });
});

// ─── fuzzyMatchProject ──────────────────────────────────

describe('fuzzyMatchProject', () => {
  it('returns null for undefined name', () => {
    expect(fuzzyMatchProject(undefined, projects)).toBeNull();
  });

  it('returns null for empty projects array', () => {
    expect(fuzzyMatchProject('Frontend', [])).toBeNull();
  });

  it('matches exact name (case insensitive)', () => {
    expect(fuzzyMatchProject('frontend redesign', projects)).toBe('p1');
    expect(fuzzyMatchProject('API MIGRATION', projects)).toBe('p2');
  });

  it('matches by startsWith', () => {
    expect(fuzzyMatchProject('Front', projects)).toBe('p1');
    expect(fuzzyMatchProject('api', projects)).toBe('p2');
  });

  it('matches by contains', () => {
    expect(fuzzyMatchProject('Redesign', projects)).toBe('p1');
    expect(fuzzyMatchProject('Migration', projects)).toBe('p2');
  });

  it('returns null when no match', () => {
    expect(fuzzyMatchProject('Backend', projects)).toBeNull();
  });

  it('trims whitespace', () => {
    expect(fuzzyMatchProject('  Mobile App  ', projects)).toBe('p3');
  });
});

// ─── fuzzyMatchLabels ───────────────────────────────────

describe('fuzzyMatchLabels', () => {
  it('returns empty array for undefined names', () => {
    expect(fuzzyMatchLabels(undefined, labels)).toEqual([]);
  });

  it('returns empty array for empty names array', () => {
    expect(fuzzyMatchLabels([], labels)).toEqual([]);
  });

  it('returns empty array for empty labels array', () => {
    expect(fuzzyMatchLabels(['Bug'], [])).toEqual([]);
  });

  it('matches exact names (case insensitive)', () => {
    expect(fuzzyMatchLabels(['bug', 'Feature'], labels)).toEqual(['l1', 'l2']);
  });

  it('matches by startsWith', () => {
    expect(fuzzyMatchLabels(['Feat'], labels)).toEqual(['l2']);
  });

  it('matches by contains', () => {
    expect(fuzzyMatchLabels(['atur'], labels)).toEqual(['l2']);
  });

  it('filters out unmatched names', () => {
    expect(fuzzyMatchLabels(['Bug', 'Nonexistent'], labels)).toEqual(['l1']);
  });

  it('trims whitespace in names', () => {
    expect(fuzzyMatchLabels(['  Bug  '], labels)).toEqual(['l1']);
  });
});
