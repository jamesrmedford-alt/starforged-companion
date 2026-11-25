/**
 * STARFORGED COMPANION
 * tests/unit/beginFightKeepsHeldResult.test.js
 *
 * HELD-RESULT-NARRATED-AFTER-THE-NEXT-LINE (the long haul's fourth live run,
 * issue #383 — a38–a41): an Enter the Fray miss held for Burn / Improve /
 * Keep was not kept by "⚔ Begin the fight"; the next attack line kept it, and
 * the roll was narrated after that line. Overhaul 4, slice 5 (D11, amending
 * issue #362 D5 — who goes on keeps it): a press on a card the held roll
 * itself posted keeps the held result first. Begin the fight claims its card,
 * keeps the Enter the Fray (its narration told the fight begun), then makes
 * the fight; Find another way keeps it before the way-out card.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const order = [];
vi.mock("../../src/moves/heldResult.js", async (importOriginal) => ({
  ...(await importOriginal()),
  keepHeldResultForChoice: vi.fn(async (resolutionId) => { order.push(`keep:${resolutionId}`); return { applied: true }; }),
}));
vi.mock("../../src/index.js", () => ({
  createCombatTrackFromThreshold: vi.fn(async ({ label }) => { order.push(`fight:${label}`); return { track: { id: "fight-1", label } }; }),
}));

import { applyCombatThresholdChoice } from "../../src/moves/cardActions.js";
import { keepHeldResultForChoice } from "../../src/moves/heldResult.js";

const MODULE_ID = "starforged-companion";

function thresholdCard(over = {}) {
  const card = {
    id: "th-1", content: "<div></div>",
    flags: { [MODULE_ID]: { combatThresholdCard: true, label: "The Ashen Wake", position: "bad_spot", actorId: "pc-mira", resolutionId: "res-a38", ...over } },
    async update(data) {
      for (const [k, v] of Object.entries(data)) if (k.startsWith(`flags.${MODULE_ID}.`)) card.flags[MODULE_ID][k.slice(`flags.${MODULE_ID}.`.length)] = v;
      return card;
    },
  };
  return card;
}

let posted;
beforeEach(() => {
  order.length = 0;
  keepHeldResultForChoice.mockClear();
  posted = [];
  globalThis.ChatMessage = { create: vi.fn(async (data) => { order.push("card:way-out"); posted.push(data); return data; }) };
});

const install = (card) => { game.messages = { contents: [card], get: (id) => (id === card.id ? card : null) }; };

describe("a press on the held roll's own card keeps it first (D11)", () => {
  it("⚔ Begin the fight: claimed, the held Enter the Fray kept — its narration — then the fight made", async () => {
    const card = thresholdCard();
    install(card);
    const r = await applyCombatThresholdChoice({ messageId: "th-1", choice: "fray", rank: "dangerous" }, { requesterIsGM: true });
    expect(r).toMatchObject({ applied: true });
    expect(card.flags[MODULE_ID].thresholdTaken).toBe("fray");
    expect(order).toEqual(["keep:res-a38", "fight:The Ashen Wake"]);
  });

  it("🚪 Find another way: kept before the way-out card", async () => {
    install(thresholdCard());
    await applyCombatThresholdChoice({ messageId: "th-1", choice: "wayOut" }, { requesterIsGM: true });
    expect(order).toEqual(["keep:res-a38", "card:way-out"]);
  });

  it("control: a card already taken keeps nothing and makes nothing", async () => {
    install(thresholdCard({ thresholdTaken: "fray" }));
    await applyCombatThresholdChoice({ messageId: "th-1", choice: "fray" }, { requesterIsGM: true });
    expect(order).toEqual([]);
    expect(keepHeldResultForChoice).not.toHaveBeenCalled();
  });
});
