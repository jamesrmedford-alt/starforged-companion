/**
 * STARFORGED COMPANION
 * tests/unit/sharedVowClockOnce.test.js
 *
 * A shared vow's deadline is one clock: Pay the Price advances every PC's copy
 * in lockstep, but lists the deadline once and fires one trigger vignette
 * (issue #321 U55).
 *
 * The inciting incident's vow is sworn as a SHARED vow: one progress Item per
 * player character, all tagged `sharedVow` + the same `vowId`, kept in
 * lockstep by registerSharedVowSyncHook (clockTicks is a synced field).
 * advanceClocksOnPayThePrice used to walk every PC and report every copy, so
 * with three PCs one Pay the Price listed the same deadline three times on
 * "⏳ The clock turns" and — when it filled — fired three trigger vignettes:
 * three paid Claude calls and three "⚠ TRIGGERED" narrator cards (each a
 * narratorCard, so each entered the ring / rolling summary) for one deadline.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/narration/narrator.js", () => ({
  narrateClockAdvancement: vi.fn(async () => "The ransom deadline passes. Dani is moved off-station."),
}));

import { narrateClockAdvancement } from "../../src/narration/narrator.js";
import { advanceClocksOnPayThePrice } from "../../src/clocks/payThePriceClocks.js";

const MODULE_ID = "starforged-companion";
const PCS = [["pc-kira", "Kira"], ["pc-ren", "Ren"], ["pc-ash", "Ash"]];

function sharedVowCopy(itemId, ticks, max = 4) {
  const item = {
    id: itemId, type: "progress", name: "Rescue Dani from the Wardens",
    system: { subtype: "vow", hasClock: true, clockTicks: ticks, clockMax: max, completed: false, current: 8, rank: "dangerous" },
    flags: { [MODULE_ID]: { sharedVow: true, vowId: "incite-msg-1" } },
    writes: [],
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        if (path === "system.clockTicks") { item.system.clockTicks = value; item.writes.push(value); }
      }
      item.afterUpdate?.();
    },
  };
  return item;
}

function seedTable(ticks, max) {
  const copies = [];
  for (const [actorId, name] of PCS) {
    const copy = sharedVowCopy(`${actorId}-vow`, ticks, max);
    copies.push(copy);
    game.actors._set(actorId, makeTestActor({ id: actorId, name, type: "character", items: { contents: [copy] } }));
  }
  return copies;
}

const settle = () => new Promise(r => setTimeout(r, 20));   // the vignettes run on a setTimeout(0)

beforeEach(() => {
  game.actors._reset();
  ChatMessage._reset();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { clocks: [], currentSessionId: "sess-1" });
  vi.clearAllMocks();
});

afterEach(() => {
  game.actors._reset();
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

describe("one shared vow, three PCs — Pay the Price fills its deadline once (issue #321 U55)", () => {
  it("the clock card lists the shared deadline once", async () => {
    seedTable(3, 4);
    await advanceClocksOnPayThePrice();
    await settle();
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.payThePriceAdvance);
    expect((card?.content.match(/<li>/g) ?? []).length).toBe(1);
    expect(card.content).toContain("Rescue Dani from the Wardens — 4/4 <strong>(TRIGGERED)</strong>");
  });

  it("one trigger vignette (one Claude call, one TRIGGERED card) for the one deadline", async () => {
    seedTable(3, 4);
    await advanceClocksOnPayThePrice();
    await settle();
    const triggeredCards = ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.clockVignetteCard);
    expect({ claudeCalls: narrateClockAdvancement.mock.calls.length, cards: triggeredCards.length })
      .toEqual({ claudeCalls: 1, cards: 1 });
  });

  it("every PC's copy still advances, and the result lists each copy for the Burn Momentum reversal", async () => {
    const copies = seedTable(3, 4);
    const advanced = await advanceClocksOnPayThePrice();
    await settle();
    expect(copies.map(c => c.system.clockTicks)).toEqual([4, 4, 4]);
    expect(advanced.filter(a => a.type === "vow").map(a => [a.actorId, a.itemId, a.vowId])).toEqual([
      ["pc-kira", "pc-kira-vow", "incite-msg-1"],
      ["pc-ren",  "pc-ren-vow",  "incite-msg-1"],
      ["pc-ash",  "pc-ash-vow",  "incite-msg-1"],
    ]);
  });

  it("the copies move together: a sibling the sync hook already moved is not advanced a second time", async () => {
    const copies = seedTable(2, 6);
    // registerSharedVowSyncHook: the first copy's write fans its value to the
    // siblings before the advance reaches them.
    copies[0].afterUpdate = () => { for (const c of copies.slice(1)) c.system.clockTicks = copies[0].system.clockTicks; };
    const advanced = await advanceClocksOnPayThePrice();
    await settle();
    expect(copies.map(c => c.system.clockTicks)).toEqual([3, 3, 3]);         // one segment, not two
    expect(copies.map(c => c.writes)).toEqual([[3], [], []]);
    expect(advanced.filter(a => a.type === "vow")).toHaveLength(3);
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.payThePriceAdvance);
    expect(card.content).toContain("Rescue Dani from the Wardens — 3/6");
    expect(narrateClockAdvancement).not.toHaveBeenCalled();
  });

  it("two PCs' own vows of the same name are two clocks — each keeps its line", async () => {
    for (const [actorId, name] of PCS.slice(0, 2)) {
      const own = sharedVowCopy(`${actorId}-own`, 1, 6);
      own.flags = { [MODULE_ID]: { vowId: `own-${actorId}` } };
      game.actors._set(actorId, makeTestActor({ id: actorId, name, type: "character", items: { contents: [own] } }));
    }
    await advanceClocksOnPayThePrice();
    await settle();
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.payThePriceAdvance);
    expect((card?.content.match(/<li>/g) ?? []).length).toBe(2);
  });
});
