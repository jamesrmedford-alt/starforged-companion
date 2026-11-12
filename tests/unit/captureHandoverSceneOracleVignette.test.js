/**
 * CAPTURE-HANDOVER-SCENE-ORACLE-VIGNETTE (known-issues; issue #345 AA34's
 * sibling). AA34 made a move's capture run on the GM whose client narrated it
 * — the single emitter its lock claim chose — instead of re-checking
 * isCanonicalGM when the reply landed. An `@scene` answer's, an oracle
 * follow-up's and a vignette's capture (scheduleSceneAnswerCapture,
 * scheduleNarrationCapture — the clock vignette's tier pass included) still
 * re-checked it, so a lower-id keyed GM joining while the narration was
 * written dropped the capture: the figure the narration introduced was
 * queued nowhere, and nobody was told. They take AA34's gate now.
 *
 * Scenario (AA34's table: Gus — gm-2, keyed — runs the session; Gina —
 * gm-1, keyed, the lower id — is away): Gus's narration is held; Gina
 * joins and is canonical; the narration lands on Gus's client and is
 * captured there — once.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const PROSE = 'A masked courier named Ilsa Marr waits by the hatch, a sealed Syndicate writ in hand.';
const ILSA = { type: 'connection', name: 'Ilsa Marr', description: 'A masked courier carrying Syndicate writs.',
  pronouns: 'she/her', role: 'courier', goal: null, confidence: 'high' };
const DETECTION = (entities) => JSON.stringify({
  entities, renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});
const CLOCK = 'The Syndicate closes in';
const isNarration = (call) => call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '');

let table, claude;

beforeAll(async () => {
  table = await simulateTable({
    users: [{ ...USERS.GM, active: false }, USERS.GM2, USERS.P1],
    clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-gina' } },
  });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [],
      lastSessionTimestamp: new Date().toISOString(), connectionIds: [],
      clocks: [{ _id: 'clk-syn', name: CLOCK, type: 'tension', segments: 4, filled: 3, active: true, advanceOdds: 'likely' }],
    },
  } } });
  await table.setClaudeKey('gm-2', 'sk-ant-gus');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  claude = scriptClaude(table, { fallback: (call) => {
    const user = call.userText ?? '';
    if (/ENTITY TYPES TO DETECT/.test(user)) return DETECTION(user.includes('Ilsa Marr') ? [ILSA] : []);
    if (/established entity records/.test(user)) return JSON.stringify({ updates: [] });
    if (isNarration(call)) return `${PROSE}\n\`\`\`json\n{"newTruths":[],"stateChanges":[]}\n\`\`\``;
    return '{}';
  } });
});

const canonical = async (id) => {
  const c = table.client(id);
  const gate = await c.import('../../src/multiplayer/gmGate.js');
  return c.run(() => gate.isCanonicalGM());
};
const detections = () => table.claude.calls.filter(c => /ENTITY TYPES TO DETECT/.test(c.userText ?? ''));
const draftNames = () => table.cards(f => f.draftEntityCard).flatMap(m => (m.flags[MODULE_ID].drafts ?? []).map(d => d.name));

/** Gus types `line`; its narration is held while Gina joins and becomes canonical; then it lands. */
async function narratedAcrossHandover(line) {
  expect(await canonical('gm-2'), 'Gus runs the session (setup)').toBe(true);
  const held = claude.hold(isNarration);
  await table.client('gm-2').chat(line);
  await held.arrived;
  await table.join('gm-1');
  // A page booted in an earlier test re-advertises its key as a page load does.
  await table.setClaudeKey('gm-1', '');
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  await table.settle();
  expect(await canonical('gm-1'), 'Gina is canonical now (setup)').toBe(true);

  vi.useFakeTimers({ toFake: ['setTimeout'] });
  try {
    held.release();
    await table.settle();
    for (let i = 0; i < 4; i++) { await vi.advanceTimersByTimeAsync(1_100); await table.settle(); }
  } finally {
    vi.useRealTimers();
  }
  await table.drain();
}

describe('CAPTURE-HANDOVER-SCENE-ORACLE-VIGNETTE — the capture runs where the narration ran, across a handover', () => {
  it('an oracle follow-up: its figure is queued on the draft card, by Gus\'s client, once', async () => {
    await narratedAcrossHandover('!oracle yes likely is anyone waiting at the hatch');
    expect(table.cards(f => f.oracleNarrationCard).length, 'the follow-up posted (setup)').toBe(1);
    expect(detections().map(c => c.client)).toEqual(['gm-2']);        // was: none
    expect(draftNames()).toEqual(['Ilsa Marr']);
  }, 60_000);

  it('an @scene answer: the same', async () => {
    await narratedAcrossHandover('@scene who is waiting at the hatch?');
    expect(detections().map(c => c.client)).toEqual(['gm-2']);        // was: none
    expect(draftNames()).toEqual(['Ilsa Marr']);
  }, 60_000);

  it('a clock vignette: the same', async () => {
    await narratedAcrossHandover(`!clock advance "${CLOCK}"`);
    expect(table.cards(f => f.clockVignetteCard === true).length, 'the vignette posted (setup)').toBe(1);
    expect(detections().map(c => c.client)).toEqual(['gm-2']);        // was: none
    expect(draftNames()).toEqual(['Ilsa Marr']);
  }, 60_000);
});
