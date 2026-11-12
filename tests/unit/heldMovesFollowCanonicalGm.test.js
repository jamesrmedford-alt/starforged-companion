/**
 * STARFORGED COMPANION
 * tests/unit/heldMovesFollowCanonicalGm.test.js
 *
 * A forced move held at the move lock follows the canonical GM (issue #347
 * AB06).
 *
 * A claimed card button's forced move that meets the lock is held in the
 * memory of the canonical GM whose pipeline held it, and only the canonical GM
 * drains. When another GM became canonical — a lower-id, keyed GM opened the
 * world mid-narration — the held move stopped draining on the old GM and the
 * new one never held it: the card stayed claimed and the milestone unmarked,
 * until the old GM was canonical again and rolled it out of the blue. The old
 * GM now hands its held moves to the new canonical GM, which rolls them when
 * the lock frees.
 */
/* global silenceConsoleErrors */
import { describe, it, expect, afterEach, vi } from 'vitest';

// gather_information strong hit: challenge dice 1 and 2, action die 6.
const control = vi.hoisted(() => ({ dice: [0.0, 0.15, 0.99] }));
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
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table, vow;
afterEach(() => { table?.teardown(); });

const world = () => table.world.campaignState();
const isNarration = (call) => /SIDECAR|NARRATOR ROLE/.test(call?.system ?? '');

function makeVow() {
  const item = {
    id: 'vow-1', type: 'progress', name: 'Find Chen', flags: { [MODULE_ID]: { vowId: 'vid-chen' } },
    system: { subtype: 'vow', rank: 'dangerous', current: 0, completed: false },
    async update(changes) { for (const [k, v] of Object.entries(changes)) if (k === 'system.current') item.system.current = v; return item; },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

const SETTINGS = {
  chronicleAutoEntry: false, narratorSessionSummary: false, autoRecapEnabled: false, 'factContinuity.enabled': false,
  campaignState: { ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: new Date().toISOString(),
    currentSessionId: 'sess-1', sessionStartedId: 'sess-1', sessionNumber: 1,
    lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [] },
};

/** gm-2 alone with the player; gm-1 (lower id) is away. `gm1Keyed`: gm-1 has played keyed before. */
async function nightRunByGm2({ gm1Keyed }) {
  table = await simulateTable({
    users: [{ ...USERS.GM, active: false }, USERS.GM2, USERS.P1],
    world: { settings: { ...SETTINGS, keyedGmUserIds: gm1Keyed ? ['gm-1', 'gm-2'] : ['gm-2'] } },
    clientSettings: gm1Keyed ? { 'gm-1': { claudeApiKey: 'sk-ant-gina' } } : {},
  });
  await table.setClaudeKey('gm-2', 'sk-ant-gus');
  vow = makeVow();
  table.addActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
  return scriptClaude(table);
}

/** The player's move is narrated on gm-2; the player presses ⚑ while the narration is in flight. */
async function pressMilestoneDuringNarration(claude) {
  const held = claude.hold(isNarration);
  table.client('pl-1').chat('I comb the archive for word of Chen.', {
    speaker: { actor: 'pc-1', alias: 'Kira' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'gather_information' } },
  });
  await held.arrived;
  await table.settle();
  const [card] = table.cards(f => f.moveResolution && f.milestoneSuggestion?.eligible);
  expect(card, 'the strong hit posted a move card with the milestone suggestion').toBeTruthy();
  expect(world().pendingMoveBy).toBe('gm-2');

  table.client('pl-1').click(card._id, '[data-action="sf-reach-milestone"]');
  await table.settle();
  // The press is claimed on the card and its forced move posted — held at gm-2's lock.
  expect(table.world.message(card._id).flags[MODULE_ID].milestoneMarked).toBe(true);
  expect(table.cards(f => f.forcedMoveId === 'reach_a_milestone')).toHaveLength(1);
  expect(vow.system.current).toBe(0);
  return { held, card };
}

describe('a held forced move and a canonical handover (issue #347 AB06)', () => {
  it('gm-1 (lower id, keyed) opens the world while gm-2 narrates: the held milestone is still marked when the lock frees', async () => {
    silenceConsoleErrors();
    const claude = await nightRunByGm2({ gm1Keyed: true });
    const { held, card } = await pressMilestoneDuringNarration(claude);

    await table.join('gm-1');                 // canonical from now on; gm-2's live lock stands (Y07)
    await table.settle();
    expect(world().pendingMove).toBe(true);

    held.release();                           // gm-2's narration lands; its pipeline records and releases
    await table.settle(); await table.drain();
    expect(world().pendingMove).toBe(false);

    const claimed = table.world.message(card._id).flags[MODULE_ID].milestoneMarked === true;
    expect({ claimed, ticks: vow.system.current, moveCards: table.cards(f => f.moveResolution).length })
      .toEqual({ claimed: true, ticks: 8, moveCards: 2 });
  }, 60_000);

  it('…and it is not rolled out of the blue later, when gm-1 leaves and some write lands on gm-2', async () => {
    silenceConsoleErrors();
    const claude = await nightRunByGm2({ gm1Keyed: true });
    const { held } = await pressMilestoneDuringNarration(claude);
    await table.join('gm-1');
    await table.settle();
    held.release();
    await table.settle(); await table.drain();
    const ticksWhileGm1Canonical = vow.system.current;

    // Much later: gm-1 leaves; gm-2 is canonical again and any campaignState write lands.
    await table.leave('gm-1');
    await table.client('gm-2').run(() => globalThis.game.settings.set(MODULE_ID, 'campaignState',
      { ...globalThis.game.settings.get(MODULE_ID, 'campaignState'), dismissedEntities: ['Vex'] }));
    await table.settle(); await table.drain();

    // Either it was marked when the lock freed (correct), or never — not marked now, unprompted.
    expect({ whenLockFreed: ticksWhileGm1Canonical, afterGm1Left: vow.system.current })
      .toEqual({ whenLockFreed: 8, afterGm1Left: 8 });
  }, 60_000);

  // The session gate holds a claimed card's move the same way ("until a
  // session begins") — for minutes, while the table gathers.
  async function pressWhichVowBeforeSession({ gm1Keyed }) {
    table = await simulateTable({
      users: [{ ...USERS.GM, active: false }, USERS.GM2, USERS.P1],
      world: { settings: { ...SETTINGS, keyedGmUserIds: gm1Keyed ? ['gm-1', 'gm-2'] : ['gm-2'],
        campaignState: { ...SETTINGS.campaignState, sessionActive: false, sessionActiveStartedAt: null } } },
      clientSettings: gm1Keyed ? { 'gm-1': { claudeApiKey: 'sk-ant-gina' } } : {},
    });
    await table.setClaudeKey('gm-2', 'sk-ant-gus');
    vow = makeVow();
    table.addActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
    scriptClaude(table);
    const gm2 = table.client('gm-2');
    const msg = await gm2.run(() => globalThis.ChatMessage.create({
      content: `<div class="sf-ptp-card"><button type="button" data-action="sf-which-vow" data-item-id="vow-1">🏁 Find Chen</button>`
        + `<button type="button" data-action="sf-which-vow" data-item-id="vow-2">🏁 Repay the Syndicate</button></div>`,
      flags: { [MODULE_ID]: { whichVowCard: true, actorId: 'pc-1', narration: 'I end this.', resolved: false,
        choices: [{ itemId: 'vow-1', name: 'Find Chen' }, { itemId: 'vow-2', name: 'Repay the Syndicate' }] } },
    }));
    await table.settle();
    table.client('pl-1').click(msg.id, '[data-action="sf-which-vow"]');
    await table.settle(); await table.drain();
    // Claimed, posted, held until a session begins — nothing rolled.
    expect(table.world.message(msg.id).flags[MODULE_ID].resolved).toBe(true);
    expect(table.cards(f => f.forcedMoveId === 'fulfill_your_vow')).toHaveLength(1);
    expect(table.cards(f => f.moveResolution)).toHaveLength(0);
    return msg;
  }

  async function beginSession(byGm) {
    await table.client(byGm).setSetting('campaignState', { ...world(), sessionActive: true, sessionActiveStartedAt: new Date().toISOString() });
    await table.settle(); await table.drain();
  }

  it('a "Which vow?" pick held until a session begins is rolled at Begin, though gm-1 joined in between', async () => {
    silenceConsoleErrors();
    await pressWhichVowBeforeSession({ gm1Keyed: true });

    await table.join('gm-1');                 // the table gathers: gm-1 is canonical from now on
    await table.settle(); await table.drain();
    await beginSession('gm-1');

    expect(world().sessionActive).toBe(true);
    expect(table.cards(f => f.moveResolution), 'the held fulfil is rolled once the session begins').toHaveLength(1);
  }, 60_000);

  it('control: the same pick with gm-2 still canonical is rolled at Begin', async () => {
    silenceConsoleErrors();
    await pressWhichVowBeforeSession({ gm1Keyed: false });

    await table.join('gm-1');                 // keyless: gm-2 stays canonical
    await table.settle(); await table.drain();
    await beginSession('gm-2');

    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
  }, 60_000);

  it('control: gm-1 keyless (gm-2 stays canonical) — the held milestone is marked when the lock frees', async () => {
    silenceConsoleErrors();
    const claude = await nightRunByGm2({ gm1Keyed: false });
    const { held } = await pressMilestoneDuringNarration(claude);

    await table.join('gm-1');                 // keyless: the keyed gm-2 stays canonical
    await table.settle();
    held.release();
    await table.settle(); await table.drain();

    expect(vow.system.current).toBe(8);
    expect(table.cards(f => f.moveResolution)).toHaveLength(2);
  }, 60_000);
});
