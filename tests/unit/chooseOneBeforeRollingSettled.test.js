/**
 * STARFORGED COMPANION
 * tests/unit/chooseOneBeforeRollingSettled.test.js
 *
 * Issue #345 AA12 (CHOOSE-BEFORE-ROLLING-TAKES-BOTH) — a sibling of the open
 * RIDERS-IGNORE-UNCHECKED: that one is an unchecked ability's rider still
 * firing; this is a checked one whose "choose one (before rolling)" was asked
 * again after the roll.
 *
 * Vendored Gunner #1: "When you Strike, choose one (before rolling). Pin them
 * down: Add +1 and take +1 momentum on a hit. Make them hurt: Mark progress
 * on a hit." (Heavy Cannons, Engine Upgrade, Navigator, Homesteader, Sensor
 * Array, Service Pod and Explorer have the same shape: one option adds to the
 * roll.) The confirm dialog pre-checks Pin them down's +1 and the roll takes
 * it; after the roll the asset-effects prompt offered the same ability's
 * options again as a free "Choose one", so Kira took the +1 AND, seeing the
 * hit, Make them hurt's mark. Taking the add is now the choice: its option's
 * effects are the outcome's, the other options are not offered; not taking
 * it drops that option, and the others stay the choice.
 *
 * The booted table: the real scan of the vendored Gunner text; the rider
 * extractor's output scripted to its contract (one choiceGroup per "choose
 * one"); the confirm dialog's default pre-check emulated; dice scripted.
 */

/* global structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, riders: [], uncheck: false, answer: '0' }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../src/moves/consequenceRiders.js', async (original) => ({
  ...(await original()), extractRiders: vi.fn(async () => structuredClone(control.riders)),
}));
// The confirm dialog as it opens: abilities with an add (or a stat swap) are
// pre-checked, and Accept applies what is checked (MoveConfirmDialog #onAccept
// → readMoveAbilitiesForm) — or the player unchecks them all (control.uncheck).
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async (interp) => {
    const checked = control.uncheck ? [] : (interp.applicableAbilities ?? []).filter(a => Number(a.adds ?? 0) > 0 || a.statReplacement);
    interp.appliedAbilityAdds = checked.reduce((n, a) => n + Number(a.adds ?? 0), 0);
    interp.appliedAbilityKeys = checked.map(a => a.key);
    interp.appliedStatReplacement = null;
    return true;
  }),
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
import { scanForApplicableAbilities } from '../../src/moves/abilityScanner.js';
import { settlePreRollChoices, normaliseRider } from '../../src/moves/consequenceRiders.js';

const DIR = fileURLToPath(new URL('../../vendor/foundry-ironsworn/json-packs/starforged-assets', import.meta.url));
const HAVE_VENDOR = fs.existsSync(DIR) && fs.readdirSync(DIR).length > 0;
function vendoredAsset(assetName, index, id = `asset-${assetName.toLowerCase().replace(/ /g, '-')}`) {
  const f = fs.readdirSync(DIR).find(n => n.startsWith(assetName.replace(/ /g, '_') + '_'));
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  return { id, name: d.name, type: 'asset',
    system: { category: d.system.category, abilities: d.system.abilities.map((a, i) => ({ ...a, enabled: i === index })) } };
}

describe.skipIf(!HAVE_VENDOR)('issue #345 AA12 — a "choose one (before rolling)" is settled by its add (booted table)', () => {
  let table, kira, journal;
  // challenge 2, 3; action die 6 — iron 2 (+1) → a strong hit either way
  const STRONG = [0.15, 0.25, 0.99];

  function progressJournal() {
    const flags = {};
    return {
      id: 'aa12-progress', name: 'Starforged Progress Tracks',
      getFlag: (scope, key) => flags[`${scope}.${key}`],
      setFlag: async (scope, key, value) => { flags[`${scope}.${key}`] = structuredClone(value); },
    };
  }
  const fight = () => (journal.getFlag(MODULE_ID, 'tracks') ?? []).find(t => t.type === 'combat');
  const gm = () => table.client('gm-1');
  const riderPrompts = () => table.dialogs.filter(d => d.title.includes('Apply asset effects'));
  const riderSummary = () => table.cards(f => f.riderSummary).at(-1)?.content ?? '';

  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'aa12-s1', sessionNumber: 1,
        currentSceneId: 'aa12-scene', sceneTruths: [], clocks: [] },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-test');
    kira = table.addActor({ id: 'pc-kira-aa12', name: 'Kira', ownership: { 'pl-1': 3 },
      system: { iron: 2 }, items: { contents: [vendoredAsset('Gunner', 0, 'asset-gunner')] } });
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
    control.uncheck = false;
    // The player's answer on the GM's prompt: Gunner's "mark progress" — the
    // second option when both are offered.
    control.answer = '1';
    gm().answerDialogs(d => {
      if (!d.title.includes('Apply asset effects')) return d.close();
      for (const r of d.form.querySelectorAll('input[name="choice-0"]')) r.checked = r.getAttribute('value') === control.answer;
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

  it("with Pin them down's +1 taken, no prompt offers Make them hurt — Pin them down's +1 momentum lands", async () => {
    await kiraStrikes();
    expect(riderPrompts().filter(p => p.content.includes('Make them hurt'))).toEqual([]);
    expect(riderSummary()).toContain('Pin them down: +1 momentum');
    expect(kira.system.momentum.value).toBe(3);
  }, 60_000);

  it("the fight gets Strike's two marks only — not Gunner's extra mark on top of its +1", async () => {
    await kiraStrikes();
    expect(fight().ticks).toBe(16);
  }, 60_000);

  it('Gunner unchecked (Make them hurt chosen): the prompt offers Make them hurt, not Pin them down — its mark lands', async () => {
    control.uncheck = true;
    control.answer = '0';   // Make them hurt, the one option left
    await kiraStrikes();
    const prompt = riderPrompts().at(-1);
    expect(prompt, 'the asset-effects prompt opened').toBeTruthy();
    expect(prompt.content).toContain('Make them hurt');
    expect(prompt.content).not.toContain('Pin them down');
    expect(fight().ticks).toBe(24);
    expect(kira.system.momentum.value).toBe(2);
  }, 60_000);

  it("control: the roll took Gunner's +1 — the Strike card reads 6 + 2 + 1 = 9, a strong hit", async () => {
    await kiraStrikes();
    const card = table.cards(f => f.moveResolution).at(-1);
    expect(card.content.replace(/\s+/g, ' ')).toMatch(/Action: 6 \+ 2 \+ 1 = <strong>9<\/strong>/);
    expect(card.content).toContain('sf-strong-hit');
  }, 60_000);
});

describe('issue #345 AA12 — settlePreRollChoices', () => {
  const choice = { option: 'Pin them down', options: ['Pin them down', 'Make them hurt'] };
  const abilities = [{ key: 'g:0', preRollChoice: choice }, { key: 'v:0', preRollChoice: null }];
  const rider = (over) => normaliseRider({ condition: 'hit', resource: 'momentum', amount: 1, choiceGroup: 'g', ...over }, 'Gunner');
  const pin  = rider({ label: '+1 momentum', option: 'Pin them down' });
  const hurt = rider({ resource: 'progress', label: 'mark progress', option: 'Make them hurt' });
  const labels = (out) => out.flatMap(e => e.riders.map(r => `${r.label}|${r.choiceGroup ?? '-'}`));

  it("the add taken: its option's effects are the outcome's own, the other options are gone", () => {
    const out = settlePreRollChoices([{ key: 'g:0', riders: [pin, hurt] }], abilities, ['g:0']);
    expect(labels(out)).toEqual(['+1 momentum|-']);
  });

  it('the add not taken: its option is gone, the others stay the choice', () => {
    const out = settlePreRollChoices([{ key: 'g:0', riders: [pin, hurt] }], abilities, []);
    expect(labels(out)).toEqual(['mark progress|g']);
  });

  it('an option named only by the label is read from it', () => {
    const out = settlePreRollChoices([{ key: 'g:0', riders: [
      rider({ label: 'Pin them down: +1 momentum' }), rider({ resource: 'progress', label: 'Make them hurt: mark progress' }),
    ] }], abilities, ['g:0']);
    expect(labels(out)).toEqual(['Pin them down: +1 momentum|-']);
  });

  it('with the add taken, a rider in the choice that names no option is dropped; one outside the choice stands', () => {
    const out = settlePreRollChoices([{ key: 'g:0', riders: [
      rider({ label: '+2 momentum', amount: 2 }), rider({ label: '+1 momentum', choiceGroup: null }),
    ] }], abilities, ['g:0']);
    expect(labels(out)).toEqual(['+1 momentum|-']);
    expect(labels(settlePreRollChoices([{ key: 'g:0', riders: [rider({ label: '+2 momentum', amount: 2 })] }], abilities, [])))
      .toEqual(['+2 momentum|g']);
  });

  it('an ability with no pre-roll choice, or no scan to read, keeps its riders as extracted', () => {
    const extracted = [{ key: 'v:0', riders: [pin, hurt] }];
    expect(settlePreRollChoices(extracted, abilities, ['v:0'])).toEqual(extracted);
    expect(settlePreRollChoices(extracted, undefined, undefined)).toEqual(extracted);
  });
});

describe.skipIf(!HAVE_VENDOR)('issue #345 AA12 — the scan marks an add that is one option of a "choose one"', () => {
  async function choiceFor(assetName, index, moveId, moveName) {
    const actor = { id: 'pc-kira', name: 'Kira', type: 'character', system: { iron: 2, edge: 2, heart: 2, shadow: 1, wits: 2 },
      items: { contents: [vendoredAsset(assetName, index)] } };
    const [found] = await scanForApplicableAbilities({ moveId, moveName, narration: 'x', apiKey: '', commandShipActor: null, characterActor: actor });
    return found?.preRollChoice ?? null;
  }

  it('the vendored "choose one" whose option adds to the roll name that option', async () => {
    expect(await choiceFor('Gunner', 0, 'strike', 'Strike')).toEqual({ option: 'Pin them down', options: ['Pin them down', 'Make them hurt'] });
    expect((await choiceFor('Engine Upgrade', 1, 'enter_the_fray', 'Enter the Fray'))?.option).toBe('Maneuver');
    expect((await choiceFor('Heavy Cannons', 0, 'strike', 'Strike'))?.option).toBe('Strafing run');
    expect((await choiceFor('Homesteader', 1, 'sojourn', 'Sojourn'))?.option).toBe('Stay a bit');
    expect((await choiceFor('Navigator', 0, 'set_a_course', 'Set a Course'))?.option).toBe('Follow the safest path');
    expect((await choiceFor('Sensor Array', 1, 'secure_an_advantage', 'Secure an Advantage'))?.option).toBe('Manual scan');
    expect((await choiceFor('Service Pod', 1, 'face_danger', 'Face Danger'))?.option).toBe('Careful');
    expect((await choiceFor('Explorer', 1, 'hearten', 'Hearten'))?.option).toBe('Soak it all in');
  });

  it("control: an add the ability's lead gives, or a choice with no add, is no pre-roll choice", async () => {
    expect(await choiceFor('Bounty Hunter', 1, 'gather_information', 'Gather Information')).toBeNull();
    expect(await choiceFor('Veteran', 1, 'make_a_connection', 'Make a Connection')).toBeNull();
  });
});
