/**
 * PROBE — SWEEP-09 REWARD-PICK-CLAIM-REFUSED-WRITE and SWEEP-10 VOW-LINK-CLAIM-REFUSED-WRITE
 * (sweep auditor, family 12 / 5: a one-shot card claimed before an effect whose
 * refusal is swallowed — the card says it landed, nothing did)
 *
 * SWEEP-09 — What the user does: picks a reward (or writes their own) on the
 * reward-choice card a sworn vow posts.
 * What happens: applyRewardPickFromRelay (src/session/swearVow.js:534-575)
 * claims the card (`rewardChosen: true`, :561) and then awaits
 * `setSharedVowReward(f.vowId, …)` (:566) — which returns `false` when a vow
 * copy's `setFlag` is refused (src/character/actorBridge.js:629-644) — but
 * ignores the result: the "🎁 Reward set: …" card is posted (:567) and
 * `{ applied: true }` returned. The card stays claimed (its buttons disabled
 * everywhere), the vow carries no `reward` flag, and the fulfilment later finds
 * none ("No concrete reward was chosen when this vow was sworn", src/index.js:4790)
 * and grants nothing. Its siblings release the claim when the effect does not
 * land: applyRecommitOffer on `write-refused` (src/moves/cardActions.js:565),
 * applyWaypointOraclePick / applyFulfilVowPick / applyMilestoneSuggestion /
 * applyCombatTrackBattle on a failed post.
 * What should happen: a refused reward write releases the claim and posts no
 * "Reward set" card (the press is the retry), and the handler reports
 * `applied: false`.
 *
 * SWEEP-10 — the same shape on the player-vow setup card's 🤝 Link:
 * applyPlayerVowLinkFromRelay (:861-890) claims `linkedConnection` (:879),
 * then `setVowLinkedConnection` (actorBridge.js:655-666) swallows a refused
 * `setFlag` and returns nothing; the "🤝 Linked to …" card posts (:885) and
 * `applied: true` is returned while no vow copy carries
 * `linkedConnectionName` — so the fulfilment deepens nothing.
 *
 * Controls: when the Item writes land, the pick is applied, the card posted
 * and the vow flagged.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sweep/claimBeforeRefusedWrite.probe.js
 */

/* global makeTestActor, makeTestMessage */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { applyRewardPickFromRelay, applyPlayerVowLinkFromRelay } from "../../../src/session/swearVow.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;
const CTX = { requesterId: "test-user", requester: { id: "test-user", isGM: true }, requesterIsGM: true, local: true };

/** A PC's copy of the shared vow "v1" — its Item flag writes refused or taken. */
function vowItem({ refuse }) {
  const flags = { [MODULE_ID]: { vowId: "v1", sharedVow: true } };
  return {
    id: "item-v1", type: "progress", name: "Find the drone", flags,
    system: { rank: 2, current: 0, completed: false },
    setFlag: vi.fn(async (m, k, v) => {
      if (refuse) throw new Error("test: the world refused the Item write");
      flags[m] = { ...(flags[m] ?? {}), [k]: v };
    }),
  };
}

function seed({ refuse }) {
  game.actors._reset();
  const pc = makeTestActor({ id: "pc-1", name: "Kira" });
  const item = vowItem({ refuse });
  pc.items = { contents: [item], get: (id) => (id === item.id ? item : null) };
  game.actors._set("pc-1", pc);
  // The connection the Link picker offers (src/session/swearVow.js:871-873 reads campaignState.connectionIds → getConnection).
  game.actors._set("actor-vex", makeTestActor({
    id: "actor-vex", name: "Vex", type: "character",
    flags: { [MODULE_ID]: { entityType: "connection", entityId: "rec-vex", connection: { _id: "rec-vex", name: "Vex", active: true } } },
  }));
  game.settings._store.set(KEY, { currentSessionId: "s1", connectionIds: ["actor-vex"] });
  return { pc, item };
}

function rewardCard() {
  const msg = makeTestMessage({
    content: "<p>Reward?</p>",
    flags: { [MODULE_ID]: { rewardChoiceCard: true, vowId: "v1", rewardOptions: [{ description: "A salvaged drone", form: "gear" }] } },
  });
  game.messages = { contents: [msg], get: (id) => (id === msg.id ? msg : null) };
  return msg;
}

function playerVowCard() {
  const msg = makeTestMessage({
    content: "<p>Link?</p>",
    flags: { [MODULE_ID]: { playerVowCard: true, vowId: "v1", vowName: "Find the drone" } },
  });
  game.messages = { contents: [msg], get: (id) => (id === msg.id ? msg : null) };
  return msg;
}

const cards = (flag) => ChatMessage._created.filter(c => c.flags?.[MODULE_ID]?.[flag]);

beforeEach(() => { ChatMessage._reset(); });
afterEach(() => { game.actors._reset(); game.settings._store.delete(KEY); });

describe("PROBE SWEEP-09 REWARD-PICK-CLAIM-REFUSED-WRITE", () => {
  it("a refused reward write: the card is not left claimed, no 'Reward set' card, applied: false", async () => {
    const { item } = seed({ refuse: true });
    const msg = rewardCard();
    const res = await applyRewardPickFromRelay({ messageId: msg.id, idx: 0 }, CTX);
    expect(item.setFlag).toHaveBeenCalled();                      // the write was attempted and refused
    // Expected: not applied, nothing promised. Today: applied: true and "🎁 Reward set" posted.
    expect.soft(res?.applied).toBe(false);
    expect.soft(cards("rewardSetCard")).toHaveLength(0);
    expect.soft(msg.flags?.[MODULE_ID]?.rewardChosen, "the claim is not released — the press cannot be retried").not.toBe(true);
    expect.soft(item.flags[MODULE_ID].reward).toBeUndefined();
  });

  it("control: a reward write the world takes is applied, posted and stamped", async () => {
    const { item } = seed({ refuse: false });
    const msg = rewardCard();
    const res = await applyRewardPickFromRelay({ messageId: msg.id, idx: 0 }, CTX);
    expect(res?.applied).toBe(true);
    expect(cards("rewardSetCard")).toHaveLength(1);
    expect(msg.flags[MODULE_ID].rewardChosen).toBe(true);
    expect(item.flags[MODULE_ID].reward).toMatchObject({ status: "promised", description: "A salvaged drone" });
  });
});

describe("PROBE SWEEP-10 VOW-LINK-CLAIM-REFUSED-WRITE", () => {
  it("a refused link write: the card is not left claimed, no 'Linked to' card, applied: false", async () => {
    const { item } = seed({ refuse: true });
    const msg = playerVowCard();
    const res = await applyPlayerVowLinkFromRelay({ messageId: msg.id, connectionName: "Vex" }, CTX);
    expect(item.setFlag).toHaveBeenCalled();
    // Expected: not applied, nothing linked. Today: applied: true and "🤝 Linked to Vex" posted.
    expect.soft(res?.applied).toBe(false);
    expect.soft(cards("vowLinkedCard")).toHaveLength(0);
    expect.soft(msg.flags?.[MODULE_ID]?.linkedConnection, "the claim is not released — the press cannot be retried").toBeFalsy();
    expect.soft(item.flags[MODULE_ID].linkedConnectionName).toBeUndefined();
  });

  it("control: a link write the world takes is applied, posted and stamped", async () => {
    const { item } = seed({ refuse: false });
    const msg = playerVowCard();
    const res = await applyPlayerVowLinkFromRelay({ messageId: msg.id, connectionName: "Vex" }, CTX);
    expect(res?.applied).toBe(true);
    expect(cards("vowLinkedCard")).toHaveLength(1);
    expect(msg.flags[MODULE_ID].linkedConnection).toBe("Vex");
    expect(item.flags[MODULE_ID].linkedConnectionName).toBe("Vex");
  });
});
