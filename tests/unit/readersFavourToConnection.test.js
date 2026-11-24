/**
 * STARFORGED COMPANION
 * tests/unit/readersFavourToConnection.test.js
 *
 * Doing something for a connection is at least offered Develop Your
 * Relationship (known-issues FAVOUR-TO-A-CONNECTION-READ-AS-TALK).
 *
 * The readers' plain-line test (test/ci/playwright/readers/runs/
 * readers-live-20261124-0255/) read a favour and a gift to a connection as
 * plain talk three readings of four on Haiku 5.5:
 *
 *   develop-2  "I offer to watch Tamsin's counter for an hour while she
 *              rests." — "A kind offer to a connection with no roll-worthy
 *              risk at social dial 5 is plain conversation, not a move."
 *   develop-3  "I slide the salvage rights to the wreck I found off Vigil
 *              Reach across the counter. They are Tamsin's now, no charge…" —
 *              "A gift of salvage rights to a connection is a relationship
 *              gesture with nothing at risk and no roll needed".
 *
 * Sonnet 5.5 offered or rolled the move four of four; trading news on the
 * comm (develop-1) was plain talk to both, and by the rules is. The rule is
 * stated whatever the model: a gift of value, a risk taken for them, a favour
 * that costs the character time or standing, bringing them what they need —
 * at least offered; small talk, news traded and plain questions stay
 * narration. It is the third thing in the pacing reader's always-offered
 * block: a relationship's progress, like a vow's, is marked only by a move.
 *
 * And the offer's Roll must mark the connection the line was about: the
 * forced move carries no target and no reader is asked, so the connection
 * the player's line names is found (statEnrichment.enrichBondedDevelop).
 * Without it the sole bonded connection was developed whoever the favour was
 * for, and with several known and none bonded nothing was marked at all.
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

import { apiPost } from '../../src/api-proxy.js';
import { buildClassifierContext } from '../../src/pacing/classifier.js';
import { decidePacing, classifierReadingOf, resetRecentDensity } from '../../src/pacing/router.js';
import { interpretMove } from '../../src/moves/interpreter.js';
import { enrichBondedDevelop } from '../../src/moves/statEnrichment.js';
import { listProgressTracks } from '../../src/ui/progressTracks.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';

// The measured lines (the readers' test's develop-2 and develop-3; run 2's a60 without its move name).
const COUNTER = "I offer to watch Tamsin's counter for an hour while she rests.";
const SALVAGE = 'I slide the salvage rights to the wreck I found off Vigil Reach across the counter. They are Tamsin\'s now, no charge, for everything she has done for me.';
const MIRA = { name: 'Mira Kestrel', actorId: 'pc-mira' };
const flat = (text) => text.replace(/\s+/g, ' ');

const pacingRules = () => flat(buildClassifierContext({
  playerText: COUNTER, campaignState: {}, character: MIRA, recentMoveDensity: { count: 0, window: 5 },
  pacingConfig: { dials: { combat: 9, investigation: 6, exploration: 6, social: 5, downtime: 1 } },
}).systemPrompt);
const alwaysOffered = () => {
  const rules = pacingRules();
  return rules.slice(rules.indexOf('WHAT ONLY A MOVE CHANGES IS ALWAYS OFFERED'), rules.indexOf('A LINE THAT NAMES ITS MOVE ASKS FOR IT'));
};

function scriptCalls({ classifier = null, interpreter = null } = {}) {
  apiPost.mockImplementation(async (_url, _headers, body) => {
    const system = JSON.stringify(body.system ?? '');
    const reply = /pacing pre-classifier/.test(system) ? classifier : interpreter;
    return { content: [{ type: 'text', text: JSON.stringify(reply ?? {}) }] };
  });
}
const callsTo = (pattern) => apiPost.mock.calls.filter(c => pattern.test(JSON.stringify(c[2].system ?? '')));
const decide = (playerText = COUNTER) => decidePacing({ playerText, campaignState: {}, character: MIRA, apiKey: 'k' });

function installMira({ bonded = false } = {}) {
  game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel', items: { contents: [
    { id: 'b1', name: 'Tamsin Okoro', type: 'progress', flags: {}, system: { subtype: 'bond', rank: 2, current: bonded ? 40 : 16, completed: bonded } },
  ] } }));
  invalidateActorCache('pc-mira');
}

beforeEach(() => {
  vi.clearAllMocks();
  game.settings._store.clear();
  game.actors._reset();
  global.game.user = { id: 'gm-1', isGM: true };
  installMira();
  listProgressTracks.mockResolvedValue([]);
  resetRecentDensity();
});

describe('the pacing reader\'s rule: something done for a connection is never plain NARRATIVE', () => {
  it('is the third thing in the one always-offered block', () => {
    expect(pacingRules().match(/WHAT ONLY A MOVE CHANGES IS ALWAYS OFFERED/g)).toHaveLength(1);
    const block = alwaysOffered();
    const order = ['- RECOVERY —', '- A STEP TOWARD A VOW —', '- SOMETHING DONE FOR A CONNECTION —'].map(heading => block.indexOf(heading));
    expect(order.every(at => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('says what deepens a relationship — the four things, whatever the model reading it', () => {
    const block = alwaysOffered();
    expect(block).toContain('- SOMETHING DONE FOR A CONNECTION — the speaker does something for one of their connections (the Connections of the SITUATION) that costs the speaker something or meets a real need of that person\'s: a gift of value, a risk taken for them, a favour that costs the speaker time or standing, bringing them what they need.');
    expect(block).toContain('That deepens the relationship, and only develop_your_relationship marks it, so offer it');
  });

  it('is about the speaker\'s connections only: a gift to anyone else is read as it was (a bribe is a Compel, a friend sought is a connection made)', () => {
    expect(alwaysOffered()).toContain('And this is about the speaker\'s connections only: the same deed done for anyone else is read by the other rules, as it was.');
  });

  it('answers the reader\'s own reason for narrating it: nothing at risk, no roll needed', () => {
    expect(alwaysOffered()).toContain('Nothing need be at risk and nothing need be rolled: with a connection not yet bonded the move is no roll at all, a mark of progress.');
  });

  it('a bonded connection\'s is rolled, where the dial calls for a move', () => {
    expect(alwaysOffered()).toContain('MOVE when the connection is bonded (it is rolled then) and the social dial calls for one.');
  });

  it('small talk, news traded and plain questions stay narration', () => {
    const block = alwaysOffered();
    expect(block).toContain('Small talk, news traded, a plain question and a courtesy that costs nothing are still narration (TALKING IS NOT A MOVE)');
    expect(pacingRules()).toContain('TALKING IS NOT A MOVE — plain conversation is narration, whoever it is with');
  });

  it('gives the measured line as its example', () => {
    expect(alwaysOffered()).toContain(`Example: "${COUNTER}" with Tamsin Okoro among the Connections → NARRATIVE_WITH_MOVE_AVAILABLE, suggestedMove develop_your_relationship. NOT plain NARRATIVE.`);
  });
});

describe('the move reader\'s rule says the same', () => {
  it('rule 10: such a line is Develop Your Relationship, its target the connection', async () => {
    scriptCalls({ interpreter: { moveId: 'develop_your_relationship', statUsed: null, moveTarget: 'Tamsin Okoro', confidence: 'high', rationale: 'A gift of value to her connection.' } });
    const reading = await interpretMove(SALVAGE, { campaignState: {}, mischiefLevel: 'lawful', apiKey: 'k', roller: game.actors.get('pc-mira') });
    const body = callsTo(/move interpreter/)[0][2];
    expect(body.system[0].text).toContain('- SOMETHING DONE FOR A CONNECTION: a line in which the character does something for one of their connections that costs the character something or meets a real need of that person\'s — a gift of value, a risk taken for them, a favour that costs time or standing, bringing them what they need — is develop_your_relationship (moveTarget the connection\'s name; statUsed null: it is no roll unless the connection is bonded, and then the module fills the rank in). Small talk, news traded and plain questions are not (rule 7).');
    expect(body.messages[0].content).toContain('- Connections: "Tamsin Okoro" (dangerous, relationship 4 of 10 boxes).');
    expect(reading).toMatchObject({ moveId: 'develop_your_relationship', statUsed: null, moveTarget: 'Tamsin Okoro', stakes: null });
  });
});

describe('decidePacing: what the code does with the reader\'s answer', () => {
  const OFFERED = { decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'develop_your_relationship', sceneChallenge: null, category: 'social', confidence: 0.75, reasoning: 'A favour that costs her an hour, done for her connection Tamsin.' };

  it('the reader is given the connection and its track with the line', async () => {
    scriptCalls({ classifier: OFFERED });
    await decide();
    expect(callsTo(/pacing pre-classifier/)[0][2].messages[0].content).toContain('- Connections: "Tamsin Okoro" (dangerous, relationship 4 of 10 boxes).');
  });

  it('offered: the line is narrated, and the move goes to the card\'s Roll', async () => {
    scriptCalls({ classifier: OFFERED });
    expect(await decide()).toMatchObject({ runMove: false, decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'develop_your_relationship' });
  });

  it('bonded and called a MOVE: it goes to the move reader, to be rolled', async () => {
    installMira({ bonded: true });
    scriptCalls({ classifier: { ...OFFERED, decision: 'MOVE', confidence: 0.85 } });
    const pacing = await decide(SALVAGE);
    expect(pacing).toMatchObject({ runMove: true, decision: 'MOVE', nominatedMove: 'develop_your_relationship' });
    expect(classifierReadingOf(pacing)).toMatchObject({ moveId: 'develop_your_relationship', category: 'social' });
    expect(callsTo(/pacing pre-classifier/)[0][2].messages[0].content).toContain('- Connections: "Tamsin Okoro" (dangerous, bonded).');
  });

  it('control: a favour to a fellow player character is roleplay, as every social move against one is', async () => {
    game.actors._set('pc-ash', makeTestActor({ id: 'pc-ash', name: 'Ash' }));
    scriptCalls({ classifier: { ...OFFERED, decision: 'MOVE', confidence: 0.85 } });
    const pacing = await decide("I offer to stand Ash's watch for an hour while he rests.");
    expect(pacing).toMatchObject({ runMove: false, decision: 'NARRATIVE', suggestedMove: null });
  });

  it('control: small talk the reader narrates is still plain narration', async () => {
    scriptCalls({ classifier: { decision: 'NARRATIVE', suggestedMove: null, category: 'social', confidence: 0.9, reasoning: 'Small talk with a connection.' } });
    expect(await decide('I ask Tamsin whether that is the same tea she was drinking yesterday.')).toMatchObject({ runMove: false, decision: 'NARRATIVE', suggestedMove: null });
  });
});

describe('the offer\'s Roll: the connection the line names is the one developed', () => {
  const tamsin = { _id: 'rec-tamsin', __hostId: 'npc-tamsin', name: 'Tamsin Okoro', rank: 'dangerous', bonded: false, active: true };
  const idris  = { _id: 'rec-idris',  __hostId: 'npc-idris',  name: 'Idris Vane',   rank: 'dangerous', bonded: false, active: true };
  const sable  = { _id: 'rec-sable',  __hostId: 'npc-sable',  name: 'Sable',        rank: 'formidable', bonded: true, active: true };
  // A paced card's Roll: the move forced, the player's line, and no target — no reader is asked.
  const forced = (line, over = {}) => ({ moveId: 'develop_your_relationship', statUsed: null, statValue: 0, adds: 0, moveTarget: null, moveTargetId: null, playerNarration: line, ...over });
  const withConnections = (...list) => ({ listConnections: async () => list });

  it('several known, none bonded: the one the line names (nothing was marked)', async () => {
    const interp = forced(COUNTER);
    const res = await enrichBondedDevelop(interp, withConnections(tamsin, idris));
    expect(res).toMatchObject({ connection: tamsin, bonded: false });
    expect(interp).toMatchObject({ moveTargetId: 'npc-tamsin', moveTarget: 'Tamsin Okoro', statUsed: null });
  });

  it('another is bonded: still the one the line names (the bonded one was developed)', async () => {
    const interp = forced(SALVAGE);
    await enrichBondedDevelop(interp, withConnections(sable, tamsin, idris));
    expect(interp).toMatchObject({ moveTargetId: 'npc-tamsin', moveTarget: 'Tamsin Okoro', statUsed: null });
  });

  it('the line names the bonded one: its rank is rolled', async () => {
    const interp = forced('I bring Sable the reactor coil she has been short of all season, and take no payment.');
    const res = await enrichBondedDevelop(interp, withConnections(sable, tamsin));
    expect(res).toMatchObject({ bonded: true });
    expect(interp).toMatchObject({ moveTargetId: 'npc-sable', moveTarget: 'Sable', statUsed: 'formidable', rollKind: 'action' });
  });

  it('a severed connection the line names is nobody to develop', async () => {
    const interp = forced(COUNTER);
    await enrichBondedDevelop(interp, withConnections({ ...tamsin, active: false }, idris, sable));
    expect(interp.moveTargetId).toBe('npc-sable');   // the fallback it always had: the sole bonded connection
  });

  it('control: a line that names two, or none, falls back as it always did', async () => {
    const both = forced('I carry Tamsin\'s ledger over to Idris Vane for her.');
    expect(await enrichBondedDevelop(both, withConnections(tamsin, idris))).toEqual({ connection: null, bonded: false, adds: 0 });
    expect(both.moveTargetId).toBeNull();
    const none = forced('I do her a good turn.');
    await enrichBondedDevelop(none, withConnections(sable, tamsin));
    expect(none.moveTargetId).toBe('npc-sable');
    const sole = forced('I do her a good turn.');
    await enrichBondedDevelop(sole, withConnections(tamsin));
    expect(sole.moveTargetId).toBe('npc-tamsin');
  });

  it('control: a target the move already carries is the target — a picker\'s id, a reader\'s name', async () => {
    const picked = forced(COUNTER, { moveTargetId: 'npc-idris' });
    await enrichBondedDevelop(picked, withConnections(tamsin, idris));
    expect(picked).toMatchObject({ moveTargetId: 'npc-idris', moveTarget: 'Idris Vane' });
    const named = forced(COUNTER, { moveTarget: 'Idris Vane' });
    await enrichBondedDevelop(named, withConnections(tamsin, idris));
    expect(named).toMatchObject({ moveTargetId: 'npc-idris', moveTarget: 'Idris Vane' });
  });
});
