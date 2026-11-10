/**
 * PROBE R2C — CAPTURE-DROPPED-ON-CANONICAL-HANDOVER (LOSE-STATE)
 * Twelfth audit, round 2, cross-feature compositions (two GMs × the
 * canonical-GM handover × a move's narration capture — Make a Connection).
 *
 * The canonical GM is the lowest-id active GM with a Claude key
 * (src/multiplayer/gmGate.js isCanonicalGM :56-90). Canonicity can change in
 * the middle of a move: a lower-id keyed co-GM joins (or enters a key) while
 * the current canonical GM's pipeline is narrating — the case the move lock's
 * handover rules were written for (rules/reachability.md §9, "a lower-id GM
 * who joined mid-move is canonical").
 *
 * The move pipeline goes on where it started (src/index.js onMessage): it
 * rolls, narrates (narrateResolution) and records there. The narration's
 * sidecar follows the handover — applyNarratorSidecar relays it to the new
 * canonical GM when this client is no longer canonical
 * (src/narration/narrator.js relayNarratorSidecar :4228, handler
 * applyRelayedNarratorSidecar :4261). The narration's CAPTURE does not:
 * runPostNarrationPasses (:1402) returns at once on a client that is not the
 * canonical GM (:1415 `if (!isCanonicalGM()) return Promise.resolve();`), and
 * nothing hands it to the GM that now is. So the capture of a narration that
 * straddles the handover — the Make a Connection hit's auto-created
 * connection (:1430-1441), the detection's draft card, the tier pass — runs
 * nowhere. The move card still says "Connection made. Give them a role and
 * rank." (resolver.js); no NPC card and no bond Item are made, and nobody is
 * told. (Batch Mode's round capture has the same gate: runRoundNarrationPasses
 * :1078.)
 *
 * Scenario (booted table: Gus — gm-2, keyed — runs the session; Gina — gm-1,
 * keyed, the lower id — is away; Kira's player; the real pipeline with the
 * interpreter, pacing, confirm and dice mocked, Claude scripted):
 *   1. Kira makes a connection with Sable Ortiz (strong hit); Gus's pipeline
 *      asks Claude for the narration (held).
 *   2. Gina joins: her key makes her the canonical GM.
 *   3. The narration lands on Gus's client.
 *   Expected: Sable Ortiz's NPC card is made, bonded to Kira (as with no
 *   handover).
 *   Actual: no connection is made.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'make_a_connection', moveName: 'Make a Connection', statUsed: 'heart', adds: 0,
    rationale: 'a new contact', mischiefApplied: false,
    playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      // challenge dice 3 and 4, action die 6: a strong hit.
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const NARRATION = 'Sable Ortiz looks you over, then shakes your hand: she will vouch for you with the guild.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const SABLE = { type: 'connection', name: 'Sable Ortiz', description: 'A scarred salvage broker.',
  pronouns: 'she/her', role: 'salvage broker', goal: null, confidence: 'high' };
const DETECTION = JSON.stringify({
  entities: [SABLE],
  renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});
const LINE = 'I ask Sable Ortiz to vouch for me with the salvage guild.';
const isNarration = (call) => call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '');

let table, claude;
const world = () => table.world.campaignState();
const sable = () => table.actors.find(a => a?.name === 'Sable Ortiz' && a.flags?.[MODULE_ID]?.entityType === 'connection');
const bondNames = (actorId) => (table.actors.get(actorId)?.items?.contents ?? [])
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond').map(i => i.name);

beforeAll(async () => {
  // Gina (gm-1, the lower id) is away at first; her browser holds a Claude key.
  table = await simulateTable({
    users: [{ ...USERS.GM, active: false }, USERS.GM2, USERS.P1],
    clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-gina' } },
  });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [],
      connectionIds: [],
    },
  } } });
  await table.setClaudeKey('gm-2', 'sk-ant-gus');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  claude = scriptClaude(table, { fallback: (call) => {
    if (/ENTITY TYPES TO DETECT/.test(call.userText)) return DETECTION;
    if (isNarration(call)) return NARRATION;
    return '{}';
  } });
});

const canonical = async (id) => {
  const c = table.client(id);
  const gate = await c.import('../../src/multiplayer/gmGate.js');
  return c.run(() => gate.isCanonicalGM());
};

describe('R2C — a lower-id keyed GM joins while a Make a Connection is being narrated', () => {
  it('control: no handover — the strong hit makes Sable Ortiz\'s card, bonded to Kira', async () => {
    expect(await canonical('gm-2'), 'Gus runs the session (setup)').toBe(true);
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.drain();
    expect(table.world.messages().some(m => /Connection made/.test(m.content ?? ''))).toBe(true);
    expect(sable(), 'Sable Ortiz\'s NPC card').toBeTruthy();
    expect(bondNames('pc-kira')).toEqual(['Sable Ortiz']);
  }, 60_000);

  it('the narration that lands after the handover is still captured — Sable Ortiz\'s card is made, bonded to Kira', async () => {
    expect(await canonical('gm-2'), 'Gus runs the session (setup)').toBe(true);
    const held = claude.hold(isNarration);
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await held.arrived;                                   // rolled on Gus's client; the narration is being written

    await table.join('gm-1');                             // Gina arrives, keyed: she is the canonical GM now
    await table.settle();
    expect(await canonical('gm-1'), 'Gina is canonical (setup)').toBe(true);
    expect(await canonical('gm-2'), 'Gus is not (setup)').toBe(false);

    held.release();
    await table.settle(); await table.drain();
    expect(table.world.messages().some(m => /Connection made/.test(m.content ?? '')), 'the move card says "Connection made"').toBe(true);
    expect(world().pendingMove).toBe(false);
    expect({ card: !!sable(), bonds: bondNames('pc-kira') }, 'the connection the hit made')
      .toEqual({ card: true, bonds: ['Sable Ortiz'] });
  }, 60_000);
});

describe('R2C — the Batch Mode sibling: the round\'s narration lands after the handover', () => {
  const round = () => table.world.getSetting('batchMode.round');
  async function relay(userId, kind, payload) {
    const c = table.client(userId);
    const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
    const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
    await table.settle();
    return res;
  }
  beforeEach(async () => {
    await table.client('gm-2').setSetting('batchMode.enabled', true);
    await table.settle();
  });

  it('control: no handover — the round\'s Make a Connection hit makes Sable Ortiz\'s card, bonded to Kira', async () => {
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: LINE, submissionId: 'k1' });
    await table.drain();
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await table.drain();
    expect(table.cards(f => f.roundNumber === 1 && f.narratorCard)).toHaveLength(1);
    expect({ card: !!sable(), bonds: bondNames('pc-kira') }).toEqual({ card: true, bonds: ['Sable Ortiz'] });
  }, 60_000);

  it('the round narrated across the handover still makes the connection its hit made', async () => {
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: LINE, submissionId: 'k1' });
    await table.drain();
    const held = claude.hold(isNarration);
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await held.arrived;                                   // rolled and recorded on Gus's client; the round is being narrated

    await table.join('gm-1');                             // Gina arrives (or enters her key): canonical now
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    expect(await canonical('gm-1'), 'Gina is canonical (setup)').toBe(true);
    expect(await canonical('gm-2'), 'Gus is not (setup)').toBe(false);

    held.release();
    await table.settle(); await table.drain();
    expect(table.cards(f => f.roundNumber === 1 && f.narratorCard), 'the round was narrated').toHaveLength(1);
    expect({ card: !!sable(), bonds: bondNames('pc-kira') }, 'the connection the round\'s hit made')
      .toEqual({ card: true, bonds: ['Sable Ortiz'] });
  }, 60_000);
});
