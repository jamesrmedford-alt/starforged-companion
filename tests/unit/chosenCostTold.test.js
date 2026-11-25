/* global makeTestActor */
/**
 * STARFORGED COMPANION
 * tests/unit/chosenCostTold.test.js
 *
 * CHOSEN-COST-NEVER-TOLD (the long haul's fourth live run, issue #383 —
 * a26–a27, a35–a36): two Endure Stress costs (spirit 5 → 1) were chosen on
 * their cards after the roll's narration — in free-flow the choice card posts
 * after it — and no narration ever told them. Overhaul 4, slice 5 (D10): the
 * pick stamps its card `pickedAfterNarration` when the result's narration is
 * on the table; the next narration that is a beat of play (a move's, a paced
 * line's, a round's) carries TELL [chosen-since] for each such pick no
 * narration has told, and once its card posts the canonical GM stamps the
 * pick `toldBy` — told once. A pick made before the narration is the
 * result's own TELL [chosen] (slice 2).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { choicesChosenSince, markChosenCostsTold, obligationsFor, formatObligationsBlock } from "../../src/moves/contracts/obligations.js";
import { mapConsequences } from "../../src/moves/resolver.js";

const MODULE_ID = "starforged-companion";

/** A suffer card for an Endure Harm weak hit's cost, as the pipeline posts it — the pick on it as the handler leaves it. */
function sufferCard(id, over = {}) {
  const prompt = mapConsequences("face_danger", "weak_hit", false).sufferPrompt;
  const card = {
    id,
    flags: { [MODULE_ID]: { sufferCard: true, sufferPrompt: prompt, resolutionId: "res-a26", actorId: "pc-mira",
      resolved: true, pickedSuffers: ["endure_stress"], pickedAfterNarration: true, ...over } },
    async update(data) {
      for (const [k, v] of Object.entries(data)) {
        const key = k.replace(`flags.${MODULE_ID}.`, "");
        card.flags[MODULE_ID][key] = v;
      }
      return card;
    },
  };
  return card;
}

let saved;
beforeEach(() => {
  saved = { messages: game.messages, user: game.user };
  game.actors._reset();
  game.actors._set("pc-mira", makeTestActor({ id: "pc-mira", name: "Mira Kestrel" }));
  game.user = { id: "gm-1", isGM: true };
});
afterEach(() => { game.messages = saved.messages; game.user = saved.user; });

const installCards = (...cards) => {
  game.messages = { contents: cards, get: (id) => cards.find(c => c.id === id) ?? null };
};

describe("a cost chosen after its narration is told by the next beat of play — once", () => {
  it("the pick is read, and the next narration's block carries TELL [chosen-since]", () => {
    installCards(sufferCard("card-1"));
    const since = choicesChosenSince();
    expect(since).toEqual([{ cardId: "card-1", resolutionId: "res-a26", who: "Mira Kestrel", labels: ["endure stress"] }]);
    const block = formatObligationsBlock(obligationsFor({ mode: "paced", chosenSince: since }));
    expect(block).toContain("- [chosen-since] Since the last narration, Mira Kestrel chose endure stress. Show what it has cost them, in a sentence, before the beat goes on.");
    expect(formatObligationsBlock(obligationsFor({ mode: "move", resolution: { moveId: "face_danger", outcome: "strong_hit" }, chosenSince: since })))
      .toContain("- [chosen-since] Since the last narration, Mira Kestrel chose endure stress.");
  });

  it("stamped toldBy once its narration's card posts (canonical GM): not told again", async () => {
    const card = sufferCard("card-1");
    installCards(card);
    await markChosenCostsTold(choicesChosenSince(), "nar-2");
    expect(card.flags[MODULE_ID].toldBy).toBe("nar-2");
    expect(choicesChosenSince()).toEqual([]);
  });

  it("a player's own key cannot stamp it — the next GM narration tells it again (accepted)", async () => {
    const card = sufferCard("card-1");
    installCards(card);
    game.user = { id: "pl-1", isGM: false };
    await markChosenCostsTold(choicesChosenSince(), "nar-2");
    expect(card.flags[MODULE_ID].toldBy ?? null).toBeNull();
    expect(choicesChosenSince()).toHaveLength(1);
  });

  it("not carried: a pick made before the narration (its result's own [chosen]), an X-Carded or superseded card, the narration's own result", () => {
    installCards(
      sufferCard("before", { pickedAfterNarration: false }),
      sufferCard("xcarded", { xCarded: true }),
      sufferCard("superseded", { superseded: true }),
      sufferCard("own", { resolutionId: "res-now" }),
    );
    expect(choicesChosenSince({ except: ["res-now"] })).toEqual([]);
  });

  it("control: an open card (no pick) is no cost chosen", () => {
    installCards(sufferCard("open", { resolved: false, pickedSuffers: [] }));
    expect(choicesChosenSince()).toEqual([]);
  });
});
