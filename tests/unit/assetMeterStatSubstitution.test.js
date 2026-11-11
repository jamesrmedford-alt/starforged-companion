/**
 * STARFORGED COMPANION
 * tests/unit/assetMeterStatSubstitution.test.js
 *
 * Issue #345 AA10 (ASSET-METER-STAT-SUB-DROPPED). Some assets let a move be
 * rolled with a meter instead of its stat — the vendored text:
 *   Trader #1        "When you Sojourn or Compel, you may roll +supply."
 *   Weapon Master #3 "When you Secure an Advantage by suiting up …, you may roll +supply."
 *   Seer #2          "When you focus or meditate to Gather Information …, roll +spirit"
 *   Rover #3         "When you Face Danger or React Under Fire by taking a hit …, you may roll +integrity."
 *   Survey Bot #3    "… or Face Danger to detect a threat, roll +its health"
 *   Sidekick #3      "… you may Face Danger or React Under Fire and roll +their health"
 * (about twenty abilities in all). The ability scanner offered only the five
 * action stats — a code comment held that meters "never substitute" — and
 * the confirm dialog has no stat picker (issue #325 W19), so these rolls could
 * never be made. A swap to a vehicle's integrity or a companion's health now
 * rolls that asset's own track, not the command vehicle's or the healthiest
 * companion's.
 *
 * The scan reads the vendored ability HTML with no mocks (skipped without the
 * submodule); the composition rolls a typed move on a booted table through
 * the real scan, the confirm form (renderMoveAbilitiesForm /
 * readMoveAbilitiesForm, with its stat radio picked) and the real pipeline.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
// The confirm dialog as its player answers it: the form it renders (the real
// renderMoveAbilitiesForm — abilities with an add or a swap pre-checked), the
// "Substitute +<stat>" radio picked, and Accept read as the dialog reads it
// (readMoveAbilitiesForm, MoveConfirmDialog #onAccept).
vi.mock('../../src/ui/settingsPanel.js', async (original) => {
  const real = await original();
  const { parseHTML } = await import('../helpers/cardDom.js');
  return { ...real, confirmInterpretation: vi.fn(async (interp) => {
    const root = parseHTML(`<div>${real.renderMoveAbilitiesForm(interp.applicableAbilities ?? [], interp.statUsed)}</div>`);
    const radio = root.querySelector('input[name="sf-stat-sub"]:not([value=""])');
    if (radio) {
      for (const r of root.querySelectorAll('input[name="sf-stat-sub"]')) r.checked = false;
      radio.checked = true;
    }
    const { total, applied, pickedStat } = real.readMoveAbilitiesForm(root);
    interp.appliedAbilityAdds = total;
    interp.appliedAbilityKeys = applied;
    interp.appliedStatReplacement = pickedStat || null;
    return true;
  }) };
});
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { scanForApplicableAbilities, parseHaikuResponse } from '../../src/moves/abilityScanner.js';
import { enrichInterpretationStatValue } from '../../src/moves/statEnrichment.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const DIR = fileURLToPath(new URL('../../vendor/foundry-ironsworn/json-packs/starforged-assets', import.meta.url));
const HAVE_VENDOR = fs.existsSync(DIR) && fs.readdirSync(DIR).length > 0;

/** The vendored asset's ability HTML, as the system stores it on the Item. */
function vendoredAbility(assetName, index) {
  const f = fs.readdirSync(DIR).find(n => n.startsWith(assetName.replace(/ /g, '_') + '_'));
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  return { name: d.name, category: d.system.category, description: d.system.abilities[index].description, track: d.system.track };
}

/** A vendor-shaped asset Item with one ability enabled, its own condition track at `value`. */
function vendoredAsset(id, assetName, index, value = null) {
  const ab = vendoredAbility(assetName, index);
  return { id, name: ab.name, type: 'asset',
    system: { category: ab.category, abilities: [{ enabled: true, description: ab.description }],
      ...(ab.track?.enabled ? { track: { ...ab.track, value: value ?? ab.track.value } } : {}) } };
}

/** The scan's stat offers for one enabled ability, as the confirm dialog gets them. */
async function offeredStats(assetName, index, moveId, moveName) {
  const ab = vendoredAbility(assetName, index);
  const characterActor = {
    id: 'pc-kira', name: 'Kira', type: 'character', system: { heart: 2, wits: 2, iron: 1, edge: 1, shadow: 1 },
    items: { contents: [{ id: 'asset-1', name: ab.name, type: 'asset',
      system: { category: ab.category, abilities: [{ enabled: true, description: ab.description }] } }] },
  };
  const found = await scanForApplicableAbilities({
    moveId, moveName, narration: 'test', apiKey: '', commandShipActor: null, characterActor,
  });
  return found.map(a => a.statReplacement ?? null);
}

describe.skipIf(!HAVE_VENDOR)('issue #345 AA10 — a meter an asset says to roll is offered as the move\'s stat', () => {
  it("Trader's 'When you Sojourn or Compel, you may roll +supply' offers +supply on a Compel", async () => {
    expect(await offeredStats('Trader', 0, 'compel', 'Compel')).toEqual(['supply']);
  });

  it('Trader offers +supply on a Sojourn too', async () => {
    expect(await offeredStats('Trader', 0, 'sojourn', 'Sojourn')).toEqual(['supply']);
  });

  it("Weapon Master's 'you may roll +supply' offers +supply on Secure an Advantage", async () => {
    expect(await offeredStats('Weapon Master', 2, 'secure_an_advantage', 'Secure an Advantage')).toEqual(['supply']);
  });

  it("Seer's 'Gather Information …, roll +spirit' offers +spirit", async () => {
    expect(await offeredStats('Seer', 1, 'gather_information', 'Gather Information')).toEqual(['spirit']);
  });

  it("a vehicle's '+integrity' and a companion's '+its health' / '+their health' are offered as its track", async () => {
    expect(await offeredStats('Snub Fighter', 0, 'enter_the_fray', 'Enter the Fray')).toEqual(['integrity']);
    expect(await offeredStats('Rover', 2, 'face_danger', 'Face Danger')).toEqual(['integrity']);
    expect(await offeredStats('Survey Bot', 2, 'face_danger', 'Face Danger')).toEqual(['companion_health']);
    expect(await offeredStats('Sidekick', 2, 'react_under_fire', 'React Under Fire')).toEqual(['companion_health']);
  });

  it('control: an action-stat swap (Revenant\'s "you may roll +heart" on Gather Information) is offered', async () => {
    expect(await offeredStats('Revenant', 2, 'gather_information', 'Gather Information')).toEqual(['heart']);
  });

  it("control: a meter rolled for the ability's own roll on a no-roll move is no swap (Internal Refit on Sacrifice Resources)", async () => {
    expect(await offeredStats('Internal Refit', 1, 'sacrifice_resources', 'Sacrifice Resources')).toEqual([null]);
  });
});

describe('issue #345 AA10 — the Haiku pass may name a meter', () => {
  const reply = (statReplacement) => JSON.stringify({ matches: [{ key: 'a1:0', summary: 's', statReplacement }] });

  it('keeps a meter the fallback pass names (+supply, a companion\'s health)', () => {
    expect(parseHaikuResponse(reply('supply'))[0].statReplacement).toBe('supply');
    expect(parseHaikuResponse(reply('companion_health'))[0].statReplacement).toBe('companion_health');
  });

  it('control: anything else is dropped', () => {
    expect(parseHaikuResponse(reply('momentum'))[0].statReplacement).toBeNull();
    expect(parseHaikuResponse(reply('cargo'))[0].statReplacement).toBeNull();
  });
});

describe('issue #345 AA10 — the swap rolls the swapping asset\'s own track', () => {
  const MOD = 'starforged-companion';
  const companion = (id, name, value) => ({ id, name, type: 'asset',
    system: { category: 'Companion', abilities: [], track: { enabled: true, name: 'Health', value, min: 0, max: 5 } } });
  const vehicle = (id, name, value) => ({ id, name, type: 'asset',
    system: { category: 'Support Vehicle', abilities: [], track: { enabled: true, name: 'Integrity', value, min: 0, max: 5 },
      conditions: [{ name: 'Battered', ticked: false }] } });
  let seq = 0;
  const kiraWith = (...items) => {
    const id = `pc-aa10-${++seq}`;
    invalidateActorCache(id);
    return { id, name: 'Kira', type: 'character',
      system: { edge: 1, heart: 2, iron: 1, shadow: 1, wits: 2, health: { value: 5 }, spirit: { value: 4 }, supply: { value: 3 },
        momentum: { value: 2, max: 10, min: -6, resetValue: 2 }, debility: {} },
      items: { contents: items }, getFlag: () => undefined };
  };
  const state = { shipIds: ['ship-1'] };
  beforeEach(() => {
    global.game.actors._reset();
    global.game.actors._set('ship-1', { id: 'ship-1', type: 'starship', system: {},
      flags: { [MOD]: { ship: { isCommandVehicle: true, integrity: 5 } } } });
    global.ui.notifications.info = vi.fn();
  });

  it("the Rover's '+integrity' rolls the Rover's track and its choices change the Rover, not the starship", () => {
    const kira = kiraWith(vehicle('asset-rover', 'Rover', 3), vehicle('asset-skiff', 'Skiff', 1));
    const interp = { moveId: 'face_danger', statUsed: 'integrity', statSubstitutedFrom: 'edge',
      statSubstitutedAssetId: 'asset-rover', playerNarration: 'I floor it through the barricade.' };
    enrichInterpretationStatValue(kira, interp, state);
    expect({ statValue: interp.statValue, vehicleItemId: interp.vehicleItemId, vehicleActorId: interp.vehicleActorId })
      .toEqual({ statValue: 3, vehicleItemId: 'asset-rover', vehicleActorId: null });
  });

  it("a companion's '+its health' rolls that companion's health, not the healthiest one's", () => {
    const kira = kiraWith(companion('c-bot', 'Survey Bot', 2), companion('c-rock', 'Rockhorn', 5));
    const interp = { moveId: 'face_danger', statUsed: 'companion_health', statSubstitutedFrom: 'wits',
      statSubstitutedAssetId: 'c-bot', playerNarration: 'I send the bot ahead to sniff out the trap.' };
    enrichInterpretationStatValue(kira, interp, state);
    expect({ statValue: interp.statValue, companionItemId: interp.companionItemId }).toEqual({ statValue: 2, companionItemId: 'c-bot' });
    expect(global.ui.notifications.info).not.toHaveBeenCalled();
  });

  it("control: a roller's meter (+supply) is read off the sheet", () => {
    const interp = { moveId: 'compel', statUsed: 'supply', statSubstitutedFrom: 'heart', statSubstitutedAssetId: 'asset-trader' };
    enrichInterpretationStatValue(kiraWith(), interp, state);
    expect(interp.statValue).toBe(3);
  });

  it('control: a Withstand Damage with no swap still rolls the command vehicle', () => {
    const interp = { moveId: 'withstand_damage', statUsed: 'integrity', playerNarration: 'The hull groans.' };
    enrichInterpretationStatValue(kiraWith(vehicle('asset-rover', 'Rover', 3)), interp, state);
    expect(interp).toMatchObject({ statValue: 5, vehicleActorId: 'ship-1' });
  });
});

describe.skipIf(!HAVE_VENDOR)('issue #345 AA10 — a typed move rolls the meter its asset offers (booted table)', () => {
  let table, kira;
  // challenge 2, 3; action die 6 — a strong hit at any stat here
  const STRONG = [0.15, 0.25, 0.99];

  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, 'riders.autoApply': false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'aa10-s1', sessionNumber: 1,
        currentSceneId: 'aa10-scene', sceneTruths: [], clocks: [], shipIds: ['ship-wayfarer'] },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-test');
    table.addActor({ id: 'ship-wayfarer', name: 'Wayfarer', type: 'starship', flags: { [MODULE_ID]: {
      entityType: 'ship', ship: { _id: 'ship-rec', name: 'Wayfarer', isCommandVehicle: true, integrity: 5, integrityMax: 5, battered: false },
    } } });
    scriptClaude(table, { fallback: () => 'It holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  });

  async function kiraRolls(items, interpretation, line) {
    kira = table.addActor({ id: `pc-kira-${Math.random().toString(36).slice(2, 8)}`, name: 'Kira', ownership: { 'pl-1': 3 },
      system: { heart: 1, edge: 1, wits: 1, supply: { value: 3 } }, items: { contents: items } });
    control.interpretation = { adds: 0, moveTarget: null, rationale: 'test', mischiefApplied: false, ...interpretation };
    control.dice = STRONG;
    await table.client('pl-1').chat(line, { speaker: { actor: kira.id } });
    await table.settle(); await table.drain();
    return table.cards(f => f.moveResolution).at(-1)?.content.replace(/\s+/g, ' ') ?? '';
  }

  it("Trader's Compel, its +supply picked, rolls Kira's supply", async () => {
    const card = await kiraRolls([vendoredAsset('asset-trader', 'Trader', 0)],
      { moveId: 'compel', moveName: 'Compel', statUsed: 'heart' }, 'I lean on the dockmaster — I can make this worth his while.');
    expect(card).toContain('+supply (3)');
  }, 60_000);

  it("the Rover's Face Danger, its +integrity picked, rolls the Rover's own integrity — not the Wayfarer's 5", async () => {
    const card = await kiraRolls([vendoredAsset('asset-rover', 'Rover', 2, 3)],
      { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge' }, 'I floor it and smash straight through the barricade.');
    expect(card).toContain('+integrity (3)');
  }, 60_000);

  it("the Survey Bot's Face Danger, its +its health picked, rolls the bot's health — not the healthier Glowcat's", async () => {
    const glowcat = { id: 'c-glowcat', name: 'Glowcat', type: 'asset',
      system: { category: 'Companion', abilities: [], track: { enabled: true, name: 'Health', value: 4, min: 0, max: 4 } } };
    const card = await kiraRolls([vendoredAsset('c-survey', 'Survey Bot', 2, 2), glowcat],
      { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'wits' }, 'I send the bot ahead to sniff out the tripwires.');
    expect(card).toContain('+companion_health (2)');
  }, 60_000);
});
