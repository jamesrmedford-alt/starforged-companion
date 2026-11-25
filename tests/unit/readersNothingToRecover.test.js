/**
 * STARFORGED COMPANION
 * tests/unit/readersNothingToRecover.test.js
 *
 * A recovery move with nothing to recover is not offered or rolled
 * (known-issues HEAL-ROLLED-AT-FULL-HEALTH) — and it is told
 * (NOTHING-TO-RECOVER-UNTOLD).
 *
 * In the long haul's live runs a Heal was made at 5 health of 5, twice. The
 * third run's own words (explorations/long-haul-live-20261124-0321/, a58–a60):
 *
 *   the line        "I sit down in the galley and treat my wounds with the
 *                    ship's medkit, cleaning and binding what the fight cost
 *                    me." — the fight had cost the ship, not Mira;
 *   the pacing read NARRATIVE_WITH_MOVE_AVAILABLE, heal: "Treating wounds
 *                    with the medkit sets about healing, which changes the
 *                    character sheet, so the heal move should be offered";
 *   the roll        a weak hit, whose choice bought "0 health (now 5)" for 2
 *                    supply (5 → 3) — and the narrator supplied a cut.
 *
 * The fourth run (issue #383) found the other half: eight recovery lines at
 * health 5/5 were rightly given no move — and nothing told the player, and
 * the narrator, told only that "a line that sets about one of those has
 * begun it", wrote "the cuts", "the gash".
 *
 * Both readers are told the sheet (the SITUATION block) and the rule. Where
 * the sheet settles it the code decides — the move contracts' gate (overhaul
 * 4, contracts/gate.js checkMove: RECOVERABLE, SOMETHING_DAMAGED): the pacing
 * router does not offer such a move, readMove neither rolls such a reading
 * nor offers the pacing reader's move again on the card of a line the move
 * reader called no move, and the refusal rides on to the narration (its
 * premise NOT SO) and the card (one line).
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/pacing/telemetry.js', () => ({ logPacingDecision: vi.fn(async () => {}) }));
vi.mock('../../src/ui/progressTracks.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listProgressTracks: vi.fn(async () => []),
  getActiveCombatPosition: vi.fn(async () => null),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));

import { apiPost } from '../../src/api-proxy.js';
import { buildClassifierContext } from '../../src/pacing/classifier.js';
import { decidePacing, resetRecentDensity } from '../../src/pacing/router.js';
import { logPacingDecision } from '../../src/pacing/telemetry.js';
import { interpretMove } from '../../src/moves/interpreter.js';
import { readMove, readAction, configureMovePipeline } from '../../src/moves/movePipeline.js';
import { readMoveSituation } from '../../src/moves/situation.js';
import { checkMove } from '../../src/moves/contracts/gate.js';
import { listProgressTracks, getActiveCombatPosition } from '../../src/ui/progressTracks.js';
import { invalidateActorCache, readCharacterSnapshot } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';
// The third live run's line (a58).
const MEDKIT = "I sit down in the galley and treat my wounds with the ship's medkit, cleaning and binding what the fight cost me.";
const MIRA = { name: 'Mira Kestrel', actorId: 'pc-mira' };
const CS = { shipIds: ['ship-1'] };
const flat = (text) => text.replace(/\s+/g, ' ');
const HEALTH_FULL = "nothing to heal: Mira Kestrel's health is 5 of 5 and no wound is marked";

/** Mira as she stood at a58: health 5, spirit 5, supply 5, no impact marked — unless said otherwise. */
function installMira({ system = {}, items = [] } = {}) {
  const pc = makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel', system: { supply: { value: 5 }, ...system }, items: { contents: items } });
  game.actors._set(pc.id, pc);
  invalidateActorCache(pc.id);
  return pc;
}
function installShip({ integrity = 5, battered = false } = {}) {
  game.actors._set('ship-1', makeTestActor({
    id: 'ship-1', name: 'Kobayashi IV', type: 'starship', system: { debility: { battered } },
    flags: { [MODULE_ID]: { entityType: 'ship', ship: { _id: 'rec-1', name: 'Kobayashi IV', isCommandVehicle: true, integrity, integrityMax: 5, battered } } },
  }));
}
const companion = { id: 'gc', name: 'Glowcat', type: 'asset', system: { category: 'Companion', track: { enabled: true, name: 'Health', value: 2, min: 0, max: 5 } } };
const fightTrack = [{ id: 'f1', type: 'combat', label: 'The Cinder Wren', completed: false, positions: { 'pc-mira': 'bad_spot' } }];

/** Answer each Claude call by what it is: the classifier, or the interpreter. */
function scriptCalls({ classifier = null, interpreter = null } = {}) {
  apiPost.mockImplementation(async (_url, _headers, body) => {
    const system = JSON.stringify(body.system ?? '');
    const reply = /pacing pre-classifier/.test(system) ? classifier : interpreter;
    return { content: [{ type: 'text', text: JSON.stringify(reply ?? {}) }] };
  });
}
const callsTo = (pattern) => apiPost.mock.calls.filter(c => pattern.test(JSON.stringify(c[2].system ?? '')));
const decide = (playerText = MEDKIT, campaignState = CS) => decidePacing({ playerText, campaignState, character: MIRA, apiKey: 'k' });
const offer = (move, extra = {}) => ({ decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: move, sceneChallenge: null, category: 'downtime', confidence: 0.8, reasoning: 'It sets about a sheet-changing move.', ...extra });
const gate = async (moveId, reading = {}, actor = game.actors.get('pc-mira')) => checkMove(moveId, await readMoveSituation(actor, { campaignState: CS }), reading);

beforeEach(() => {
  vi.clearAllMocks();
  game.settings._store.clear();
  game.actors._reset();
  global.game.user = { id: 'gm-1', isGM: true };
  listProgressTracks.mockResolvedValue([]);
  getActiveCombatPosition.mockResolvedValue(null);
  resetRecentDensity();
});

// ─────────────────────────────────────────────────────────────────────────────

describe('the gate — what the sheet says of a recovery move', () => {
  it('each of the four, with its meter full and its impact clear: nothing — Repair and Resupply only where no reader read the move', async () => {
    installShip();
    installMira();
    for (const move of ['heal', 'hearten']) expect((await gate(move)).ok, move).toBe(false);
    for (const move of ['resupply', 'repair']) {
      expect((await gate(move)).ok, `${move}: a reader read it — an item, a device`).toBe(true);
      expect((await gate(move, { readAsNoMove: true })).ok, `${move}: offered after a reading of no move`).toBe(false);
    }
  });

  it('a meter down or its impact marked: something', async () => {
    installShip({ integrity: 3 });
    installMira({ system: { health: { value: 4 } } });
    expect((await gate('heal')).ok).toBe(true);
    installMira({ system: { debility: { wounded: true } } });
    expect((await gate('heal')).ok).toBe(true);
    installMira({ system: { spirit: { value: 3 } } });
    expect((await gate('hearten')).ok).toBe(true);
    installMira({ system: { debility: { shaken: true } } });
    expect((await gate('hearten')).ok).toBe(true);
    installMira({ system: { supply: { value: 2 } } });
    expect((await gate('resupply', { readAsNoMove: true })).ok).toBe(true);
    expect((await gate('repair', { readAsNoMove: true })).ok, 'the ship at 3 of 5').toBe(true);
    installShip({ integrity: 5, battered: true });
    expect((await gate('repair', { readAsNoMove: true })).ok, 'battered').toBe(true);
  });

  it('what is not known is never "nothing": no command vehicle, no sheet', async () => {
    installMira();
    expect((await gate('repair', { readAsNoMove: true })).ok, 'no command vehicle recorded').toBe(true);
    expect(checkMove('heal', await readMoveSituation(null, { campaignState: CS }), {}).ok, 'no player character').toBe(true);
  });

  it('says why, in the words the card and the narration are given', async () => {
    installMira();
    expect(await gate('heal')).toMatchObject({ code: 'recoverable-health', hard: false, why: HEALTH_FULL,
      premise: { claim: 'a wound to treat', never: 'a cut, a gash, blood or a dressing on them' } });
  });

  it('the sheet is read as it stands, not from the cached snapshot: a meter changed a moment ago decides', async () => {
    const pc = installMira();
    expect(readCharacterSnapshot(pc).meters.health).toBe(5);      // cached at 5
    pc.system.health.value = 2;                                    // changed, with no hook to drop the cache
    pc.system.debility.shaken = true;
    expect(readCharacterSnapshot(pc).meters.health, 'the cached snapshot is stale').toBe(5);
    expect((await gate('heal')).ok).toBe(true);
    expect((await gate('hearten')).ok).toBe(true);
  });

  it('a Heal is for its patient — and with none named, for anyone the party could treat: another PC, a companion', async () => {
    installMira();
    game.actors._set('pc-ash', makeTestActor({ id: 'pc-ash', name: 'Ash', system: { health: { value: 2 } } }));
    expect((await gate('heal')).ok, 'Ash is hurt').toBe(true);
    expect((await gate('heal', { patient: { self: true } })).ok, 'her own wounds: none').toBe(false);
    game.actors._reset();
    installMira({ items: [companion] });
    expect((await gate('heal')).ok, 'the Glowcat is hurt').toBe(true);
    // An NPC card is nobody a Heal's health goes to.
    game.actors._reset();
    installMira();
    game.actors._set('npc-1', makeTestActor({ id: 'npc-1', name: 'Tamsin Okoro', system: { health: { value: 1 } }, flags: { [MODULE_ID]: { entityType: 'connection' } } }));
    expect((await gate('heal')).ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('the pacing reader\'s rule: the exception is written into the always-offered block', () => {
  const rules = () => flat(buildClassifierContext({
    playerText: MEDKIT, campaignState: {}, character: null, recentMoveDensity: { count: 0, window: 5 }, pacingConfig: { dials: { downtime: 1 } },
  }).systemPrompt);
  const alwaysOffered = () => rules().slice(rules().indexOf('WHAT ONLY A MOVE CHANGES IS ALWAYS OFFERED'), rules().indexOf('A LINE THAT NAMES ITS MOVE ASKS FOR IT'));
  const recovery = () => alwaysOffered().slice(alwaysOffered().indexOf('- RECOVERY'), alwaysOffered().indexOf('- A STEP TOWARD A VOW'));

  it('under RECOVERY, in the one block', () => {
    expect(rules().match(/WHAT ONLY A MOVE CHANGES IS ALWAYS OFFERED/g)).toHaveLength(1);
    expect(rules().match(/NOTHING TO RECOVER/g)).toHaveLength(1);
    expect(recovery()).toContain('THE EXCEPTION — NOTHING TO RECOVER. A recovery move with nothing to recover is no move, and is not offered: answer plain NARRATIVE, suggestedMove null. Read it from the Meters and the Command vehicle of the SITUATION:');
  });

  it('names the four, each by its meter and its impact', () => {
    const text = recovery();
    expect(text).toContain('heal — Health is full and the character is not wounded (unless the care is plainly for someone else: an ally, a companion);');
    expect(text).toContain('hearten — Spirit is full and the character is not shaken;');
    expect(text).toContain('resupply — Supply is full and the character is not unprepared (unless the line is after one particular item it needs);');
    expect(text).toContain('repair — the command vehicle\'s integrity is full and it is not battered (unless the line is about something else that is damaged: another vehicle, a module, a companion, a device).');
  });

  it('what is unknown is not "nothing": the move is offered as before', () => {
    expect(recovery()).toContain('A meter the SITUATION gives as unknown, or no command vehicle recorded, is not "nothing": offer the move as above.');
  });

  it('the run\'s line is both examples: offered with health down, narrated with health full', () => {
    const text = recovery();
    expect(text).toContain('Example: "I treat my wounds with the ship\'s medkit" at a downtime dial of 1, with Health 3 of 5 → NARRATIVE_WITH_MOVE_AVAILABLE, suggestedMove heal. NOT plain NARRATIVE.');
    expect(text).toContain('Example: "I treat my wounds with the ship\'s medkit" with Health 5 of 5 (full, not wounded) → NARRATIVE, suggestedMove null. There is no wound to treat; rolled, it would buy nothing and could cost supply.');
  });

  it('and the reader is given the meters the rule reads (a58: it was given none)', () => {
    installShip();
    installMira();
    const user = buildClassifierContext({
      playerText: MEDKIT, campaignState: CS, character: MIRA, recentMoveDensity: { count: 0, window: 5 }, pacingConfig: { dials: { downtime: 1 } },
    }).userMessage;
    expect(user).toContain('- Meters: Health 5 of 5 (full, not wounded); Spirit 5 of 5 (full, not shaken); Supply 5 of 5 (full, not unprepared).');
    expect(user).toContain('- Command vehicle: "Kobayashi IV", integrity 5 of 5 (full, not battered).');
  });
});

describe('the move reader\'s rule: told the same meters, it answers that no move is being made', () => {
  it('rule 10 names the four, and says it gives way to a move already chosen or a roll asked for', async () => {
    scriptCalls({ interpreter: { moveId: null, rationale: 'Health is full: nothing to treat.' } });
    installShip();
    const pc = installMira();
    const reading = await interpretMove(MEDKIT, { campaignState: CS, mischiefLevel: 'lawful', apiKey: 'k', roller: pc, classifier: { moveId: 'heal', category: 'downtime' } });
    const body = callsTo(/move interpreter/)[0][2];
    const system = body.system[0].text;
    expect(system).toContain('- NOTHING TO RECOVER: a recovery move with nothing to recover is NO MOVE (rule 7), whatever the pacing read says — heal when Health is full and the character is not wounded (unless the care is plainly for someone else: an ally, a companion); hearten when Spirit is full and the character is not shaken; resupply when Supply is full and the character is not unprepared (unless the line is after one particular item it needs); repair when the command vehicle\'s integrity is full and it is not battered (unless the line is about something else that is damaged: another vehicle, a module, a companion, a device).');
    expect(system).toContain('A meter the SITUATION gives as unknown is not "nothing". This does not apply when the move is already chosen, or when a roll was asked for.');
    // The same meters the pacing reader was given, beside the pacing read it may overrule.
    expect(body.messages[0].content).toContain('- Meters: Health 5 of 5 (full, not wounded); Spirit 5 of 5 (full, not shaken); Supply 5 of 5 (full, not unprepared).');
    expect(body.messages[0].content).toMatch(/PACING READ .* read this line as heal in a downtime scene/);
    // Its answer is the no-move reading the pipeline narrates.
    expect(reading).toMatchObject({ noMove: true, moveId: null, rationale: 'Health is full: nothing to treat.' });
  });
});


// ─────────────────────────────────────────────────────────────────────────────

describe('decidePacing: a recovery move the sheet has nothing for is not offered — and is told', () => {
  it('a58 — Heal offered at 5 health of 5, nobody else to treat: narrated, no move on the card, the refusal handed on', async () => {
    installShip();
    installMira();
    scriptCalls({ classifier: offer('heal', { reasoning: 'Treating wounds with the medkit sets about healing, which changes the character sheet, so the heal move should be offered.' }) });
    const pacing = await decide();
    expect(pacing).toMatchObject({ runMove: false, decision: 'NARRATIVE', suggestedMove: null,
      refused: { moveId: 'heal', code: 'recoverable-health', hard: false, why: HEALTH_FULL } });
    expect(pacing.reasoning).toMatch(/^\[cannot be made: recoverable-health — nothing to heal: Mira Kestrel's health is 5 of 5 and no wound is marked\] Treating wounds with the medkit/);
    // The telemetry says what was done with the reader's answer.
    expect(logPacingDecision.mock.calls.at(-1)[0]).toMatchObject({ decision: 'NARRATIVE', suggestedMove: null });
  });

  it('called a MOVE, it is not rolled either', async () => {
    installMira();
    scriptCalls({ classifier: offer('heal', { decision: 'MOVE', confidence: 0.9 }) });
    expect(await decide()).toMatchObject({ runMove: false, decision: 'NARRATIVE', suggestedMove: null, refused: { moveId: 'heal' } });
  });

  it('Hearten at 5 spirit of 5, not shaken: the same', async () => {
    installMira();
    scriptCalls({ classifier: offer('hearten') });
    expect(await decide('I put the kettle on and sit with a hot cup until I am easy again.')).toMatchObject({ decision: 'NARRATIVE', suggestedMove: null, refused: { code: 'recoverable-spirit' } });
  });

  it('control: with something to recover, the move is offered as it always was', async () => {
    installMira({ system: { health: { value: 3 } } });
    scriptCalls({ classifier: offer('heal') });
    const pacing = await decide();
    expect(pacing).toMatchObject({ runMove: false, decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'heal' });
    expect(pacing.refused).toBeUndefined();

    installMira({ system: { debility: { wounded: true } } });
    expect(await decide(), 'health full, the wound still marked').toMatchObject({ suggestedMove: 'heal' });

    installMira({ system: { spirit: { value: 4 } } });
    scriptCalls({ classifier: offer('hearten') });
    expect(await decide()).toMatchObject({ suggestedMove: 'hearten' });
  });

  it('a Heal for anyone the party could treat is offered: an ally hurt, a companion hurt — and refused with everyone whole', async () => {
    installMira();
    game.actors._set('pc-ash', makeTestActor({ id: 'pc-ash', name: 'Ash', system: { health: { value: 2 } } }));
    scriptCalls({ classifier: offer('heal') });
    expect(await decide('I clean and bind the gash along Ash\'s ribs.')).toMatchObject({ decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'heal' });

    game.actors._reset();
    installMira({ items: [companion] });
    expect(await decide('I see to the Glowcat\'s burned paw.')).toMatchObject({ suggestedMove: 'heal' });

    game.actors._reset();
    installMira();
    game.actors._set('pc-ash', makeTestActor({ id: 'pc-ash', name: 'Ash', system: { supply: { value: 5 } } }));
    const whole = await decide('I check Ash over for injuries.');
    expect(whole).toMatchObject({ decision: 'NARRATIVE', suggestedMove: null, refused: { code: 'recoverable-health' } });
    expect(whole.refused.why).toBe("nothing to heal: Mira Kestrel's health is 5 of 5 and no wound is marked; Ash's health is 5 of 5 and no wound is marked");
  });

  it('Resupply and Repair are the reader\'s to judge: one particular item, something else that is damaged', async () => {
    installShip();
    installMira();
    scriptCalls({ classifier: offer('resupply') });
    expect(await decide('I go round the market for a replacement nav core.')).toMatchObject({ decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'resupply' });
    scriptCalls({ classifier: offer('repair') });
    expect(await decide('I strip the scanner down and rebuild it.')).toMatchObject({ suggestedMove: 'repair' });
  });

  it('not in an open fight, where an offer is a MOVE and outcomes are earned with dice', async () => {
    installMira();
    listProgressTracks.mockResolvedValue(fightTrack);
    scriptCalls({ classifier: offer('heal') });
    expect(await decide()).toMatchObject({ runMove: true, decision: 'MOVE', nominatedMove: 'heal' });
  });

  it('nothing is decided from a sheet that is not there, or from a call that failed', async () => {
    scriptCalls({ classifier: offer('heal') });
    expect(await decidePacing({ playerText: MEDKIT, campaignState: CS, character: { name: 'Mira Kestrel' }, apiKey: 'k' })).toMatchObject({ suggestedMove: 'heal' });
    installMira();
    apiPost.mockRejectedValue(new Error('529 overloaded'));
    silenceConsoleErrors();
    expect(await decide()).toMatchObject({ runMove: true, decision: 'MOVE', classifierRead: false });
  });

  it('control: any other offer passes as it was', async () => {
    installMira();
    scriptCalls({ classifier: offer('gather_information', { category: 'investigation' }) });
    expect(await decide('I go down the ledger line by line.')).toMatchObject({ decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'gather_information' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('readMove: such a move is neither rolled nor offered again — and the refusal is handed on to be told', () => {
  const host = Object.fromEntries([
    'postWhichFightCard', 'postWhichVowCard', 'postWhichLegacyCard', 'postTrackGoneCard',
    'applyOutcomeEffects', 'addLegacyTicks', 'postDevelopRelationshipCard', 'applyReachMilestone',
    'postForgeABondCard', 'postExpeditionFinishCard', 'noteUnsavedOnCopy', 'postSceneFinishCard',
    'postRecommitOfferCard', 'postVowRecommitOfferCard', 'postBondRecommitOfferCard',
    'resolveVowItemCopies', 'completeVowItemByName', 'postFulfillVowCard', 'payFulfilledVowNative',
    'postForsakeVowCard', 'postDecisiveActionCostCard', 'postMovePayThePriceCard', 'postMoveResult',
    'reportUnsavedMoveRecord', 'applyMoveConsequenceRiders', 'resolveCurrentLocationName',
  ].map(name => [name, vi.fn(async () => null)]));
  const read = (extra = {}) => readMove({ narration: MEDKIT, speakerActorId: 'pc-mira', campaignState: CS, apiKey: 'k', dial: 'balanced', ...extra });
  const HEAL = { moveId: 'heal', statUsed: 'iron', healSituation: 'self', confidence: 'high', rationale: 'She tends her own wounds.' };
  const NO_MOVE = { moveId: null, rationale: 'Health is full: there is no wound to treat.' };

  beforeEach(() => {
    configureMovePipeline(host);
    game.settings._store.set(`${MODULE_ID}.campaignState`, CS);
    game.settings._store.set(`${MODULE_ID}.riders.autoApply`, false);
    installShip();
  });

  it('the move reader answers no move: the pacing reader\'s Heal is not offered on the card (it was — pressed, and rolled) — and why is told', async () => {
    installMira();
    scriptCalls({ interpreter: NO_MOVE });
    const result = await read({ classifier: { moveId: 'heal', category: 'downtime', reasoning: 'Sets about healing.' } });
    expect(result.noMove).toMatchObject({ rationale: 'Health is full: there is no wound to treat.', lowConfidence: false, offeredMove: null,
      refused: { moveId: 'heal', code: 'recoverable-health', why: HEALTH_FULL } });
  });

  it('with its "no move" beside the sheet, none of the four is offered again', async () => {
    installMira();
    scriptCalls({ interpreter: { moveId: null, rationale: 'The stores are full.' } });
    expect((await read({ classifier: { moveId: 'resupply', category: 'downtime' } })).noMove).toMatchObject({ offeredMove: null, refused: { code: 'recoverable-supply' } });
    scriptCalls({ interpreter: { moveId: null, rationale: 'The ship is whole.' } });
    expect((await read({ classifier: { moveId: 'repair', category: 'downtime' } })).noMove).toMatchObject({ offeredMove: null, refused: { code: 'something-damaged' } });
    scriptCalls({ interpreter: { moveId: null, rationale: 'She is easy in herself.' } });
    expect((await read({ classifier: { moveId: 'hearten', category: 'downtime' } })).noMove.offeredMove).toBeNull();
  });

  it('the move reader reads Heal all the same: the sheet settles it — narrated, nothing rolled, and the reason said', async () => {
    installMira();
    scriptCalls({ interpreter: HEAL });
    const result = await read({ classifier: { moveId: 'heal', category: 'downtime' } });
    expect(result.noMove).toMatchObject({
      rationale: `She tends her own wounds. (Cannot be made: ${HEALTH_FULL} — narrated, with no Heal.)`,
      lowConfidence: false, offeredMove: null, refused: { moveId: 'heal', code: 'recoverable-health' },
    });
  });

  it('an unsure reading of Heal is not offered either, where the sheet settles it', async () => {
    installMira();
    scriptCalls({ interpreter: { ...HEAL, confidence: 'low' } });
    expect((await read()).noMove).toMatchObject({ offeredMove: null });
  });

  it('control: with a wound to treat, the Heal is read and goes on to the confirm dialog', async () => {
    installMira({ system: { health: { value: 3 } } });
    scriptCalls({ interpreter: HEAL });
    const result = await read({ classifier: { moveId: 'heal', category: 'downtime' } });
    expect(result.noMove).toBeUndefined();
    expect(result.interpretation).toMatchObject({ moveId: 'heal', statUsed: 'iron', healSituation: 'self' });
    expect(result.interpretation.softRefusal).toBeUndefined();
  });

  it('control: with a wound to treat and a move reader that reads none, the Heal is still offered', async () => {
    installMira({ system: { health: { value: 3 } } });
    scriptCalls({ interpreter: { moveId: null, rationale: 'She only looks at the kit.' } });
    expect((await read({ classifier: { moveId: 'heal', category: 'downtime' } })).noMove.offeredMove).toBe('heal');
  });

  it('a Resupply or a Repair the move reader does read is its to judge: the sheet alone does not settle them', async () => {
    installMira();
    scriptCalls({ interpreter: { moveId: 'resupply', statUsed: 'heart', confidence: 'high', rationale: 'She is after a nav core.' } });
    const result = await read({ narration: 'I go round the market for a replacement nav core.' });
    expect(result.noMove).toBeUndefined();
    expect(result.interpretation.moveId).toBe('resupply');
  });

  it('a Heal for someone else is its to judge too — its patient is who the gate reads', async () => {
    installMira();
    game.actors._set('pc-ash', makeTestActor({ id: 'pc-ash', name: 'Ash', system: { health: { value: 2 } } }));
    scriptCalls({ interpreter: { ...HEAL, statUsed: 'wits', healSituation: 'ally', moveTarget: 'Ash' } });
    const result = await read({ narration: 'I clean and bind the gash along Ash\'s ribs.' });
    expect(result.noMove).toBeUndefined();
    expect(result.interpretation).toMatchObject({ moveId: 'heal', healSituation: 'ally', moveTarget: 'Ash', patientActorId: 'pc-ash' });
  });

  it('a roll that was asked for, and a card\'s forced move, reach the GM\'s confirm dialog with the reason — its Accept rolls it at the GM\'s word (D2)', async () => {
    installMira();
    scriptCalls({ interpreter: HEAL });
    const asked = await read({ allowNoMove: false });
    expect(asked.noMove).toBeUndefined();
    expect(asked.refused).toBeUndefined();
    expect(asked.interpretation).toMatchObject({ moveId: 'heal', softRefusal: { moveId: 'heal', code: 'recoverable-health', hard: false } });
    const forced = await read({ forced: { moveId: 'heal' } });
    expect(forced.noMove).toBeUndefined();
    expect(forced.interpretation).toMatchObject({ moveId: 'heal', softRefusal: { code: 'recoverable-health' } });
  });

  it('not in an open fight', async () => {
    installMira();
    listProgressTracks.mockResolvedValue(fightTrack);
    getActiveCombatPosition.mockResolvedValue('bad_spot');
    scriptCalls({ interpreter: HEAL });
    const result = await read();
    expect(result.noMove).toBeUndefined();
    expect(result.interpretation.moveId).toBe('heal');
    expect(result.interpretation.softRefusal).toBeUndefined();
  });

  it('a Batch Mode round\'s reading of the line is a narrative one, with no move to roll instead — and the reason the window shows', async () => {
    installMira();
    scriptCalls({ classifier: offer('heal', { decision: 'MOVE', confidence: 0.9 }), interpreter: HEAL });
    const reading = await readAction({ text: MEDKIT, speakerActorId: 'pc-mira', campaignState: CS, apiKey: 'k', dial: 'balanced' });
    expect(reading).toMatchObject({ kind: 'narrative', suggestedMove: null, suggestedTargetId: null, refused: { moveId: 'heal', code: 'recoverable-health' } });
    // The pacing router settled it: the move reader was not asked.
    expect(callsTo(/move interpreter/)).toHaveLength(0);
  });
});
