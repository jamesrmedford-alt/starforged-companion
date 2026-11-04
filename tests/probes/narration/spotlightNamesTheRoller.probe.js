/**
 * PROBE — NARRATION-08 SPOTLIGHT-NAMES-THE-ROLLER (Needs a decision)
 *
 * What the user does: two PCs (Kira, Orin) share a scene; Kira makes a move
 * or narrates a paced beat.
 *
 * What happens: maybeAdvanceSpotlight (src/narration/narrator.js:3804-3847)
 * → selectSpotlight (src/narration/spotlight.js:62-90) picks the next PC after
 * the stored pointer by actor-id order, knowing nothing about whose beat this
 * is (it is not told the roller). On the first beat of a scene — pointer null
 * — the PC whose id sorts first is named; when that is the PC who just acted,
 * the narrator is told "By the rotation, Kira is next … address your closing
 * prompt to Kira by name" at the end of Kira's own beat. The same happens
 * whenever a player acts out of turn: the pointer sits on the invited PC, so
 * the next after it is the one who just acted.
 *
 * What should happen (option A): the rotation never names the PC whose beat
 * it closes when another candidate is in the scene — decisions.md
 * "Multiplayer spotlight is implied by narration": the nudge exists "to keep
 * every player involved … moving toward quieter players"; naming the player
 * who just acted spreads nothing. Option B: keep the pure per-scene pointer
 * (the narrator is told it may follow the fiction instead).
 *
 * Controls: with the pointer on Kira the block names Orin; a solo scene gets
 * no block.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/narration/spotlightNamesTheRoller.probe.js
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { buildNarratorExtras } from '../../../src/narration/narrator.js';

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
  // Ids chosen so Kira sorts first by actor id.
  game.actors._set('a-actor', makeTestActor({ id: 'a-actor', name: 'Kira' }));
  game.actors._set('b-actor', makeTestActor({ id: 'b-actor', name: 'Orin' }));
});

describe('PROBE NARRATION-08 SPOTLIGHT-NAMES-THE-ROLLER', () => {
  it("the first beat of a scene, made by Kira: the nudge does not hand the spotlight back to Kira", async () => {
    game.settings._store.set(KEY, state({ lastActorId: null, sceneId: 'sc-1' }));
    const extras = await buildNarratorExtras('move_resolution', JSON.parse(JSON.stringify(game.settings.get(MODULE_ID, 'campaignState'))), {
      character: { name: 'Kira', actorId: 'a-actor' }, relevance: RELEVANCE, playerNarration: 'I slam the charts down.',
    });
    expect(extras.spotlightBlock).toContain('## SPOTLIGHT');
    // Expected: Orin is drawn in. Today: "By the rotation, Kira is next" — the PC who just acted.
    expect(extras.spotlightBlock).toMatch(/By the rotation, Orin is next/);
  });

  it("a beat made out of turn: Orin acts while the pointer invites Orin — the nudge draws Kira in, not Orin again", async () => {
    game.settings._store.set(KEY, state({ lastActorId: 'a-actor', sceneId: 'sc-1' }));   // Kira had the last beat; Orin was invited
    const extras = await buildNarratorExtras('paced_narrative', JSON.parse(JSON.stringify(game.settings.get(MODULE_ID, 'campaignState'))), {
      character: { name: 'Orin', actorId: 'b-actor' }, playerNarration: 'I take the charts and leave.',
    });
    expect(extras.spotlightBlock).toContain('## SPOTLIGHT');
    // Expected: Kira (the other PC). Today: Orin — the PC who just acted — is named again.
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
