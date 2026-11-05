/**
 * STARFORGED COMPANION
 * tests/unit/sceneVariantAbilities.test.js
 *
 * SCENE-VARIANT-ABILITIES-UNKEYED (found while fixing issue #338 D2's open
 * items). Within a scene challenge, Face Danger and Secure an Advantage are
 * their scene-challenge variants (D2) — but an asset ability is keyed to a move
 * by the move it links: the Shuttle's "When you Face Danger or React Under
 * Fire to navigate …, add +1" matched "Face Danger", not "Face Danger (Scene
 * Challenge)", so a scene-challenge roll lost its asset adds, stat
 * substitutions and riders. A variant is now matched as the ordinary move it
 * varies, in the scanner (links, adds, stat, Haiku pass) and in the rider
 * extraction.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], rows: [] }));
// The REAL confirm dialog, accepted with the boxes as it pre-checks them.
vi.mock("../../src/ui/settingsPanel.js", async (original) => {
  const real = await original();
  return { ...real, confirmInterpretation: vi.fn(async (interp) => {
    const shown  = real.MoveConfirmDialog.prompt(interp);
    const dialog = real.MoveConfirmDialog.pending;
    dialog.element = await dialog._renderHTML(await dialog._prepareContext({}), {});
    control.rows.push(...dialog.element.querySelectorAll(".sf-applicable-ability-row"));
    await real.MoveConfirmDialog.DEFAULT_OPTIONS.actions.accept.call(dialog);
    return shown;
  }) };
});
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { scanForApplicableAbilities, extractStatReplacement, structuredMatches } from "../../src/moves/abilityScanner.js";
import { extractRiders } from "../../src/moves/consequenceRiders.js";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { StubElement } from "../helpers/cardDom.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const link = (name) => `@Compendium[foundry-ironsworn.starforgedmoves.x]{${name}}`;
const TEXT = {
  shuttle: `When you ${link("Face Danger")} or ${link("React Under Fire")} to navigate through hazardous skies, avoid obstacles, or evade an attack, add +1 and take +1 momentum on a hit.`,
  glowcat: `When you ${link("Secure an Advantage")} by studying the glowcat’s reactions in a charged interaction, add +its health.`,
  ghost:   `When you ${link("Face Danger")} by moving unseen, you may roll +shadow.`,
};
const FD  = { moveId: "face_danger_scene_challenge",         moveName: "Face Danger (Scene Challenge)" };
const SAA = { moveId: "secure_an_advantage_scene_challenge", moveName: "Secure an Advantage (Scene Challenge)" };

let n = 0;
function kira(assetName, category, text, track = null) {
  const item = { id: `asset-${assetName.toLowerCase()}`, name: assetName, type: "asset",
    system: { category, abilities: [{ enabled: true, description: `<p>${text}</p>` }], ...(track ? { track } : {}) } };
  return { id: `pc-kira-${++n}`, name: "Kira", type: "character",
    system: { edge: 2, heart: 1, iron: 1, shadow: 3, wits: 2 },
    items: { contents: [item], get: (id) => (id === item.id ? item : undefined) } };
}
const scan = (actor, move) => scanForApplicableAbilities({ ...move, narration: "test", apiKey: "", commandShipActor: null, characterActor: actor });

describe("a scene-challenge variant is matched as the ordinary move it varies", () => {
  it("the Shuttle's Face Danger +1 is offered on Face Danger (Scene Challenge), as on Face Danger", async () => {
    const actor = kira("Shuttle", "Support Vehicle", TEXT.shuttle);
    const variant = await scan(actor, FD);
    const twin    = await scan(actor, { moveId: "face_danger", moveName: "Face Danger" });
    expect(variant.map(a => [a.assetName, a.adds, a.detection])).toEqual([["Shuttle", 1, "structured"]]);
    expect(variant.map(a => a.adds)).toEqual(twin.map(a => a.adds));
  });

  it("the Glowcat's Secure an Advantage +its health is offered on its scene-challenge variant", async () => {
    const offers = await scan(kira("Glowcat", "Companion", TEXT.glowcat, { value: 3, max: 3, min: 0 }), SAA);
    expect(offers.map(a => [a.adds, a.addsFrom])).toEqual([[3, "its health"]]);
  });

  it("a stat substitution keyed to Face Danger is the variant's too", async () => {
    expect(extractStatReplacement(TEXT.ghost, FD.moveName)).toBe("shadow");
    expect((await scan(kira("Ghost", "Path", TEXT.ghost), FD))[0]?.statReplacement).toBe("shadow");
  });

  it("the rider extraction is told the ordinary move", async () => {
    let prompt = "";
    await extractRiders({ abilities: [{ key: "a:0", assetName: "Shuttle", text: TEXT.shuttle }], moveName: FD.moveName, apiKey: "k",
      _call: async (p) => { prompt = p; return "{}"; } });
    expect(prompt).toMatch(/^Move: Face Danger\n/);
  });

  it("control: an ability keyed to another move is not matched; the ordinary move is itself", () => {
    expect(structuredMatches([{ text: TEXT.shuttle }], "Secure an Advantage (Scene Challenge)")).toEqual([]);
    expect(structuredMatches([{ text: TEXT.shuttle }], "Face Danger")).toHaveLength(1);
    expect(structuredMatches([{ text: TEXT.shuttle }], "Gather Information")).toEqual([]);
  });
});

describe("a scene-challenge roll takes its asset's add (on a table)", () => {
  let table, pc;
  const isClassifier  = (call) => /pacing pre-classifier/.test(call.system ?? "");
  const isInterpreter = (call) => /You are the move interpreter/.test(call.system ?? "");
  const isNarration   = (call) => /SIDECAR|NARRATOR ROLE/.test(call.system ?? "");
  const lastMove      = () => table.cards(f => f.narratorCard && f.resolutionId).at(-1)?.flags[MODULE_ID];
  // Challenge 5 and 7, die 5: 5 + edge 2 = 7, a weak hit; with the Shuttle's +1, 8, a strong hit.
  const DICE = [0.45, 0.65, 0.7];

  function progressJournal() {
    const flags = {};
    return {
      id: "sv-progress", name: "Starforged Progress Tracks",
      getFlag: (scope, key) => flags[`${scope}.${key}`],
      setFlag: async (scope, key, value) => { flags[`${scope}.${key}`] = structuredClone(value); },
    };
  }

  beforeAll(async () => {
    globalThis.document = { createElement: (tag) => new StubElement(tag) };
    table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  }, 30_000);
  afterAll(() => { table?.teardown(); delete globalThis.document; });
  beforeEach(async () => {
    control.rows = [];
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "sv-s1", sessionNumber: 1,
        lastSessionTimestamp: new Date().toISOString(), currentSceneId: "sv-scene", sceneTruths: [], clocks: [] },
    } } });
    await table.setClaudeKey("gm-1", "sk-ant-test");
    table.journal._set(progressJournal());
    const store = await table.client("gm-1").import("../../src/ui/progressTracks.js");
    await table.client("gm-1").run(() => store.addProgressTrack({ label: "The Storm Run", type: "scene_challenge", rank: "dangerous" }));
    await table.settle();
    scriptClaude(table, { fallback: (call) => (isNarration(call)
      ? 'The shuttle bucks through the squall.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' : "{}") })
      .when(isClassifier, JSON.stringify({ decision: "MOVE", suggestedMove: null, category: "exploration", confidence: 0.9, reasoning: "test" }))
      .when(isInterpreter, JSON.stringify({ moveId: "face_danger_scene_challenge", statUsed: "edge", moveTarget: "The Storm Run", rationale: "test", confidence: "high" }));
    const shuttle = { id: "asset-shuttle", name: "Shuttle", type: "asset",
      system: { category: "Support Vehicle", track: { enabled: true, name: "Integrity", value: 4, max: 4, min: 0 },
        abilities: [{ enabled: true, description: `<p>${TEXT.shuttle}</p>` }] } };
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { edge: 2 }, items: { contents: [shuttle] } });
  });

  it("the Shuttle's +1 is on the confirm dialog, and the challenge's Face Danger rolls with it", async () => {
    control.dice = DICE;
    await table.client("pl-1").chat("I thread the shuttle between the lightning columns.", { speaker: { actor: pc.id } });
    await table.settle(); await table.drain();
    expect(control.rows.map(r => r.textContent).join(" ")).toMatch(/Shuttle[\s\S]*\+1/);
    expect(lastMove()).toMatchObject({ moveId: "face_danger_scene_challenge", outcome: "strong_hit" });
  }, 30_000);
});
