/**
 * STARFORGED COMPANION
 * tests/unit/breakAddClaimedBeforeAdded.test.js
 *
 * Issue #342 Z52 BREAK-ADD-USED-BEFORE-CLAIMED (the pipeline auditor's PIPE-5
 * probe) — Take a Break's "+1 on the next move" was added to a roll before
 * the store let it go; when the world refused the clear, the +1 stayed
 * pending and the next action roll took it again.
 *
 * rollMove (src/moves/movePipeline.js) took the add from its working copy,
 * added it to the roll, and only then cleared it on the store, whose refusal
 * was a console warning; the record's merge keeps the store's `nextMoveAdd`
 * (store-owned), so it was never spent. It is now claimed on the store first
 * (consumeNextMoveAdd), as its sibling, the roller's own "+1 on your next
 * move", is — "so a refused claim adds nothing" (issue #322 V02,
 * consumeNextMoveBonus). decisions.md "Take a Break's +1 applies to the next
 * action roll": single-use.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0,
    rationale: 'test', mischiefApplied: false, playerNarration: text, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const KEY = `${MODULE_ID}.campaignState`;
const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const world = () => table.world.campaignState();
const cardOf = (actorId) => table.cards(f => f.moveResolution && f.actorId === actorId).at(-1);
// The action line, "Action: <die> + <stat> + <adds> = <score>": the adds, or 0.
const addsOn = (card) => Number((/Action:\s*\d+\s*\+\s*-?\d+\s*\+\s*(\d+)\s*=/.exec(card?.content ?? '') ?? [])[1] ?? 0);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.0, 0.15, 0.99];   // challenge 1, 2; action die 6
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'tb-s1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'tb-scene', sceneTruths: [], clocks: [],
      // Take a Break → "Move on": +1 on the next action roll, whoever makes it.
      nextMoveAdd: { value: 1, source: 'take_a_break', setAt: new Date().toISOString() },
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

/** Refuse the first campaignState write that spends the +1 (drops `nextMoveAdd` while the world holds it). */
function refuseTheClear() {
  let refused = 0;
  table.interceptWrites((w) => {
    if (refused || w.kind !== 'setting' || w.key !== KEY || w.client !== 'gm-1') return undefined;
    if (!world().nextMoveAdd || w.value?.nextMoveAdd) return undefined;
    refused += 1;
    return new Error('Setting [campaignState] could not be saved: the server refused the write');
  });
  return { get refused() { return refused; } };
}

async function moves(userId, actorId, text) {
  await table.client(userId).chat(text, { speaker: { actor: actorId } });
  await table.settle(); await table.drain();
}

describe('Z52 — Take a Break\'s +1 is used once, even when the world refuses its claim', () => {
  it('a refused clear does not let the next roll take the +1 again', async () => {
    const fault = refuseTheClear();
    await moves('pl-1', 'pc-kira', 'Kira vaults the railing and sprints for the airlock.');
    control.dice = [0.0, 0.15, 0.99];
    await moves('pl-2', 'pc-ren', 'Ren braces against the hull and pushes through the breach.');

    // Sanity: both rolled; the clear was refused once.
    expect(cardOf('pc-kira'), 'Kira rolled').toBeTruthy();
    expect(cardOf('pc-ren'), 'Ren rolled').toBeTruthy();
    expect(fault.refused).toBe(1);

    // The single-use +1 lands on exactly one of the two rolls.
    expect(addsOn(cardOf('pc-kira')) + addsOn(cardOf('pc-ren'))).toBe(1);
    // Kira's claim was the one refused: her roll took nothing, Ren's took it, and it is spent.
    expect(addsOn(cardOf('pc-kira'))).toBe(0);
    expect(addsOn(cardOf('pc-ren'))).toBe(1);
    expect(world().nextMoveAdd ?? null).toBeNull();
  }, 30_000);

  it('control: with the clear accepted, Kira\'s roll takes the +1, Ren\'s does not, and the world has spent it', async () => {
    await moves('pl-1', 'pc-kira', 'Kira vaults the railing and sprints for the airlock.');
    control.dice = [0.0, 0.15, 0.99];
    await moves('pl-2', 'pc-ren', 'Ren braces against the hull and pushes through the breach.');
    expect(addsOn(cardOf('pc-kira'))).toBe(1);
    expect(addsOn(cardOf('pc-ren'))).toBe(0);
    expect(world().nextMoveAdd ?? null).toBeNull();
  }, 30_000);
});
