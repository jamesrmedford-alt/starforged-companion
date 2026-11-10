/**
 * PROBE R2U-2 — AID-YOUR-ALLY-ABILITIES-UNKEYED (RULES)
 * Sibling of SCENE-VARIANT-ABILITIES-UNKEYED (known-issues.md:488), on the
 * Aid Your Ally path.
 *
 * Vendored Aid Your Ally: "When you act in direct support of an ally, envision
 * how you aid them. Then, Secure an Advantage or Gain Ground to take action."
 * The aid IS a Secure an Advantage (a Gain Ground in a fight) — the module
 * resolves it as one (issue #325 W17: resolver.aidYourAllyConsequences,
 * movePipeline.js:832-835 inFight). So an ability that triggers "When you
 * Secure an Advantage …" applies to the roll — its add is the roller's.
 *
 * But the asset scan matches the move by its own name only:
 *   src/moves/sceneChallenge.js:99-103  assetMatchMove maps the scene-challenge
 *     variants to their twins; "Any other move is itself, as given"
 *   src/moves/abilityScanner.js:357-364  scanForApplicableAbilities →
 *     structuredMatches(all, "Aid Your Ally") — Veteran / Lore Hunter / Explorer
 *     / Naturalist / Navigator / Tech … (linked to Secure an Advantage) never
 *     match, and once any Aid Your Ally ability matches (Leader, Loyalist) the
 *     Haiku fallback is skipped, so they are never offered at all
 *   src/moves/movePipeline.js:367-374  readMove scans with moveId
 *     "aid_your_ally"; the confirm dialog offers exactly that list.
 *
 * Scenario:
 *   1. Kira has Loyalist ("When you Aid Your Ally, add +1 …") and Veteran
 *      ("When you Secure an Advantage or Gain Ground by recounting or recalling
 *      a hard-won lesson from your battlefield experiences, envision the
 *      memory and add +1").
 *   2. She types "I talk Ren through the breach the way we did it at Kell
 *      Station" → Aid Your Ally (+wits).
 *   3. The confirm dialog offers Loyalist's +1 only; Veteran's +1 is never
 *      shown, so the aid rolls +1 short.
 *   Expected: Veteran's +1 offered beside Loyalist's.
 *   Actual: only Loyalist.
 *   Without Loyalist (no key, so no Haiku pass): nothing is offered for the aid,
 *   though the same Secure an Advantage offers Veteran's +1.
 *
 * Control: the same Veteran ability on a plain Secure an Advantage is offered.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// The Haiku fallback pass, answered at its transport (only the keyed test uses it).
vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
import { apiPost } from '../../../src/api-proxy.js';
import { scanForApplicableAbilities } from '../../../src/moves/abilityScanner.js';

const DIR = fileURLToPath(new URL('../../../vendor/foundry-ironsworn/json-packs/starforged-assets', import.meta.url));
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

async function offered(moveId, moveName, actor) {
  const found = await scanForApplicableAbilities({
    moveId, moveName, narration: NARRATION, apiKey: '', commandShipActor: null, characterActor: actor,
  });
  return found.map(a => ({ asset: a.assetName, adds: a.adds }));
}

describe.skipIf(!HAVE_VENDOR)('R2U-2 AID-YOUR-ALLY-ABILITIES-UNKEYED — the aid is a Secure an Advantage, its abilities are not offered', () => {
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

  it("with a key, the Haiku pass that does surface Veteran for the aid reads its +1 as no add", async () => {
    // The fallback's match is annotated against "Aid Your Ally": Veteran's
    // add sits in a clause naming Secure an Advantage / Gain Ground — another
    // move's, so abilityScanner.addFor (:598-601) gives it 0.
    apiPost.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({ matches: [
      { key: 'a-vet:2', summary: 'Recalling the Kell Station lesson adds +1.', statReplacement: null },
    ] }) }] });
    const actor = kira(vendoredAsset('Veteran', 2, 'a-vet'));
    const found = await scanForApplicableAbilities({
      moveId: 'aid_your_ally', moveName: 'Aid Your Ally', narration: NARRATION, apiKey: 'test-key',
      commandShipActor: null, characterActor: actor,
    });
    expect(found.map(a => ({ asset: a.assetName, adds: a.adds }))).toEqual([{ asset: 'Veteran', adds: 1 }]);
  });

  it("control: the same Veteran ability on a plain Secure an Advantage is offered", async () => {
    const actor = kira(vendoredAsset('Veteran', 2, 'a-vet'));
    expect(await offered('secure_an_advantage', 'Secure an Advantage', actor)).toEqual([{ asset: 'Veteran', adds: 1 }]);
  });
});
