/**
 * PROBE — R2M-4 SIDECAR-SUBJECT-OLDER-SECTOR-NAMESAKE (WRONG-TARGET / LOSE-STATE)
 * A sibling of issue #342 Z15 (ARRIVAL-BY-NAME-OTHER-SECTOR-NAMESAKE) on the
 * narrator-memory side.
 *
 * Generated site names repeat across sectors — every derelict is "Derelict
 * Starship" or "Derelict Settlement" (known-issues SECTOR-DUPLICATE-NAMES:
 * "derelict names repeat near-certainly"). Z15 made `!at`, the arrivals and the
 * narrator's ship position take the active sector's namesake
 * (index.js resolveCurrentLocationName ~6509, shipPosition.js
 * activeSectorNamesakeFirst ~313), and decisions.md records the rule as
 * "every name resolver prefers the active sector's namesake" (issue #342
 * decisions → "An arrival is by the place's id, the active sector's first").
 *
 * The narrator's own name resolvers were left out:
 *   - a sidecar subject (applyNarratorSidecar → applySidecar → resolveSubject
 *     → relevanceResolver.resolveEntityName ~185) takes the FIRST entity of a
 *     full name in collectAllEntities' order (the `locationIds` creation order
 *     — the older sector's);
 *   - relevance's name index (resolveRelevance → buildNameIndex → indexNames
 *     ~121, `if (!full.has(key)) full.set(key, entity)`) does the same.
 * So with the crew docked at the new sector's derelict (Z15 put the current
 * location there), what the narration records about "Derelict Starship" is
 * filed on the OLD sector's derelict — its card's facts at the scene end, its
 * subject in the ledger — and a player's line naming the derelict brings the
 * OLD derelict's card into the prompt instead of the one the crew stands in.
 * resolveEntityName's own contract: "a fact filed under the wrong entity is
 * worse than one kept as text".
 *
 * Real producers: applyNarratorSidecar (the narrator's sidecar apply and
 * persist) and resolveRelevance (every narration's matched set; paced/@scene
 * through resolvePathRelevance). The roster is the registry's own reads of
 * location Actors, as in tests/unit/arrivalActiveSectorNamesake.test.js.
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from 'vitest';
import { applyNarratorSidecar } from '../../../src/narration/narrator.js';
import { resolveRelevance } from '../../../src/context/relevanceResolver.js';
import { resolveCurrentLocationName } from '../../../src/index.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const copy = () => foundry.utils.deepClone(stored());
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

function installSite(id, sectorId) {
  const actor = makeTestActor({
    id, type: 'location', name: 'Derelict Starship',
    flags: { [MODULE_ID]: { entityType: 'location', location: { _id: `rec-${id}`, name: 'Derelict Starship', type: 'derelict', sectorId } } },
  });
  game.actors._set(id, actor);
  return actor;
}

beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  game.settings._store.clear();
  const gmUser = { id: 'gm-1', name: 'Test GM', isGM: true, active: true };
  global.game.users = Object.assign([gmUser], { get: (id) => (id === 'gm-1' ? gmUser : null) });
  global.game.user = gmUser;
  // Each sector's creation appended its site Actors: the older sector's first.
  installSite('site-old-actor', 'sec-old');
  installSite('site-new-actor', 'sec-new');
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-1', sessionNumber: 3, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null, dismissedEntities: [],
    // The crew moved on to the newer sector and docked at its derelict (`!at`, Z15).
    activeSectorId: 'sec-new', currentLocationId: 'site-new-actor', currentLocationType: 'location',
    locationIds: ['site-old-actor', 'site-new-actor'],
    connectionIds: [], settlementIds: [], factionIds: [], shipIds: [], planetIds: [], creatureIds: [],
  });
});

describe("R2M-4 — the narrator's name resolvers take the older sector's namesake", () => {
  it("control (Z15): the GM's `!at Derelict Starship` resolves the active sector's derelict", () => {
    expect(resolveCurrentLocationName('Derelict Starship', stored())?.id).toBe('site-new-actor');
  });

  it("a fact the narration records about the Derelict Starship is filed on the active sector's derelict, where the crew is", async () => {
    const raw = `The derelict's reactor hums under the crew's boots.\n\`\`\`json\n${JSON.stringify({
      newTruths: [{ subject: 'Derelict Starship', fact: 'Its reactor is still warm' }],
      stateChanges: [{ subject: 'Derelict Starship', attribute: 'condition', value: 'hull breached on deck 3' }],
    })}\n\`\`\``;
    applyNarratorSidecar(raw, copy(), { narrationId: 'nar-1' });
    await flush();
    const truth = (stored().sceneTruths ?? []).find(t => t.fact === 'Its reactor is still warm');
    expect(truth?.subject?.kind).toBe('entity');                       // the setup resolves the roster
    expect.soft(Object.keys(stored().sceneState?.bySubject ?? {}), 'the state key').toEqual(['entity:site-new-actor']);
    expect(truth.subject.entityId).toBe('site-new-actor');
  });

  it("a player's line naming the Derelict Starship brings the active sector's derelict into the narration, not the older one", async () => {
    const relevance = await resolveRelevance('I sweep the Derelict Starship\'s bridge for survivors.', null, null, stored());
    expect(relevance.entityIds).toContain('site-new-actor');
    expect(relevance.entityIds).not.toContain('site-old-actor');
  });
});
