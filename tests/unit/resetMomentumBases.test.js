/**
 * STARFORGED COMPANION
 * tests/unit/resetMomentumBases.test.js
 *
 * MOMENTUM-BASE-DRIFTED — a world that played under the old momentum
 * write-back (issue #316 T01) has characters whose sheet bases sit below 10 /
 * +2 (the audit's run ended at 7 / 0). T01 stopped the drift but repaired
 * nothing: the bases are the sheet's, and nothing tells a base the write-back
 * lowered from one a GM set on purpose. The maintainer's call: an explicit
 * command, `!reset-momentum [name | all]`, puts a character's bases back to
 * 10 / +2 — the typist's own character, a named one, or every one; a player
 * resets only a character they own, a GM any.
 *
 * The booted table: a GM and two players, each with a drifted character.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { readMomentumState } from '../../src/character/actorBridge.js';

let table, kira, ren;
const cards = () => table.cards(f => f.resetMomentumCard);
const bases = (a) => ({ max: a.system.momentum.max, reset: a.system.momentum.resetValue });

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, sessionActive: true } } } });
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
    system: { momentum: { value: 5, max: 7, resetValue: 0 } } });
  ren = table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-2': 3 },
    system: { momentum: { value: 4, max: 8, resetValue: 1 } } });
});

async function type(userId, content, speaker = null) {
  await table.client(userId).chat(content, speaker ? { speaker: { actor: speaker } } : {});
  await table.settle(); await table.drain();
}

describe('MOMENTUM-BASE-DRIFTED — !reset-momentum', () => {
  it("a player's bare !reset-momentum puts their own character's bases back to 10 / +2, and says what changed", async () => {
    await type('pl-1', '!reset-momentum', 'pc-kira');
    expect(bases(kira)).toEqual({ max: 10, reset: 2 });
    expect(kira.system.momentum.value).toBe(5);                 // momentum itself is left alone
    expect(readMomentumState(kira)).toMatchObject({ max: 10, reset: 2 });
    expect(cards().at(-1).content).toMatch(/Kira: base maximum 7 → 10, reset \+0 → \+2/);
    expect(bases(ren)).toEqual({ max: 8, reset: 1 });            // not hers
  }, 30_000);

  it("a GM's !reset-momentum all resets every character", async () => {
    await type('gm-1', '!reset-momentum all');
    expect([bases(kira), bases(ren)]).toEqual([{ max: 10, reset: 2 }, { max: 10, reset: 2 }]);
  }, 30_000);

  it("a player cannot reset a character they do not own", async () => {
    await type('pl-1', '!reset-momentum Ren', 'pc-kira');
    expect(bases(ren)).toEqual({ max: 8, reset: 1 });
    expect(table.client('pl-1').notifications.map(n => n.message))
      .toContainEqual(expect.stringMatching(/you do not own Ren/));
    expect(cards()).toEqual([]);
  }, 30_000);

  it('control: bases already 10 / +2 are not written', async () => {
    kira.system.momentum.max = 10; kira.system.momentum.resetValue = 2;
    await type('gm-1', '!reset-momentum Kira');
    expect(cards().at(-1).content).toMatch(/Kira: already 10 \/ \+2/);
  }, 30_000);
});
