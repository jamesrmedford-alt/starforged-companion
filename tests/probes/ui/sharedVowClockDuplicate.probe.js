/**
 * PROBE (ui audit) — SHARED-VOW-CLOCK-PER-COPY
 *
 * The inciting incident's vow is sworn as a SHARED vow: one progress Item per
 * player character, all tagged `sharedVow` + the same `vowId`, kept in
 * lockstep by registerSharedVowSyncHook (clockTicks is a synced field). Its
 * deadline clock is one clock in the fiction.
 *
 * advanceClocksOnPayThePrice (src/clocks/payThePriceClocks.js) walks every PC
 * and advances every vow clock on each (advanceVowClocks) with no dedupe by
 * vowId, so with three PCs one Pay the Price:
 *   - lists the same deadline three times on "⏳ The clock turns", and
 *   - when it fills, fires three trigger vignettes — three paid Claude calls
 *     and three "⚠ TRIGGERED" narrator cards (each a narratorCard, so each
 *     enters the ring / rolling summary) for one deadline.
 *
 * Asserts the CORRECT behaviour (one line, one trigger vignette), so it FAILS
 * today.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/narration/narrator.js", () => ({
  narrateClockAdvancement: vi.fn(async () => "The ransom deadline passes. Dani is moved off-station."),
}));

import { narrateClockAdvancement } from "../../../src/narration/narrator.js";
import { advanceClocksOnPayThePrice } from "../../../src/clocks/payThePriceClocks.js";

const MODULE_ID = "starforged-companion";

function sharedVowCopy(itemId, ticks) {
  const item = {
    id: itemId, type: "progress", name: "Rescue Dani from the Wardens",
    system: { subtype: "vow", hasClock: true, clockTicks: ticks, clockMax: 4, completed: false, current: 8, rank: "dangerous" },
    flags: { [MODULE_ID]: { sharedVow: true, vowId: "incite-msg-1" } },
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        if (path === "system.clockTicks") item.system.clockTicks = value;
      }
    },
  };
  return item;
}

beforeEach(() => {
  game.actors._reset();
  ChatMessage._reset();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { clocks: [], currentSessionId: "sess-1" });
  for (const [actorId, name] of [["pc-kira", "Kira"], ["pc-ren", "Ren"], ["pc-ash", "Ash"]]) {
    const actor = makeTestActor({ id: actorId, name, type: "character",
      items: { contents: [sharedVowCopy(`${actorId}-vow`, 3)] } });
    game.actors._set(actorId, actor);
  }
  vi.clearAllMocks();
});

afterEach(() => {
  game.actors._reset();
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

describe("one shared vow, three PCs — Pay the Price fills its deadline (SHARED-VOW-CLOCK-PER-COPY)", () => {
  it("the clock card lists the shared deadline once", async () => {
    await advanceClocksOnPayThePrice();
    await new Promise(r => setTimeout(r, 20));   // let this test's vignettes finish (no leak into the next)
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.payThePriceAdvance);
    const lines = (card?.content.match(/<li>/g) ?? []).length;
    // Today: 3 — one "Rescue Dani from the Wardens — 4/4 (TRIGGERED)" per PC copy.
    expect(lines).toBe(1);
  });

  it("one trigger vignette (one Claude call, one TRIGGERED card) for the one deadline", async () => {
    await advanceClocksOnPayThePrice();
    await new Promise(r => setTimeout(r, 20));   // the vignettes run on a setTimeout(0)
    const triggeredCards = ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.clockVignetteCard);
    // Today: 3 narrator calls and 3 "⚠ TRIGGERED" narrator cards.
    expect({ claudeCalls: narrateClockAdvancement.mock.calls.length, cards: triggeredCards.length })
      .toEqual({ claudeCalls: 1, cards: 1 });
  });
});
