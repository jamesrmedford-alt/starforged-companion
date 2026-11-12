/**
 * The inciting card's ⚔ Swear this vow, pressed while another move is being
 * resolved, is not lost in silence (issue #347 AB06 — SESS-4; known-issues
 * MOVE-BUSY-NOTICE).
 *
 * The forced swear (buildSwearMovePost) is not held at the move lock: the
 * canonical GM's pipeline dropped it with a toast on the GM's own screen, the
 * presser was told nothing, and their ⚔ stayed disabled until a reload. The
 * pipeline now whispers a "Not rolled" notice naming the post
 * (`gatedMessageId`), and the presser's client re-arms its button
 * (swearVow.js rearmSwearOnGateRefusal), as the session gate's notice does.
 *
 * (Converted from the thirteenth audit's probe
 * tests/probes/sess/incitingSwearDroppedAtLock.probe.js.)
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.9] }));   // challenge 3, 4; action 6 — a strong hit
vi.mock('../../src/pacing/router.js', async (orig) => ({
  ...(await orig()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (orig) => ({
  ...(await orig()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
    playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (orig) => ({
  ...(await orig()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (orig) => ({
  ...(await orig()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (orig) => {
  const real = await orig();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';   // narrationModel default
const REPLY = 'Steel rings.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const INCITING_TEXT = [
  'The relay at Paradox Station goes dark; a distress code older than the Forge repeats on every band.',
  '',
  'Suggested vow: Find who silenced the relay (dangerous)',
].join('\n');

let table;
const moveCards  = () => table.cards(f => f.moveResolution);
const swearPosts = () => table.world.messages().filter(m => m.flags?.[MODULE_ID]?.forcedMoveId === 'swear_an_iron_vow');
const sworn      = (cardId) => table.world.message(cardId).flags[MODULE_ID].vowSworn === true;
const swearButton = (userId, cardId) => (table.client(userId).rendered.get(cardId) ?? table.client(userId).render(cardId))
  .querySelector('[data-action="sf-swear-vow"]');

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

async function reset() {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, vowSwearingNarration: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: 'sw-s1', currentSessionId: 'sw-s1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sw-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
}

async function postIncitingCard() {
  const { postIncitingIncidentCard } = await table.client('gm-1').import('../../src/session/incitingIncident.js');
  await table.client('gm-1').run(() => postIncitingIncidentCard({
    spark: { action: 'Seize', theme: 'Power' }, text: INCITING_TEXT, fallback: false, sessionId: 'sw-s1', narrationId: 'nar-incite',
  }));
  await table.settle();
  return table.cards(f => f.incitingIncidentCard)[0];
}

describe('the inciting ⚔ pressed while another move holds the move lock', () => {
  it('control: pressed with the table quiet, the swear rolls and the card is sworn', async () => {
    await reset();
    silenceConsoleErrors();
    scriptClaude(table, { fallback: () => REPLY });
    const card = await postIncitingCard();

    table.client('pl-2').click(card._id, '[data-action="sf-swear-vow"]');
    await table.settle(); await table.drain();

    expect(swearPosts()).toHaveLength(1);
    expect(moveCards().map(c => c.content).join(' ')).toMatch(/Swear an Iron Vow/i);
    expect(sworn(card._id)).toBe(true);
  }, 60_000);

  it("pressed while a crewmate's move is narrated, the press is not lost in silence", async () => {
    await reset();
    silenceConsoleErrors();
    const narration = scriptClaude(table, { fallback: () => REPLY }).hold(call => call.model === NARRATION_MODEL);
    const card = await postIncitingCard();

    // Kira's player types a line: the canonical GM rolls Face Danger and its narration is in flight.
    await table.client('pl-1').chat('I shoulder the jammed hatch open.');
    await narration.arrived;
    expect(table.world.campaignState().pendingMove, 'the move lock is held (setup)').toBeTruthy();

    // Ren's player presses ⚔ Swear this vow on the inciting card.
    table.client('pl-2').click(card._id, '[data-action="sf-swear-vow"]');
    await table.settle();
    expect(swearPosts(), "the press posted its forced swear (setup)").toHaveLength(1);

    narration.release(REPLY);
    await table.settle(); await table.drain();
    expect(table.world.campaignState().pendingMove, 'the move lock is free again (setup)').toBeFalsy();
    expect(moveCards().filter(c => /Face Danger/i.test(c.content)), "Kira's move resolved (setup)").toHaveLength(1);

    const notice = table.cards(f => f.moveNotRolledNotice === 'busy').at(-1);
    expect(notice, 'the presser is told').toBeTruthy();
    expect(table.world.message(notice._id).whisper).toContain('pl-2');
    expect(String(table.world.message(notice._id).content)).toMatch(/Press its button again/);
    expect(sworn(card._id)).toBe(false);
    expect(swearButton('pl-2', card._id)?.disabled, "the presser's ⚔ is live again").toBe(false);

    // Pressed again on a quiet table, the vow is sworn.
    table.client('pl-2').click(card._id, '[data-action="sf-swear-vow"]');
    await table.settle(); await table.drain();
    expect(sworn(card._id)).toBe(true);
  }, 60_000);
});
