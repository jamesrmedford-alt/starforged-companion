/**
 * STARFORGED COMPANION
 * tests/unit/colourNotFiled.test.js
 *
 * Overhaul 2, slice 3 (§5.6) — a scene's end files only what binds. Every
 * narrator truth used to become canon at its scene's end: an entity's on its
 * card as "NARRATOR-ADDED (honour and build on these)", the rest as World
 * Journal Lore recorded confirmed — the fourth live run's a6 dock-fee slip,
 * the narration's own invention, was filed on Tamsin's card and came back in
 * session 2's opening (known-issues OPENING-CONTRADICTS-WHERE-IT-STOPPED).
 * Colour is let go and counted; a colour placement of a character is no LAST
 * KNOWN. What the player said, the dice decided, the GM set is filed as before.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const filed = vi.hoisted(() => ({ lore: [], tiers: [] }));
vi.mock('../../src/world/worldJournal.js', async (orig) => ({ ...(await orig()),
  archiveSceneTruth: vi.fn(async (t) => { filed.lore.push(t.fact); return { pageId: 'p1' }; }) }));
vi.mock('../../src/entities/entityExtractor.js', async (orig) => ({ ...(await orig()),
  appendMigratedTruthToTier: vi.fn(async (_id, t) => { filed.tiers.push(t?.fact ?? t); return true; }) }));

import { endScene } from '../../src/factContinuity/sceneLifecycle.js';
import { applySidecar } from '../../src/factContinuity/ledgers.js';

const CS = 'starforged-companion.campaignState';
const state = () => ({ currentSessionId: 's1', currentSceneId: 'sc-1', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' } });
const say = (cs, narrationId, truths, basis) => applySidecar({ newTruths: truths, stateChanges: [] },
  { campaignState: cs, asserter: 'narrator', narrationId, basisOf: () => basis });

beforeEach(() => { filed.lore.length = 0; filed.tiers.length = 0; });

describe('overhaul 2 §5.6 — only what binds is filed at a scene\'s end', () => {
  it('a6\'s slip, the narration\'s colour, is let go; a7\'s, the player\'s line, is archived', async () => {
    const cs = state();
    say(cs, 'n6', [{ subject: 'the fee slip', fact: 'Tamsin gave the PC a written dock-fee slip' }], 'narrator');
    say(cs, 'n7', [{ subject: 'the fee slip', fact: "Mira left it on Tamsin's counter" }], 'player');
    game.settings._store.set(CS, structuredClone(cs));
    const counts = await endScene(structuredClone(cs), { reason: 'scene_command' });
    expect(counts).toMatchObject({ archived: 1, faded: 1 });
    expect(filed.lore).toEqual(["Mira left it on Tamsin's counter"]);
    expect(game.settings._store.get(CS).sceneTruths).toEqual([]);
  });

  it('an old narrator truth, from before bases, is colour too (D13); an old GM truth is filed', async () => {
    const cs = state();
    cs.sceneTruths = [
      { id: 't-old', subject: { kind: 'text', text: 'the lamps' }, fact: 'burn amber', asserter: 'narrator', retracted: false, createdAt: 1 },
      { id: 't-gm', subject: { kind: 'text', text: 'raider cutter' }, fact: 'is named the Cinder Wren', asserter: 'gm', retracted: false, createdAt: 2 },
    ];
    game.settings._store.set(CS, structuredClone(cs));
    const counts = await endScene(structuredClone(cs), { reason: 'scene_command' });
    expect(counts).toMatchObject({ archived: 1, faded: 1 });
    expect(filed.lore).toEqual(['is named the Cinder Wren']);
  });
});
