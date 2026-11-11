/**
 * Issue #345 AA06 SIDECAR-SUBJECT-OLDER-SECTOR-NAMESAKE (the twelfth audit's
 * R2M-4 — a sibling of issue #342 Z15 on the narrator-memory side).
 *
 * Generated site names repeat across sectors — every derelict is "Derelict
 * Starship" or "Derelict Settlement" (known-issues SECTOR-DUPLICATE-NAMES).
 * Z15 made `!at`, the arrivals and the narrator's ship position take the
 * active sector's namesake (resolveCurrentLocationName,
 * activeSectorNamesakeFirst). The narrator's own name resolvers were left
 * out: the roster (collectAllEntities) kept creation order — the older
 * sector's derelict first — and the name index keeps the first entity of a
 * full name. So with the crew at the new sector's derelict, what a narration
 * recorded about "Derelict Starship" was filed on the OLD sector's derelict
 * (its ledger subject, its card's facts at the scene end), and a player's
 * line naming it brought the old derelict's card into the prompt. Now the
 * roster leads every shared name with the active sector's entity — Z15's
 * rule, one helper for both.
 *
 * Real producers: applyNarratorSidecar (the narrator's sidecar apply and
 * persist), resolveRelevance (every narration's matched set; paced / @scene
 * through resolvePathRelevance), endScene (a scene fact filed on its place),
 * `!truth set` (the relay handler). The roster is the registry's own reads of
 * location Actors, as in tests/unit/arrivalActiveSectorNamesake.test.js.
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from 'vitest';
import { applyNarratorSidecar } from '../../src/narration/narrator.js';
import { resolveRelevance, collectAllEntities, activeSectorNamesakeFirst } from '../../src/context/relevanceResolver.js';
import { endScene } from '../../src/factContinuity/sceneLifecycle.js';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';
import { resolveCurrentLocationName } from '../../src/index.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const copy = () => foundry.utils.deepClone(stored());
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

function installSite(id, sectorId, name = 'Derelict Starship') {
  const actor = makeTestActor({
    id, type: 'location', name,
    flags: { [MODULE_ID]: { entityType: 'location', location: { _id: `rec-${id}`, name, type: 'derelict', sectorId } } },
  });
  game.actors._set(id, actor);
  return actor;
}
const tierOf = (id) => (game.actors.get(id)?.flags?.[MODULE_ID]?.location?.generativeTier ?? []).map(d => d.detail ?? d.text ?? d);

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

describe("issue #345 AA06 — the narrator's name resolvers take the active sector's namesake", () => {
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
    expect(Object.keys(stored().sceneState?.bySubject ?? {}), 'the state key').toEqual(['entity:site-new-actor']);
    expect(truth.subject.entityId).toBe('site-new-actor');
  });

  it("a player's line naming the Derelict Starship brings the active sector's derelict into the narration, not the older one", async () => {
    const relevance = await resolveRelevance('I sweep the Derelict Starship\'s bridge for survivors.', null, null, stored());
    expect(relevance.entityIds).toContain('site-new-actor');
    expect(relevance.entityIds).not.toContain('site-old-actor');
  });

  it("a scene fact asserted at the Derelict Starship is filed on the active sector's derelict at the scene end", async () => {
    const raw = `Frost rimes the corridor walls.\n\`\`\`json\n${JSON.stringify({
      sceneFrame: { location: 'Derelict Starship', situation: 'sweeping the decks' },
      newTruths: [{ subject: 'scene', fact: 'The gravity plating is failing' }], stateChanges: [],
    })}\n\`\`\``;
    applyNarratorSidecar(raw, copy(), { narrationId: 'nar-1' });
    await flush();
    await endScene(copy(), { reason: 'scene_command' });
    expect(tierOf('site-new-actor').join(' | ')).toMatch(/gravity plating is failing/i);
    expect(tierOf('site-old-actor')).toEqual([]);
  });

  it("the GM's `!truth set \"Derelict Starship\" …` is the active sector's derelict's fact too", async () => {
    await applyFactContinuityCommand({ text: '!truth set "Derelict Starship" Its airlock is jammed' }, { requesterIsGM: true });
    const truth = (stored().sceneTruths ?? []).find(t => t.fact === 'Its airlock is jammed');
    expect(truth?.subject).toMatchObject({ kind: 'entity', entityId: 'site-new-actor' });
  });

  it('control: with no active sector the roster keeps its order — the first namesake, as before', () => {
    game.settings._store.set(KEY, { ...stored(), activeSectorId: null });
    expect(collectAllEntities(stored()).map(e => e.journalId)).toEqual(['site-old-actor', 'site-new-actor']);
  });

  it('control: a name only one sector has is that entity, whichever sector is active', async () => {
    installSite('site-ruin-actor', 'sec-old', 'Glasspike Ruin');
    game.settings._store.set(KEY, { ...stored(), locationIds: ['site-old-actor', 'site-ruin-actor', 'site-new-actor'] });
    const relevance = await resolveRelevance('We climb the Glasspike Ruin.', null, null, stored());
    expect(relevance.entityIds).toEqual(['site-ruin-actor']);
  });
});

describe('issue #345 AA06 — activeSectorNamesakeFirst', () => {
  it("leads each shared name with the active sector's entities and keeps the rest in order", () => {
    const roster = [
      { journalId: 'a', name: 'Derelict Starship', sectorId: 's1' },
      { journalId: 'b', name: 'Bleakhold' },
      { journalId: 'c', name: 'derelict  starship', sectorId: 's2' },
      { journalId: 'd', name: 'Vantage', sectorId: 's1' },
    ];
    expect(activeSectorNamesakeFirst(roster, 's2').map(e => e.journalId)).toEqual(['c', 'a', 'b', 'd']);
    expect(activeSectorNamesakeFirst(roster, null)).toBe(roster);
  });
});
