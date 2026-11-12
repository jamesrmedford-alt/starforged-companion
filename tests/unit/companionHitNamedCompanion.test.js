/**
 * STARFORGED COMPANION
 * tests/unit/companionHitNamedCompanion.test.js
 *
 * Issue #345 AA45 (COMPANION-HIT-RENARRATE-NOTICE-FALSE) — the sibling of
 * issue #342 Z53 on the Companion Takes a Hit path.
 *
 * Vendored Companion Takes a Hit: "When your companion faces physical
 * hardship, they suffer -1 health … Then, if their health is 0 or you choose
 * to test their resilience, roll +your companion's health."
 *
 * With several companions the roll always took the healthiest
 * (statEnrichment.selectCompanionAsset), and its notice said "… using
 * "<healthiest>" … Re-narrate if you meant a different companion" — but
 * nothing read the narration, so re-narrating picked the same one. "The
 * glowcat is clipped by a ricochet" rolled the Rockhorn's +5 and harmed the
 * Rockhorn. The companion the move's target names, else the one its line
 * names (whole words, as Heal's companion is read), is now the one rolled;
 * the healthiest is the fallback when none is named, and the notice says
 * naming the companion picks it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
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

import { enrichInterpretationStatValue, resolveHealPatient } from '../../src/moves/statEnrichment.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let seq = 0;
function kira(companions) {
  const id = `pc-r2u4-${++seq}`;
  invalidateActorCache(id);
  return {
    id, name: 'Kira', type: 'character',
    system: {
      iron: 1, edge: 2, heart: 2, shadow: 1, wits: 3,
      health: { value: 5, max: 5 }, spirit: { value: 5, max: 5 }, supply: { value: 3, max: 5 },
      momentum: { value: 2, max: 10, min: -6, resetValue: 2 },
      debility: {}, xp: 0,
    },
    items: { contents: companions.map(c => ({
      id: c.id, name: c.name, type: 'asset',
      system: { category: 'Companion', abilities: [], track: { enabled: true, name: 'Health', value: c.health, min: 0, max: 5 },
        // The vendor asset's "Name" field: the name the player gives it.
        fields: [{ name: 'Name', value: c.given ?? '' }] },
    })) },
    getFlag: () => undefined,
  };
}

const NARRATION = 'The glowcat is clipped by a ricochet';

describe('issue #345 AA45 — the companion the move or its line names is the one rolled', () => {
  beforeEach(() => {
    global.ui.notifications.info = vi.fn();
  });

  it('Companion Takes a Hit for the named Glowcat rolls the Glowcat\'s health and targets it', () => {
    const actor = kira([
      { id: 'c-glowcat',  name: 'Glowcat',  health: 2 },
      { id: 'c-rockhorn', name: 'Rockhorn', health: 5 },
    ]);
    const interp = { moveId: 'companion_takes_a_hit', statUsed: 'companion_health', moveTarget: null, playerNarration: NARRATION };
    enrichInterpretationStatValue(actor, interp, {});
    expect({ statValue: interp.statValue, companionItemId: interp.companionItemId })
      .toEqual({ statValue: 2, companionItemId: 'c-glowcat' });
  });

  it('naming it as the move\'s target picks it too', () => {
    const actor = kira([
      { id: 'c-glowcat',  name: 'Glowcat',  health: 2 },
      { id: 'c-rockhorn', name: 'Rockhorn', health: 5 },
    ]);
    const interp = { moveId: 'companion_takes_a_hit', statUsed: 'companion_health', moveTarget: 'Glowcat', playerNarration: NARRATION };
    enrichInterpretationStatValue(actor, interp, {});
    expect(interp.companionItemId).toBe('c-glowcat');
  });

  it('control: one companion — the roll is that companion\'s', () => {
    const actor = kira([{ id: 'c-glowcat', name: 'Glowcat', health: 2 }]);
    const interp = { moveId: 'companion_takes_a_hit', statUsed: 'companion_health', moveTarget: null, playerNarration: NARRATION };
    enrichInterpretationStatValue(actor, interp, {});
    expect({ statValue: interp.statValue, companionItemId: interp.companionItemId })
      .toEqual({ statValue: 2, companionItemId: 'c-glowcat' });
  });

  it('control: a Heal for the named companion already resolves the name', () => {
    const actor = kira([
      { id: 'c-glowcat',  name: 'Glowcat',  health: 2 },
      { id: 'c-rockhorn', name: 'Rockhorn', health: 5 },
    ]);
    const interp = { moveId: 'heal', statUsed: 'heart', moveTarget: 'the glowcat', playerNarration: 'I get the glowcat to a vet' };
    resolveHealPatient(interp, actor, { players: [actor] });
    expect(interp.patientCompanionItemId).toBe('c-glowcat');
  });
});

describe("COMPANION-GIVEN-NAME-UNREAD — a companion named by the name the player gave it", () => {
  beforeEach(() => {
    global.ui.notifications.info = vi.fn();
  });
  const pair = () => kira([
    { id: 'c-glowcat',  name: 'Glowcat',  health: 2, given: 'Pip' },
    { id: 'c-rockhorn', name: 'Rockhorn', health: 5, given: 'Old Tusk' },
  ]);

  it("Companion Takes a Hit for \"Pip\" rolls the Glowcat's health and targets it", () => {
    const actor = pair();
    const interp = { moveId: 'companion_takes_a_hit', statUsed: 'companion_health', moveTarget: null,
      playerNarration: 'Pip is clipped by a ricochet' };
    enrichInterpretationStatValue(actor, interp, {});
    expect({ statValue: interp.statValue, companionItemId: interp.companionItemId })
      .toEqual({ statValue: 2, companionItemId: 'c-glowcat' });
    expect(global.ui.notifications.info).not.toHaveBeenCalled();
  });

  it('the given name as the move target, and a Heal for it, pick it too', () => {
    const actor = pair();
    // Each is the one the fallback would not pick: the healthiest is rolled,
    // the most hurt is healed.
    const hit = { moveId: 'companion_takes_a_hit', statUsed: 'companion_health', moveTarget: 'Pip', playerNarration: 'x' };
    enrichInterpretationStatValue(actor, hit, {});
    expect(hit.companionItemId).toBe('c-glowcat');
    const heal = { moveId: 'heal', statUsed: 'heart', moveTarget: 'Old Tusk', playerNarration: 'I patch up Old Tusk' };
    resolveHealPatient(heal, actor, { players: [actor] });
    expect(heal.patientCompanionItemId).toBe('c-rockhorn');
  });

  it('control: a line naming both companions picks neither — the healthiest is rolled, with the notice', () => {
    const actor = pair();
    const interp = { moveId: 'companion_takes_a_hit', statUsed: 'companion_health', moveTarget: null,
      playerNarration: 'Pip and the rockhorn are caught in the blast' };
    enrichInterpretationStatValue(actor, interp, {});
    expect(interp.statValue).toBe(5);
    expect(global.ui.notifications.info).toHaveBeenCalled();
  });
});

describe('issue #345 AA45 — the notice says what picks another companion', () => {
  beforeEach(() => { global.ui.notifications.info = vi.fn(); });
  const two = () => kira([{ id: 'c-glowcat', name: 'Glowcat', health: 2 }, { id: 'c-rockhorn', name: 'Rockhorn', health: 5 }]);

  it('with none named, the healthiest is rolled and the notice says to name the companion — not to re-narrate', () => {
    const interp = { moveId: 'companion_takes_a_hit', statUsed: 'companion_health', moveTarget: null, playerNarration: 'A ricochet whines past.' };
    enrichInterpretationStatValue(two(), interp, {});
    expect(interp.companionItemId).toBe('c-rockhorn');
    const [[notice]] = global.ui.notifications.info.mock.calls;
    expect(notice).toContain('Rockhorn');
    expect(notice).toMatch(/Name the companion in your line/);
    expect(notice).not.toMatch(/Re-narrate/);
  });

  it('a named companion is rolled with no notice', () => {
    const interp = { moveId: 'companion_takes_a_hit', statUsed: 'companion_health', moveTarget: null, playerNarration: NARRATION };
    enrichInterpretationStatValue(two(), interp, {});
    expect(global.ui.notifications.info).not.toHaveBeenCalled();
  });
});

describe('issue #345 AA45 — a typed Companion Takes a Hit for the named companion lands on it (booted table)', () => {
  let table, actor, glow, rock;
  // challenge 3, 4; action die 6 — +2 → 8: a strong hit
  const STRONG = [0.25, 0.35, 0.9];
  const asset = (id, name, value) => {
    const item = { id, name, type: 'asset',
      system: { category: 'Companion', abilities: [], track: { enabled: true, name: 'Health', value, min: 0, max: 5 } },
      update: async (changes) => { if ('system.track.value' in changes) item.system.track.value = changes['system.track.value']; } };
    return item;
  };

  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'aa45-s1', sessionNumber: 1,
        currentSceneId: 'aa45-scene', sceneTruths: [], clocks: [] },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-test');
    glow = asset('c-glowcat', 'Glowcat', 2);
    rock = asset('c-rockhorn', 'Rockhorn', 4);
    actor = table.addActor({ id: 'pc-kira-aa45', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [glow, rock] } });
    scriptClaude(table, { fallback: () => 'The glowcat shakes it off.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
    control.interpretation = { moveId: 'companion_takes_a_hit', moveName: 'Companion Takes a Hit', statUsed: 'companion_health',
      adds: 0, moveTarget: null, rationale: 'test', mischiefApplied: false };
    control.dice = STRONG;
  });

  it("rolls the Glowcat's health and its strong hit's +1 health is the Glowcat's — the healthier Rockhorn is untouched", async () => {
    await table.client('pl-1').chat(NARRATION + '.', { speaker: { actor: actor.id } });
    await table.settle(); await table.drain();
    const card = table.cards(f => f.moveResolution).at(-1);
    expect(card.content.replace(/\s+/g, ' ')).toContain('+companion_health (2)');
    expect({ glow: glow.system.track.value, rock: rock.system.track.value }).toEqual({ glow: 3, rock: 4 });
  }, 60_000);
});
