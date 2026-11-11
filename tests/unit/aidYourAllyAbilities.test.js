/**
 * STARFORGED COMPANION
 * tests/unit/aidYourAllyAbilities.test.js
 *
 * Issue #345 AA11 (AID-YOUR-ALLY-ABILITIES-UNKEYED) — the sibling of
 * SCENE-VARIANT-ABILITIES-UNKEYED on the Aid Your Ally path.
 *
 * Vendored Aid Your Ally: "When you act in direct support of an ally, envision
 * how you aid them. Then, Secure an Advantage or Gain Ground to take action."
 * The module resolves the aid as one — Gain Ground while a fight is open, else
 * Secure an Advantage (issue #325 W17) — but its ability scan matched the
 * move's own name only: Veteran's "When you Secure an Advantage or Gain Ground
 * by recounting … a hard-won lesson …, add +1" was never offered when aiding,
 * and once Loyalist ("When you Aid Your Ally, add +1") matched, the Haiku pass
 * was skipped. Aid Your Ally is now matched as itself and as the move it is
 * made as (sceneChallenge.assetMatchMove's `madeAs`): each ability's add and
 * stat are read for the move its links name, and the rider prompt says what
 * the aid is made as.
 *
 * The scan reads the vendored ability HTML (skipped without the submodule);
 * the in-fight case rolls a typed aid on a booted table with a fight open.
 */

/* global structuredClone */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
// The Haiku fallback pass, answered at its transport in the keyed test (once);
// everything else reaches the table's Claude.
vi.mock('../../src/api-proxy.js', async (original) => {
  const real = await original();
  return { ...real, apiPost: vi.fn(real.apiPost) };
});
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
// The confirm dialog as it opens: abilities with an add are pre-checked, and
// Accept applies what is checked (MoveConfirmDialog #onAccept).
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async (interp) => {
    const checked = (interp.applicableAbilities ?? []).filter(a => Number(a.adds ?? 0) > 0);
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

import { apiPost } from '../../src/api-proxy.js';
import { scanForApplicableAbilities } from '../../src/moves/abilityScanner.js';
import { extractRiders } from '../../src/moves/consequenceRiders.js';
import { assetMatchMove } from '../../src/moves/sceneChallenge.js';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const DIR = fileURLToPath(new URL('../../vendor/foundry-ironsworn/json-packs/starforged-assets', import.meta.url));
const HAVE_VENDOR = fs.existsSync(DIR) && fs.readdirSync(DIR).length > 0;

function vendoredAsset(assetName, index, id) {
  const f = fs.readdirSync(DIR).find(n => n.startsWith(assetName.replace(/ /g, '_') + '_'));
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const abilities = d.system.abilities.map((a, i) => ({ enabled: i === index, description: a.description }));
  return { id, name: d.name, type: 'asset', system: { category: d.system.category, abilities } };
}

function kira(...assets) {
  return {
    id: 'pc-kira', name: 'Kira', type: 'character',
    system: { heart: 2, wits: 3, iron: 1, edge: 1, shadow: 1 },
    items: { contents: assets },
  };
}

const NARRATION = 'I talk Ren through the breach the way we did it at Kell Station';

async function offered(moveId, moveName, actor, { inFight = false } = {}) {
  const found = await scanForApplicableAbilities({
    moveId, moveName, narration: NARRATION, apiKey: '', commandShipActor: null, characterActor: actor, inFight,
  });
  return found.map(a => ({ asset: a.assetName, adds: a.adds }));
}

describe.skipIf(!HAVE_VENDOR)('issue #345 AA11 — the aid is a Secure an Advantage: its abilities are offered', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("Aid Your Ally offers Veteran's Secure an Advantage +1 beside Loyalist's", async () => {
    const actor = kira(vendoredAsset('Loyalist', 0, 'a-loyal'), vendoredAsset('Veteran', 2, 'a-vet'));
    const got = await offered('aid_your_ally', 'Aid Your Ally', actor);
    expect(got).toEqual(expect.arrayContaining([
      { asset: 'Loyalist', adds: 1 },
      { asset: 'Veteran',  adds: 1 },
    ]));
  });

  it("with no Aid Your Ally ability, the aid still offers Veteran's +1", async () => {
    const actor = kira(vendoredAsset('Veteran', 2, 'a-vet'));
    expect(await offered('aid_your_ally', 'Aid Your Ally', actor)).toEqual([{ asset: 'Veteran', adds: 1 }]);
  });

  it("with a key, Veteran is offered for the aid with its +1 (no Haiku pass reading it as another move's)", async () => {
    apiPost.mockResolvedValueOnce({ content: [{ type: 'text', text: JSON.stringify({ matches: [
      { key: 'a-vet:2', summary: 'Recalling the Kell Station lesson adds +1.', statReplacement: null },
    ] }) }] });
    const actor = kira(vendoredAsset('Veteran', 2, 'a-vet'));
    const found = await scanForApplicableAbilities({
      moveId: 'aid_your_ally', moveName: 'Aid Your Ally', narration: NARRATION, apiKey: 'test-key',
      commandShipActor: null, characterActor: actor,
    }).finally(() => apiPost.mockReset());   // an unused scripted reply never reaches a later call
    expect(found.map(a => ({ asset: a.assetName, adds: a.adds }))).toEqual([{ asset: 'Veteran', adds: 1 }]);
  });

  it("a stat an ability swaps on Secure an Advantage is offered on the aid (Weapon Master's +supply)", async () => {
    const found = await scanForApplicableAbilities({ moveId: 'aid_your_ally', moveName: 'Aid Your Ally', narration: NARRATION,
      apiKey: '', commandShipActor: null, characterActor: kira(vendoredAsset('Weapon Master', 2, 'a-wm')) });
    expect(found.map(a => a.statReplacement)).toEqual(['supply']);
  });

  it("in a fight the aid is a Gain Ground: Ace's 'When you Gain Ground …, add +1' is offered, Glowcat's Secure an Advantage add is not", async () => {
    const actor = kira(vendoredAsset('Ace', 1, 'a-ace'), vendoredAsset('Glowcat', 0, 'a-glow'));
    expect(await offered('aid_your_ally', 'Aid Your Ally', actor, { inFight: true })).toEqual([{ asset: 'Ace', adds: 1 }]);
    expect(await offered('aid_your_ally', 'Aid Your Ally', kira(vendoredAsset('Ace', 1, 'a-ace')))).toEqual([]);
  });

  it("control: the same Veteran ability on a plain Secure an Advantage is offered", async () => {
    const actor = kira(vendoredAsset('Veteran', 2, 'a-vet'));
    expect(await offered('secure_an_advantage', 'Secure an Advantage', actor)).toEqual([{ asset: 'Veteran', adds: 1 }]);
  });

  it('control: an ability linked to another move is still not offered for the aid (Veteran on Face Danger only)', async () => {
    const actor = kira(vendoredAsset('Loyalist', 0, 'a-loyal'), vendoredAsset('Ace', 0, 'a-ace'));
    expect(await offered('aid_your_ally', 'Aid Your Ally', actor)).toEqual([{ asset: 'Loyalist', adds: 1 }]);
  });
});

describe('issue #345 AA11 — what the aid is matched as', () => {
  it('assetMatchMove: Aid Your Ally is made as Secure an Advantage, or Gain Ground in a fight', () => {
    expect(assetMatchMove({ moveId: 'aid_your_ally', moveName: 'Aid Your Ally' }).madeAs)
      .toEqual({ moveId: 'secure_an_advantage', moveName: 'Secure an Advantage' });
    expect(assetMatchMove({ moveName: 'Aid Your Ally', inFight: true }).madeAs)
      .toEqual({ moveId: 'gain_ground', moveName: 'Gain Ground' });
  });

  it('control: any other move is made as nothing else; a scene-challenge variant is still its twin', () => {
    expect(assetMatchMove({ moveId: 'secure_an_advantage', moveName: 'Secure an Advantage' }).madeAs ?? null).toBeNull();
    const variant = assetMatchMove({ moveId: 'face_danger_scene_challenge' });
    expect({ moveId: variant.moveId, madeAs: variant.madeAs ?? null }).toEqual({ moveId: 'face_danger', madeAs: null });
  });

  it("the rider extraction is told the move the aid is made as", async () => {
    const _call = vi.fn(async () => JSON.stringify({ abilities: [] }));
    const abilities = [{ key: 'a:0', assetName: 'Veteran', text: 'When you Secure an Advantage …, add +1.' }];
    await extractRiders({ abilities, moveName: 'Aid Your Ally', apiKey: 'k', _call });
    await extractRiders({ abilities, moveName: 'Aid Your Ally', apiKey: 'k', inFight: true, _call });
    expect(_call.mock.calls.map(([prompt]) => prompt.split('\n')[0]))
      .toEqual(['Move: Aid Your Ally (made as Secure an Advantage)', 'Move: Aid Your Ally (made as Gain Ground)']);
  });
});

describe.skipIf(!HAVE_VENDOR)('issue #345 AA11 — an aid typed during a fight takes the Gain Ground ability\'s +1 (booted table)', () => {
  let table, actor, journal;
  // challenge 2, 3; action die 6 — heart 2 + 1 → 9: a strong hit
  const STRONG = [0.15, 0.25, 0.99];

  function progressJournal() {
    const flags = {};
    return {
      id: 'aa11-progress', name: 'Starforged Progress Tracks',
      getFlag: (scope, key) => flags[`${scope}.${key}`],
      setFlag: async (scope, key, value) => { flags[`${scope}.${key}`] = structuredClone(value); },
    };
  }
  const gm = () => table.client('gm-1');

  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, 'riders.autoApply': false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'aa11-s1', sessionNumber: 1,
        currentSceneId: 'aa11-scene', sceneTruths: [], clocks: [] },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-test');
    actor = table.addActor({ id: 'pc-kira-aa11', name: 'Kira', ownership: { 'pl-1': 3 },
      system: { heart: 2 }, items: { contents: [vendoredAsset('Ace', 1, 'asset-ace')] } });
    journal = progressJournal();
    table.journal._set(journal);
    const store = await gm().import('../../src/ui/progressTracks.js');
    await gm().run(() => store.addProgressTrack({ type: 'combat', label: 'Raiders', rank: 'dangerous' }));
    scriptClaude(table, { fallback: () => 'Ren lines up the shot.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
    control.interpretation = { moveId: 'aid_your_ally', moveName: 'Aid Your Ally', statUsed: 'heart', adds: 0, moveTarget: null,
      rationale: 'Kira swings the skiff around to give Ren a clean shot', mischiefApplied: false };
    control.dice = STRONG;
  });
  afterEach(async () => {
    gm().answerDialogs(d => d.close());
    await table.drain().catch(() => {});
  });

  it("Ace's 'When you Gain Ground by maneuvering your vehicle …, add +1' is taken: the card reads 6 + 2 + 1", async () => {
    await table.client('pl-1').chat('I bank hard across the raiders’ line so Ren has a clean shot.', { speaker: { actor: actor.id } });
    await table.settle(); await table.drain();
    const card = table.cards(f => f.moveResolution).at(-1);
    expect(card, 'the aid was rolled').toBeTruthy();
    expect(card.content.replace(/\s+/g, ' ')).toMatch(/Action: 6 \+ 2 \+ 1 = <strong>9<\/strong>/);
  }, 60_000);
});
