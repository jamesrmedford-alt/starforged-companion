/**
 * ACTIVE-SCENE-STRIKE-PLACE-BLIND (known-issues; issue #345 AA28's residual).
 *
 * AA28 made a strike an EARLIER scene kept stand only at the place its scene
 * fact was asserted at (keptStrikeStandsAt). The active scene's own strikes
 * stayed place-blind: a scene travels (its frame's location moves with the
 * narration, and each truth is stamped with the place it was asserted at —
 * `sceneLocation`, issue #326 D2), and within one scene the GM's strike of
 * "scene — The lights are out" at Bleakhold
 *   - blocked Vantage Station's own scene fact of those words
 *     (applySidecar's findEquivalentTruth read the retracted entry),
 *   - was "lifted" by a `!truth set` of those words at Vantage Station
 *     (setTruth's findBareStrike), and
 *   - was named under CORRECTED at Vantage Station (sessionRetractedFacts'
 *     active-scene half) — beside the station's own binding fact.
 * Now the active scene's struck (or replaced) scene facts stand only at their
 * place, as the kept ones do; the X-Card's retraction stays place-blind.
 *
 * Real producers: applyNarratorSidecar (the narrator's sidecar apply and
 * persist), `!truth strike` / `!truth set` (the relay handler), the ledger
 * block builder.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyNarratorSidecar } from '../../src/narration/narrator.js';
import { startScene } from '../../src/factContinuity/sceneLifecycle.js';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';
import { findEquivalentTruth, findBareStrike, retractNarrations } from '../../src/factContinuity/ledgers.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const DARK = 'The lights are out';
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const copy = () => foundry.utils.deepClone(stored());
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

let orig;
beforeEach(() => {
  orig = { user: global.game.user, users: global.game.users };
  const gmUser = { id: 'gm-1', name: 'Test GM', isGM: true, active: true };
  global.game.users = Object.assign([gmUser], { get: (id) => (id === 'gm-1' ? gmUser : null) });
  global.game.user = gmUser;
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: null,
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null, dismissedEntities: [],
  });
});
afterEach(() => {
  global.game.user = orig.user;
  global.game.users = orig.users;
});

/** A narration at `place` whose sidecar states one scene truth, applied as the narrator applies it. */
async function narrateAt(place, fact, narrationId) {
  const raw = `The corridor stretches ahead.\n\`\`\`json\n${JSON.stringify({
    sceneFrame: { location: place, situation: 'searching the deck' },
    newTruths: fact ? [{ subject: 'scene', fact }] : [], stateChanges: [],
  })}\n\`\`\``;
  applyNarratorSidecar(raw, copy(), { narrationId });
  await flush();
}
const sceneTruths = (fact) => (stored().sceneTruths ?? []).filter(t => t?.subject?.kind === 'scene' && t.fact === fact);
const liveScene = (fact) => sceneTruths(fact).filter(t => !t.retracted);
const ledger = () => buildLedgerBlock(stored(), { matchedEntityIds: [], currentLocationId: null, maxTokens: Infinity });

/** One scene: at Bleakhold the narration says the lights are out, the GM strikes it — and the scene travels on. */
async function strikeAtBleakholdThenTravel(to = 'Vantage Station') {
  await startScene(copy(), { reason: 'test' });
  await narrateAt('Bleakhold', DARK, 'nar-1');
  const [t1] = liveScene(DARK);
  expect(t1?.sceneLocation).toBe('Bleakhold');
  await applyFactContinuityCommand({ text: `!truth strike ${t1.id.slice(0, 8)}` }, { requesterIsGM: true });
  expect(liveScene(DARK)).toHaveLength(0);
  await narrateAt(to, 'Alarms are blaring', 'nar-2');
  expect(stored().sceneFrame?.location).toBe(to);
  return t1;
}

describe('ACTIVE-SCENE-STRIKE-PLACE-BLIND — the active scene\'s strike of a scene fact stands at its place', () => {
  it('control: back at Bleakhold, in the same scene, the narrator may not restate the struck fact — and CORRECTED names it', async () => {
    await strikeAtBleakholdThenTravel('Bleakhold');
    await narrateAt('Bleakhold', DARK, 'nar-3');
    expect(liveScene(DARK)).toEqual([]);
    expect(ledger().corrections).toContain(`scene — ${DARK}`);
  });

  it('the scene travelled to Vantage Station: the narration saying the lights are out there is recorded as the station\'s fact', async () => {
    await strikeAtBleakholdThenTravel();
    await narrateAt('Vantage Station', DARK, 'nar-3');
    expect(liveScene(DARK).map(t => `${t.sceneLocation} (${t.narrationId})`)).toEqual(['Vantage Station (nar-3)']);
  });

  it('…and at Vantage Station CORRECTED does not name Bleakhold\'s strike beside the station\'s binding fact', async () => {
    await strikeAtBleakholdThenTravel();
    await narrateAt('Vantage Station', DARK, 'nar-3');
    const block = ledger();
    expect(block.truths).toContain(`scene — ${DARK}`);
    expect(block.corrections).not.toContain(DARK);
  });

  it('the GM\'s `!truth set scene …` at Vantage Station records the station\'s fact and lifts nothing of Bleakhold\'s strike', async () => {
    const t1 = await strikeAtBleakholdThenTravel();
    const line = await applyFactContinuityCommand({ text: `!truth set scene ${DARK}` }, { requesterIsGM: true });
    expect(line).toMatch(/Truth recorded/);
    expect(line).not.toMatch(/strike on it is lifted/);
    const struck = stored().sceneTruths.find(t => t.id === t1.id);
    expect(struck.retracted).toBe(true);
    expect(struck.correctedTo).toBeNull();
    // Back at Bleakhold the strike still stands.
    await narrateAt('Bleakhold', null, 'nar-4');
    expect(ledger().corrections).toContain(`scene — ${DARK}`);
  });

  it('control: the GM\'s `!truth set scene …` back at Bleakhold lifts the strike', async () => {
    const t1 = await strikeAtBleakholdThenTravel('the Bleakhold docks');
    const line = await applyFactContinuityCommand({ text: `!truth set scene ${DARK}` }, { requesterIsGM: true });
    expect(line).toMatch(/strike on it is lifted/);
    expect(stored().sceneTruths.find(t => t.id === t1.id).correctedTo).toBeTruthy();
  });

  it('a player\'s `!truth set scene …` at Vantage Station is the station\'s own fact — not refused over the GM\'s strike at Bleakhold', async () => {
    await strikeAtBleakholdThenTravel();
    const line = await applyFactContinuityCommand({ text: `!truth set scene ${DARK}` }, { requesterIsGM: false });
    expect(line).toMatch(/Truth recorded/);
  });

  it('control: an X-Card retraction of a scene fact in the active scene stays blocked anywhere', async () => {
    await startScene(copy(), { reason: 'test' });
    await narrateAt('Bleakhold', DARK, 'nar-1');
    const cs = copy();
    retractNarrations(cs, ['nar-1']);
    game.settings._store.set(KEY, cs);
    await narrateAt('Vantage Station', DARK, 'nar-2');
    expect(liveScene(DARK)).toEqual([]);
  });
});

describe('ACTIVE-SCENE-STRIKE-PLACE-BLIND — the lookups', () => {
  const struck = (over = {}) => ({
    id: 'tr-1', subject: { kind: 'scene' }, fact: DARK, retracted: true, retractedBy: 'gm',
    correctedTo: null, sceneLocation: 'Bleakhold', ...over,
  });

  it('findEquivalentTruth / findBareStrike: a struck scene fact matches at its place, not at another — place-blind when no place is asked', () => {
    for (const find of [findEquivalentTruth, findBareStrike]) {
      expect(find([struck()], { kind: 'scene' }, DARK, { place: 'Bleakhold' })?.id).toBe('tr-1');
      expect(find([struck()], { kind: 'scene' }, DARK, { place: 'the Bleakhold docks' })?.id).toBe('tr-1');
      expect(find([struck()], { kind: 'scene' }, DARK, { place: null })?.id).toBe('tr-1');
      expect(find([struck()], { kind: 'scene' }, DARK)?.id).toBe('tr-1');
      expect(find([struck()], { kind: 'scene' }, DARK, { place: 'Vantage Station' })).toBeNull();
    }
  });

  it('an entity\'s strike, a live truth and the X-Card\'s retraction are place-blind', () => {
    const vance = { kind: 'text', text: 'Vance' };
    expect(findEquivalentTruth([struck({ subject: vance })], vance, DARK, { place: 'Vantage Station' })?.id).toBe('tr-1');
    expect(findEquivalentTruth([struck({ retracted: false, retractedBy: null })], { kind: 'scene' }, DARK, { place: 'Vantage Station' })?.id).toBe('tr-1');
    expect(findEquivalentTruth([struck({ retractedBy: 'xcard' })], { kind: 'scene' }, DARK, { place: 'Vantage Station' })?.id).toBe('tr-1');
  });
});
