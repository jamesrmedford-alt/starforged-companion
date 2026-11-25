/**
 * STARFORGED COMPANION
 * tests/unit/readerComposition.test.js
 *
 * The one reader, composed (rules/reachability.md §3): the real situation
 * (src/moves/readerSituation.js) → the real availability
 * (src/moves/contracts/available.js) → the real prompt (src/moves/reader.js) → the
 * call, answered by the table's Claude → the parse → the route
 * (src/pacing/readAndRoute.js) — on a booted GM / player table with live
 * documents, every fact from its real producer: the vow and the bond by the
 * sheet's Item writers, the fight by the progress-track store and its
 * position by setCombatTrackPosition, the place by the GM's `!at`.
 *
 * readAndRoute is what decidePacing calls at the switch (slice 2 of issue #384); until then the readers' plain-line test
 * calls it — this is the hop it measures.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { withLiveDocuments } from '../helpers/liveDocuments.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const VOW = 'Find who is raiding the Cinder Expanse lanes';
const isLineReader = (call) => /^You are the line reader\b/.test(call?.system ?? '');
const reply = (over) => JSON.stringify({
  move: null, asked: false, risk: null, category: 'social', confidence: 'high', reason: 'r', target: null, sceneChallenge: null, stat: null,
  healSituation: null, expeditionRank: null, combatRank: null, stakes: null, mischiefApplied: false, plainMove: null, ...over,
});

let table;
let gm;

beforeAll(async () => {
  table = withLiveDocuments(await simulateTable({ users: [USERS.GM, USERS.P1] }));
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'cmp-s1', sessionNumber: 1, currentSceneId: 'cmp-scene', sceneTruths: [], settlementIds: ['set-bleak'] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  gm = table.client('gm-1');
  table.addActor({ id: 'set-bleak', name: 'Bleakhold Station', type: 'location', flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { name: 'Bleakhold Station' } } } });
  table.addActor({ id: 'pc-mira', name: 'Mira Kestrel', type: 'character', ownership: { 'pl-1': 3 }, system: { health: { value: 5 }, spirit: { value: 5 }, supply: { value: 5 } } });
  // The sheet's own writers: a vow, a bond.
  const sheet = await gm.import('../../src/character/actorBridge.js');
  await gm.run(async () => {
    const pc = game.actors.get('pc-mira');
    await sheet.createCharacterVowItem(pc, { name: VOW, rank: 'dangerous', vowId: 'vid-raiders' });
    await sheet.createCharacterBondItem(pc, { name: 'Tamsin Okoro', rank: 'dangerous', connectionId: 'conn-tamsin' });
  });
  // The GM says where the party is.
  await gm.chat('!at Bleakhold Station');
  await table.settle();
}, 30_000);

/** The fight, from the progress-track store: Mira in a bad spot in it. */
async function openFight() {
  const store = await gm.import('../../src/ui/progressTracks.js');
  return gm.run(async () => {
    const fight = await store.addProgressTrack({ label: 'Ashen Wake', type: 'combat', rank: 'dangerous' });
    await store.setCombatTrackPosition(fight.id, 'bad_spot', 'pc-mira');
    return fight;
  });
}

/** Mira's line, read and routed on the canonical GM, as decidePacing will at the switch. */
async function readMira(line) {
  const { readAndRoute } = await gm.import('../../src/pacing/readAndRoute.js');
  const router = await gm.import('../../src/pacing/router.js');
  return gm.run(async () => {
    const campaignState = game.settings.get(MODULE_ID, 'campaignState');
    const pacingConfig = router.readPacingConfig(campaignState);
    return readAndRoute({
      playerText: line, campaignState, character: { name: 'Mira Kestrel', actorId: 'pc-mira' }, apiKey: 'sk-ant-test',
      pacingConfig, recentMoveDensity: router.getRecentMoveDensity(pacingConfig.densityWindow), mischiefLevel: 'serious',
    });
  });
}

describe('one line, read once, against the whole situation', () => {
  it('in a fight: the reader is told her position and what it allows; a Strike is read as Clash and rolled', async () => {
    await openFight();
    scriptClaude(table).when(isLineReader, reply({ move: 'strike', risk: 'high', category: 'combat', stat: 'edge',
      stakes: { hit: 'Your burst rakes the cutter\'s flank.', miss: 'Her guns find your hull first.', missSuffer: { move: 'withstand_damage', amount: 1 } } }));
    const before = table.claude.calls.length;
    const decision = await readMira('I swing the nose round and rake the cutter with the forward guns.');

    const calls = table.claude.calls.slice(before);
    expect(calls.filter(isLineReader), 'one call reads the line').toHaveLength(1);
    expect(calls).toHaveLength(1);
    const asked = calls[0];
    expect(asked.model).toBe('claude-sonnet-5-5');
    expect(asked.userText).toContain('- Open fights: "Ashen Wake" (dangerous, 0 of 10 boxes, Mira Kestrel is in a bad spot).');
    expect(asked.userText).toContain('- gain_ground, strike — Mira Kestrel is in a bad spot (react_under_fire, clash instead)');
    // The move contracts' availability (slice 4): the fight's moves for her position, made for the fight.
    expect(asked.userText).toContain('- enter_the_fray, clash, react_under_fire, take_decisive_action, face_defeat, battle — "Ashen Wake"');
    expect(asked.userText).toContain(`- Open vows: "${VOW}" (dangerous, 0 of 10 boxes).`);
    expect(asked.userText).toContain('- Connections: "Tamsin Okoro" (dangerous, relationship 0 of 10 boxes).');
    expect(asked.userText).toMatch(/- Place: Bleakhold Station\./);

    expect(decision).toMatchObject({ runMove: true, decision: 'MOVE', suggestedMove: null, moveId: 'clash', category: 'combat', confidence: 0.9, unmade: null });
    expect(decision.reading.interpretation).toMatchObject({ moveId: 'clash', statUsed: 'edge', positionConstraintApplied: true,
      stakes: { hit: 'Your burst rakes the cutter\'s flank.', miss: 'Her guns find your hull first.' } });
    expect(decision.route).toMatchObject({ route: 'roll', why: 'a fight is open: a fight never hedges' });
  }, 30_000);

  it('a Heal at full health: out of a fight the contracts refuse it and the line is narrated, told why; in a fight the dice decide', async () => {
    scriptClaude(table).when(isLineReader, reply({ move: 'heal', risk: 'plain', category: 'downtime', stat: 'iron', healSituation: 'self' }), { times: 2 });
    const calm = await readMira('I slap a field dressing on my arm.');
    expect(table.claude.calls.at(-1).userText).toMatch(/- heal — nothing to heal: /);
    expect(calm).toMatchObject({ runMove: false, decision: 'NARRATIVE', suggestedMove: null, unmade: { moveId: 'heal', why: expect.stringMatching(/^nothing to heal: /) } });
    // In a fight a sheet-settled refusal is not applied (overhaul 4's gate): the fight never hedges.
    await openFight();
    const fighting = await readMira('I slap a field dressing on my arm between volleys.');
    expect(fighting).toMatchObject({ runMove: true, decision: 'MOVE', moveId: 'heal', route: { why: 'a fight is open: a fight never hedges' } });
  }, 30_000);

  it('no fight: something of worth given to her connection is offered — a move with no roll is claimed, not rolled', async () => {
    scriptClaude(table).when(isLineReader, reply({ move: 'develop_your_relationship', category: 'social', target: 'Tamsin Okoro' }));
    const decision = await readMira('I set the salvaged navigation core on Tamsin\'s counter. It is hers, no cut to me.');
    expect(decision).toMatchObject({ runMove: false, decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'develop_your_relationship', moveId: 'develop_your_relationship' });
    expect(table.claude.calls.at(-1).userText).toMatch(/- [a-z_, ]*\bstrike\b[a-z_, ]* — [^\n]*fight[^\n]*\(enter_the_fray instead\)/);
  }, 30_000);

  it('a reply nobody can read: the line goes on as a move with no reading, as a failed pacing call does today', async () => {
    scriptClaude(table).when(isLineReader, 'I would say this is a Compel.');
    const decision = await readMira('I lean on the clerk.');
    expect(decision).toMatchObject({ runMove: true, decision: 'MOVE', fallback: true, reasoning: 'fallback: the reply could not be read', moveId: null });
    expect(decision.reading.failed).toBe('the reply could not be read');
  }, 30_000);
});
