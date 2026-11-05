/**
 * PROBE — SWEEP-03 NARRATION-CACHED-STORE-SIBLINGS (sweep auditor, family 1:
 * the cached setting changed before a refusable write; issue #329 X09's shape
 * at the callers its fix did not reach)
 *
 * What the user does: (a) the GM types `!incite` (or presses ✦ Envision
 * Inciting Incident, or runs Campaign Start) with no scene open; (b) a player
 * rolls a vow's progress on the foundry-ironsworn sheet and the keyed GM
 * narrates it. Then the world refuses the GM's campaignState write (a server
 * error, a dropped socket).
 *
 * What happens: both paths hand the narrator the cached campaignState itself
 * — `handleIncitingIncidentCommand` (src/index.js:3393), the Session panel's
 * GM path (src/ui/sessionPanel.js:240), Campaign Start phase 5
 * (src/session/campaignStart.js:188 via readCampaignState) and the native
 * progress-roll hook (src/index.js:2890). `narrateIncitingIncident` runs
 * `ensureSceneStarted` and `applyNarratorSidecar` on the object it is given
 * (src/narration/narrator.js:2455, :2471), as `narrateResolution` does: a
 * scene is minted and the sidecar's truths pushed onto the GM's cache before
 * the persist, so a refused write leaves this GM holding a scene and facts
 * the world and every other client lack — its next narration continues that
 * phantom scene and its next whole-object write carries it into the world
 * (X09's harm). X38 fixed only the premise field of `!incite`; X09 fixed the
 * oracle follow-up, `@scene`, the clock vignettes and the relayed sidecar.
 *
 * What should happen: each caller narrates from a working copy
 * (`foundry.utils.deepClone(game.settings.get(…))`, rules/foundry-api.md), so
 * after a refused write the GM's cache equals the world.
 *
 * Control: with the write accepted, the scene and the truth land in the world
 * and the GM's cache agrees.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sweep/inciteCachedStoreWrites.probe.js
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const KEY = `${MODULE_ID}.campaignState`;
const NARRATION_MODEL = "claude-sonnet-4-5-20250929";

const SIDECAR = {
  newTruths:    [{ subject: "the dockmaster", fact: "Owes the crew a favour" }],
  stateChanges: [{ subject: "the dockmaster", attribute: "location", value: "the loading bay" }],
  sceneFrame:   { location: "the loading bay", present: ["the dockmaster"], situation: "A beacon screams" },
};
const NARRATION = [
  "The beacon at Paradox Station screams a distress code no one has used in a century.",
  "",
  "Suggested vow: Find who silenced the beacon (dangerous)",
  "Situation: Paradox Station has gone dark and its beacon is screaming.",
  "```json", JSON.stringify(SIDECAR), "```",
].join("\n");

let table;
const gmCache = () => table.client("gm-1").getSetting("campaignState");
const world   = () => table.world.campaignState();

// The vendor roll card: JSON HTML-escaped inside a single-quoted attribute (nativeBondRollNarration.test.js).
function nativeProgressCard({ source, value, dice }) {
  const roll = { preRollOptions: { progress: { source, value }, actorId: "pc-1" }, rawChallengeDiceValues: dice };
  const json = JSON.stringify(roll).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  return `<article class='ironsworn-roll' data-ironswornroll='${json}'><h3>Progress Roll: ${source}</h3></article>`;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true, currentSessionId: "sess-1", sessionNumber: 1,
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null, currentSceneId: null,
  } } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  table.addActor({
    id: "pc-1", name: "Kira", type: "character", ownership: { "pl-1": 3 },
    items: { contents: [
      { id: "vow-1", type: "progress", name: "Find Chen", system: { subtype: "vow", rank: "dangerous", current: 0 }, flags: {} },
    ] },
  });
  scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL ? NARRATION : "{}") });
});

/** Refuse every campaignState write the GM's client makes. */
function refuseGmCampaignStateWrites() {
  table.interceptWrites(w => (w.kind === "setting" && w.key === KEY && w.client === "gm-1")
    ? new Error("Setting [campaignState] could not be saved: the server refused the write")
    : undefined);
}

async function rollVowOnSheet() {
  await table.client("pl-1").run(() => globalThis.ChatMessage.create({
    content: nativeProgressCard({ source: "Find Chen", value: 1, dice: [5, 8] }),
    speaker: { actor: "pc-1", alias: "Kira" },
    rolls: [{ formula: "{d10,d10}", total: 0 }],
  }));
  await table.settle();
}

describe("PROBE SWEEP-03 NARRATION-CACHED-STORE-SIBLINGS", () => {
  it("!incite on the keyed GM: a refused write leaves no scene and no truth in the GM's cache", async () => {
    silenceConsoleErrors();
    refuseGmCampaignStateWrites();
    await table.client("gm-1").chat("!incite");
    await table.settle();

    expect(table.cards(f => f.incitingIncidentCard)).toHaveLength(1);   // the narration happened
    expect(world().currentSceneId ?? null).toBeNull();                   // the world took nothing
    expect(world().sceneTruths ?? []).toEqual([]);
    // Expected: the GM's cache as the world. Actual: a scene minted and the truth pushed on the cache.
    expect(gmCache().currentSceneId ?? null).toBeNull();
    expect.soft(gmCache().sceneTruths ?? []).toEqual([]);
    expect.soft(gmCache().sceneFrame ?? null).toBeNull();
  }, 30_000);

  it("a sheet-rolled vow narrated by the keyed GM: a refused write leaves no scene and no truth in the GM's cache", async () => {
    silenceConsoleErrors();
    refuseGmCampaignStateWrites();
    await rollVowOnSheet();

    expect(table.cards(f => f.narratorCard && f.moveId === "fulfill_your_vow")).toHaveLength(1);   // narrated
    expect(world().currentSceneId ?? null).toBeNull();
    expect(gmCache().currentSceneId ?? null).toBeNull();
    expect.soft(gmCache().sceneTruths ?? []).toEqual([]);
  }, 30_000);

  it("control: with the write accepted, !incite's scene and truth land in the world and the GM's cache agrees", async () => {
    await table.client("gm-1").chat("!incite");
    await table.settle();
    expect(world().currentSceneId).toMatch(/^sc-/);
    expect(world().sceneTruths.map(t => t.fact)).toEqual(["Owes the crew a favour"]);
    expect(gmCache().currentSceneId).toBe(world().currentSceneId);
    expect(gmCache().sceneTruths.map(t => t.fact)).toEqual(["Owes the crew a favour"]);
  }, 30_000);

  it("control: with the write accepted, the sheet roll's narration mints the scene in the world and the GM's cache agrees", async () => {
    await rollVowOnSheet();
    expect(world().currentSceneId).toMatch(/^sc-/);
    expect(gmCache().currentSceneId).toBe(world().currentSceneId);
  }, 30_000);
});
