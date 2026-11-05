/**
 * PROBE — UPGRADES-04 SUFFER-PICK-GONE-PC-FIRST-PC (tenth audit, area upgrades)
 *
 * What the user does: a suffer-choice card is on the table for Kira (a weak
 * hit's "Resolve consequence", a harm's resist card, an at-0 choice). Before
 * anyone picks, Kira's Actor is deleted — the GM retires the character, or
 * removes a duplicate. Ren's player, who owns only Ren, presses a button on
 * the stale card.
 *
 * What happens: applySufferPickFromRelay (src/moves/sufferCard.js:421-430)
 * resolves the card's PC to null and SKIPS the ownership check — it is made
 * only `if (actor && …)` — then handleSufferPick (:465) falls back to
 * `getPlayerActors()[0]`: the first player character in the world. The pick
 * is applied to whoever that is — Ren, or a third player's character — and
 * the card says "Applied: …". A player who owns no PC gets the same.
 *
 * What should happen: a card whose PC is gone applies to nobody; a requester
 * who is not a GM and does not own the card's PC is refused (decisions.md
 * "Multiplayer attribution"; issue #326 D8 / #331 X19: a PC-less or
 * mismatched requester is never handed another player's character). The
 * ninth audit's family-11 sweep cleared this fallback as sitting behind
 * `requesterOwnsActor` — it does so only while the PC exists.
 *
 * Control: with Kira present, Ren's player's press is refused as not-owner
 * and nothing changes.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/upgrades/sufferPickGonePcFirstPc.probe.js
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from "vitest";
import { postSufferChoiceCard, applySufferPickFromRelay } from "../../../src/moves/sufferCard.js";
import { invalidateActorCache } from "../../../src/character/actorBridge.js";

const MODULE_ID = "starforged-companion";
const REN_PLAYER = { requesterId: "pl-2", requesterIsGM: false, requester: { id: "pl-2", isGM: false } };
const PROMPT = { kind: "enumerated", options: [{ label: "-1 health", health: -1 }, { label: "Lose Momentum (-2)", suffer: "lose_momentum", amount: 2 }] };

let kira, ren;
beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  globalThis.game.messages = {
    get: (id) => ChatMessage._created.find(m => m.id === id) ?? null,
    get contents() { return ChatMessage._created; },
  };
  kira = makeTestActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { health: { value: 5 }, momentum: { value: 5 } } });
  ren  = makeTestActor({ id: "pc-ren",  name: "Ren",  ownership: { "pl-2": 3 }, system: { health: { value: 5 }, momentum: { value: 5 } } });
  game.actors._set(kira.id, kira);
  game.actors._set(ren.id, ren);
  invalidateActorCache(kira.id);
  invalidateActorCache(ren.id);
});

describe("UPGRADES-04 a pick on a card whose PC is gone lands on the first PC", () => {
  it("Ren's player presses Kira's stale card after Kira's Actor was deleted — nobody's health should change", async () => {
    const card = await postSufferChoiceCard({ sufferPrompt: PROMPT, actor: kira, executorOpts: {}, moveId: "endure_harm", resolutionId: null });
    expect(card.flags[MODULE_ID].actorId).toBe("pc-kira");

    // Kira's Actor is gone; Ren is now the world's first player character.
    game.actors._reset();
    game.actors._set(ren.id, ren);

    const res = await applySufferPickFromRelay({ messageId: card.id, pickKind: "enum", optionIndex: "0" }, REN_PLAYER);

    // Expected: refused (no PC to apply to / not the requester's), Ren untouched.
    // Actual: applied — Ren's health 5 → 4, the card stamped "Applied: Health -1".
    expect(ren.system.health.value).toBe(5);
    expect.soft(res.applied).toBe(false);
    expect.soft(card.flags[MODULE_ID].resolved).not.toBe(true);
  });

  it("control: with Kira present, Ren's player's press on her card is refused as not-owner", async () => {
    const card = await postSufferChoiceCard({ sufferPrompt: PROMPT, actor: kira, executorOpts: {}, moveId: "endure_harm", resolutionId: null });
    const res = await applySufferPickFromRelay({ messageId: card.id, pickKind: "enum", optionIndex: "0" }, REN_PLAYER);
    expect(res).toMatchObject({ applied: false, reason: "not-owner" });
    expect(kira.system.health.value).toBe(5);
    expect(ren.system.health.value).toBe(5);
  });
});
