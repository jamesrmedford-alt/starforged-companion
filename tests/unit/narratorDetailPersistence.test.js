/**
 * STARFORGED COMPANION
 * tests/unit/narratorDetailPersistence.test.js
 *
 * Issue #286 — narrator continuity and detail persistence. Composition tests
 * on a booted multi-client table (tests/helpers/multiClient.js): a detail the
 * narrator records about an NPC goes through the real sidecar path on the
 * canonical GM, is read back in the next narration's prompt, and migrates to
 * the NPC's card at scene end. rules/reachability.md → "Composition test".
 *
 * The unit suites on either side of these hops passed hand-built
 * `{ entityId }` rosters, a shape collectAllEntities never produces, so the
 * id every recorded entity's facts were filed under was `undefined` in
 * production (A1). A tier write that looked for its record in game.journal
 * only reported success for Actor-hosted NPCs and saved nothing (A2). Draft
 * confirm promoted earlier facts to the record's own id, which nothing
 * resolves (A3).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// The pipeline: Face Danger +iron, no pacing call, no confirm dialog, and
// three scripted dice inside the REAL resolveMove — a strong hit, no match.
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  // The real interpreter's shape, playerNarration included.
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
    playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.25)   // challenge die 3
        .mockReturnValueOnce(0.35)   // challenge die 4
        .mockReturnValueOnce(0.9);   // action die 6
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';   // narrationModel default
const EMPTY_SIDECAR = { newTruths: [], stateChanges: [] };

let table;
const world = () => table.world.campaignState();
const replies = [];   // narration replies, in order; the default reply after they run out

/** Narrator prose with its fact-continuity sidecar fence. */
function reply(prose, sidecar = EMPTY_SIDECAR) {
  return `${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  replies.length = 0;
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [],
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.claude.respond((call) => {
    if (call.model === NARRATION_MODEL) return replies.shift() ?? reply('The station hums. Nothing moves.');
    return '{}';
  });
});

/** The player narrates; the canonical GM's pipeline narrates it. Returns that Claude call. */
async function narrateMove(text) {
  const from = table.claude.calls.length;
  await table.client('pl-1').chat(text, { speaker: { actor: 'pc-pat' } });
  await table.settle();
  const narration = table.claude.calls.slice(from).filter(c => c.model === NARRATION_MODEL);
  expect(narration.map(c => c.client)).toEqual(['gm-1']);
  return narration[0];
}

async function type(userId, text) {
  await table.client(userId).chat(text);
  await table.settle();
}

/** Record a connection through its production writer, on the GM. Returns its Actor id. */
async function recordNpc(name) {
  const gm = table.client('gm-1');
  const { createConnection } = await gm.import('../../src/entities/connection.js');
  const record = await gm.run(async () => createConnection({ name }, game.settings.get(MODULE_ID, 'campaignState')));
  await table.settle();
  return actorIdFor(record);
}

function actorIdFor(record) {
  return world().connectionIds.find(id => table.actors.get(id)?.flags?.[MODULE_ID]?.connection?._id === record._id);
}

const tier = (actorId) => table.actors.get(actorId)?.flags?.[MODULE_ID]?.connection?.generativeTier ?? [];

describe('a recorded NPC: what the narrator records about them is kept', () => {
  it('their truth and state render on the next turn and land on their card at scene end (A1)', async () => {
    const kael = await recordNpc('Kael Dros');
    replies.push(reply('Kael leans on the rail of the docking ring, rubbing the old scar on his jaw.', {
      newTruths:    [{ subject: 'Kael Dros', fact: 'has a ragged scar along his jaw' }],
      stateChanges: [{ subject: 'Kael Dros', attribute: 'location', value: 'the docking ring' }],
    }));
    await narrateMove('I hail Kael Dros across the docking ring.');

    expect(world().sceneTruths).toMatchObject([{
      fact: 'has a ragged scar along his jaw',
      subject: { kind: 'entity', entityId: kael, entityType: 'connection' },
    }]);
    expect(Object.keys(world().sceneState.bySubject)).toEqual([`entity:${kael}`]);

    const next = await narrateMove('I ask Kael what he wants.');
    expect(next.system).toContain('## KAEL DROS — Connection');
    expect(next.system).toMatch(/TRUTHS:\n {2}Kael Dros — has a ragged scar along his jaw/);
    expect(next.system).toMatch(/CURRENT STATE[^\n]*\n {2}Kael Dros — location: the docking ring/);

    await type('gm-1', '!scene end');
    expect(tier(kael)).toEqual([
      expect.objectContaining({ detail: 'has a ragged scar along his jaw', source: 'scene_truth_migration', sessionNum: 3 }),
    ]);

    const later = await narrateMove('Kael, a word.');
    expect(later.system).toMatch(/NARRATOR-ADDED[^\n]*\n(?: {2}.*\n)* {2}Session 3: has a ragged scar along his jaw/);
  });

  it('two NPCs\' state stays apart — it used to share one key', async () => {
    const kael = await recordNpc('Kael Dros');
    const mora = await recordNpc('Captain Mora');
    replies.push(reply('Kael waits by the airlock; Captain Mora paces the bridge.', {
      newTruths: [],
      stateChanges: [
        { subject: 'Kael', attribute: 'location', value: 'by the airlock' },
        { subject: 'Captain Mora', attribute: 'location', value: 'the bridge' },
      ],
    }));
    await narrateMove('I check on Kael and Captain Mora.');

    expect(world().sceneState.bySubject).toEqual({
      [`entity:${kael}`]: [expect.objectContaining({ attribute: 'location', value: 'by the airlock' })],
      [`entity:${mora}`]: [expect.objectContaining({ attribute: 'location', value: 'the bridge' })],
    });
  });

  it('`!state set` addresses the NPC by name and the narrator sees it', async () => {
    const kael = await recordNpc('Kael Dros');
    await type('pl-1', '!state set Kael condition=bleeding from the shoulder');
    expect(world().sceneState.bySubject[`entity:${kael}`])
      .toEqual([expect.objectContaining({ attribute: 'condition', value: 'bleeding from the shoulder' })]);

    const next = await narrateMove('I help Kael to the medbay.');
    expect(next.system).toMatch(/Kael Dros — condition: bleeding from the shoulder/);
  });

  it('a development the tier pass catches is saved on the NPC card Actor (A2)', async () => {
    const kael = await recordNpc('Kael Dros');
    const gm = table.client('gm-1');
    const { appendGenerativeTierUpdates } = await gm.import('../../src/entities/entityExtractor.js');
    table.claude.respond((call) => (call.userText.includes('SIGNIFICANT new development')
      ? JSON.stringify({ updates: [{ entityId: kael, detail: 'Sold the crew\'s route to the Syndicate.', salience: 'significant' }] })
      : reply('The station hums. Nothing moves.')));
    // The write must reach the server: the in-memory record alone survives
    // neither a reload nor the trip to another client.
    const seenByPlayer = [];
    table.client('pl-1').listen('updateActor', (actor, changes) => {
      if (actor.id === kael) seenByPlayer.push(changes);
    });
    const applied = await gm.run(() => appendGenerativeTierUpdates(
      'Kael admits he sold your route.', [{ journalId: kael, type: 'connection' }], 'sess-1', 3,
    ));
    await table.settle();
    expect(applied).toHaveLength(1);
    expect(seenByPlayer).toEqual([{
      [`flags.${MODULE_ID}.connection`]: expect.objectContaining({
        generativeTier: [expect.objectContaining({ detail: 'Sold the crew\'s route to the Syndicate.' })],
      }),
    }]);
    expect(tier(kael).map(e => e.detail)).toEqual(['Sold the crew\'s route to the Syndicate.']);

    const next = await narrateMove('I confront Kael about the route.');
    expect(next.system).toMatch(/NARRATOR-ADDED[^\n]*\n {2}Session 3: Sold the crew's route to the Syndicate\./);
  });
});

describe('a new NPC: facts the narrator recorded before their card existed follow them onto it', () => {
  it('Confirm on the draft card re-keys them to the new Actor, the next turn renders them, scene end migrates them (A3)', async () => {
    replies.push(reply('A woman in a quartermaster\'s coat waves you over, her hand wrapped in gauze.', {
      newTruths:    [{ subject: 'Mira Sol', fact: 'quartermaster at Bleakhold (she/her); owes the PC a favour' }],
      stateChanges: [{ subject: 'Mira Sol', attribute: 'condition', value: 'nursing a burned hand' }],
    }));
    await narrateMove('I look for whoever runs the cargo deck.');
    expect(world().sceneTruths[0].subject).toEqual({ kind: 'text', text: 'Mira Sol' });

    // The detection pass's draft card (its real producer), confirmed by the GM.
    const gm = table.client('gm-1');
    const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
    await gm.run(() => routeEntityDrafts(
      [{ name: 'Mira Sol', type: 'connection', description: 'quartermaster with a burned hand' }],
      game.settings.get(MODULE_ID, 'campaignState'),
      {},
    ));
    await table.settle();
    const draft = table.cards(f => f.draftEntityCard)[0];
    gm.click(draft._id, '[data-action="sf-draft-confirm"]');
    await table.settle();

    const mira = world().connectionIds.find(id => table.actors.get(id)?.name === 'Mira Sol');
    expect(mira).toBeTruthy();
    expect(world().sceneTruths[0].subject).toEqual({ kind: 'entity', entityId: mira, entityType: 'connection' });
    expect(Object.keys(world().sceneState.bySubject)).toEqual([`entity:${mira}`]);

    const next = await narrateMove('I ask Mira about the manifest.');
    expect(next.system).toContain('## MIRA SOL — Connection');
    expect(next.system).toMatch(/Mira Sol — quartermaster at Bleakhold \(she\/her\); owes the PC a favour/);
    expect(next.system).toMatch(/Mira Sol — condition: nursing a burned hand/);

    await type('gm-1', '!scene end');
    expect(tier(mira).map(e => e.detail)).toContain('quartermaster at Bleakhold (she/her); owes the PC a favour');
  });
});

describe('@scene asks about the scene in progress (A4)', () => {
  it('its answer is written against the frame, truths and state — and the scene carries on', async () => {
    replies.push(reply('Emergency strips bathe the corridor red; the hatch ahead is a seam of slag.', {
      newTruths:    [{ subject: 'scene', fact: 'the hatch is welded shut' }],
      stateChanges: [{ subject: 'scene', attribute: 'lighting', value: 'red emergency strips' }],
      sceneFrame:   { location: 'the derelict\'s spine corridor', present: [], situation: 'Looking for a way past the welded hatch' },
    }));
    await narrateMove('I follow the corridor to the hatch.');

    const from = table.claude.calls.length;
    await type('pl-1', '@scene what does the hatch look like up close?');
    const asked = table.claude.calls.slice(from).filter(c => c.model === NARRATION_MODEL);
    expect(asked.map(c => c.client)).toEqual(['gm-1']);
    expect(asked[0].system).toMatch(/SCENE FRAME[^\n]*\n {2}Where: {3}the derelict's spine corridor/);
    expect(asked[0].system).toMatch(/TRUTHS:\n {2}scene — the hatch is welded shut/);
    expect(asked[0].system).toMatch(/CURRENT STATE[^\n]*\n {2}scene — lighting: red emergency strips/);

    expect(world().currentSceneId).toBe('sc-1');
    expect(world().sceneTruths.map(t => t.fact)).toEqual(['the hatch is welded shut']);
    expect(world().sceneFrame?.location).toBe('the derelict\'s spine corridor');
  });
});

describe('what a player writes is kept with the prose it prompted (B1, B5)', () => {
  it('the next move narration is told the last turns — the player\'s line, then the narrator\'s prose', async () => {
    replies.push(reply('The old man turns the compass over, thumb on the cracked glass.'));
    await narrateMove('I give him my father\'s compass.');
    expect(table.cards(f => f.narratorCard && f.moveId)[0].flags[MODULE_ID]).toMatchObject({
      playerText: 'I give him my father\'s compass.', playerName: 'Kira',
    });

    const next = await narrateMove('I wait for his answer.');
    expect(next.userText).toMatch(
      /^## RECENT SCENE\n\nPLAYER — Kira wrote: "I give him my father's compass\."\nThe old man turns the compass over, thumb on the cracked glass\./,
    );
    expect(next.userText).toContain('Kira: "I wait for his answer."');
  });

  it('carries at most four recent turns into a move', async () => {
    for (let i = 1; i <= 6; i += 1) {
      replies.push(reply(`Beat ${i} of the chase.`));
      await narrateMove(`I push the engines harder, round ${i}.`);
    }
    const next = await narrateMove('One more push.');
    const recent = next.userText.split('## MOVE OUTCOME')[0];
    expect(recent).not.toContain('Beat 2 of the chase.');
    for (const i of [3, 4, 5, 6]) expect(recent).toContain(`Beat ${i} of the chase.`);
  });
});

describe('the scene frame\'s cast keeps their card and facts on a move turn (B3)', () => {
  it('"I try to convince him" — the partner the frame lists is in the prompt with his truths and state', async () => {
    await recordNpc('Kael Dros');
    replies.push(reply('Kael folds his arms, unimpressed.', {
      newTruths:    [{ subject: 'Kael Dros', fact: 'wants the PC off Bleakhold by dawn' }],
      stateChanges: [{ subject: 'Kael Dros', attribute: 'location', value: 'the cargo office' }],
      sceneFrame:   { location: 'the cargo office', present: ['Captain Kael Dros'], situation: 'Haggling over the manifest' },
    }));
    await narrateMove('I tell Kael Dros the manifest is clean.');

    const next = await narrateMove('I lean in and try to convince him.');
    expect(next.system).toContain('## KAEL DROS — Connection');
    expect(next.system).toMatch(/TRUTHS:\n {2}Kael Dros — wants the PC off Bleakhold by dawn/);
    expect(next.system).toMatch(/Kael Dros — location: the cargo office/);
    // The permission class still comes from the player's text alone (§8.2):
    // no name in it, so this hybrid move resolves as discovery.
    expect(next.system).toContain('NARRATOR PERMISSIONS — DISCOVERY MODE');
  });
});

describe('the rolling summary regenerates after a card posts, not inside a narration (B7)', () => {
  it('a due regen no longer holds up the next narration — and the summary reaches the turn after', async () => {
    table.world.setSetting('narratorContextCards', 2);   // debounce K = round(1.5 × 2) = 3 cards
    let release;
    const held = new Promise((r) => { release = r; });
    const summaryCalls = [];
    table.claude.respond((call) => {
      if (call.system.includes('continuity scribe')) {
        summaryCalls.push(call.client);
        return held.then(() => 'Kira bargained with the dockmaster for a berth.');
      }
      if (call.model === NARRATION_MODEL) return reply('The deck shudders underfoot.');
      return '{}';
    });

    await narrateMove('I check the docking clamps one by one.');
    await narrateMove('I wave down the dockmaster for a berth.');
    expect(summaryCalls).toEqual([]);
    await narrateMove('I offer the dockmaster half our fuel.');   // the 3rd card: the regen is due
    expect(summaryCalls).toEqual(['gm-1']);

    // The regen is still waiting on Haiku; the next narration goes out anyway.
    const next = await narrateMove('I sign the berth papers.');
    expect(next.system).not.toContain('STORY SO FAR');

    release();
    await table.settle();
    expect(world().sessionSummary).toMatchObject({ text: 'Kira bargained with the dockmaster for a berth.', sessionId: 'sess-1' });
    const after = await narrateMove('I head for the berth.');
    expect(after.system).toContain('## STORY SO FAR (THIS SESSION)');
    expect(after.system).toContain('Kira bargained with the dockmaster for a berth.');
  });
});

describe('a struck fact stays struck — on the card, after the scene, in the summary (B6)', () => {
  it('a player\'s !truth strike drops the tier copy; CORRECTED and the summary\'s leave-out list outlive the scene', async () => {
    table.world.setSetting('narratorContextCards', 2);   // debounce K = 3 cards
    const kael = await recordNpc('Kael Dros');
    replies.push(reply('Kael\'s jaw is a map of old scars.', {
      newTruths: [{ subject: 'Kael Dros', fact: 'has a ragged scar along his jaw' }], stateChanges: [],
    }));
    await narrateMove('I study Kael Dros across the table.');
    // The tier pass caught the same prose (its real writer, this session).
    const gm = table.client('gm-1');
    const { appendGenerativeTierUpdates } = await gm.import('../../src/entities/entityExtractor.js');
    table.claude.respond((call) => {
      if (call.userText.includes('SIGNIFICANT new development')) {
        return JSON.stringify({ updates: [{ entityId: kael, detail: 'Kael has a scar along his jaw.', salience: 'notable' }] });
      }
      if (call.system.includes('continuity scribe')) return 'Kira met Kael in the cargo office.';
      return call.model === NARRATION_MODEL ? reply('The station hums.') : '{}';
    });
    await gm.run(() => appendGenerativeTierUpdates('Kael\'s jaw is scarred.', [{ journalId: kael, type: 'connection' }], 'sess-1', 3));
    expect(tier(kael).map(e => e.detail)).toEqual(['Kael has a scar along his jaw.']);

    const truthId = world().sceneTruths[0].id;
    await type('pl-1', `!truth strike ${truthId.slice(0, 8)}`);
    expect(world().sceneTruths[0]).toMatchObject({ retracted: true, retractedBy: 'player' });
    expect(tier(kael)).toEqual([]);

    await type('gm-1', '!scene end');
    expect(world().sessionRetractions).toMatchObject({
      sessionId: 'sess-1', facts: [{ label: 'Kael Dros', fact: 'has a ragged scar along his jaw' }],
    });

    const next = await narrateMove('I walk the empty docking ring.');   // a new scene
    expect(next.system).toMatch(/CORRECTED[^\n]*\n[^\n]*\n {2}Kael Dros — has a ragged scar along his jaw/);

    await narrateMove('I wait for the next shuttle.');   // the 3rd card: the summary regen is due
    const summary = table.claude.calls.find(c => c.system.includes('continuity scribe'));
    expect(summary.userText).toContain('## RETRACTED BY THE TABLE — these did not happen; leave them out\n\n- Kael Dros — has a ragged scar along his jaw');
  });
});

describe('what scene end keeps reaches the next scene (C1, C2)', () => {
  it('a character\'s last location and condition are on their card in the next scene', async () => {
    await recordNpc('Kael Dros');
    replies.push(reply('Kael limps back to the cargo office.', {
      newTruths: [],
      stateChanges: [
        { subject: 'Kael Dros', attribute: 'location',  value: 'the cargo office' },
        { subject: 'Kael Dros', attribute: 'condition', value: 'limping on a twisted ankle' },
      ],
    }));
    await narrateMove('I watch Kael Dros go.');
    await type('gm-1', '!scene end');
    expect(world().sceneState.bySubject).toEqual({});

    const next = await narrateMove('Later, I go looking for Kael.');   // a new scene
    expect(next.system).toMatch(
      /## KAEL DROS — Connection[\s\S]*LAST KNOWN[^\n]*\n {2}location: the cargo office \(Session 3\)\n {2}condition: limping on a twisted ankle \(Session 3\)/,
    );
  });

  it('a place detail lands on the place\'s card and is there on the next visit', async () => {
    const gm = table.client('gm-1');
    const { createSettlement } = await gm.import('../../src/entities/settlement.js');
    await gm.run(async () => {
      const cs = game.settings.get(MODULE_ID, 'campaignState');
      await createSettlement({ name: 'Bleakhold' }, cs);
      await game.settings.set(MODULE_ID, 'campaignState', cs);
    });
    await type('gm-1', '!at Bleakhold');
    replies.push(reply('Neon flickers over a bar wedged between two cargo locks.', {
      newTruths:  [{ subject: 'scene', fact: 'the bar on the docking ring is called the Rusty Lantern' }],
      stateChanges: [],
      sceneFrame: { location: 'Bleakhold docking ring', present: [], situation: 'Looking for a drink' },
    }));
    await narrateMove('I find somewhere to drink on the docking ring.');
    await type('gm-1', '!scene end');

    const next = await narrateMove('I head back to that bar.');
    expect(next.system).toMatch(/## CURRENT LOCATION\n\n## BLEAKHOLD — Settlement[\s\S]*NARRATOR-ADDED[^\n]*\n(?: {2}.*\n)* {2}Session 3: the bar on the docking ring is called the Rusty Lantern/);
  });
});

describe('a session carries into the next one (C3, C4)', () => {
  const SUMMARY = 'The crew paid Vex 300 credits for the beacon code, 7-Delta-9.';
  const RECAP   = 'RECAP: the crew still owes Vex a favour.';

  beforeEach(async () => {
    table.claude.respond((call) => {
      if (call.system?.includes('continuity scribe')) return SUMMARY;
      if (call.userText?.includes('## CAMPAIGN CHRONICLE')) return RECAP;
      if (call.model === NARRATION_MODEL) return replies.shift() ?? reply('The station hums. Nothing moves.');
      return '{}';
    });
    // A recap made from the chronicle as it stands — a cache is used only
    // while it matches (issue #301 B04).
    const gm = table.client('gm-1');
    const { campaignRecapCacheKey } = await gm.import('../../src/narration/narrator.js');
    const chronicle = await gm.run(() => campaignRecapCacheKey(world()));
    table.world.setSetting('campaignState', {
      ...world(),
      lastSessionTimestamp: new Date().toISOString(),
      campaignRecapCache:   { text: RECAP, generatedAt: null, ...chronicle },
    });
  });

  it('End a Session, then Begin: a new session, told what happened last session', async () => {
    await narrateMove('I pay Vex for the beacon code.');
    table.client('gm-1').answerDialogs(d => d.submit({ 'input[name="questFocus"]': '', 'input[name="connectionFocus"]': '' }));
    await type('gm-1', '!end-session');
    expect(world()).toMatchObject({ sessionEndedId: 'sess-1', sessionSummary: { sessionId: 'sess-1', text: SUMMARY } });

    table.client('gm-1').answerDialogs(d => d.submit({ 'input[name="vignette"]': false, 'input[name="galleyVignette"]': false }));
    await type('gm-1', '!begin-session');
    expect(world().currentSessionId).not.toBe('sess-1');
    expect(world()).toMatchObject({
      sessionActive: true, sessionNumber: 4, sessionEndedId: null,
      previousSessionSummary: { sessionId: 'sess-1', sessionNumber: 3, text: SUMMARY },
    });

    // The new session's first narration — a scene question, which never got
    // the recap — carries both; the ring is the new session's own.
    const from = table.claude.calls.length;
    await type('pl-1', '@scene What is the beacon doing?');
    const question = table.claude.calls.slice(from).find(c => c.model === NARRATION_MODEL);
    expect(question.system).toContain(`## LAST SESSION (SESSION 3)\n\n(Narrative texture only`);
    expect(question.system).toContain(SUMMARY);
    expect(question.system).toContain(`## CAMPAIGN RECAP — SESSION START CONTEXT\n\n${RECAP}`);
    expect(question.userText).not.toContain('I pay Vex');

    const move = await narrateMove('I tune the beacon.');
    expect(move.system).toContain(SUMMARY);
    expect(move.system).not.toContain('CAMPAIGN RECAP');
  });

  it('chat activity keeps a long session alive; once idle past four hours it is not revived', async () => {
    table.world.setSetting('campaignState', { ...world(), lastSessionTimestamp: new Date(Date.now() - 20 * 60_000).toISOString() });
    await narrateMove('I keep watch.');
    expect(Date.now() - Date.parse(world().lastSessionTimestamp)).toBeLessThan(60_000);

    // A reload now resumes the session, however long ago it began.
    const gm = table.client('gm-1');
    const { initSessionId } = await gm.import('../../src/index.js');
    expect((await gm.run(() => initSessionId(game.settings.get(MODULE_ID, 'campaignState')))).currentSessionId).toBe('sess-1');

    const idle = new Date(Date.now() - 5 * 3_600_000).toISOString();
    table.world.setSetting('campaignState', { ...world(), lastSessionTimestamp: idle });
    await narrateMove('I wake up.');
    expect(world().lastSessionTimestamp).toBe(idle);
  });
});

describe('what reached no prompt now does (C5)', () => {
  beforeEach(() => {
    table.world.setSetting('campaignState', { ...world(), lastSessionTimestamp: new Date().toISOString() });
  });

  it('the focus the table chose at End a Session is on the next session\'s narrations', async () => {
    table.client('gm-1').answerDialogs(d => d.submit({ 'input[name="questFocus"]': 'Find the beacon', 'input[name="connectionFocus"]': 'Mara' }));
    await type('gm-1', '!end-session');
    table.client('gm-1').answerDialogs(d => d.submit({ 'input[name="vignette"]': false, 'input[name="galleyVignette"]': false }));
    await type('gm-1', '!begin-session');
    expect(world()).toMatchObject({
      questFocus: '', connectionFocus: '',
      sessionFocus: { sessionId: world().currentSessionId, quest: 'Find the beacon', connection: 'Mara' },
    });

    const call = await narrateMove('I check the nav console.');
    expect(call.system).toContain("## THE TABLE'S FOCUS THIS SESSION");
    expect(call.system).toContain('- Quest: Find the beacon\n- Connection: Mara');
  });

  it('a clock the GM starts is in the next narration', async () => {
    await type('gm-1', '!clock new "Reactor overload" 4 tension');
    const call = await narrateMove('I try to vent the coolant.');
    expect(call.system).toMatch(/## CLOCKS\n\n[^\n]*\n\n- Tension: Reactor overload — 0\/4/);
  });

  it('vow progress marked on the sheet reaches the next narration — the cached snapshot is dropped', async () => {
    const vow = { id: 'vow-1', name: 'Find the relay', type: 'progress', system: { subtype: 'vow', rank: 'dangerous', progress: 4 } };
    const pc = table.actors.get('pc-pat');
    vow.parent = pc;
    pc.items.contents.push(vow);

    const before = await narrateMove('I study the relay schematics.');
    expect(before.system).toContain('Find the relay (dangerous, progress 1/10)');

    vow.system.progress = 20;   // the player marks progress on the native sheet
    table.fireDocumentHook('pl-1', 'updateItem', vow, {});
    await table.settle();
    const after = await narrateMove('I push on toward the relay.');
    expect(after.system).toContain('Find the relay (dangerous, progress 5/10)');
  });
});

describe('a keyless-GM table keeps what a player\'s narration records (D2)', () => {
  it('@scene on the player\'s own key: the truth it records reaches the ledger through the GM', async () => {
    await table.setClaudeKey('gm-1', '');
    await table.setClaudeKey('pl-1', 'sk-ant-pat');
    replies.push(reply('The hatch is welded shut, the seam still warm.', {
      newTruths: [{ subject: 'scene', fact: 'the hatch is welded shut' }], stateChanges: [],
    }));
    const from = table.claude.calls.length;
    await type('pl-1', '@scene What about the hatch?');
    expect(table.claude.calls.slice(from).filter(c => c.model === NARRATION_MODEL).map(c => c.client)).toEqual(['pl-1']);
    expect(world().sceneTruths).toMatchObject([{ fact: 'the hatch is welded shut', subject: { kind: 'scene' }, sceneId: 'sc-1' }]);
    expect(table.errors).toEqual([]);
  });
});

describe('Confirm on a draft card keeps what the narration said about them (D3)', () => {
  it('the role and goal the detection pass read from the prose win over the oracle; no rolled first look over a narrated one', async () => {
    const gm = table.client('gm-1');
    const { parseDetectionResponse, routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
    await gm.run(() => {
      const cs = game.settings.get(MODULE_ID, 'campaignState');
      const detected = parseDetectionResponse(JSON.stringify({ entities: [{
        type: 'connection', name: 'Mira Sol', description: 'a stocky woman with a burned hand',
        pronouns: 'she/her', role: 'quartermaster', goal: 'clear her debt to the Syndicate', confidence: 'high',
      }] }), cs);
      return routeEntityDrafts(detected.entities, cs, {});
    });
    await table.settle();
    const draft = table.cards(f => f.draftEntityCard)[0];
    gm.click(draft._id, '[data-action="sf-draft-confirm"]');
    await table.settle();

    const mira = world().connectionIds.find(id => table.actors.get(id)?.name === 'Mira Sol');
    const record = table.actors.get(mira).flags[MODULE_ID].connection;
    expect(record).toMatchObject({
      role: 'quartermaster', motivation: 'clear her debt to the Syndicate', pronouns: 'she/her',
      description: 'a stocky woman with a burned hand',
    });
  });
});

describe('the Private Channel reads the shared story; a published reflection is canon (D1)', () => {
  const PRIVATE_MODEL = 'claude-haiku-4-5-20251001';

  it('a private aside is told the premise, the NPC\'s card and what the scene established about them', async () => {
    await recordNpc('Kael Dros');
    replies.push(reply('Kael leans on the rail, rubbing the old scar on his jaw.', {
      newTruths:  [{ subject: 'Kael Dros', fact: 'has a ragged scar along his jaw' }],
      stateChanges: [],
      sceneFrame: { location: 'Bleakhold docking ring', present: ['Kael Dros'], situation: 'Waiting for the shuttle' },
    }));
    await narrateMove('I hail Kael Dros across the docking ring.');
    table.world.setSetting('campaignState', { ...world(), incitingIncident: { prose: 'The beacon at Bleakhold went dark.' } });
    await table.setClaudeKey('pl-1', 'sk-ant-pat');

    const pl = table.client('pl-1');
    const { requestPrivateNarration } = await pl.import('../../src/private-channel/narrate.js');
    const from = table.claude.calls.length;
    const result = await pl.run(() => requestPrivateNarration({
      campaignState: game.settings.get(MODULE_ID, 'campaignState'), userId: 'pl-1', actorId: 'pc-pat',
      transcriptTurns: [], playerMessage: 'What do I remember about him?',
    }));
    expect(result.ok).toBe(true);

    const aside = table.claude.calls.slice(from).find(c => c.model === PRIVATE_MODEL && c.client === 'pl-1');
    expect(aside.system).toContain('## CAMPAIGN PREMISE');
    expect(aside.system).toContain('The beacon at Bleakhold went dark.');
    // "him" names no one: the scene frame's cast brings Kael's card and facts.
    expect(aside.userText).toContain('## KAEL DROS — Connection');
    expect(aside.userText).toContain('SCENE FRAME (the scene as it stands):');
    expect(aside.userText).toMatch(/Kael Dros — has a ragged scar along his jaw/);
  });

  it('a published reflection reaches the next narration, and the NPC it names gets the tier pass', async () => {
    await recordNpc('Kael Dros');
    const REFLECTION = 'You realise Kael Dros never forgave the Hegemony for Bleakhold.';
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      const pl = table.client('pl-1');
      const { publishToMainChat } = await pl.import('../../src/private-channel/publish.js');
      const from = table.claude.calls.length;
      await pl.run(() => publishToMainChat({ userId: 'pl-1', content: REFLECTION }));
      await table.settle();
      await vi.advanceTimersByTimeAsync(2_000);
      await table.settle();
      expect(table.cards(f => f.publishedReflection)).toHaveLength(1);
      const tierPass = table.claude.calls.slice(from).filter(c => c.client === 'gm-1' && c.userText?.includes(REFLECTION));
      expect(tierPass.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }

    const next = await narrateMove('I go and find Kael.');
    expect(next.userText).toContain(REFLECTION);
  });
});
