/**
 * Issue #330 D8 — the spotlight rotation skips the PC whose beat it closes.
 *
 * Two PCs share a scene; Kira makes the first move of the scene (pointer
 * null). `selectSpotlight` picked the next PC after the pointer by actor-id
 * order and was never told whose beat it was, so when Kira's id sorted first
 * the narrator was told "By the rotation, Kira is next … address your
 * closing prompt to Kira by name" at the end of Kira's own beat; the same
 * whenever a player acted out of turn. Decided (option A): the acting PC
 * (the narration's CHARACTER) is skipped when another candidate is in the
 * scene, and the pointer moves on past both.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { buildNarratorExtras } from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const RELEVANCE = { resolvedClass: 'interaction', entityIds: [], entityTypes: [], matchedNames: [], needsClarification: false, referenceType: 'none' };

const state = (spotlight) => ({
  currentSessionId: 'sess-2', sessionNumber: 2, currentSceneId: 'sc-1',
  sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' },
  sceneFrame: { location: 'the galley', present: ['Kira', 'Orin'], situation: 'Arguing over the charts', sceneId: 'sc-1' },
  spotlight,
});

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.user = { id: 'gm-1', isGM: true };
  // Rotating Spotlight is off by default (issue #354 P2-07): this table has it on.
  game.settings._store.set(`${MODULE_ID}.narratorSpotlightRotation`, true);
  // Ids chosen so Kira sorts first by actor id.
  game.actors._set('a-actor', makeTestActor({ id: 'a-actor', name: 'Kira' }));
  game.actors._set('b-actor', makeTestActor({ id: 'b-actor', name: 'Orin' }));
});

describe('issue #330 D8 — the spotlight nudge never names the PC who just acted', () => {
  it("the first beat of a scene, made by Kira: the nudge does not hand the spotlight back to Kira", async () => {
    game.settings._store.set(KEY, state({ lastActorId: null, sceneId: 'sc-1' }));
    const extras = await buildNarratorExtras('move_resolution', JSON.parse(JSON.stringify(game.settings.get(MODULE_ID, 'campaignState'))), {
      character: { name: 'Kira', actorId: 'a-actor' }, relevance: RELEVANCE, playerNarration: 'I slam the charts down.',
    });
    expect(extras.spotlightBlock).toContain('## SPOTLIGHT');
    expect(extras.spotlightBlock).toMatch(/By the rotation, Orin is next/);
  });

  it("a beat made out of turn: Orin acts while the pointer invites Orin — the nudge draws Kira in, not Orin again", async () => {
    game.settings._store.set(KEY, state({ lastActorId: 'a-actor', sceneId: 'sc-1' }));   // Kira had the last beat; Orin was invited
    const extras = await buildNarratorExtras('paced_narrative', JSON.parse(JSON.stringify(game.settings.get(MODULE_ID, 'campaignState'))), {
      character: { name: 'Orin', actorId: 'b-actor' }, playerNarration: 'I take the charts and leave.',
    });
    expect(extras.spotlightBlock).toContain('## SPOTLIGHT');
    expect(extras.spotlightBlock).toMatch(/By the rotation, Kira is next/);
  });

  it('control: with the pointer on Kira, a beat made by Kira draws Orin in', async () => {
    game.settings._store.set(KEY, state({ lastActorId: 'a-actor', sceneId: 'sc-1' }));
    const extras = await buildNarratorExtras('move_resolution', JSON.parse(JSON.stringify(game.settings.get(MODULE_ID, 'campaignState'))), {
      character: { name: 'Kira', actorId: 'a-actor' }, relevance: RELEVANCE,
    });
    expect(extras.spotlightBlock).toMatch(/By the rotation, Orin is next/);
  });

  it('control: a solo scene carries no spotlight block', async () => {
    game.actors._reset();
    game.actors._set('a-actor', makeTestActor({ id: 'a-actor', name: 'Kira' }));
    game.settings._store.set(KEY, state({ lastActorId: null, sceneId: 'sc-1' }));
    const extras = await buildNarratorExtras('move_resolution', JSON.parse(JSON.stringify(game.settings.get(MODULE_ID, 'campaignState'))), {
      character: { name: 'Kira', actorId: 'a-actor' }, relevance: RELEVANCE,
    });
    expect(extras.spotlightBlock).toBe('');
  });
});

describe('issue #330 D8 — selectSpotlight skips the acting PC', () => {
  const A = { id: 'a', name: 'Kira' }, B = { id: 'b', name: 'Orin' }, C = { id: 'c', name: 'Pax' };

  it('the first beat of a scene names the next PC after the one acting', async () => {
    const { selectSpotlight } = await import('../../src/narration/spotlight.js');
    expect(selectSpotlight({ roster: [A, B, C], lastActorId: null, actingActorId: 'a' }).nextActorId).toBe('b');
  });

  it('a beat out of turn moves past the actor: the pointer on Kira, Orin acts → Pax', async () => {
    const { selectSpotlight } = await import('../../src/narration/spotlight.js');
    expect(selectSpotlight({ roster: [A, B, C], lastActorId: 'a', actingActorId: 'b' }).nextActorId).toBe('c');
  });

  it('control: an actor who is not next changes nothing', async () => {
    const { selectSpotlight } = await import('../../src/narration/spotlight.js');
    expect(selectSpotlight({ roster: [A, B, C], lastActorId: 'a', actingActorId: 'c' }).nextActorId).toBe('b');
    expect(selectSpotlight({ roster: [A, B, C], lastActorId: 'a' }).nextActorId).toBe('b');
  });
});
