/**
 * STARFORGED COMPANION
 * tests/unit/planExistenceOffTableScreens.test.js
 *
 * Issue #362 D3 PLAN-EXISTENCE-ON-PLAYER-SCREENS (the maintainer's answer A).
 * The narrator is told never to hint that a hidden plan exists, yet three
 * table-facing surfaces said so:
 *   - a plan's clock was named "<subject> — escalation" on the clock cards,
 *     `!clock list` and every player's Session panel — now its subject alone,
 *     and a world's existing plan clocks are renamed once at load by the
 *     canonical GM;
 *   - Ask the Oracle printed the consulted odds ("Ask the Oracle (almost
 *     certain)") and their threshold, stating the hidden truth one yes/no at
 *     a time — the card now shows the odds the player typed and no threshold,
 *     while the roll is still made at the plan's odds;
 *   - the world snapshot's pending marks (`plan_made`, `plan_decided`,
 *     `new_enemy_revealed` …) sat in a world setting every client holds —
 *     now one opaque "out of date" mark; which events set it stays on the
 *     reporting GM's client and the snapshot page's log.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  restore = await resetSkeletonTable(table);
  // A new world: what each GM's page held in memory — the snapshot it took, the events it reported — is gone.
  for (const id of ['gm-1', 'gm-2']) {
    const events = await table.client(id).import('../../src/narration/snapshotEvents.js');
    const store  = await table.client(id).import('../../src/narration/worldSnapshotStore.js');
    table.client(id).run(() => { events._resetSnapshotEventsForTests(); store._resetWorldSnapshotStoreForTests(); });
  }
});
afterEach(() => { vi.restoreAllMocks(); restore?.(); });

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
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
  return plansOf(table).find(p => p.kind === 'threat');
}

describe('issue #362 D3 — a hidden plan\'s clock is named by its subject alone', () => {
  it('a decided threat\'s clock is "the escort", not "the escort — escalation"', async () => {
    const plan = await decidedThreat();
    const clock = (stored().clocks ?? []).find(c => c._id === plan.clockId);
    expect(clock).toMatchObject({ name: 'the escort', planId: plan.id });
  }, 40_000);

  it('a world\'s plan clocks are renamed once when the canonical GM loads — no other clock is', async () => {
    table.world.setSetting('campaignState', { ...table.world.campaignState(), clocks: [
      { _id: 'c-plan', name: 'the escort — escalation', type: 'tension', segments: 4, filled: 2, active: true, planId: 'sk-1' },
      { _id: 'c-own', name: 'Reactor — escalation', type: 'tension', segments: 4, filled: 1, active: true },
      { _id: 'c-count', name: "Archer's count", type: 'tension', segments: 6, filled: 3, active: true, planId: 'sk-2' },
    ] });
    await table.reload('gm-1');
    await table.settle();
    const byId = new Map((table.world.campaignState().clocks ?? []).map(c => [c._id, c]));
    expect(byId.get('c-plan')).toMatchObject({ name: 'the escort', filled: 2, planId: 'sk-1' });
    expect(byId.get('c-own').name, 'a GM\'s own clock is left as named').toBe('Reactor — escalation');
    expect(byId.get('c-count').name).toBe("Archer's count");

    // Once: the next load finds nothing to rename and writes nothing.
    const writes = [];
    table.interceptWrites((w) => { if (w.kind === 'setting' && /campaignState/.test(w.key)) writes.push(w); });
    await table.reload('gm-1');
    await table.settle();
    expect(writes).toEqual([]);
  }, 60_000);

  it('a GM who is not the canonical one renames nothing at load', async () => {
    table.world.setSetting('campaignState', { ...table.world.campaignState(), clocks: [
      { _id: 'c-plan', name: 'the escort — escalation', type: 'tension', segments: 4, filled: 2, active: true, planId: 'sk-1' },
    ] });
    await table.reload('gm-2');
    await table.settle();
    expect(table.world.campaignState().clocks[0].name).toBe('the escort — escalation');
  }, 60_000);
});

describe('issue #362 D3 — Ask the Oracle shows the odds typed, and no threshold', () => {
  /** A yes/no at "likely" about the planned escort, consulted as "small chance", the d100 held at 50. */
  async function askAboutTheEscort(userId) {
    table.script.when((c) => /You set the odds/.test(c.system ?? ''), 'small_chance');
    vi.spyOn(Math, 'random').mockReturnValue(0.495);
    try {
      await onGm(table, () => table.client(userId).chat('!oracle yes likely Is the escort a drone?'));
    } finally {
      vi.restoreAllMocks();
    }
    return oracleCards().at(-1);
  }

  it('the card, its flags and the oracle memory name "likely"; the answer is the plan\'s (50 is a NO at small chance)', async () => {
    await decidedThreat();
    for (const userId of ['gm-1', 'pl-1']) {
      const card = await askAboutTheEscort(userId);
      const f = card.flags[MODULE_ID];
      expect(card.content, userId).toContain('Ask the Oracle (likely)');
      expect(card.content, userId).toContain('d100 = <strong>50</strong> → <strong>NO</strong>');
      expect(JSON.stringify(card), userId).not.toMatch(/small chance|small_chance|≤|> 10\b/);
      expect(f.oracleNarration.oracleName).toBe('Ask the Oracle (likely)');
      expect(f.oracleNarration.rolledLine).toBe('d100 = 50 → NO');
      expect(f.oracleMemory).toMatchObject({ name: 'Ask the Oracle (likely)', answer: 'NO' });
    }
    // The table's memory of it — a world setting every client holds — names the odds typed too.
    expect(JSON.stringify(stored().recentOracles ?? [])).not.toMatch(/small chance/);
  }, 60_000);

  it('control: a question that names no plan is rolled at the odds typed (50 is a YES at likely)', async () => {
    await decidedThreat();
    vi.spyOn(Math, 'random').mockReturnValue(0.495);
    try {
      await onGm(table, () => table.client('pl-1').chat('!oracle yes likely Is the hatch sealed?'));
    } finally {
      vi.restoreAllMocks();
    }
    expect(oracleCards().at(-1).content).toContain('d100 = <strong>50</strong> → <strong>YES</strong>');
  }, 40_000);
});

describe('issue #362 D3 — the world setting marks the snapshot out of date, and names nothing', () => {
  const eventsOn = async (id) => table.client(id).import('../../src/narration/snapshotEvents.js');
  const setting = () => table.world.getSetting('worldSnapshotEvents') ?? { events: [] };

  it('a plan made, decided and an enemy revealed leave one opaque mark in the setting — on every client', async () => {
    await decidedThreat();
    const events = await eventsOn('gm-1');
    gmOf(table).run(() => {
      events.reportSnapshotEvent('plan_made');
      events.reportSnapshotEvent('plan_decided');
      events.reportSnapshotEvent('new_enemy_revealed');
    });
    await table.settle();
    for (const id of ['gm-1', 'gm-2', 'pl-1']) {
      const held = table.client(id).run(() => game.settings.get(MODULE_ID, 'worldSnapshotEvents'));
      expect(held.events.map(e => e.id), id).toEqual(['out_of_date']);
      expect(JSON.stringify(held), id).not.toMatch(/plan_|new_enemy/);
    }
    // The reporting GM still names them, for the snapshot page's log.
    expect(gmOf(table).run(() => events.namedSnapshotCauses(events.pendingSnapshotEvents())))
      .toEqual(expect.arrayContaining(['plan_made', 'plan_decided', 'new_enemy_revealed']));
  }, 40_000);

  it('a mark another GM\'s client set takes the canonical GM\'s next snapshot, its log saying "out_of_date"', async () => {
    const gmEvents = await eventsOn('gm-1');
    const coEvents = await eventsOn('gm-2');
    const store = await gmOf(table).import('../../src/narration/worldSnapshotStore.js');
    const cs = () => foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
    const first = await gmOf(table).run(() => store.resolveWorldSnapshot(cs()));
    expect(first?.fresh).toBe(true);

    table.client('gm-2').run(() => coEvents.reportSnapshotEvent('plan_edited'));
    await table.settle();
    const next = await gmOf(table).run(() => store.resolveWorldSnapshot(cs()));
    expect(next).toMatchObject({ fresh: true, causes: ['out_of_date'] });
    await table.settle();
    expect(gmOf(table).run(() => gmEvents.pendingSnapshotEvents())).toEqual([]);
  }, 40_000);

  it('a mark a world stored before by event name still takes a snapshot, and is cleared by it', async () => {
    const events = await eventsOn('gm-1');
    const store = await gmOf(table).import('../../src/narration/worldSnapshotStore.js');
    const cs = () => foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
    await gmOf(table).run(() => store.resolveWorldSnapshot(cs()));
    table.world.setSetting('worldSnapshotEvents', { events: [{ id: 'plan_made', at: Date.now() + 1_000 }] });
    const next = await gmOf(table).run(() => store.resolveWorldSnapshot(cs()));
    expect(next).toMatchObject({ fresh: true, causes: ['plan_made'] });
    await table.settle();
    expect(gmOf(table).run(() => events.pendingSnapshotEvents())).toEqual([]);
    expect(setting().events).toEqual([]);
  }, 40_000);
});
