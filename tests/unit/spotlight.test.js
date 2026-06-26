/**
 * STARFORGED COMPANION
 * tests/unit/spotlight.test.js
 *
 * Unit tests for the narrator rotating-spotlight rotation core (issue #232).
 * The module is pure — no Foundry globals — so these test selectSpotlight()'s
 * round-robin, present-filtering, and null cases, plus buildSpotlightBlock()'s
 * rendering directly.
 */

import { describe, it, expect } from 'vitest';

import {
  SPOTLIGHT_MODES,
  selectSpotlight,
  buildSpotlightBlock,
} from '../../src/narration/spotlight.js';

// Ids chosen so the stable id-sort order is a, b, c (matches roster order).
const A = { id: 'a-actor', name: 'Kira' };
const B = { id: 'b-actor', name: 'Orin' };
const C = { id: 'c-actor', name: 'Vance' };

describe('SPOTLIGHT_MODES', () => {
  it('includes the live interactive beats and excludes meta/answer modes', () => {
    expect(SPOTLIGHT_MODES.has('move_resolution')).toBe(true);
    expect(SPOTLIGHT_MODES.has('paced_narrative')).toBe(true);
    expect(SPOTLIGHT_MODES.has('scene_interrogation')).toBe(false);
    expect(SPOTLIGHT_MODES.has('oracle_followup')).toBe(false);
    expect(SPOTLIGHT_MODES.has('campaign_recap')).toBe(false);
    expect(SPOTLIGHT_MODES.has('inciting_incident')).toBe(false);
    expect(SPOTLIGHT_MODES.has('session_vignette')).toBe(false);
  });
});

describe('selectSpotlight', () => {
  it('returns null for solo play (fewer than two PCs)', () => {
    expect(selectSpotlight({ roster: [A] })).toBeNull();
    expect(selectSpotlight({ roster: [] })).toBeNull();
    expect(selectSpotlight({})).toBeNull();
  });

  it('starts at the first PC when there is no prior pointer', () => {
    const sel = selectSpotlight({ roster: [A, B, C], lastActorId: null });
    expect(sel.nextActorId).toBe(A.id);
    expect(sel.nextActorName).toBe('Kira');
    expect(sel.candidates.map(c => c.id)).toEqual([A.id, B.id, C.id]);
  });

  it('advances round-robin to the next PC after the last addressed', () => {
    expect(selectSpotlight({ roster: [A, B, C], lastActorId: A.id }).nextActorId).toBe(B.id);
    expect(selectSpotlight({ roster: [A, B, C], lastActorId: B.id }).nextActorId).toBe(C.id);
  });

  it('wraps around from the last PC to the first', () => {
    expect(selectSpotlight({ roster: [A, B, C], lastActorId: C.id }).nextActorId).toBe(A.id);
  });

  it('restarts at the first PC when lastActorId is no longer a candidate', () => {
    // PC who acted last has left the roster — treat as a fresh rotation.
    expect(selectSpotlight({ roster: [A, B, C], lastActorId: 'gone' }).nextActorId).toBe(A.id);
  });

  it('orders by id, not roster array order, so the pointer is stable', () => {
    const sel = selectSpotlight({ roster: [C, A, B], lastActorId: null });
    expect(sel.candidates.map(c => c.id)).toEqual([A.id, B.id, C.id]);
    expect(sel.nextActorId).toBe(A.id);
  });

  it('ignores roster entries with no id or name', () => {
    const sel = selectSpotlight({
      roster: [A, { id: '', name: 'Nameless' }, { id: 'x', name: '  ' }, B],
      lastActorId: null,
    });
    expect(sel.candidates.map(c => c.id)).toEqual([A.id, B.id]);
  });

  describe('scene-frame presence filtering', () => {
    it('uses the full roster when no frame names who is present', () => {
      const sel = selectSpotlight({ roster: [A, B, C], presentNames: [], lastActorId: null });
      expect(sel.candidates.map(c => c.id)).toEqual([A.id, B.id, C.id]);
    });

    it('skips PCs absent from the scene frame', () => {
      // Only Kira and Vance are present (Orin is elsewhere); rotation skips Orin.
      const sel = selectSpotlight({
        roster: [A, B, C],
        presentNames: ['Kira', 'Vance', 'Some NPC'],
        lastActorId: A.id,
      });
      expect(sel.candidates.map(c => c.id)).toEqual([A.id, C.id]);
      expect(sel.nextActorId).toBe(C.id); // next after Kira among present PCs
    });

    it('matches present names case-insensitively and ignores surrounding space', () => {
      const sel = selectSpotlight({
        roster: [A, B],
        presentNames: ['  kira ', 'ORIN'],
        lastActorId: null,
      });
      expect(sel.candidates.map(c => c.id)).toEqual([A.id, B.id]);
    });

    it('returns null when the frame shows fewer than two PCs in scene', () => {
      // Only one PC present (plus NPCs) → no turn order to imply this beat.
      expect(selectSpotlight({
        roster: [A, B, C],
        presentNames: ['Kira', 'A Dock Worker'],
        lastActorId: null,
      })).toBeNull();
      // No PCs present at all.
      expect(selectSpotlight({
        roster: [A, B],
        presentNames: ['A Guard', 'The Comms Officer'],
        lastActorId: null,
      })).toBeNull();
    });
  });
});

describe('buildSpotlightBlock', () => {
  it('returns empty string for a null/empty selection', () => {
    expect(buildSpotlightBlock(null)).toBe('');
    expect(buildSpotlightBlock({})).toBe('');
    expect(buildSpotlightBlock({ nextActorName: '   ' })).toBe('');
  });

  it('names the next PC and frames the prompt as a suggestion, not a gate', () => {
    const block = buildSpotlightBlock(selectSpotlight({ roster: [A, B, C], lastActorId: null }));
    expect(block).toContain('## SPOTLIGHT');
    expect(block).toContain('Kira is next');
    expect(block).toContain('"Kira, what do you do?"');
    expect(block).toContain('never a gate');
    expect(block).toContain('follow the fiction');
  });

  it('lists the present player characters', () => {
    const block = buildSpotlightBlock(selectSpotlight({ roster: [A, B, C], lastActorId: null }));
    expect(block).toContain('Player characters in the scene: Kira, Orin, Vance.');
  });
});
