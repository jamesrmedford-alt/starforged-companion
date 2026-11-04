/**
 * PROBE — UPG-01 LOSE-MOMENTUM-AT-MIN-FREE (ninth audit, area upgrades)
 *
 * What the user does: Kira's momentum is already at its minimum (-6). A
 * consequence card asks her to pay a price — the "any" picker ("Make a suffer
 * move (-2)": a Set a Course weak hit's "one suffer move", a Pay the Price
 * route, a Sacrifice Resources redirect) or an enumerated choice with a Lose
 * Momentum option (Endure Harm's miss: "-1 health or Lose Momentum (-2)",
 * Heal's weak hit, Check Your Gear's weak hit …). She taps Lose Momentum.
 *
 * What happens: sufferCard.js offers Lose Momentum regardless of the PC's
 * momentum (anySufferBlocked, src/moves/sufferCard.js:106-109, blocks only an
 * excluded move and Sacrifice Resources while unprepared at 0; isOptionAvailable,
 * src/moves/sufferDialog.js:530-567, has no momentum rule). The pick is claimed
 * and run (applySufferPickFromRelay → handleSufferPick, sufferCard.js:383-523):
 * loseMomentum (src/moves/sufferExecutor.js:120-141) writes momentum -6 → -6,
 * posts "Momentum: -6 → -6 (at minimum; pick a redirect or clear progress)",
 * and the choice card resolves "Applied: Lose Momentum (-2)". Nothing was
 * paid, no other card asks for the cost, and the move's Burn / Improve are
 * closed as "the consequence was already chosen" (closeUpgradesForChoice).
 *
 * What should happen: Lose Momentum — "When your momentum is at its minimum
 * (-6) and you must suffer -momentum, choose one: … apply the cost to a
 * different suffer move … [or] clear 1 unit of progress on that track per its
 * rank" (vendor Lose_Momentum_93d2d69b7e2b85e1; play kit p. 6). The cost is
 * never settled for nothing: either the option is unavailable at -6 (the shape
 * issue #325 W16 gave Sacrifice Resources while unprepared at 0 — the loss
 * goes to a different suffer move) or the pick chains into the redirect /
 * clear-progress choice. Known item MOMENTUM-MIN-REDIRECT-MANUAL is the
 * neighbouring gap (an at-min remainder is only described on the card); this
 * is the pick itself being offered and settling the whole cost free.
 *
 * Controls: at momentum 0 the same pick lands -2 and resolves the card; the
 * W16 rule still blocks Sacrifice Resources while unprepared at 0.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/upgrades/loseMomentumAtMinFree.probe.js
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from "vitest";
import { applySufferPickFromRelay, renderSufferCard } from "../../../src/moves/sufferCard.js";
import { invalidateActorCache } from "../../../src/character/actorBridge.js";
import { mapConsequences } from "../../../src/moves/resolver.js";

const MODULE_ID = "starforged-companion";
const GM = { requesterId: "gm-1", requesterIsGM: true, requester: { id: "gm-1", isGM: true } };

let pc;

/** A GM-authored suffer-choice card as sufferCard.js posts it (the unit tests' stub shape). */
function sufferCardMessage(prompt, extra = {}) {
  const msg = {
    id: "m-suffer",
    content: renderSufferCard(prompt, pc, []),
    flags: { [MODULE_ID]: { sufferCard: true, sufferPrompt: prompt, executorOpts: { isMiss: true }, actorId: pc.id,
      moveId: "face_danger", resolutionId: "res-1", pickedIndices: [], resolved: false, ...extra } },
    async update(changes) {
      for (const [path, val] of Object.entries(changes)) {
        if (path === "content") { msg.content = val; continue; }
        const parts = path.split(".");
        let t = msg;
        for (let i = 0; i < parts.length - 1; i++) t = (t[parts[i]] ??= {});
        t[parts.at(-1)] = val;
      }
    },
  };
  game.messages = { contents: [msg], get: (id) => (id === msg.id ? msg : null) };
  return msg;
}

/** Choice cards posted while the pick ran (a redirect / clear-progress picker would be one). */
const followUpChoiceCards = () =>
  ChatMessage._created.filter(m => m?.flags?.[MODULE_ID]?.sufferCard && m.flags[MODULE_ID].sufferPrompt);

beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  pc = makeTestActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: -6 } } });
  game.actors._set(pc.id, pc);
  invalidateActorCache(pc.id);
});

describe("UPG-01 a Lose Momentum pick at the momentum minimum settles the cost for nothing", () => {
  it("the 'any' picker: Lose Momentum (-2) at -6 is not offered as a free way out, or chains into the redirect", async () => {
    const card = sufferCardMessage({ kind: "any", amount: 2, count: 1 });
    const res  = await applySufferPickFromRelay({ messageId: card.id, pickKind: "any", sufferId: "lose_momentum" }, GM);

    const settledForNothing = res.applied === true
      && card.flags[MODULE_ID].resolved === true
      && pc.system.momentum.value === -6
      && followUpChoiceCards().length === 0;
    // Expected: false — the pick is refused ("not-offered", the button unavailable as
    // Sacrifice Resources is while unprepared at 0) or a redirect / clear-progress card
    // follows. Actual: true — "Applied: Lose Momentum (-2)", momentum -6 → -6, nothing else.
    expect(settledForNothing).toBe(false);
  });

  it("an enumerated choice: Endure Harm's miss 'Lose Momentum (-2)' at -6 is not settled free either", async () => {
    const prompt = mapConsequences("endure_harm", "miss", false).sufferPrompt;   // "-1 health" | "Lose Momentum (-2)"
    const loseIdx = prompt.options.findIndex(o => o.suffer === "lose_momentum");
    const card = sufferCardMessage(prompt);
    const res  = await applySufferPickFromRelay({ messageId: card.id, pickKind: "enum", optionIndex: String(loseIdx) }, GM);

    const settledForNothing = res.applied === true
      && card.flags[MODULE_ID].resolved === true
      && pc.system.momentum.value === -6
      && pc.system.health.value === 5
      && followUpChoiceCards().length === 0;
    expect(settledForNothing).toBe(false);   // actual: true — the miss cost Kira nothing
  });

  it("control: at momentum 0 the same 'any' pick lands -2 and resolves the card", async () => {
    pc.system.momentum.value = 0;
    const card = sufferCardMessage({ kind: "any", amount: 2, count: 1 });
    await expect(applySufferPickFromRelay({ messageId: card.id, pickKind: "any", sufferId: "lose_momentum" }, GM))
      .resolves.toEqual({ applied: true });
    expect(pc.system.momentum.value).toBe(-2);
    expect(card.flags[MODULE_ID].resolved).toBe(true);
  });

  it("control (issue #325 W16): Sacrifice Resources while unprepared at 0 supply is not offered", async () => {
    pc.system.supply.value = 0;
    pc.system.debility.unprepared = true;
    invalidateActorCache(pc.id);
    const card = sufferCardMessage({ kind: "any", amount: 1, count: 1 });
    await expect(applySufferPickFromRelay({ messageId: card.id, pickKind: "any", sufferId: "sacrifice_resources" }, GM))
      .resolves.toEqual({ applied: false, reason: "not-offered" });
    expect(card.flags[MODULE_ID].resolved).toBe(false);
  });
});
