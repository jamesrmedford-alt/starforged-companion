/**
 * PROBE — DETECTION-TRUNC-SILENT
 *
 * The combined detection pass (runCombinedDetectionPass → callHaiku,
 * src/entities/entityExtractor.js) asks Haiku for one JSON object holding
 * every new entity, rename, lore item, threat, faction update, location and
 * state transition in the narration, with `max_tokens: 600` — and the prompt
 * insists on one factionUpdates entry per named faction "even in passing".
 * A busy narration (an inciting incident: four named entities, two lore
 * items, two threats, three factions, a site) needs ~800–900 output tokens
 * pretty-printed. The reply is cut at the cap (stop_reason "max_tokens");
 * callHaiku returns the text without looking at stop_reason, the greedy
 * /\{[\s\S]*\}/ slice ends at some inner "}", JSON.parse throws, and
 * parseDetectionResponse returns the empty shape: every entity, lore item,
 * threat and faction of that narration is dropped with no console line and
 * no GM notice. The API-failure branch of the same function exists precisely
 * because "a persistent failure must not be silent" (PLAYTEST-1717 B), and
 * the consistency check's identical defect was fixed (NARRCHK-TRUNC-SILENT:
 * a bigger cap + a stop_reason warning).
 *
 * Correct behaviour (asserted): a detection reply cut off at max_tokens does
 * not vanish silently — the GM is told (or what was complete is kept).
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
// ~600 tokens of the pretty-printed reply (≈3.5 chars/token) — where the API stops.
const CUT = FULL.slice(0, 2100);

const calls = [];
vi.mock('../../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    calls.push(body);
    return { content: [{ type: 'text', text: CUT }], stop_reason: 'max_tokens', usage: { output_tokens: 600 } };
  }),
}));

import { runCombinedDetectionPass } from '../../../src/entities/entityExtractor.js';

const MODULE = 'starforged-companion';

beforeEach(() => {
  calls.length = 0;
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.game.settings._store.set(`${MODULE}.claudeApiKey`, 'sk-ant-test');
});

describe('PROBE DETECTION-TRUNC-SILENT', () => {
  it('a detection reply cut at max_tokens is not dropped silently', async () => {
    expect(FULL.length).toBeGreaterThan(CUT.length);       // the full reply needs more than the cap
    const warn = vi.spyOn(global.ui.notifications, 'warn');

    const detection = await runCombinedDetectionPass(
      'Narration naming Dani, Overseer Kell, the Black Fang, the Hollow Spire, the Iron Syndicate, the Covenant…',
      'paced_narrative', 'n/a', { connectionIds: [], dismissedEntities: [] },
    );

    expect(calls[0]?.max_tokens).toBe(600);                 // evidence: the cap the reply hit
    const kept = detection.entities.length + detection.worldJournal.factionUpdates.length;
    const told = warn.mock.calls.length > 0
      || getCapturedWarns().concat(getCapturedErrors()).some(l => /max_tokens|truncat|cut off/i.test(l));

    // Expected: something survives, or the GM is told. Today: kept 0, told false.
    expect({ keptSomething: kept > 0, toldTheGM: told }).not.toEqual({ keptSomething: false, toldTheGM: false });
  });
});
