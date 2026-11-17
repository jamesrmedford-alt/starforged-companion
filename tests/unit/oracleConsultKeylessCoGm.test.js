/**
 * STARFORGED COMPANION
 * tests/unit/oracleConsultKeylessCoGm.test.js
 *
 * Issue #362 AC78 ORACLE-CONSULT-KEYLESS-GM (an incomplete fix of issue #354
 * P2-31). Two GMs: Gina (gm-1, canonical) holds the Claude key, Gus (gm-2)
 * has none. A decided hidden plan is about "the escort". A yes/no about a
 * planned subject is rolled at odds the plan's truth sets, so the answer
 * cannot contradict it (issue #353, decided); P2-31 made that hold for a roll
 * typed on a client that cannot consult — a player's — by asking the
 * canonical GM for the odds. index.js chose the path by `game.user.isGM`
 * alone, so Gus's roll consulted locally, got nothing for want of a key, and
 * was rolled at the odds he typed. The path now follows whether the client
 * can make the call (oracleConsult.consultedOdds).
 *
 * The d100 is held at 50: "likely" (75) answers YES, "small chance" (10) NO —
 * so the answer shows which odds it was rolled at, whatever the card prints.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });   // gm-1 alone is given a Claude key
afterEach(() => { vi.restoreAllMocks(); restore?.(); });

const consults    = () => table.claude.calls.filter(c => /You set the odds for an oracle/.test(c.system ?? ''));
const oracleCards = () => table.cards(f => f.oracleCommandCard === true && /Ask the Oracle/.test(f.oracleNarration?.oracleName ?? ''));

/** A decided threat plan about "the escort", filed as a narration files one. */
async function decidedThreat() {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: 'A Keeper drone collecting names.',
        escalation: ['It asks again, closer'], clues: ['A pulse that counts down'] }] } : {}) } };
  };
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
  const plan = plansOf(table).find(p => p.kind === 'threat');
  expect(plan?.truth).toBe('A Keeper drone collecting names.');
  return plan;
}

/** `userId` asks a yes/no at "likely", the d100 held at 50. */
async function asks(userId, question = 'Is the escort a drone?') {
  table.script.when((c) => /You set the odds/.test(c.system ?? ''), 'small_chance');
  vi.spyOn(Math, 'random').mockReturnValue(0.495);
  try {
    await onGm(table, () => table.client(userId).chat(`!oracle yes likely ${question}`));
  } finally {
    vi.restoreAllMocks();
  }
  return oracleCards().at(-1);
}

describe('issue #362 AC78 — a keyless co-GM\'s yes/no about a planned subject, with a keyed GM connected', () => {
  it('control: the keyed GM\'s own roll is rolled at the odds the plan sets', async () => {
    await decidedThreat();
    const card = await asks('gm-1');
    expect(consults()).toHaveLength(1);
    expect(card.flags['starforged-companion'].oracleMemory.answer).toBe('NO');
  }, 40_000);

  it('control: a player\'s roll asks the keyed GM, and is rolled at the odds the plan sets (P2-31)', async () => {
    await decidedThreat();
    const card = await asks('pl-1');
    expect(consults()).toHaveLength(1);
    expect(card.author).toBe('pl-1');
    expect(card.flags['starforged-companion'].oracleMemory.answer).toBe('NO');
  }, 40_000);

  it('the keyless co-GM\'s roll asks the keyed canonical GM too, and is rolled at the odds the plan sets', async () => {
    await decidedThreat();
    expect(table.client('gm-2').run(() => game.user.isGM)).toBe(true);
    expect(table.client('gm-2').run(() => game.settings.get('starforged-companion', 'claudeApiKey') || '')).toBe('');

    const card = await asks('gm-2');
    expect(card.author, 'Gus rolled it, on his own client').toBe('gm-2');
    expect(consults()).toHaveLength(1);
    expect(card.flags['starforged-companion'].oracleMemory.answer).toBe('NO');
  }, 40_000);

  it('control: a question naming no plan is rolled at the odds typed, by anyone', async () => {
    await decidedThreat();
    const card = await asks('gm-2', 'Is the hatch sealed?');
    expect(consults()).toEqual([]);
    expect(card.flags['starforged-companion'].oracleMemory.answer).toBe('YES');
  }, 40_000);

  it('control: the canonical GM with no key asks no one — the asks are its own to answer — and rolls at the odds typed', async () => {
    await decidedThreat();
    await table.setClaudeKey('gm-1', '');
    const sent = [];
    const socket = gmOf(table).run(() => game.socket);
    const emit = socket.emit.bind(socket);
    socket.emit = (channel, message) => { sent.push(message); return emit(channel, message); };
    try {
      const card = await asks('gm-1');
      expect(card.flags['starforged-companion'].oracleMemory.answer).toBe('YES');
    } finally {
      socket.emit = emit;
    }
    expect(sent.filter(m => m?.kind === 'oracleConsult.ask')).toEqual([]);
    expect(consults()).toEqual([]);
  }, 40_000);
});
