/**
 * STARFORGED COMPANION
 * tests/unit/swearVow.test.js
 *
 * Unit tests for the ⚔ Swear this vow planner (Cluster B — F2/F3/F4).
 * The pure planner decides what a click does; the executor's Foundry IO is
 * covered live by the Quench inciting-incident batch.
 */

import { describe, it, expect } from 'vitest';
import {
  buildSwearVowPlan, buildSwearMovePost,
  shouldOfferVowSetup, buildPlayerVowSetupHtml, buildSwearMovePostForName,
} from '../../src/session/swearVow.js';

const MODULE_ID = 'starforged-companion';

const META = {
  vow:    { statement: 'I will reach Vance before his life support fails', rank: 'dangerous', raw: '' },
  clock:  { label: "Vance's life support", segments: 6 },
  target: { name: 'Vance', description: 'Estranged mentor, wounded aboard his shuttle.' },
};

const CTX = { isGM: true, hasActor: true, targetExists: false, alreadySworn: false };

describe('buildSwearVowPlan', () => {
  it('plans vow + clock + target creation for a GM with a PC', () => {
    const plan = buildSwearVowPlan(META, CTX);
    expect(plan.ok).toBe(true);
    expect(plan.vow).toEqual({
      name:  'I will reach Vance before his life support fails',
      rank:  'dangerous',
      clock: { max: 6 },
    });
    expect(plan.createTarget).toBe(true);
    expect(plan.targetNotice).toBeUndefined();
  });

  it('omits the clock when the narrator suggested none', () => {
    const plan = buildSwearVowPlan({ ...META, clock: null }, CTX);
    expect(plan.ok).toBe(true);
    expect(plan.vow.clock).toBeNull();
  });

  it('skips target creation with a notice when the name already exists', () => {
    const plan = buildSwearVowPlan(META, { ...CTX, targetExists: true });
    expect(plan.ok).toBe(true);
    expect(plan.createTarget).toBe(false);
    expect(plan.targetNotice).toMatch(/already established/);
  });

  it('queues a GM-actionable target draft for non-GM clickers instead of a dead advisory (finding C)', () => {
    const plan = buildSwearVowPlan(META, { ...CTX, isGM: false });
    expect(plan.ok).toBe(true);              // the vow itself still lands
    expect(plan.createTarget).toBe(false);   // world-write stays GM-only
    expect(plan.queueTargetDraft).toBe(true);
    expect(plan.targetNotice).toMatch(/queued as a connection for your GM/);
  });

  it('does not queue a draft when the target already exists', () => {
    const plan = buildSwearVowPlan(META, { ...CTX, isGM: false, targetExists: true });
    expect(plan.queueTargetDraft).toBeFalsy();
    expect(plan.targetNotice).toMatch(/already established/);
  });

  it('does not queue a draft for a GM (it creates directly)', () => {
    const plan = buildSwearVowPlan(META, { ...CTX, isGM: true });
    expect(plan.queueTargetDraft).toBeFalsy();
    expect(plan.createTarget).toBe(true);
  });

  it('plans no target work when the narrator named none', () => {
    const plan = buildSwearVowPlan({ ...META, target: null }, CTX);
    expect(plan.ok).toBe(true);
    expect(plan.createTarget).toBe(false);
    expect(plan.targetNotice).toBeUndefined();
  });

  it('refuses when the vow has already been sworn', () => {
    const plan = buildSwearVowPlan(META, { ...CTX, alreadySworn: true });
    expect(plan).toMatchObject({ ok: false, reason: 'already_sworn' });
  });

  it('refuses when the card carries no vow', () => {
    expect(buildSwearVowPlan(null, CTX)).toMatchObject({ ok: false, reason: 'no_vow' });
    expect(buildSwearVowPlan({ vow: null }, CTX)).toMatchObject({ ok: false, reason: 'no_vow' });
  });

  it('refuses when no player character exists', () => {
    const plan = buildSwearVowPlan(META, { ...CTX, hasActor: false });
    expect(plan).toMatchObject({ ok: false, reason: 'no_character' });
  });
});

describe('buildSwearMovePost (#248 Theme C — swearing rolls)', () => {
  const card = (incitingMeta, id = 'msg-1') => ({ id, flags: { [MODULE_ID]: { incitingMeta } } });

  it('builds a forced Swear an Iron Vow move that carries the inciting card id', () => {
    const post = buildSwearMovePost(card(META, 'incite-42'));
    const f = post.flags[MODULE_ID];
    expect(post.content).toContain('I will reach Vance');
    expect(f.bypassPacing).toBe(true);
    expect(f.forcedMoveId).toBe('swear_an_iron_vow');
    expect(f.forcedMoveTarget).toBe('I will reach Vance before his life support fails');
    expect(f.incitingSwearMessageId).toBe('incite-42');
  });

  it('returns null when the card carries no suggested vow', () => {
    expect(buildSwearMovePost(card(null))).toBeNull();
    expect(buildSwearMovePost(card({ vow: null }))).toBeNull();
    expect(buildSwearMovePost(undefined)).toBeNull();
  });
});

describe('player-authored vow recognition (#248 B1)', () => {
  const vow = (flags = {}) => ({ type: 'progress', system: { subtype: 'vow' }, flags: { [MODULE_ID]: flags } });

  describe('shouldOfferVowSetup', () => {
    it('offers for a hand-made vow with no module flags', () => {
      expect(shouldOfferVowSetup({ type: 'progress', system: { subtype: 'vow' }, flags: {} })).toBe(true);
    });
    it('skips a module-created vow (has vowId)', () => {
      expect(shouldOfferVowSetup(vow({ vowId: 'm1' }))).toBe(false);
    });
    it('skips a vow already offered', () => {
      expect(shouldOfferVowSetup(vow({ vowSetupOffered: true }))).toBe(false);
    });
    it('skips non-vow progress items, non-progress items, and null', () => {
      expect(shouldOfferVowSetup({ type: 'progress', system: { subtype: 'bond' }, flags: {} })).toBe(false);
      expect(shouldOfferVowSetup({ type: 'weapon', system: {}, flags: {} })).toBe(false);
      expect(shouldOfferVowSetup(null)).toBe(false);
    });
  });

  describe('buildSwearMovePostForName', () => {
    it('builds a forced swear move for a named vow (no inciting id)', () => {
      const post = buildSwearMovePostForName('Stop the crash');
      expect(post.flags[MODULE_ID].forcedMoveId).toBe('swear_an_iron_vow');
      expect(post.flags[MODULE_ID].forcedMoveTarget).toBe('Stop the crash');
      expect(post.flags[MODULE_ID].incitingSwearMessageId).toBeUndefined();
    });
    it('returns null for an empty name', () => {
      expect(buildSwearMovePostForName('   ')).toBeNull();
      expect(buildSwearMovePostForName(undefined)).toBeNull();
    });
  });

  describe('buildPlayerVowSetupHtml', () => {
    it('renders the swear button, the vow name, and a stakes line', () => {
      const html = buildPlayerVowSetupHtml({ name: 'Avenge my sister', rank: 'formidable' });
      expect(html).toContain('data-action="sf-player-vow-swear"');
      expect(html).toContain('Avenge my sister');
      expect(html).toContain('formidable');
    });
    it('escapes the vow name', () => {
      const html = buildPlayerVowSetupHtml({ name: '<script>x</script>', rank: 'dangerous' });
      expect(html).not.toContain('<script>x');
      expect(html).toContain('&lt;script&gt;');
    });
    it('renders the connection picker when connections exist (#248 B-link)', () => {
      const html = buildPlayerVowSetupHtml({ name: 'V', rank: 'dangerous', connections: ['Lucas Sedano', 'Kira'] });
      expect(html).toContain('data-action="sf-player-vow-link"');
      expect(html).toContain('class="sf-vow-connection"');
      expect(html).toContain('Lucas Sedano');
      expect(html).toContain('Kira');
    });
    it('omits the picker when there are no connections', () => {
      const html = buildPlayerVowSetupHtml({ name: 'V', rank: 'dangerous', connections: [] });
      expect(html).not.toContain('data-action="sf-player-vow-link"');
      expect(html).not.toContain('sf-vow-connection');
    });
  });
});
