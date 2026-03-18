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

// ─── Decision Status Colors ─────────────────────────────
export const DECISION_STATUS_COLORS = {
  DRAFT: '#888780',
  ACTIVE: '#639922',
  SUPERSEDED: '#EF9F27',
  REVOKED: '#E24B4A',
} as const;

export const DECISION_STATUS_BG_COLORS = {
  DRAFT: 'rgba(136,135,128,.12)',
  ACTIVE: 'rgba(99,153,34,.12)',
  SUPERSEDED: 'rgba(239,159,39,.12)',
  REVOKED: 'rgba(226,75,74,.12)',
} as const;

export const DECISION_STATUS_TEXT_COLORS = {
  DRAFT: '#444441',
  ACTIVE: '#27500A',
  SUPERSEDED: '#854F0B',
  REVOKED: '#A32D2D',
} as const;

export const DECISION_STATUS_LABELS = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  SUPERSEDED: 'Superseded',
  REVOKED: 'Revoked',
} as const;

// ─── Board columns (visible statuses) ────────────────────
export const BOARD_COLUMNS = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;

// ─── Experiment Status ─────────────────────────────────
export const EXPERIMENT_STATUS_COLORS = {
  BACKLOG: '#888780',
  IN_PROGRESS: '#EF9F27',
  COMPLETED: '#639922',
  ICEBOX: '#378ADD',
} as const;

export const EXPERIMENT_STATUS_BG_COLORS = {
  BACKLOG: 'rgba(136,135,128,.12)',
  IN_PROGRESS: 'rgba(239,159,39,.12)',
  COMPLETED: 'rgba(99,153,34,.12)',
  ICEBOX: 'rgba(55,138,221,.12)',
} as const;

export const EXPERIMENT_STATUS_TEXT_COLORS = {
  BACKLOG: '#444441',
  IN_PROGRESS: '#854F0B',
  COMPLETED: '#27500A',
  ICEBOX: '#185FA5',
} as const;

export const EXPERIMENT_STATUS_LABELS: Record<string, string> = {
  BACKLOG: 'Backlog',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  ICEBOX: 'Icebox',
};

export const EXPERIMENT_STATUS_ORDER = ['BACKLOG', 'IN_PROGRESS', 'COMPLETED', 'ICEBOX'] as const;

// ─── Experiment Persona ────────────────────────────────
export const EXPERIMENT_PERSONA_LABELS: Record<string, string> = {
  RENTER: 'Renter',
  HENRY: 'HENRY',
  FOUNDER: 'Founder',
  FINANCE_BRO: 'Finance Bro',
  YOUNG_PERSON: 'Young Person',
  GLOBAL_TRAVELER: 'Global Traveler',
  LANDLORD: 'Landlord',
};

// ─── Experiment Channel ────────────────────────────────
export const EXPERIMENT_CHANNEL_LABELS: Record<string, string> = {
  FOUNDER_DM: 'Founder DM',
  EMAIL: 'Email',
  TEXT: 'Text',
  PM_PARTNER: 'PM Partner',
  REFERRAL: 'Referral',
  TIKTOK: 'TikTok',
  TWITTER_X: 'Twitter/X',
  IG: 'IG',
  LINKEDIN: 'LinkedIn',
  IN_PERSON: 'In-Person',
  CHURCH_COMMUNITY: 'Church/Community',
  PM_CONFERENCE: 'PM Conference',
};

// ─── Experiment Type ───────────────────────────────────
export const EXPERIMENT_TYPE_LABELS: Record<string, string> = {
  DISCOVERY: 'Discovery',
  SMOKE_TEST: 'Smoke Test',
  FAKE_DOOR: 'Fake Door',
  CONCIERGE: 'Concierge',
  WIZARD_OF_OZ: 'Wizard of Oz',
  MONEY_TEST: 'Money Test',
  AB_TEST: 'A/B Test',
  GROWTH: 'Growth',
  PM_PARTNER_WEDGE: 'PM Partner Wedge',
  CUSTOMER_INTERVIEW: 'Customer Interview',
};

// ─── Experiment Scoring Criteria ───────────────────────
export const EXPERIMENT_SCORING_CRITERIA = [
  { key: 'personaWants', label: 'Does persona actively want this?' },
  { key: 'acceleratesDeposit', label: 'Directly accelerates first deposit OR referral?' },
  { key: 'twoWeekExecute', label: 'Can execute in ≤2 weeks?' },
  { key: 'cacBelowArpu', label: 'CAC ≤ 1 month of ARPU?' },
  { key: 'existingEvidence', label: 'Existing evidence this works?' },
  { key: 'aiStickinessBoost', label: 'Improves AI Private Banker stickiness?' },
  { key: 'opensDataMoat', label: 'Opens proprietary data moat?' },
  { key: 'beatsTopExperiment', label: 'Scores higher than current top experiment?' },
] as const;
