/**
 * Issue #336 Y20 SUFFER-PICK-GONE-PC-FIRST-PC — a pick on a suffer card
 * whose PC is gone applies to nobody.
 *
 * A suffer-choice card is pending for Kira (a weak hit's "Resolve
 * consequence", a resist card, an at-0 choice) and Kira's Actor is deleted
 * before anyone picks. Ren's player — who owns only Ren — pressed the stale
 * card: applySufferPickFromRelay resolved the card's PC to null and skipped
 * the ownership check (`if (actor && …)`), then handleSufferPick fell back
 * to `getPlayerActors()[0]` and applied the pick to the world's first PC —
 * Ren — stamping the card "Applied: Health -1". Every W11 handler and X19's
 * fix refuse a requester handed no PC of their own. Now a player is refused,
 * and a GM's press applies nothing and the card says its character is gone.
 *
 * (Converted from the tenth audit's probe
 * tests/probes/upgrades/sufferPickGonePcFirstPc.probe.js.)
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from "vitest";
import { postSufferChoiceCard, applySufferPickFromRelay } from "../../src/moves/sufferCard.js";
import { invalidateActorCache } from "../../src/character/actorBridge.js";

const MODULE_ID = "starforged-companion";
const REN_PLAYER = { requesterId: "pl-2", requesterIsGM: false, requester: { id: "pl-2", isGM: false } };
const PCLESS    = { requesterId: "pl-3", requesterIsGM: false, requester: { id: "pl-3", isGM: false } };
const GM        = { requesterId: "gm-1", requesterIsGM: true,  requester: { id: "gm-1", isGM: true } };
const KIRA_PLAYER = { requesterId: "pl-1", requesterIsGM: false, requester: { id: "pl-1", isGM: false } };
const PROMPT = { kind: "enumerated", options: [{ label: "-1 health", health: -1 }, { label: "Lose Momentum (-2)", suffer: "lose_momentum", amount: 2 }] };

let kira, ren;
beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  game.user.character = null;
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

/** Kira's card, then Kira's Actor deleted: Ren is the world's first player character. */
async function kirasCardThenKiraGone() {
  const card = await postSufferChoiceCard({ sufferPrompt: PROMPT, actor: kira, executorOpts: {}, moveId: "endure_harm", resolutionId: null });
  expect(card.flags[MODULE_ID].actorId).toBe("pc-kira");
  game.actors._reset();
  game.actors._set(ren.id, ren);
  return card;
}

describe("issue #336 Y20 — a pick on a card whose PC is gone applies to nobody", () => {
  it("Ren's player presses Kira's stale card after Kira's Actor was deleted: refused, Ren untouched", async () => {
    const card = await kirasCardThenKiraGone();

    const res = await applySufferPickFromRelay({ messageId: card.id, pickKind: "enum", optionIndex: "0" }, REN_PLAYER);

    expect(res).toEqual({ applied: false, reason: "no-actor" });
    expect(ren.system.health.value).toBe(5);
    expect(card.flags[MODULE_ID].resolved).not.toBe(true);
  });

  it("a player who owns no character presses it: refused the same way", async () => {
    const card = await kirasCardThenKiraGone();
    const res = await applySufferPickFromRelay({ messageId: card.id, pickKind: "enum", optionIndex: "1" }, PCLESS);
    expect(res).toEqual({ applied: false, reason: "no-actor" });
    expect(ren.system.momentum.value).toBe(5);
  });

  it("a GM's press applies nothing to anyone, and the card says its character is gone", async () => {
    const card = await kirasCardThenKiraGone();

    const res = await applySufferPickFromRelay({ messageId: card.id, pickKind: "enum", optionIndex: "0" }, GM);

    expect(res).toEqual({ applied: false, reason: "no-actor" });
    expect(ren.system.health.value).toBe(5);
    expect(card.flags[MODULE_ID].resolved).toBe(true);
    expect(card.content).toMatch(/no longer in the world — nothing on it was applied/);
    expect(card.content).not.toMatch(/data-action="sf-suffer-pick"/);
    // A second press finds it resolved.
    await expect(applySufferPickFromRelay({ messageId: card.id, pickKind: "enum", optionIndex: "0" }, GM))
      .resolves.toMatchObject({ applied: false, reason: "already-resolved" });
  });

  it("a card naming no PC never falls back to the GM's own character or the first PC", async () => {
    game.user.character = ren;                          // the GM's own bound character
    const card = await postSufferChoiceCard({ sufferPrompt: PROMPT, actor: null, executorOpts: {}, moveId: "endure_harm" });
    expect(card.flags[MODULE_ID].actorId ?? null).toBeNull();

    const res = await applySufferPickFromRelay({ messageId: card.id, pickKind: "enum", optionIndex: "0" }, GM);

    expect(res).toMatchObject({ applied: false, reason: "no-actor" });
    expect(ren.system.health.value).toBe(5);
    expect(kira.system.health.value).toBe(5);
  });

  it("control: with Kira present, Ren's player's press on her card is refused as not-owner", async () => {
    const card = await postSufferChoiceCard({ sufferPrompt: PROMPT, actor: kira, executorOpts: {}, moveId: "endure_harm", resolutionId: null });
    const res = await applySufferPickFromRelay({ messageId: card.id, pickKind: "enum", optionIndex: "0" }, REN_PLAYER);
    expect(res).toMatchObject({ applied: false, reason: "not-owner" });
    expect(kira.system.health.value).toBe(5);
    expect(ren.system.health.value).toBe(5);
  });

  it("control: Kira's own player's press applies to Kira", async () => {
    const card = await postSufferChoiceCard({ sufferPrompt: PROMPT, actor: kira, executorOpts: {}, moveId: "endure_harm", resolutionId: null });
    const res = await applySufferPickFromRelay({ messageId: card.id, pickKind: "enum", optionIndex: "0" }, KIRA_PLAYER);
    expect(res).toMatchObject({ applied: true });
    expect(kira.system.health.value).toBe(4);
    expect(ren.system.health.value).toBe(5);
  });
});
