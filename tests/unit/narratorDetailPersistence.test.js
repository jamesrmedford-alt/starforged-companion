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
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
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
