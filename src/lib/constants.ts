// ─── Brand ───────────────────────────────────────────────
export const BRAND_AMBER = '#BA7517';
export const BRAND_AMBER_LIGHT = 'rgba(186,117,23,.15)';

// ─── Status Colors ───────────────────────────────────────
export const STATUS_COLORS = {
  BACKLOG: '#888780',
  TODO: '#378ADD',
  IN_PROGRESS: '#EF9F27',
  IN_REVIEW: '#7F77DD',
  DONE: '#639922',
  CANCELLED: '#888780',
} as const;

export const STATUS_BG_COLORS = {
  BACKLOG: 'rgba(136,135,128,.12)',
  TODO: 'rgba(55,138,221,.12)',
  IN_PROGRESS: 'rgba(239,159,39,.12)',
  IN_REVIEW: 'rgba(127,119,221,.12)',
  DONE: 'rgba(99,153,34,.12)',
  CANCELLED: 'rgba(136,135,128,.12)',
} as const;

export const STATUS_TEXT_COLORS = {
  BACKLOG: '#444441',
  TODO: '#185FA5',
  IN_PROGRESS: '#854F0B',
  IN_REVIEW: '#3C3489',
  DONE: '#27500A',
  CANCELLED: '#444441',
} as const;

export const STATUS_LABELS: Record<string, string> = {
  BACKLOG: 'Backlog',
  TODO: 'Todo',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
};

export const STATUS_ORDER = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'] as const;

// ─── Priority Colors ────────────────────────────────────
export const PRIORITY_COLORS = {
  URGENT: '#E24B4A',
  HIGH: '#EF9F27',
  MEDIUM: '#378ADD',
  LOW: '#888780',
  NONE: '#888780',
} as const;

export const PRIORITY_LABELS: Record<string, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
  NONE: 'None',
};

export const PRIORITY_ORDER = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;

// ─── Label Presets ───────────────────────────────────────
export const LABEL_PRESETS = {
  Feature: { color: '#185FA5', bg: 'rgba(53,138,221,.12)' },
  Infra: { color: '#0F6E56', bg: 'rgba(29,158,117,.12)' },
  Design: { color: '#99355A', bg: 'rgba(212,83,126,.12)' },
  Docs: { color: '#534AB7', bg: 'rgba(127,119,221,.12)' },
} as const;

// ─── Avatar Colors (from mockup) ─────────────────────────
export const AVATAR_COLORS: Record<string, { bg: string; color: string }> = {
  Fred: { bg: 'rgba(186,117,23,.15)', color: '#BA7517' },
  Sarah: { bg: 'rgba(53,138,221,.15)', color: '#185FA5' },
  Marcus: { bg: 'rgba(29,158,117,.15)', color: '#0F6E56' },
  Priya: { bg: 'rgba(212,83,126,.12)', color: '#99355A' },
  Jordan: { bg: 'rgba(127,119,221,.15)', color: '#534AB7' },
};

// ─── Board columns (visible statuses) ────────────────────
export const BOARD_COLUMNS = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;
