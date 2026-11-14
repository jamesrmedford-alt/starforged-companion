/**
 * STARFORGED COMPANION
 * tests/unit/entityNameMatching.test.js
 *
 * Issue #354 section D (alpha 23 playtest part 2) — one thing under more than
 * one name, where the module decides what a detected name means:
 *
 * P2-16  "Archer" was offered as a new NPC beside the established Vuldar
 *        Archer (the dedupe gate compared whole names); a free-flow New
 *        Entities card's Confirm always bonded the person to the acting PC —
 *        it now offers "No one" too (the maintainer's decision, amending issue
 *        #342 D3).
 * P2-17  lore about "the blockade corridor" never reached the location "The
 *        Corridor"; a PC's own decision was filed as world lore.
 * P2-18  a working label is filed as a name ("the corridor" → "Corridor").
 * P2-19  the contradiction card showed a pointer to the fact, not the fact.
 * P2-30  one enemy named three ways got three hidden plans.
 *
 * The pure matching rules are in nameMatch.test.js; the threats' one page and
 * one severity (P2-15) in threatOnePageOneSeverity.test.js.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { routeEntityDrafts, buildCombinedDetectionPrompt } from '../../src/entities/entityExtractor.js';
import { describeContradiction } from '../../src/factContinuity/consistencyCheck.js';
import { planIsAbout } from '../../src/world/secrets.js';
import { recordUnchartedDestination } from '../../src/sectors/siteDiscovery.js';

const MODULE = 'starforged-companion';

const npc = (id, name) => global.makeTestActor({
  id, type: 'character', name,
  flags: { [MODULE]: { entityType: 'connection', connection: { _id: `rec-${id}`, name, active: true } } },
});
const draftCards = () => global.ChatMessage._created.filter(m => m.flags?.[MODULE]?.draftEntityCard);

beforeEach(() => {
  global.game.actors._reset();
  global.game.user = { isGM: true, id: 'gm-1' };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  global.ChatMessage._reset();
  global.game.messages = { contents: [], get: () => null };
  global.game.settings._store.clear();
  global.game.actors._set('pc-isaac', global.makeTestActor({ id: 'pc-isaac', type: 'character', name: 'Isaac Sutton' }));
  global.game.actors._set('pc-karthik', global.makeTestActor({ id: 'pc-karthik', type: 'character', name: 'Karthik Shepherd' }));
  global.game.actors._set('npc-archer', npc('npc-archer', 'Vuldar Archer'));
});

const CS = () => ({ connectionIds: ['npc-archer'], dismissedEntities: [] });
const person = (name, description = 'Someone on the comm.') => ({ type: 'connection', name, description, confidence: 'high' });

describe('issue #354 P2-16 — an established person under part of their name is not a new one', () => {
  it('"Archer", "Ms Archer", "Vuldar" and a near spelling are all Vuldar Archer: nothing is offered', async () => {
    const { queued } = await routeEntityDrafts(
      [person('Archer'), person('Ms Archer'), person('Vuldar'), person('Valdur Archer')],
      CS(), { autoCreateConnection: false });
    expect(queued.map(e => e.name)).toEqual([]);
    expect(draftCards()).toHaveLength(0);
  });

  it('a player character under their first name is not offered as an NPC', async () => {
    const { queued } = await routeEntityDrafts([person('Karthik'), person('Captain Sutton')], CS(), { autoCreateConnection: false });
    expect(queued.map(e => e.name)).toEqual([]);
  });

  it('control: someone who shares no name with anyone known is offered, their generated name written as a name', async () => {
    const { queued } = await routeEntityDrafts([person('the escort', 'A voice from the far side of the blockade.')], CS(), { autoCreateConnection: false });
    expect(queued.map(e => e.name)).toEqual(['The Escort']);
  });

  it('two people who share a surname with nobody established are two people', async () => {
    const { queued } = await routeEntityDrafts([person('Maren Vale'), person('Marek Dunn')], CS(), { autoCreateConnection: false });
    expect(queued.map(e => e.name).sort()).toEqual(['Marek Dunn', 'Maren Vale']);
  });

  it('the detector is told the same rule', () => {
    const prompt = buildCombinedDetectionPrompt('Archer waits.', 'paced_narrative', 'narrative', CS());
    const text = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
    expect(text).toMatch(/A person is the same person under part of their name/);
    expect(text).toMatch(/Never return any of these as a new entity/);
  });
});

describe('issue #354 P2-16 — a free-flow card asks whose connection a person is, with "No one"', () => {
  it('a person\'s row offers the narration\'s PC by name and "No one"; a place\'s row keeps its Confirm', async () => {
    await routeEntityDrafts([
      person('the escort', 'A voice from the far side of the blockade.'),
      { type: 'location', name: 'Relay Nine', description: 'A dead comm relay.', confidence: 'high' },
    ], CS(), { autoCreateConnection: false, actorId: 'pc-isaac' });
    const [card] = draftCards();
    expect(card, 'a draft card was posted').toBeTruthy();
    const html = String(card.content);
    expect(html).toMatch(/data-actor-id="pc-isaac"[^>]*>Isaac Sutton</);
    expect(html).toMatch(/sf-draft-no-bond[^>]*data-actor-id=""[^>]*>No one</);
    expect(html).toMatch(/pick No one to add them with no connection on any sheet/);
    // One "No one" — the person's row only.
    expect(html.match(/>No one</g)).toHaveLength(1);
  });
});

describe('issue #354 P2-18 — a working label is filed as a name', () => {
  it('an uncharted destination "the corridor" is recorded as "Corridor"', async () => {
    const made = [];
    const cs = { activeSectorId: 'sec-1', locationIds: [],
      sectors: [{ id: 'sec-1', name: 'Onyx Threshold', mapData: { settlements: [], discoveries: [] } }] };
    const result = await recordUnchartedDestination('the corridor', cs, {
      createLoc: async (data, state) => { made.push(data); state.locationIds.push('loc-1'); },
      layout:    async (site) => ({ ...site, x: 1, y: 1 }),
    });
    expect(made).toHaveLength(1);
    expect(made[0].name).toBe('Corridor');
    expect(result.site).toMatchObject({ name: 'Corridor', workingLabel: true, actorId: 'loc-1' });
    expect(cs.sectors[0].mapData.discoveries.map(d => d.name)).toEqual(['Corridor']);
  });

  it('a label the story wrote with capitals keeps them', async () => {
    const made = [];
    const cs = { activeSectorId: 'sec-1', locationIds: [],
      sectors: [{ id: 'sec-1', name: 'Onyx Threshold', mapData: { settlements: [], discoveries: [] } }] };
    await recordUnchartedDestination("Archer's rendezvous — the gap", cs, {
      createLoc: async (data, state) => { made.push(data); state.locationIds.push('loc-2'); },
      layout:    async (site) => ({ ...site, x: 1, y: 1 }),
    });
    expect(made[0].name).toBe("Archer's Rendezvous — The Gap");
  });
});

describe('issue #354 P2-19 — a contradiction card says what conflicts', () => {
  const ledger = { state: 'ACTIVE SCENE STATE\n  Isaac Sutton — location: the bridge\n  Isaac Sutton — condition: unhurt\n  ISV Savela — integrity: 4' };

  it('a state catch shows the recorded value and the narration\'s words, the subject by its proper name', () => {
    const shown = describeContradiction(
      { subject: 'isaac sutton', kind: 'state', violated: 'ACTIVE SCENE STATE — isaac sutton location', evidence: 'Isaac steps out of the airlock onto the hull.' },
      {}, ledger);
    expect(shown).toEqual({ subject: 'Isaac Sutton', recorded: 'location: the bridge', evidence: 'Isaac steps out of the airlock onto the hull.' });
  });

  it('a truth catch shows the fact as the ledger records it', () => {
    const cs = { sceneTruths: [{ id: 't1', subject: { type: 'text', value: 'The escort' }, fact: 'has asked for Captain Sutton by name three times' }] };
    const shown = describeContradiction({ subject: 'The escort', kind: 'truth', truthId: 't1', violated: 'ACTIVE SCENE TRUTHS', evidence: 'The escort has never spoken.' }, cs, ledger);
    expect(shown.recorded).toBe('has asked for Captain Sutton by name three times');
    expect(shown.evidence).toBe('The escort has never spoken.');
  });

  it('with no ledger line it falls back to the audit\'s words, without a section heading — and never throws', () => {
    expect(describeContradiction({ subject: 'Archer', kind: 'state', violated: 'CURRENT STATE: mood — furious', evidence: 'She laughs.' }, {}, {}))
      .toMatchObject({ subject: 'Archer', recorded: 'mood — furious' });
    expect(() => describeContradiction(null, null, null)).not.toThrow();
  });
});

describe('issue #354 P2-30 — a plan is about its subject under any of its names', () => {
  const plan = (kind, name) => ({ kind, status: 'active', subject: { type: 'name', id: null, name } });

  it('a threat plan answers to a variant of its name', () => {
    const escort = plan('threat', 'Unknown entity breaching blockade from far side');
    expect(planIsAbout(escort, 'Unknown entity breaching blockade from far side: imminent detection: high')).toBe(true);
    expect(planIsAbout(escort, 'unknown entity breaching blockade from far side')).toBe(true);
    expect(planIsAbout(plan('threat', 'The Escort'), 'the escort')).toBe(true);
  });

  it('an NPC\'s agenda answers to either of their names', () => {
    const archer = plan('npcAgenda', 'Vuldar Archer');
    expect(planIsAbout(archer, 'Archer')).toBe(true);
    expect(planIsAbout(archer, 'Vuldar')).toBe(true);
    expect(planIsAbout(archer, 'Valdur Archer')).toBe(true);
  });

  it('names with no word in common are two subjects — only the narrator knows otherwise', () => {
    expect(planIsAbout(plan('threat', 'The Escort'), 'the second presence')).toBe(false);
    expect(planIsAbout(plan('threat', 'Hull breach'), 'Hull')).toBe(false);
    expect(planIsAbout(plan('threat', 'The Escort'), '')).toBe(false);
  });
});
