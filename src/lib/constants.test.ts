import { describe, it, expect } from 'vitest';
import {
  BRAND_AMBER,
  BRAND_AMBER_LIGHT,
  STATUS_COLORS,
  STATUS_BG_COLORS,
  STATUS_TEXT_COLORS,
  STATUS_LABELS,
  STATUS_ORDER,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  LABEL_PRESETS,
  AVATAR_COLORS,
  DECISION_STATUS_COLORS,
  DECISION_STATUS_BG_COLORS,
  DECISION_STATUS_TEXT_COLORS,
  DECISION_STATUS_LABELS,
  BOARD_COLUMNS,
  EXPERIMENT_STATUS_COLORS,
  EXPERIMENT_STATUS_BG_COLORS,
  EXPERIMENT_STATUS_TEXT_COLORS,
  EXPERIMENT_STATUS_LABELS,
  EXPERIMENT_STATUS_ORDER,
  EXPERIMENT_PERSONA_LABELS,
  EXPERIMENT_CHANNEL_LABELS,
  EXPERIMENT_TYPE_LABELS,
  FEEDBACK_STATUS_COLORS,
  FEEDBACK_STATUS_BG_COLORS,
  FEEDBACK_STATUS_TEXT_COLORS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUS_ORDER,
  FEEDBACK_TYPE_COLORS,
  FEEDBACK_TYPE_BG_COLORS,
  FEEDBACK_TYPE_TEXT_COLORS,
  FEEDBACK_TYPE_LABELS,
  EXPERIMENT_SCORING_CRITERIA,
} from './constants';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const RGBA = /^rgba\(/;

function expectEveryValueMatches(obj: Record<string, string>, regex: RegExp) {
  for (const [k, v] of Object.entries(obj)) {
    expect(v, `value for ${k}`).toMatch(regex);
  }
}

describe('constants', () => {
  describe('brand colors', () => {
    it('BRAND_AMBER is the documented hex', () => {
      expect(BRAND_AMBER).toBe('#BA7517');
    });

    it('BRAND_AMBER_LIGHT is an rgba value', () => {
      expect(BRAND_AMBER_LIGHT).toMatch(RGBA);
    });
  });

  describe('status constants', () => {
    const statusKeys = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'];

    it('STATUS_COLORS has all statuses with valid hex colors', () => {
      for (const k of statusKeys) {
        expect(STATUS_COLORS[k as keyof typeof STATUS_COLORS]).toMatch(HEX_COLOR);
      }
    });

    it('STATUS_BG_COLORS values are rgba strings', () => {
      expectEveryValueMatches(STATUS_BG_COLORS as unknown as Record<string, string>, RGBA);
    });

    it('STATUS_TEXT_COLORS values are hex', () => {
      expectEveryValueMatches(STATUS_TEXT_COLORS as unknown as Record<string, string>, HEX_COLOR);
    });

    it('STATUS_LABELS has a human label for every status key', () => {
      for (const k of statusKeys) {
        expect(STATUS_LABELS[k]).toBeTypeOf('string');
        expect(STATUS_LABELS[k].length).toBeGreaterThan(0);
      }
    });

    it('STATUS_ORDER lists every status exactly once', () => {
      expect([...STATUS_ORDER].sort()).toEqual([...statusKeys].sort());
      expect(new Set(STATUS_ORDER).size).toBe(STATUS_ORDER.length);
    });

    it('BOARD_COLUMNS is a subset of STATUS_ORDER and excludes CANCELLED', () => {
      for (const col of BOARD_COLUMNS) {
        expect(STATUS_ORDER).toContain(col);
      }
      expect(BOARD_COLUMNS).not.toContain('CANCELLED');
    });
  });

  describe('priority constants', () => {
    const priorityKeys = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

    it('PRIORITY_COLORS has all priorities with hex colors', () => {
      for (const k of priorityKeys) {
        expect(PRIORITY_COLORS[k as keyof typeof PRIORITY_COLORS]).toMatch(HEX_COLOR);
      }
    });

    it('PRIORITY_LABELS has human labels', () => {
      for (const k of priorityKeys) {
        expect(PRIORITY_LABELS[k]).toBeTypeOf('string');
      }
    });

    it('PRIORITY_ORDER places URGENT first and NONE last', () => {
      expect(PRIORITY_ORDER[0]).toBe('URGENT');
      expect(PRIORITY_ORDER[PRIORITY_ORDER.length - 1]).toBe('NONE');
    });

    it('PRIORITY_ORDER contains all priority keys exactly once', () => {
      expect([...PRIORITY_ORDER].sort()).toEqual([...priorityKeys].sort());
    });
  });

  describe('label presets', () => {
    it('every preset has both color and bg', () => {
      for (const [name, preset] of Object.entries(LABEL_PRESETS)) {
        expect(preset.color, `${name} color`).toMatch(HEX_COLOR);
        expect(preset.bg, `${name} bg`).toMatch(RGBA);
      }
    });
  });

  describe('avatar colors', () => {
    it('every avatar entry has bg and color', () => {
      for (const [name, entry] of Object.entries(AVATAR_COLORS)) {
        expect(entry.bg, `${name} bg`).toMatch(RGBA);
        expect(entry.color, `${name} color`).toMatch(HEX_COLOR);
      }
    });
  });

  describe('decision status constants', () => {
    const keys = ['DRAFT', 'ACTIVE', 'SUPERSEDED', 'REVOKED'];

    it('all maps share the same key set', () => {
      expect(Object.keys(DECISION_STATUS_COLORS).sort()).toEqual([...keys].sort());
      expect(Object.keys(DECISION_STATUS_BG_COLORS).sort()).toEqual([...keys].sort());
      expect(Object.keys(DECISION_STATUS_TEXT_COLORS).sort()).toEqual([...keys].sort());
      expect(Object.keys(DECISION_STATUS_LABELS).sort()).toEqual([...keys].sort());
    });

    it('hex maps contain valid hex; bg maps contain rgba', () => {
      expectEveryValueMatches(DECISION_STATUS_COLORS as unknown as Record<string, string>, HEX_COLOR);
      expectEveryValueMatches(DECISION_STATUS_TEXT_COLORS as unknown as Record<string, string>, HEX_COLOR);
      expectEveryValueMatches(DECISION_STATUS_BG_COLORS as unknown as Record<string, string>, RGBA);
    });
  });

  describe('experiment constants', () => {
    const keys = ['BACKLOG', 'IN_PROGRESS', 'COMPLETED', 'ICEBOX'];

    it('all status maps share the same key set', () => {
      expect(Object.keys(EXPERIMENT_STATUS_COLORS).sort()).toEqual([...keys].sort());
      expect(Object.keys(EXPERIMENT_STATUS_BG_COLORS).sort()).toEqual([...keys].sort());
      expect(Object.keys(EXPERIMENT_STATUS_TEXT_COLORS).sort()).toEqual([...keys].sort());
    });

    it('EXPERIMENT_STATUS_LABELS covers every order key', () => {
      for (const k of EXPERIMENT_STATUS_ORDER) {
        expect(EXPERIMENT_STATUS_LABELS[k]).toBeTypeOf('string');
      }
    });

    it('persona, channel, and type labels are non-empty', () => {
      expect(Object.keys(EXPERIMENT_PERSONA_LABELS).length).toBeGreaterThan(0);
      expect(Object.keys(EXPERIMENT_CHANNEL_LABELS).length).toBeGreaterThan(0);
      expect(Object.keys(EXPERIMENT_TYPE_LABELS).length).toBeGreaterThan(0);
    });

    it('EXPERIMENT_SCORING_CRITERIA entries have key + label', () => {
      expect(EXPERIMENT_SCORING_CRITERIA.length).toBeGreaterThan(0);
      for (const entry of EXPERIMENT_SCORING_CRITERIA) {
        expect(entry.key).toBeTypeOf('string');
        expect(entry.label).toBeTypeOf('string');
        expect(entry.key.length).toBeGreaterThan(0);
      }
    });
  });

  describe('feedback constants', () => {
    const statusKeys = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
    const typeKeys = ['BUG', 'FEATURE_REQUEST', 'QUESTION', 'OTHER'];

    it('FEEDBACK_STATUS_ORDER covers all status keys', () => {
      expect([...FEEDBACK_STATUS_ORDER].sort()).toEqual([...statusKeys].sort());
    });

    it('FEEDBACK_STATUS color maps share key set', () => {
      expect(Object.keys(FEEDBACK_STATUS_COLORS).sort()).toEqual([...statusKeys].sort());
      expect(Object.keys(FEEDBACK_STATUS_BG_COLORS).sort()).toEqual([...statusKeys].sort());
      expect(Object.keys(FEEDBACK_STATUS_TEXT_COLORS).sort()).toEqual([...statusKeys].sort());
      expect(Object.keys(FEEDBACK_STATUS_LABELS).sort()).toEqual([...statusKeys].sort());
    });

    it('FEEDBACK_TYPE maps share key set', () => {
      expect(Object.keys(FEEDBACK_TYPE_COLORS).sort()).toEqual([...typeKeys].sort());
      expect(Object.keys(FEEDBACK_TYPE_BG_COLORS).sort()).toEqual([...typeKeys].sort());
      expect(Object.keys(FEEDBACK_TYPE_TEXT_COLORS).sort()).toEqual([...typeKeys].sort());
      expect(Object.keys(FEEDBACK_TYPE_LABELS).sort()).toEqual([...typeKeys].sort());
    });
  });
});
