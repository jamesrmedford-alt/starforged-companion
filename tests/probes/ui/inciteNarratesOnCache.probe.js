/**
 * PROBE — UI-01 INCITE-NARRATES-ON-CACHE (tenth audit, area ui; family 1 —
 * the cached setting handed to code that changes what it is given,
 * rules/foundry-api.md "game.settings.get returns an object setting's cached
 * value by reference"; the sibling path issue #329 X09 did not reach)
 *
 * What the user does: the GM (keyed, the canonical GM) opens the Session
 * panel and presses ✦ Envision Inciting Incident — or types `!incite`, or
 * runs ✦ Campaign Start — while the world refuses a campaignState write (a
 * server hiccup, a dropped socket).
 *
 * What happens: all three callers hand `runIncitingIncident` the cached
 * campaignState itself (src/ui/sessionPanel.js:239-240,
 * src/index.js:3392-3393, src/session/campaignStart.js:188-190). The
 * narration it starts, `narrateIncitingIncident` (src/narration/narrator.js
 * :2440-2472), mints a scene on that object (`ensureSceneStarted`) and
 * applies the sidecar's truths, state and frame onto it
 * (`applyNarratorSidecar`). The premise field is now written only once the
 * store confirms it (issue #331 X38), but the scene and the ledgers were
 * applied before the persist: refused, the GM's client keeps a scene and
 * binding truths the world and every other client lack — rendered as binding
 * in its next narration, audited by the consistency check, and carried into
 * the world by its next whole-object write. Issue #329 X09 fixed exactly this
 * for the oracle follow-up, `@scene`, the three clock vignettes and the
 * relayed sidecar ("each now narrates from a working copy"); the inciting
 * incident's three callers were left out.
 *
 * What should happen: the narrator is handed a working copy
 * (`foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState"))`),
 * as `@scene` and the clock vignettes do; a refused write leaves the cache as
 * the world has it.
 *
 * Controls: `@scene` on the same table (X09's fix) leaves the cache equal to
 * the world; without a refusal the inciting narration's facts land in the
 * world and the cache.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/ui/inciteNarratesOnCache.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const KEY = `${MODULE_ID}.campaignState`;
const NARRATION_MODEL = "claude-sonnet-4-5-20250929";

const SIDECAR = {
  newTruths:    [{ subject: "the Syndicate", fact: "Holds the station's water rights" }],
  stateChanges: [{ subject: "scene", attribute: "location", value: "the docking ring" }],
  sceneFrame:   { location: "the docking ring", present: ["the Syndicate"], situation: "A reckoning is due" },
};
const NARRATION = "The water taps run dry across the ring.\n```json\n" + JSON.stringify(SIDECAR) + "\n```";

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

const base = () => ({
  ...CampaignStateSchema,
  sessionActive: true, currentSessionId: "sess-1", sessionNumber: 1,
  sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null, currentSceneId: null,
});

async function seed() {
  await table.reset({ world: { settings: { campaignState: base() } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
  scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL ? NARRATION : "{}") });
}

beforeEach(async () => { await seed(); });

function refuseGmCampaignStateWrites() {
  table.interceptWrites(w => (w.kind === "setting" && w.key === KEY && w.client === "gm-1")
    ? new Error("Setting [campaignState] could not be saved: the server refused the write")
    : undefined);
}

const gmCache = () => table.client("gm-1").getSetting("campaignState");
const world   = () => table.world.campaignState();

/** The GM presses ✦ Envision Inciting Incident on their own Session panel (the client's own module copy). */
async function pressEnvisionOnGm() {
  const client = table.client("gm-1");
  await client.run(async () => {
    const { SessionPanelApp } = await import("../../../src/ui/sessionPanel.js");
    await SessionPanelApp.DEFAULT_OPTIONS.actions.envisionIncite.call({ render() {} }, {}, {});
  });
  await table.settle();
}

describe("UI-01 the inciting incident is narrated on a working copy, not the cached setting", () => {
  it("GM types !incite while the world refuses the write: the GM's cache stays equal to the world (no scene, no truth)", async () => {
    refuseGmCampaignStateWrites();
    await table.client("gm-1").chat("!incite");
    await table.settle();

    const narration = table.claude.calls.find(c => c.model === NARRATION_MODEL);
    expect(narration?.client).toBe("gm-1");                          // the narration ran on the keyed canonical GM
    expect(table.cards(f => f.incitingIncidentCard)).toHaveLength(1); // the card still posts
    expect(world().sceneTruths).toEqual([]);                          // refused: the world has no truth
    expect(world().currentSceneId ?? null).toBeNull();
    // Today: the cache holds the minted scene and the sidecar's truth, frame and state.
    expect.soft(gmCache().sceneTruths ?? []).toEqual([]);
    expect.soft(gmCache().sceneFrame ?? null).toBeNull();
    expect.soft(gmCache().sceneState?.bySubject ?? {}).toEqual({});
    expect(gmCache().currentSceneId ?? null).toBeNull();
  }, 30_000);

  it("GM presses ✦ Envision Inciting Incident on the Session panel while the world refuses the write: same", async () => {
    refuseGmCampaignStateWrites();
    await pressEnvisionOnGm();

    expect(table.claude.calls.some(c => c.model === NARRATION_MODEL && c.client === "gm-1")).toBe(true);
    expect(world().sceneTruths).toEqual([]);
    expect(gmCache().currentSceneId ?? null).toBeNull();
    expect(gmCache().sceneTruths ?? []).toEqual([]);
    expect.soft(gmCache().sceneFrame ?? null).toBeNull();
  }, 30_000);

  it("control: @scene (issue #329 X09's fix) on the same refusing table leaves the cache equal to the world", async () => {
    refuseGmCampaignStateWrites();
    await table.client("gm-1").chat("@scene What does the docking ring smell like?");
    await table.settle();
    expect(world().currentSceneId ?? null).toBeNull();
    expect(gmCache().currentSceneId ?? null).toBeNull();
    expect(gmCache().sceneTruths ?? []).toEqual([]);
  }, 30_000);

  it("control: without a refusal the inciting narration's facts land in the world and the GM's cache agrees", async () => {
    await table.client("gm-1").chat("!incite");
    await table.settle();
    expect(world().sceneTruths.map(t => t.fact)).toEqual(["Holds the station's water rights"]);
    expect(world().currentSceneId).toMatch(/^sc-/);
    expect(gmCache().currentSceneId).toBe(world().currentSceneId);
    expect(gmCache().sceneTruths.map(t => t.fact)).toEqual(["Holds the station's water rights"]);
  }, 30_000);
});
