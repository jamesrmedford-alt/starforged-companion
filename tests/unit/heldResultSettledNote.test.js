/**
 * STARFORGED COMPANION
 * tests/unit/heldResultSettledNote.test.js
 *
 * Issue #362 AC82 HELD-RESOLVED-BY-NEVER-READ. heldResult.js closeWait stamps
 * how a held result was settled on its move card (`awaitingUpgrade.resolvedBy`:
 * "keep" | "later" | "choice" | "burn" | "improve"), and nothing read it — a
 * card flag with no consumer (rules/reachability.md §1). Once settled the
 * card's Keep row simply vanished, so the table could not tell what had kept
 * the result.
 *
 * Wired: the settled card says what kept it, in the Keep row's place; a burned
 * or improved card shows its upgrade and has no such line.
 *
 * From the probe tests/probes/pipe/heldResolvedByNeverRead.probe.js (its
 * source scan, with its controls), plus the card as each client renders it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [78] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
vi.mock("../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { productionSources } from "../helpers/sourceScan.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, pc;
const flags = (id) => table.world.message(id).flags[MODULE_ID];
const MISS   = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — a miss; momentum 9 burns to a strong hit
const WEAK   = [0.25, 0.65, 0.5];   // challenge 3, 7; action die 4 + wits 2 — a weak hit
const STRONG = [0.05, 0.15, 0.9];
const KEEP = '[data-action="sf-keep-result"]';
const BURN = '[data-action="sf-burn-momentum"]';

async function roll(moveId, { dice = MISS, line = `I attempt ${moveId}.` } = {}) {
  control.interpretation = { moveId, moveName: moveId, statUsed: "wits", adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat(line, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}
async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}
/** The held card as another player's client renders it now. */
const seen = (card) => table.client("pl-2").render(card._id);
const settledNote = (card) => seen(card).querySelector(".sf-keep-result-settled")?.textContent ?? null;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [78];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "ac82-s1", sessionNumber: 1,
      currentSceneId: "ac82-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("issue #362 AC82 — the held card's `resolvedBy` stamp has a production reader", () => {
  const sources = productionSources();
  const mentions = (name) => sources.flatMap(src => src.code.split("\n")
    .map((text, i) => ({ file: src.file, line: i + 1, text: text.trim() }))
    .filter(m => new RegExp(`\\b${name}\\b`).test(m.text)));
  const isWrite = (text, name) => new RegExp(`\\b${name}(?:\`\\])?\\s*(?::|=(?!=))`).test(text);

  it("control: `resolvedBy` is written by closeWait", () => {
    expect(mentions("resolvedBy").some(m => m.file === "src/moves/heldResult.js" && isWrite(m.text, "resolvedBy"))).toBe(true);
  });

  it("something in production code reads it", () => {
    expect(mentions("resolvedBy").filter(m => !isWrite(m.text, "resolvedBy")).map(m => m.file)).toContain("src/index.js");
  });
});

describe("issue #362 AC82 — a settled held card says what kept it", () => {
  it("control: while held, the card asks — Keep the result, no settled line", async () => {
    const card = await roll("gather_information");
    expect(flags(card._id).awaitingUpgrade.open).toBe(true);
    expect(seen(card).querySelector(KEEP)).toBeTruthy();
    expect(settledNote(card)).toBeNull();
  }, 30_000);

  it("kept by its button: the row reads that it was kept", async () => {
    const card = await roll("gather_information");
    await click(card, KEEP);
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "keep" });
    expect(seen(card).querySelector(KEEP)).toBeNull();
    expect(settledNote(card)).toBe("Kept — its price and its narration followed.");
  }, 30_000);

  it("kept by the roller's next line: the row says so", async () => {
    const first = await roll("gather_information");
    await roll("face_danger", { dice: STRONG, line: "I push on through the hatch." });
    expect(flags(first._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "later" });
    expect(settledNote(first)).toBe("Kept by the roller's next line or move.");
  }, 30_000);

  it("kept by a consequence chosen on its choice card: the row says so", async () => {
    const card = await roll("face_danger", { dice: WEAK });
    const choice = table.cards(f => f.sufferCard && f.sufferPrompt && !f.suffer).at(-1);
    await click(choice, '[data-suffer-id="endure_harm"]');
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "choice" });
    expect(settledNote(card)).toBe("Kept — a consequence was chosen on its choice card.");
  }, 30_000);

  it("burned: the card shows the burn, and no kept line", async () => {
    const card = await roll("gather_information");
    await click(card, BURN);
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "burn" });
    expect(seen(card).querySelector(KEEP)).toBeNull();
    expect(settledNote(card)).toBeNull();
    expect(seen(card).textContent).toMatch(/Burned → Strong Hit/);
  }, 30_000);
});
