/**
 * STARFORGED COMPANION
 * tests/unit/detectionTruncation.test.js
 *
 * The combined detection pass never drops a narration's detection silently
 * (issue #321 U15). Its one Haiku reply holds every new entity, rename, lore
 * item, threat, faction update and location; a busy narration (an inciting
 * incident) needs ~900 output tokens. At a 600-token cap the reply was cut
 * (stop_reason "max_tokens"), JSON.parse failed, and every entity of that
 * narration was lost with no console line and no GM notice — the defect
 * NARRCHK-TRUNC-SILENT fixed for the consistency check. The cap is raised, a
 * cut-off reply is logged with its cause, and the GM is told.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const FULL = JSON.stringify({
  entities: [
    { type: 'connection', name: 'Dani Vasquez', description: "A captured Exodus-line archivist, last seen aboard the Hollow Spire's cargo ring.", pronouns: 'she/her', role: 'archivist', goal: "recover the ship's lost manifests", confidence: 'high' },
    { type: 'connection', name: 'Overseer Kell', description: "The station's clipped, tired overseer who controls docking rights.", pronouns: 'he/him', role: 'station overseer', goal: null, confidence: 'high' },
    { type: 'ship', name: 'Black Fang', description: "A pirate cutter running dark off the station's shadow side.", pronouns: null, role: null, goal: null, confidence: 'medium' },
    { type: 'settlement', name: 'Hollow Spire', description: 'A derelict-built orbital station of salvagers and smugglers.', pronouns: null, role: null, goal: null, confidence: 'high' },
  ],
  renames: [],
  worldJournal: {
    lore: [
      { title: 'The Hollow Spire was built from an Exodus ark', category: 'history', text: "The station's core is the gutted hull of an Exodus ark, and its old manifests are said to survive in a sealed archive.", salience: 'significant', narratorAsserted: true, confirmed: false, entityName: 'Hollow Spire' },
      { title: 'Ark manifests are worth killing for', category: 'faction', text: 'Several factions believe the ark manifests reveal the location of a precursor vault.', salience: 'notable', narratorAsserted: true, confirmed: false, entityName: null },
    ],
    threats: [
      { name: 'Iron Syndicate enforcers', type: 'faction', severity: 'active', summary: 'Syndicate enforcers hold Dani and are searching the cargo ring for the archive key.', salience: 'significant' },
      { name: 'Black Fang', type: 'ship', severity: 'looming', summary: "A pirate cutter shadowing the station, waiting for the Syndicate's signal.", salience: 'notable' },
    ],
    factionUpdates: [
      { name: 'Iron Syndicate', attitude: 'hostile', summary: 'Their enforcers seized Dani and opened fire on the dock.', isNew: true },
      { name: 'the Covenant', attitude: 'unknown', summary: "Covenant pilgrims crowd the spire's chapel deck, watching.", isNew: true },
      { name: 'Keepers of the Ark', attitude: 'neutral', summary: "A salvage guild claiming the ark's archive by right of first salvage.", isNew: true },
    ],
    locationUpdates: [
      { name: 'the sealed archive', type: 'vault', summary: "A sealed compartment deep in the ark's spine; its door answers only to an Exodus key.", isNew: true },
    ],
    stateTransitions: [],
  },
}, null, 2);
// ~600 tokens of the pretty-printed reply (≈3.5 chars/token) — where the old cap stopped it.
const CUT = FULL.slice(0, 2100);

const calls = [];
let reply = null;
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    calls.push(body);
    return reply;
  }),
}));

import { runCombinedDetectionPass } from '../../src/entities/entityExtractor.js';

const MODULE = 'starforged-companion';
const NARRATION = 'Narration naming Dani, Overseer Kell, the Black Fang, the Hollow Spire, the Iron Syndicate, the Covenant…';
const detect = () => runCombinedDetectionPass(NARRATION, 'paced_narrative', 'n/a', { connectionIds: [], dismissedEntities: [] });

beforeEach(() => {
  calls.length = 0;
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.game.settings._store.set(`${MODULE}.claudeApiKey`, 'sk-ant-test');
});

describe('combined detection: a reply cut off at max_tokens', () => {
  it('asks for room for a busy narration\'s whole reply', async () => {
    reply = { content: [{ type: 'text', text: FULL }], stop_reason: 'end_turn' };
    await detect();
    expect(calls[0]?.max_tokens).toBeGreaterThanOrEqual(1500);
  });

  it('is not dropped silently: the console names the cut and the GM is told', async () => {
    expect(FULL.length).toBeGreaterThan(CUT.length);
    reply = { content: [{ type: 'text', text: CUT }], stop_reason: 'max_tokens', usage: { output_tokens: 1500 } };
    const toast = vi.spyOn(global.ui.notifications, 'warn');

    const detection = await detect();

    expect(detection.entities).toEqual([]);
    expect(getCapturedWarns().some(l => /max_tokens \(1500\)/.test(l))).toBe(true);
    expect(getCapturedWarns().some(l => /not a complete JSON object/.test(l))).toBe(true);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toMatch(/entity detection failed/);
  });

  it('control: a complete reply is parsed and tells nobody anything', async () => {
    reply = { content: [{ type: 'text', text: FULL }], stop_reason: 'end_turn' };
    const toast = vi.spyOn(global.ui.notifications, 'warn');

    const detection = await detect();

    expect(detection.entities.map(e => e.name)).toEqual(['Dani Vasquez', 'Overseer Kell', 'Black Fang', 'Hollow Spire']);
    expect(detection.worldJournal.factionUpdates).toHaveLength(3);
    expect(toast).not.toHaveBeenCalled();
    expect(getCapturedWarns()).toEqual([]);
  });
});

describe('combined detection: a reply with no JSON object', () => {
  it('tells the GM — a malformed reply drops the narration\'s detection too', async () => {
    const toast = vi.spyOn(global.ui.notifications, 'warn');

    const detection = await runCombinedDetectionPass(NARRATION, 'paced_narrative', 'n/a', {},
      { callDetectionAPI: async () => 'I found these entities: Dani, Kell.' });

    expect(detection.entities).toEqual([]);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('control: an empty reply (no key on this client) is not a failure', async () => {
    const toast = vi.spyOn(global.ui.notifications, 'warn');

    await runCombinedDetectionPass(NARRATION, 'paced_narrative', 'n/a', {}, { callDetectionAPI: async () => '' });

    expect(toast).not.toHaveBeenCalled();
    expect(getCapturedWarns()).toEqual([]);
  });
});
