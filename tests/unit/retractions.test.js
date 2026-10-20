/**
 * STARFORGED COMPANION
 * tests/unit/retractions.test.js
 *
 * A struck truth reaches every store that copied it (issue #286 B6): the
 * subject entity's same-session tier details, the session's auto-confirmed
 * World Journal lore, and the rolling summary — and the scene's strikes
 * outlive the scene for the rest of the session.
 *
 * The stores are written through their production writers
 * (appendDetailToTier, recordLoreDiscovery, applySidecar + strikeTruth).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  factsOverlap,
  propagateRetraction,
  rememberSessionRetractions,
  sessionRetractedFacts,
} from '../../src/factContinuity/retractions.js';
import { applySidecar, strikeTruth, replaceTruth } from '../../src/factContinuity/ledgers.js';
import { appendDetailToTier } from '../../src/entities/entityExtractor.js';
import {
  recordLoreDiscovery,
  getConfirmedLore,
  getNarratorAssertedLore,
  promoteLoreToConfirmed,
} from '../../src/world/worldJournal.js';
import { installJournalMock, addConnectionEntity } from '../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';

let installed;
beforeEach(() => { installed = installJournalMock(); });
afterEach(() => { installed.restore(); });

function makeState(overrides = {}) {
  return {
    currentSessionId: 'sess-1',
    sessionNumber:    2,
    currentSceneId:   'sc-1',
    sceneTruths:      [],
    sceneState:       { bySubject: {}, sceneId: 'sc-1' },
    connectionIds:    [],
    ...overrides,
  };
}

/** A recorded NPC plus a narrator truth about them, as the sidecar files it. */
function npcWithTruth(cs, name, fact) {
  const npc = addConnectionEntity(installed.journals, { name });
  cs.connectionIds.push(npc.journalId);
  applySidecar(
    { newTruths: [{ subject: name, fact }], stateChanges: [] },
    { campaignState: cs, entities: [{ _id: npc.internalId, journalId: npc.journalId, name, entityType: 'connection' }] },
  );
  return { npc, truth: cs.sceneTruths.at(-1) };
}

const ref = (npc) => ({
  journalId: npc.journalId, type: 'connection',
  record: { ...global.game.actors.get(npc.journalId).flags[MODULE_ID].connection },
});
const tierOf = (npc) => global.game.actors.get(npc.journalId).flags[MODULE_ID].connection.generativeTier;

describe('factsOverlap', () => {
  it('matches containment and a paraphrase that shares the fact\'s words', () => {
    expect(factsOverlap('has a ragged scar along his jaw', 'Has a ragged scar along his jaw.')).toBe(true);
    expect(factsOverlap('has a ragged scar along his jaw', 'Kael has a scar along his jaw')).toBe(true);
    expect(factsOverlap('is secretly a Covenant spy', 'Revealed he is a Covenant spy')).toBe(true);
  });

  it('does not match facts that only share a word or two of many', () => {
    expect(factsOverlap('a scar on his arm', 'a scar on his jaw')).toBe(false);
    expect(factsOverlap('the hatch is welded shut', 'the cargo hatch opens onto the docking ring')).toBe(false);
    expect(factsOverlap('', 'anything')).toBe(false);
  });
});

describe('propagateRetraction', () => {
  it('drops the subject\'s same-session tier details that state the struck fact — and nothing else', async () => {
    const cs = makeState();
    const { npc, truth } = npcWithTruth(cs, 'Kael Dros', 'has a ragged scar along his jaw');
    await appendDetailToTier(ref(npc), 'Kael has a scar along his jaw.', 'sess-1', 2);
    await appendDetailToTier(ref(npc), 'Sold the crew\'s route to the Syndicate.', 'sess-1', 2);
    await appendDetailToTier(ref(npc), 'Scar along his jaw from the Bleakhold riots.', 'sess-0', 1);

    strikeTruth(truth.id, cs);
    const out = await propagateRetraction(truth, cs);

    expect(out.tierDetails).toBe(1);
    expect(tierOf(npc).map(e => e.detail)).toEqual([
      'Sold the crew\'s route to the Syndicate.',
      'Scar along his jaw from the Bleakhold riots.',   // an earlier session's — not this prose
    ]);
  });

  it('keeps a pinned tier detail', async () => {
    const cs = makeState();
    const { npc, truth } = npcWithTruth(cs, 'Kael Dros', 'has a ragged scar along his jaw');
    await appendDetailToTier(ref(npc), 'Kael has a scar along his jaw.', 'sess-1', 2);
    tierOf(npc)[0].pinned = true;
    await propagateRetraction(strikeTruth(truth.id, cs), cs);
    expect(tierOf(npc)).toHaveLength(1);
  });

  it('takes this session\'s matching lore out of canon and out of the pending queue', async () => {
    const cs = makeState();
    await recordLoreDiscovery('The hatch', { text: 'The cargo hatch is welded shut.', confirmed: true, narratorAsserted: true, sessionId: 'sess-1' }, cs);
    await recordLoreDiscovery('Old weld', { text: 'The cargo hatch is welded shut.', confirmed: true, narratorAsserted: true, sessionId: 'sess-0' }, cs);
    await recordLoreDiscovery('Spine corridor', { text: 'The spine corridor floods at high tide.', confirmed: true, narratorAsserted: true, sessionId: 'sess-1' }, cs);
    applySidecar({ newTruths: [{ subject: 'scene', fact: 'the cargo hatch is welded shut' }], stateChanges: [] }, { campaignState: cs });
    const truth = strikeTruth(cs.sceneTruths[0].id, cs);

    const out = await propagateRetraction(truth, cs);
    expect(out.lore).toBe(1);
    expect(getConfirmedLore(cs).map(l => l.title).sort()).toEqual(['Old weld', 'Spine corridor']);
    expect(getNarratorAssertedLore(cs)).toEqual([]);
    // The detection pass "confirming" it again is the narrator re-asserting it.
    expect(await promoteLoreToConfirmed('The hatch', cs)).toBeNull();
    expect(getConfirmedLore(cs).map(l => l.title)).not.toContain('The hatch');
  });

  it('marks this session\'s rolling summary for a regen', async () => {
    const cs = makeState({ sessionSummary: { text: 'Kael showed his scar.', coveredCount: 12, sessionId: 'sess-1' } });
    applySidecar({ newTruths: [{ subject: 'scene', fact: 'it is raining' }], stateChanges: [] }, { campaignState: cs });
    await propagateRetraction(strikeTruth(cs.sceneTruths[0].id, cs), cs);
    expect(cs.sessionSummary).toMatchObject({ text: 'Kael showed his scar.', coveredCount: 0 });
  });
});

describe('session retractions', () => {
  it('keep a scene\'s bare strikes — not a replacement\'s — past the scene', () => {
    const cs = makeState();
    applySidecar({ newTruths: [
      { subject: 'scene', fact: 'the hatch is welded shut' },
      { subject: 'the dockmaster', fact: 'is called Orrin' },
    ], stateChanges: [] }, { campaignState: cs });
    strikeTruth(cs.sceneTruths[0].id, cs);
    replaceTruth(cs.sceneTruths[1].id, { fact: 'is called Orla' }, cs);

    rememberSessionRetractions(cs);
    cs.sceneTruths = [];   // the scene ends
    expect(sessionRetractedFacts(cs)).toEqual([{ label: 'scene', fact: 'the hatch is welded shut' }]);
    expect(cs.sessionRetractions).toMatchObject({ sessionId: 'sess-1', facts: [{ label: 'scene', fact: 'the hatch is welded shut', sceneId: 'sc-1' }] });
  });

  it('name an entity by its record, list this scene\'s strikes after earlier scenes\', and ignore another session\'s', () => {
    const cs = makeState({ sessionRetractions: { sessionId: 'sess-1', facts: [{ label: 'scene', fact: 'the lift is broken' }] } });
    const { truth } = npcWithTruth(cs, 'Kael Dros', 'has a ragged scar along his jaw');
    strikeTruth(truth.id, cs);
    expect(sessionRetractedFacts(cs)).toEqual([
      { label: 'scene', fact: 'the lift is broken' },
      { label: 'Kael Dros', fact: 'has a ragged scar along his jaw' },
    ]);
    expect(sessionRetractedFacts({ ...cs, currentSessionId: 'sess-2', sceneTruths: [] })).toEqual([]);
  });
});
