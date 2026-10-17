/**
 * STARFORGED COMPANION
 * tests/unit/moveCardRelay.test.js
 *
 * Burn Momentum / Improve Result double-apply fix. The move card is authored
 * by the canonical GM, so a player's click could never update its `consumed`
 * flag — the button stayed live and a second click re-applied the meter
 * deltas. Clicks now relay to the canonical GM (gmRelay "move.burnMomentum" /
 * "move.improveResult"); these tests pin:
 *   - applyBurnFromRelay / applyImproveFromRelay apply exactly once (consumed
 *     re-check + in-flight guard against near-simultaneous clicks);
 *   - the requester must be a GM or own the actor;
 *   - relayCardButtonClick restores the button when the request fails, no GM
 *     is connected, a local run leaves the card unconsumed, or a relayed run
 *     is not acknowledged within RELAY_RECOVERY_MS.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/multiplayer/gmRelay.js", () => ({
  requestGmAction: vi.fn(),
}));

import { requestGmAction } from "../../src/multiplayer/gmRelay.js";
import {
  applyBurnFromRelay,
  relayCardButtonClick,
  requesterOwnsActor,
  registerBurnMomentumHook,
  RELAY_RECOVERY_MS,
} from "../../src/moves/burnMomentum.js";
import {
  applyImproveFromRelay,
  registerImproveResultHook,
} from "../../src/moves/improveResult.js";
import { invalidateActorCache } from "../../src/character/actorBridge.js";

const MODULE_ID = "starforged-companion";

const GM_CTX     = { requesterId: "gm-1", requester: { id: "gm-1", isGM: true }, requesterIsGM: true, local: true };
const OWNER_CTX  = { requesterId: "pl-1", requester: { id: "pl-1", isGM: false }, requesterIsGM: false, local: false };
const OTHER_CTX  = { requesterId: "pl-2", requester: { id: "pl-2", isGM: false }, requesterIsGM: false, local: false };

function installPc(id = "pc-burn", momentum = 8) {
  const pc = makeTestActor({
    id, type: "character", name: "Kira",
    system: { momentum: { value: momentum, max: 10, min: -6, resetValue: 2 } },
  });
  pc.ownership = { "pl-1": 3 };
  game.actors._set(id, pc);
  invalidateActorCache(id);
  return pc;
}

function makeCard(id, moduleFlags) {
  const msg = {
    id,
    content: `<div class="sf-move-card"><div class="sf-move-outcome">Weak Hit</div></div>`,
    flags: { [MODULE_ID]: moduleFlags },
    update: vi.fn(async (changes) => {
      for (const [path, val] of Object.entries(changes)) {
        if (path === "content") { msg.content = val; continue; }
        const parts = path.split(".");
        let t = msg;
        for (let i = 0; i < parts.length - 1; i++) t = (t[parts[i]] ??= {});
        t[parts.at(-1)] = val;
      }
    }),
  };
  return msg;
}

function installMessages(...msgs) {
  game.messages = { contents: msgs, get: (id) => msgs.find(m => m.id === id) ?? null };
}

function burnCard(id = "m-burn") {
  return makeCard(id, {
    burn: {
      canBurn: true, challengeDice: [2, 7], momentum: 8, markedImpactCount: 0,
      moveId: "gather_information", originalOutcome: "weak_hit",
      originalConsequences: { momentumChange: 1, healthChange: 0, spiritChange: 0, supplyChange: 0 },
      previewOutcome: "strong_hit", originalApplied: true, actorId: "pc-burn",
      resolutionId: null, ptpReversals: null,
    },
  });
}

function improveCard(id = "m-imp") {
  return makeCard(id, {
    improve: {
      canImprove: true, improveTo: "strong_hit", moveId: "gather_information", isMatch: false,
      originalOutcome: "weak_hit",
      originalConsequences: { momentumChange: 1, healthChange: 0, spiritChange: 0, supplyChange: 0 },
      originalApplied: true, actorId: "pc-burn", resolutionId: null,
      assetId: null, abilityIndex: null, assetName: "Fugitive", abilityName: "",
      hasClock: false, clockMax: 4, consumed: false,
    },
  });
}

const narrate = vi.fn(async () => {});
const persist = vi.fn(async () => {});

beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: "s1" });
  ChatMessage._reset();
  narrate.mockClear();
  persist.mockClear();
  requestGmAction.mockReset();
  registerBurnMomentumHook({ narrate, persist });
  registerImproveResultHook({ narrate, persist });
});


// ─────────────────────────────────────────────────────────────────────────────
// requesterOwnsActor
// ─────────────────────────────────────────────────────────────────────────────

describe("requesterOwnsActor", () => {
  it("allows a GM requester and an owning player; refuses others", () => {
    const pc = installPc();
    expect(requesterOwnsActor(pc, GM_CTX)).toBe(true);
    expect(requesterOwnsActor(pc, OWNER_CTX)).toBe(true);
    expect(requesterOwnsActor(pc, OTHER_CTX)).toBe(false);
    expect(requesterOwnsActor(pc, {})).toBe(false);
  });

  it("prefers Foundry's testUserPermission when available", () => {
    const pc = installPc();
    pc.testUserPermission = (user, level) => user.id === "pl-2" && level === "OWNER";
    expect(requesterOwnsActor(pc, OTHER_CTX)).toBe(true);
    expect(requesterOwnsActor(pc, OWNER_CTX)).toBe(false);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// applyBurnFromRelay
// ─────────────────────────────────────────────────────────────────────────────

describe("applyBurnFromRelay", () => {
  it("applies the burn once and marks the card consumed", async () => {
    const pc   = installPc();
    const card = burnCard();
    installMessages(card);

    const res = await applyBurnFromRelay({ messageId: "m-burn" }, OWNER_CTX);

    expect(res).toEqual({ applied: true });
    expect(card.flags[MODULE_ID].burn.consumed).toBe(true);
    expect(pc._updateHistory.length).toBeGreaterThan(0);
    expect(narrate).toHaveBeenCalledTimes(1);   // deps stored at registration
  });

  it("a second click after consumption re-applies nothing", async () => {
    const pc = installPc();
    installMessages(burnCard());
    await applyBurnFromRelay({ messageId: "m-burn" }, OWNER_CTX);
    const writes = pc._updateHistory.length;

    const again = await applyBurnFromRelay({ messageId: "m-burn" }, OWNER_CTX);

    expect(again).toEqual({ applied: false, reason: "already-consumed" });
    expect(pc._updateHistory.length).toBe(writes);
    expect(narrate).toHaveBeenCalledTimes(1);
  });

  it("two near-simultaneous clicks apply once (in-flight guard)", async () => {
    installPc();
    installMessages(burnCard());

    const [a, b] = await Promise.all([
      applyBurnFromRelay({ messageId: "m-burn" }, OWNER_CTX),
      applyBurnFromRelay({ messageId: "m-burn" }, GM_CTX),
    ]);

    expect([a.applied, b.applied].filter(Boolean)).toHaveLength(1);
    expect(narrate).toHaveBeenCalledTimes(1);
  });

  it("refuses a requester who neither is a GM nor owns the actor", async () => {
    const pc   = installPc();
    const card = burnCard();
    installMessages(card);

    const res = await applyBurnFromRelay({ messageId: "m-burn" }, OTHER_CTX);

    expect(res).toEqual({ applied: false, reason: "not-owner" });
    expect(pc._updateHistory).toHaveLength(0);
    expect(card.update).not.toHaveBeenCalled();
    expect(getCapturedWarns().some(w => /burn refused/.test(w))).toBe(true);
  });

  it("warns and stops when the card is gone", async () => {
    installMessages();
    const res = await applyBurnFromRelay({ messageId: "nope" }, GM_CTX);
    expect(res).toEqual({ applied: false, reason: "no-message" });
    expect(getCapturedWarns().some(w => /not found/.test(w))).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// applyImproveFromRelay
// ─────────────────────────────────────────────────────────────────────────────

describe("applyImproveFromRelay", () => {
  it("applies the improvement once and marks the card consumed", async () => {
    const pc   = installPc();
    const card = improveCard();
    installMessages(card);

    const first  = await applyImproveFromRelay({ messageId: "m-imp" }, OWNER_CTX);
    const writes = pc._updateHistory.length;
    const second = await applyImproveFromRelay({ messageId: "m-imp" }, OWNER_CTX);

    expect(first).toEqual({ applied: true });
    expect(card.flags[MODULE_ID].improve.consumed).toBe(true);
    expect(second).toEqual({ applied: false, reason: "already-consumed" });
    expect(pc._updateHistory.length).toBe(writes);
    expect(narrate).toHaveBeenCalledTimes(1);
  });

  it("two near-simultaneous clicks apply once", async () => {
    installPc();
    installMessages(improveCard());
    const results = await Promise.all([
      applyImproveFromRelay({ messageId: "m-imp" }, OWNER_CTX),
      applyImproveFromRelay({ messageId: "m-imp" }, OWNER_CTX),
    ]);
    expect(results.filter(r => r.applied)).toHaveLength(1);
  });

  it("refuses a non-owner requester", async () => {
    const pc = installPc();
    installMessages(improveCard());
    const res = await applyImproveFromRelay({ messageId: "m-imp" }, OTHER_CTX);
    expect(res).toEqual({ applied: false, reason: "not-owner" });
    expect(pc._updateHistory).toHaveLength(0);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// relayCardButtonClick — the button's local state recovers
// ─────────────────────────────────────────────────────────────────────────────

describe("relayCardButtonClick", () => {
  afterEach(() => { vi.useRealTimers(); });

  function args(over = {}) {
    return {
      kind: "move.burnMomentum", messageId: "m1",
      isConsumed: vi.fn(() => false),
      restore: vi.fn(),
      ...over,
    };
  }

  it("sends only the message id to the GM", async () => {
    requestGmAction.mockResolvedValue({ ok: true, relayed: false });
    const a = args({ isConsumed: () => true });
    await relayCardButtonClick(a);
    expect(requestGmAction).toHaveBeenCalledWith("move.burnMomentum", { messageId: "m1" });
    expect(a.restore).not.toHaveBeenCalled();
  });

  it("restores when no GM is connected", async () => {
    requestGmAction.mockResolvedValue({ ok: false, reason: "no-gm" });
    const a = args();
    await relayCardButtonClick(a);
    expect(a.restore).toHaveBeenCalledTimes(1);
  });

  it("restores (and reports) when the request throws", async () => {
    expectConsoleError(/click handler failed/);
    requestGmAction.mockRejectedValue(new Error("boom"));
    const a = args();
    await relayCardButtonClick(a);
    expect(a.restore).toHaveBeenCalledTimes(1);
  });

  it("restores when a local (canonical-GM) run leaves the card unconsumed", async () => {
    requestGmAction.mockResolvedValue({ ok: true, relayed: false });
    const a = args({ isConsumed: () => false });
    await relayCardButtonClick(a);
    expect(a.restore).toHaveBeenCalledTimes(1);
  });

  it("restores a relayed click that is not acknowledged within the recovery window", async () => {
    vi.useFakeTimers();
    requestGmAction.mockResolvedValue({ ok: true, relayed: true });
    const a = args({ isConsumed: () => false });
    await relayCardButtonClick(a);
    expect(a.restore).not.toHaveBeenCalled();
    vi.advanceTimersByTime(RELAY_RECOVERY_MS);
    expect(a.restore).toHaveBeenCalledTimes(1);
  });

  it("leaves a relayed click alone once the GM consumed the card", async () => {
    vi.useFakeTimers();
    requestGmAction.mockResolvedValue({ ok: true, relayed: true });
    let consumed = false;
    const a = args({ isConsumed: () => consumed });
    await relayCardButtonClick(a);
    consumed = true;
    vi.advanceTimersByTime(RELAY_RECOVERY_MS);
    expect(a.restore).not.toHaveBeenCalled();
  });

  it("restores immediately when the card has no id", async () => {
    const a = args({ messageId: undefined });
    await relayCardButtonClick(a);
    expect(requestGmAction).not.toHaveBeenCalled();
    expect(a.restore).toHaveBeenCalledTimes(1);
  });
});
