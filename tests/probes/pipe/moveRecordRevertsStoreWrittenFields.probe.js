/**
 * PIPE-04 · MOVE-RECORD-REVERTS-STORE-WRITTEN-FIELDS  (LOST-UPDATE)
 *
 * persistResolution writes the move pipeline's working copy — read before the
 * confirm dialog and the narration — merged onto the store per a field policy
 * (mergeWithLatestState): fields other writers own take the STORED value
 * (STORE_OWNED_FIELDS); "every other field keeps the working copy". Four
 * campaignState fields that only other writers write, straight to the store,
 * are not on the list, so a move's record puts back the value they had when
 * the move began:
 *
 *   crewSupply           sharedSupply.js persistCrewSupply — each sync pass (SUPPLY-TWO-PC-TIE)
 *   deletedChatMessages  narrator.js persistDeletedRecord — a card deleted (DELETED-NARRATION-MEMORY-PAGE-ONLY)
 *   unsummarisedSession  narrator.js catchUpUnsummarisedSession clears the mint's mark (AB15) —
 *                        and runs after every narrator card, i.e. inside the move pipeline
 *   sessionPerspective   lifecycle.js beginSession / mintSession (PT03)
 *
 * Scenario A (ordinary play, the real pipeline): two PCs share the supply.
 * Kira's Face Danger misses; its Pay the Price is "You waste resources" —
 * Sacrifice Resources −1. Both sheets go 3 → 2 and the sync pass stores the
 * crew's supply (2). Then the move's record lands.
 *   Correct: campaignState.crewSupply is 2 — the value the pass just stored.
 *   Today: the record writes the working copy's pre-move value over it.
 *
 * Scenario B: the same merge, for the other three — a value the store took
 * while a move was in flight is still there after that move's record.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [72] }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
vi.mock("../../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { bootTable, resetTable, MODULE_ID, MISS, STRONG } from "./_heldTable.js";

let table, kira, bex;
const state = () => table.world.campaignState();

async function faceDanger(dice) {
  control.interpretation = { moveId: "face_danger", moveName: "Face Danger", statUsed: "wits", adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat("Kira forces the jammed cargo lock.", { speaker: { actor: kira.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

beforeAll(async () => { table = await bootTable(); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [72];   // Pay the Price 72: "You waste resources" — Sacrifice Resources (-1)
  // Momentum 2: a miss against 6 and 7 cannot be burned, so nothing is held — the price is paid at the roll.
  kira = await resetTable(table, { momentum: 2 });
  bex = table.addActor({ id: "pc-bex", name: "Bex", ownership: { "pl-2": 3 } });
});

describe("PIPE-04 — a move's record keeps what other writers stored while it ran", () => {
  it("control: a move that changes no supply leaves the stored crew's supply as the last pass set it", async () => {
    await table.client("gm-1").run(() => game.settings.set(MODULE_ID, "campaignState", { ...game.settings.get(MODULE_ID, "campaignState"), crewSupply: 3 }));
    await faceDanger(STRONG);
    expect(state().crewSupply).toBe(3);
    expect(kira.system.supply.value).toBe(3);
  });

  it("A: the crew's supply a move's own Pay the Price lowered is still stored once the move is recorded", async () => {
    expect(kira.system.supply.value).toBe(3);
    expect(bex.system.supply.value).toBe(3);
    // Every campaignState write, in order, by the crew's supply it carries.
    const written = [];
    table.interceptWrites((w) => {
      if (w.kind === "setting" && w.key === `${MODULE_ID}.campaignState`) written.push(w.value?.crewSupply ?? null);
      return undefined;
    });

    await faceDanger(MISS);

    // Setup: the price was Sacrifice Resources, and the shared-supply pass mirrored it to the other sheet.
    expect(table.cards(f => f.payThePriceCard)[0].content).toContain("You waste resources");
    expect(kira.system.supply.value).toBe(2);
    expect(bex.system.supply.value).toBe(2);
    // Setup: the pass stored the crew's supply (sharedSupply.js persistCrewSupply)…
    expect(written, "a write stored crewSupply 2 (setup)").toContain(2);
    // …and the move's record must not undo it.
    expect(state().crewSupply).toBe(2);
  });

  it("B: a value the store took for deletedChatMessages / unsummarisedSession / sessionPerspective mid-move survives that move's record", async () => {
    const gm = table.client("gm-1");
    const { persistResolution } = await gm.import("../../src/moves/persistResolution.js");
    const after = await gm.run(async () => {
      const KEY = "campaignState";
      // The session was minted with its predecessor still unsummarised (issue #347 AB15's mark).
      await game.settings.set(MODULE_ID, KEY, { ...game.settings.get(MODULE_ID, KEY),
        unsummarisedSession: { sessionId: "pipe-s0", sessionNumber: 0 }, deletedChatMessages: [], sessionPerspective: null });
      // A move begins: the pipeline's working copy.
      const working = foundry.utils.deepClone(game.settings.get(MODULE_ID, KEY));
      // While it runs, three other writers land on the store (each writes a copy of the stored state):
      await game.settings.set(MODULE_ID, KEY, { ...game.settings.get(MODULE_ID, KEY),
        unsummarisedSession: null,                                                   // the catch-up made LAST SESSION
        deletedChatMessages: [{ id: "msg-9", deleted: true, flags: {}, whisper: [] }],   // a GM deleted a card
        sessionPerspective:  { sessionId: "pipe-s1", perspective: "third_person" },      // Begin a Session decided it
      });
      // …and the move is recorded.
      await persistResolution({ _id: "res-b", moveId: "face_danger", outcome: "strong_hit",
        consequences: { momentumChange: 0, healthChange: 0, spiritChange: 0, supplyChange: 0 } }, working, null);
      return game.settings.get(MODULE_ID, KEY);
    });
    expect.soft(after.unsummarisedSession, "the cleared mark is not put back").toBeNull();
    expect.soft(after.deletedChatMessages, "the deleted card's record is kept").toEqual([expect.objectContaining({ id: "msg-9" })]);
    expect.soft(after.sessionPerspective, "the session's perspective is kept").toEqual({ sessionId: "pipe-s1", perspective: "third_person" });
  });
});
