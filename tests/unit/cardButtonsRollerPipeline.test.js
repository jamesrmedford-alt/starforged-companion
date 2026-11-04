/**
 * STARFORGED COMPANION
 * tests/unit/cardButtonsRollerPipeline.test.js
 *
 * Issue #329 X05 — the move pipeline on the multi-client table (the unit twin
 * is cardRepostAsRoller.test.js). At a two-PC table (Ren, created first;
 * Kira) Kira rolls a strong hit and the GM presses a follow-up on her card:
 * "🏁 Attempt to Fulfill Vow" fulfils KIRA's vow, not the first PC's; "⚔
 * Attempt to Finish the Fight" rolls KIRA's Take Decisive Action — her name
 * on the card, her +1 momentum. The control (⚑ Mark Progress on Vow, issue
 * #321 U20) pins the attribution the fix extends.
 *
 * (Converted from the ninth audit's probe
 * tests/probes/pipeline/cardButtonsClickerRoller.probe.js.)
 */

/* global silenceConsoleErrors, structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (_text, { expectedMoveSlug } = {}) => ({
    moveId: expectedMoveSlug ?? 'strike', moveName: 'Strike', statUsed: 'iron', rationale: 'test',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

function makeVow(id, name, vowId, ticks) {
  const item = {
    id, type: 'progress', name, flags: { [MODULE_ID]: { vowId } },
    system: { subtype: 'vow', rank: 'dangerous', current: ticks, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        if (k === 'system.current') item.system.current = v;
        if (k === 'system.completed') item.system.completed = v;
      }
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
    async getFlag(scope, key) { return item.flags[scope]?.[key]; },
  };
  return item;
}

function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

// Action roll: challenge 1 and 2, action die 6 — a strong hit. Progress roll: challenge 1 and 2 only.
const STRONG_ACTION   = [0.0, 0.15, 0.99];
const STRONG_PROGRESS = [0.0, 0.15];

let table, kiraVow, renVow;
const momentumOf = (id) => table.actors.get(id).system.momentum.value;

async function kiraRolls(moveId, text) {
  control.dice = STRONG_ACTION;
  await table.client('pl-1').chat(text, {
    speaker: { actor: 'pc-kira', alias: 'Kira' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: moveId } },
  });
  await table.settle(); await table.drain();
  const card = table.cards(f => f.moveResolution).at(-1);
  expect(card, `Kira's ${moveId} card`).toBeTruthy();
  expect(card.flags[MODULE_ID].actorId, 'the card records Kira as its roller').toBe('pc-kira');
  return card;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'btn-s1', sessionNumber: 1,
      currentSceneId: 'btn-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  renVow  = makeVow('vow-ren',  'Repay the Syndicate', 'vid-ren',  40);
  kiraVow = makeVow('vow-kira', 'Find Chen',           'vid-kira', 40);
  // Ren first: the campaign's "first PC" — what a GM's own press resolves to.
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [renVow] } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [kiraVow] } });
  scriptClaude(table, { fallback: () => 'Steel rings.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe('issue #329 X05 (pipeline) — a move card\'s follow-up button pressed by the GM is the card\'s roller\'s move', () => {
  it('"🏁 Attempt to Fulfill Vow" on Kira\'s card fulfils Kira\'s vow, not the first PC\'s', async () => {
    silenceConsoleErrors();
    const card = await kiraRolls('gather_information', 'I comb the archive for word of Chen.');
    expect(card.flags[MODULE_ID].milestoneSuggestion?.eligible, 'the suggestion row is offered').toBe(true);

    control.dice = STRONG_PROGRESS;
    table.client('gm-1').click(card._id, '[data-action="sf-attempt-fulfill-vow"]');
    await table.settle(); await table.drain();

    const forced = table.cards(f => f.forcedMoveId === 'fulfill_your_vow').at(-1);
    expect(forced, 'the forced fulfil was posted').toBeTruthy();
    expect(forced.speaker?.actor ?? null).toBe('pc-kira');      // was null — the pipeline credited the GM's first PC
    expect(kiraVow.system.completed).toBe(true);                // was false — Kira's vow untouched
    expect(renVow.system.completed).toBe(false);                // was true — Ren's "Repay the Syndicate" fulfilled instead
  }, 30_000);

  it('"⚔ Attempt to Finish the Fight" on Kira\'s Strike card rolls Kira\'s Take Decisive Action', async () => {
    silenceConsoleErrors();
    table.journal._set(makeTracksJournal([{
      id: 'fight-1', label: 'Corsairs', type: 'combat', rank: 'dangerous', ticks: 24, completed: false,
      combatState: 'in_control', positions: { 'pc-kira': 'in_control', 'pc-ren': 'in_control' },
    }]));
    const card = await kiraRolls('strike', 'I drive my blade at the corsair captain.');   // ×2 marks: 24 → 40 ticks
    expect(card.flags[MODULE_ID].combatTrackId, 'the card names its fight').toBe('fight-1');
    const kiraBefore = momentumOf('pc-kira');
    const renBefore  = momentumOf('pc-ren');

    control.dice = STRONG_PROGRESS;
    table.client('gm-1').click(card._id, '[data-action="sf-take-decisive-action"]');
    await table.settle(); await table.drain();

    const forced = table.cards(f => f.forcedMoveId === 'take_decisive_action').at(-1);
    expect(forced, 'the forced Take Decisive Action was posted').toBeTruthy();
    const tda = table.cards(f => f.moveResolution).at(-1);
    expect(tda.content, 'a strong hit: the fight is won').toMatch(/Strong Hit/);
    expect(forced.speaker?.actor ?? null).toBe('pc-kira');      // was null
    expect(tda.flags[MODULE_ID].actorId).toBe('pc-kira');       // was "pc-ren" — the card named Ren the roller
    expect(momentumOf('pc-kira') - kiraBefore).toBe(1);        // was 0 — the strong hit's +1 momentum …
    expect(momentumOf('pc-ren') - renBefore).toBe(0);          // was 1 — … landed on Ren
  }, 30_000);

  it('control: "⚑ Mark Progress on Vow" pressed by the GM on Kira\'s card marks Kira\'s vow (issue #321 U20)', async () => {
    silenceConsoleErrors();
    kiraVow.system.current = 0; renVow.system.current = 0;
    const card = await kiraRolls('gather_information', 'I comb the archive for word of Chen.');

    table.client('gm-1').click(card._id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();

    const forced = table.cards(f => f.forcedMoveId === 'reach_a_milestone').at(-1);
    expect(forced.speaker?.actor).toBe('pc-kira');
    expect({ kira: kiraVow.system.current, ren: renVow.system.current }).toEqual({ kira: 8, ren: 0 });
  }, 30_000);
});
