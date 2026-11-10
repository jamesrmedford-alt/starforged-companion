/**
 * PROBE R2U-6 — CHOOSE-BEFORE-ROLLING-TAKES-BOTH (RULES)
 * Sibling of the open RIDERS-IGNORE-UNCHECKED (known-issues.md:541) — that
 * one is an UNCHECKED ability's rider still firing; this is a CHECKED one
 * whose "choose one (before rolling)" is asked again after the roll.
 *
 * Vendored Gunner #1: "When you Strike, choose one (before rolling). Pin them
 * down: Add +1 and take +1 momentum on a hit. Make them hurt: Mark progress on
 * a hit." (Heavy Cannons #1, Engine Upgrade #2, Navigator #1, Homesteader #2,
 * Sensor Array #2, Service Pod #2 have the same shape: one option is a
 * pre-roll add, the other an outcome effect.)
 *
 * The module takes the choice twice:
 *   - before the roll, the scan offers Pin them down's +1 (adds 1) and the
 *     confirm dialog pre-checks it (src/ui/settingsPanel.js:2327-2330 —
 *     "Pre-check when there's a numeric add"); the roll takes it
 *     (src/moves/movePipeline.js:681-684 appliedAbilityAdds);
 *   - after the roll, the rider pass offers the same ability's options again
 *     as a free "Choose one" — +1 momentum, mark progress, or neither
 *     (src/index.js:6815-6864 applyMoveConsequenceRiders → riderDialog.js
 *     promptRiders :86-95). Nothing ties the choice group to the add the roll
 *     already took: the riders never read appliedAbilityKeys / the add
 *     (only resolver.js:1426 reads appliedAbilityKeys, for weakHitAsMiss).
 * So Kira strikes with Pin them down's +1 and then, seeing the hit, takes Make
 * them hurt's progress — both options, the choice made after the roll.
 *
 * Scenario (booted GM + player table; the real scan of the vendored Gunner
 * text; the rider extractor's output scripted to its contract — the two
 * options as one choiceGroup, as EXTRACT_SYSTEM asks; the confirm dialog's
 * default pre-check emulated; dice scripted to a strong hit):
 *   1. One fight is open ("Raiders", dangerous). Kira (iron 2) types "I open
 *      up on the raiders with Old Reliable" → Strike +iron; Gunner's +1 is
 *      taken (pre-checked, accepted).
 *   2. Strong hit: Strike marks progress twice (16 ticks).
 *   3. The GM's "Apply asset effects" prompt offers Gunner's "Choose one":
 *      +1 momentum / mark progress. The player's choice is "mark progress".
 *   Expected: with Pin them down taken before the roll, the prompt offers no
 *   Make them hurt; the fight stays at Strike's 16 ticks.
 *   Actual: the prompt offers both; the fight goes to 24 ticks (+1 add AND an
 *   extra mark).
 *
 * Control: the roll did take Gunner's +1 (the action score carries adds 1).
 */

/* global structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, riders: [] }));
vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/consequenceRiders.js', async (original) => ({
  ...(await original()), extractRiders: vi.fn(async () => structuredClone(control.riders)),
}));
// The confirm dialog as it opens: abilities with an add (or a stat swap) are
// pre-checked, and Accept applies what is checked (MoveConfirmDialog #onAccept
// → readMoveAbilitiesForm).
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async (interp) => {
    const checked = (interp.applicableAbilities ?? []).filter(a => Number(a.adds ?? 0) > 0 || a.statReplacement);
    interp.appliedAbilityAdds = checked.reduce((n, a) => n + Number(a.adds ?? 0), 0);
    interp.appliedAbilityKeys = checked.map(a => a.key);
    interp.appliedStatReplacement = null;
    return true;
  }),
}));
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const DIR = fileURLToPath(new URL('../../../vendor/foundry-ironsworn/json-packs/starforged-assets', import.meta.url));
const HAVE_VENDOR = fs.existsSync(DIR) && fs.readdirSync(DIR).length > 0;
function gunner() {
  const f = fs.readdirSync(DIR).find(n => n.startsWith('Gunner_'));
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  return { id: 'asset-gunner', name: d.name, type: 'asset',
    system: { category: d.system.category, abilities: d.system.abilities.map((a, i) => ({ ...a, enabled: i === 0 })) } };
}

let table, kira, journal;
// challenge 2, 3; action die 6 — iron 2 + 1 → 9: a strong hit
const STRONG = [0.15, 0.25, 0.99];

function progressJournal() {
  const flags = {};
  return {
    id: 'r2u6-progress', name: 'Starforged Progress Tracks',
    getFlag: (scope, key) => flags[`${scope}.${key}`],
    setFlag: async (scope, key, value) => { flags[`${scope}.${key}`] = structuredClone(value); },
  };
}
const fight = () => (journal.getFlag(MODULE_ID, 'tracks') ?? []).find(t => t.type === 'combat');
const gm = () => table.client('gm-1');
const riderPrompts = () => table.dialogs.filter(d => d.title.includes('Apply asset effects'));

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'r2u6-s1', sessionNumber: 1,
      currentSceneId: 'r2u6-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kira = table.addActor({ id: 'pc-kira-r2u6', name: 'Kira', ownership: { 'pl-1': 3 },
    system: { iron: 2 }, items: { contents: [gunner()] } });
  journal = progressJournal();
  table.journal._set(journal);
  const store = await gm().import('../../src/ui/progressTracks.js');
  await gm().run(() => store.addProgressTrack({ type: 'combat', label: 'Raiders', rank: 'dangerous' }));
  scriptClaude(table, { fallback: () => 'Rounds chew the bulkhead.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  // Gunner's two options, as the extractor's contract shapes a "choose one".
  control.riders = [{ key: 'asset-gunner:0', assetName: 'Gunner', abilityName: '', riders: [
    { condition: 'hit', resource: 'momentum', amount: 1, optional: false, choiceGroup: 'gunner-strike', label: 'Pin them down: +1 momentum' },
    { condition: 'hit', resource: 'progress', amount: 1, optional: false, choiceGroup: 'gunner-strike', label: 'Make them hurt: mark progress' },
  ] }];
  control.interpretation = { moveId: 'strike', moveName: 'Strike', statUsed: 'iron', adds: 0, moveTarget: null,
    rationale: 'Kira fires on the raiders', mischiefApplied: false };
  control.dice = STRONG;
  // The player's answer on the GM's prompt: Gunner's "mark progress".
  gm().answerDialogs(d => {
    if (!d.title.includes('Apply asset effects')) return d.close();
    const radios = d.form.querySelectorAll('input[name="choice-0"]');
    for (const r of radios) r.checked = r.getAttribute('value') === '1';
    return d.choose('apply');
  });
});
afterEach(async () => {
  gm().answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

async function kiraStrikes() {
  await table.client('pl-1').chat('I open up on the raiders with Old Reliable.', { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
}

describe.skipIf(!HAVE_VENDOR)('R2U-6 CHOOSE-BEFORE-ROLLING-TAKES-BOTH — a "choose one (before rolling)" is chosen again after the roll', () => {
  it("with Pin them down's +1 taken, the outcome prompt offers no Make them hurt", async () => {
    await kiraStrikes();
    const prompt = riderPrompts().at(-1);
    expect(prompt, 'the asset-effects prompt opened').toBeTruthy();
    expect(prompt.content).not.toContain('Make them hurt');
  }, 60_000);

  it("the fight gets Strike's two marks only — not Gunner's extra mark on top of its +1", async () => {
    await kiraStrikes();
    expect(fight().ticks).toBe(16);
  }, 60_000);

  it("control: the roll took Gunner's +1 — the Strike card reads 6 + 2 + 1 = 9, a strong hit", async () => {
    await kiraStrikes();
    const card = table.cards(f => f.moveResolution).at(-1);
    expect(card.content.replace(/\s+/g, ' ')).toMatch(/Action: 6 \+ 2 \+ 1 = <strong>9<\/strong>/);
    expect(card.content).toContain('sf-strong-hit');
  }, 60_000);
});
