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
 *
 * "across a booted table" runs it end to end on the multi-client harness
 * (tests/helpers/multiClient.js, issue #282): a player's narration goes
 * through the GM's real move pipeline, the GM posts the move card, and the
 * player clicks Burn / Improve on their own client — where Foundry refuses a
 * player's update of a GM-authored card, which is what the old click path
 * did and why its second click re-applied.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";

// The move pipeline, for the multi-client section at the end: a scripted
// interpretation (Face Danger +iron), no pacing call, the confirm dialog
// accepted, and three scripted dice inside the REAL resolveMove — challenge
// 7 and 3, action die 4 → a weak hit that burning 8 momentum turns strong.
// Every mock spreads the real module, so src/index.js boots on every client.
const pipeline = vi.hoisted(() => ({ abilities: [] }));
vi.mock("../../src/pacing/router.js", async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0, rationale: "test", mischiefApplied: false,
  })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => pipeline.abilities),
}));
vi.mock("../../src/ui/settingsPanel.js", async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/moves/resolver.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, "random")
        .mockReturnValueOnce(0.65)    // challenge die 7
        .mockReturnValueOnce(0.2)     // challenge die 3
        .mockReturnValueOnce(0.5);    // action die 4 (+ iron 3 = 7)
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import * as gmRelay from "../../src/multiplayer/gmRelay.js";
import { simulateTable, USERS } from "../helpers/multiClient.js";
import { CampaignStateSchema } from "../../src/schemas.js";
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

const NARRATION_MODEL = "claude-sonnet-4-5-20250929";   // narrationModel default
const NARRATION_REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

const narrate = vi.fn(async () => {});
const persist = vi.fn(async () => {});

beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: "s1" });
  ChatMessage._reset();
  narrate.mockClear();
  persist.mockClear();
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

  // Issue #300 F02: a burn applied before the pipeline recorded the original
  // outcome was followed by that persist, stacking both outcomes.
  it("refuses while the original outcome is not recorded yet", async () => {
    const pc   = installPc();
    const card = burnCard();
    card.flags[MODULE_ID].burn.originalApplied = false;
    installMessages(card);

    const res = await applyBurnFromRelay({ messageId: "m-burn" }, OWNER_CTX);

    expect(res).toEqual({ applied: false, reason: "original-pending" });
    expect(pc._updateHistory).toHaveLength(0);
    expect(card.update).not.toHaveBeenCalled();
  });

  it("burns the momentum the PC holds now, not the card's stale preview", async () => {
    const pc   = installPc("pc-burn", 1);   // the card previews 8; the sheet says 1
    const card = burnCard();
    installMessages(card);

    const res = await applyBurnFromRelay({ messageId: "m-burn" }, OWNER_CTX);

    expect(res).toEqual({ applied: false, reason: "no-improvement" });
    expect(pc._updateHistory).toHaveLength(0);
    expect(card.flags[MODULE_ID].burn.consumed).toBeFalsy();
  });

  it("is refused once the result was improved, and an improvement once momentum was burned", async () => {
    const pc   = installPc();
    const card = makeCard("m-both", {
      burn:    { ...burnCard().flags[MODULE_ID].burn },
      improve: { ...improveCard().flags[MODULE_ID].improve },
    });
    installMessages(card);

    expect(await applyImproveFromRelay({ messageId: "m-both" }, OWNER_CTX)).toEqual({ applied: true });
    const writes = pc._updateHistory.length;
    expect(await applyBurnFromRelay({ messageId: "m-both" }, OWNER_CTX)).toEqual({ applied: false, reason: "already-upgraded" });
    expect(pc._updateHistory).toHaveLength(writes);

    const other = makeCard("m-both-2", {
      burn:    { ...burnCard().flags[MODULE_ID].burn },
      improve: { ...improveCard().flags[MODULE_ID].improve },
    });
    installMessages(other);
    installPc();
    expect(await applyBurnFromRelay({ messageId: "m-both-2" }, OWNER_CTX)).toEqual({ applied: true });
    expect(await applyImproveFromRelay({ messageId: "m-both-2" }, OWNER_CTX)).toEqual({ applied: false, reason: "already-upgraded" });
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

  it("refuses while the original outcome is not recorded yet (issue #300 F02)", async () => {
    const pc   = installPc();
    const card = improveCard();
    card.flags[MODULE_ID].improve.originalApplied = false;
    installMessages(card);
    const res = await applyImproveFromRelay({ messageId: "m-imp" }, OWNER_CTX);
    expect(res).toEqual({ applied: false, reason: "original-pending" });
    expect(pc._updateHistory).toHaveLength(0);
  });

  it("swaps the recorded original's meters for the strong hit's", async () => {
    const pc = installPc("pc-burn", 5);
    installMessages(improveCard());
    await applyImproveFromRelay({ messageId: "m-imp" }, OWNER_CTX);
    // Gather Information: weak hit +1 momentum is on the sheet; strong hit is +2.
    expect(pc.system.momentum.value).toBe(6);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// relayCardButtonClick — the button's local state recovers
// ─────────────────────────────────────────────────────────────────────────────

describe("relayCardButtonClick", () => {
  let requestGmAction;
  beforeEach(() => { requestGmAction = vi.spyOn(gmRelay, "requestGmAction"); });
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


// ─────────────────────────────────────────────────────────────────────────────
// Across a booted table — the multi-client harness (issue #282)
// ─────────────────────────────────────────────────────────────────────────────

describe("across a booted table", () => {
  let table;
  let pc;

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
  }, 30_000);
  afterAll(() => table?.teardown());

  /**
   * Pat (pl-1) narrates a Face Danger; the GM's pipeline posts the move card.
   * `beforeChat` runs after the table reset (which clears table.claude's
   * responder) and before the narration — e.g. to hold the narrator's reply.
   */
  async function rollWeakHit({ beforeChat } = {}) {
    await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, sessionActive: true } } } });
    await table.setClaudeKey("gm-1", "sk-ant-gina");
    pc = table.addActor({
      id: "pc-pat", name: "Kira", ownership: { "pl-1": 3 },
      system: { momentum: { value: 8, max: 10, min: -6, resetValue: 2 } },
    });
    beforeChat?.();
    await table.client("pl-1").chat("I brace against the hull and push through the breach.", { speaker: { actor: "pc-pat" } });
    await table.settle();
    const cards = table.cards(f => f.moveResolution);
    expect(cards.map(c => c.author)).toEqual(["gm-1"]);
    return cards[0];
  }

  const flagsOf = (id) => table.world.message(id).flags[MODULE_ID];
  const momentumWrites = () => pc._updateHistory.filter(u => "system.momentum.value" in u);

  /** Hold the GM's first narration call until the returned deferred resolves. */
  function holdNarration() {
    let release;
    const held = new Promise((r) => { release = r; });
    let taken = false;
    table.claude.respond((call) => {
      if (!taken && call.client === "gm-1" && call.model === NARRATION_MODEL) {
        taken = true;
        return held.then(() => NARRATION_REPLY);
      }
      return NARRATION_REPLY;
    });
    return { resolve: release };
  }

  describe("Burn Momentum", () => {
    beforeEach(() => { pipeline.abilities = []; });

    it("the GM's card offers the burn the roll earned", async () => {
      const card = await rollWeakHit();
      expect(flagsOf(card._id).burn).toMatchObject({
        canBurn: true, originalOutcome: "weak_hit", previewOutcome: "strong_hit", originalApplied: true, actorId: "pc-pat",
      });
    });

    it("a player's click applies once, on the GM — the card is consumed on every client", async () => {
      const card = await rollWeakHit();
      const narrationsBefore = table.claude.calls.length;
      table.client("pl-1").click(card._id, '[data-action="sf-burn-momentum"]');
      await table.settle();

      expect(momentumWrites()).toHaveLength(1);
      expect(pc.system.momentum.value).toBe(3);   // reset to 2, then +1 for the strong hit
      for (const c of table.clients) expect(c.message(card._id).flags[MODULE_ID].burn.consumed, c.id).toBe(true);
      const renarrations = table.claude.calls.slice(narrationsBefore);
      expect(renarrations.length).toBeGreaterThan(0);
      expect(renarrations.every(c => c.client === "gm-1")).toBe(true);
    });

    it("after the card re-renders, the button stays spent — a second click applies nothing", async () => {
      const card = await rollWeakHit();
      table.client("pl-1").click(card._id, '[data-action="sf-burn-momentum"]');
      await table.settle();
      const root = table.client("pl-1").render(card._id);   // a fresh render, as after any update
      const btn = root.querySelector('[data-action="sf-burn-momentum"]');
      expect(btn.disabled).toBe(true);
      table.client("pl-1").click(card._id, '[data-action="sf-burn-momentum"]');
      await table.settle();
      expect(momentumWrites()).toHaveLength(1);
    });

    it("the owner and the GM clicking at once still apply it once", async () => {
      const card = await rollWeakHit();
      const narrations = () => table.cards(f => f.narratorCard).length;
      const before = narrations();
      table.client("pl-1").click(card._id, '[data-action="sf-burn-momentum"]');
      table.client("gm-1").click(card._id, '[data-action="sf-burn-momentum"]');
      await table.settle();
      expect(momentumWrites()).toHaveLength(1);   // momentum is reset to a target, so a second burn writes nothing —
      expect(narrations() - before).toBe(1);      // but it re-narrates: the burned outcome is narrated once
      expect(flagsOf(card._id).burn.consumed).toBe(true);
    });

    // Issue #300 F02: a burn clicked while the narration was generated applied
    // the strong hit, then the pipeline's persist added the weak hit on top.
    it("waits for the original result to be recorded, then applies only the upgraded one", async () => {
      let held;
      const card = await rollWeakHit({ beforeChat: () => { held = holdNarration(); } });
      expect(flagsOf(card._id).burn.originalApplied).toBe(false);

      // The player's button is disabled while the narration is generated …
      const btn = table.client("pl-1").render(card._id).querySelector('[data-action="sf-burn-momentum"]');
      expect(btn.disabled).toBe(true);
      table.client("pl-1").click(card._id, '[data-action="sf-burn-momentum"]');
      // … and a burn relayed anyway (a stale screen) is refused on the GM.
      const player = table.client("pl-1");
      const relay = await player.import("../../src/multiplayer/gmRelay.js");
      await player.run(() => relay.requestGmAction("move.burnMomentum", { messageId: card._id }));
      await table.settle();
      expect(momentumWrites()).toEqual([]);
      expect(getCapturedWarns().some(w => /not recorded yet; burn refused/.test(w))).toBe(true);

      held.resolve();
      await table.settle();
      expect(flagsOf(card._id).burn.originalApplied).toBe(true);
      expect(table.client("pl-1").render(card._id).querySelector('[data-action="sf-burn-momentum"]').disabled).toBe(false);

      table.client("pl-1").click(card._id, '[data-action="sf-burn-momentum"]');
      await table.settle();
      expect(pc.system.momentum.value).toBe(3);   // reset to 2, then +1 for the strong hit — nothing stacked on top
      expect(momentumWrites()).toHaveLength(1);
      // The original narration exists by the time the burn runs, so it is struck.
      expect(table.cards(f => f.narratorCard && f.burnSuperseded)).toHaveLength(1);
    });

    it("a player who does not own the PC cannot burn its momentum", async () => {
      const card = await rollWeakHit();
      table.client("pl-2").click(card._id, '[data-action="sf-burn-momentum"]');
      await table.settle();
      expect(momentumWrites()).toEqual([]);
      expect(flagsOf(card._id).burn.consumed).toBeFalsy();
      expect(getCapturedWarns().some(w => /does not own Kira — burn refused/.test(w))).toBe(true);
    });
  });

  describe("Improve Result", () => {
    beforeEach(() => {
      pipeline.abilities = [{
        assetId: null, abilityIndex: null, assetName: "Fugitive", abilityName: "Slip away",
        text: "improve the result to a strong hit", resultImprovement: { improveTo: "strong_hit" }, hasClock: false,
      }];
    });
    afterAll(() => { pipeline.abilities = []; });

    it("a player's click improves the result once, on the GM — the card is consumed everywhere", async () => {
      const card = await rollWeakHit();
      expect(flagsOf(card._id).improve).toMatchObject({ canImprove: true, originalApplied: true, actorId: "pc-pat" });
      table.client("pl-1").click(card._id, '[data-action="sf-improve-result"]');
      table.client("pl-1").click(card._id, '[data-action="sf-improve-result"]');   // a double click
      await table.settle();
      for (const c of table.clients) expect(c.message(card._id).flags[MODULE_ID].improve.consumed, c.id).toBe(true);
      expect(table.client("pl-1").render(card._id).querySelector('[data-action="sf-improve-result"]').disabled).toBe(true);
    });

    it("a player who does not own the PC cannot improve its result", async () => {
      const card = await rollWeakHit();
      table.client("pl-2").click(card._id, '[data-action="sf-improve-result"]');
      await table.settle();
      expect(flagsOf(card._id).improve.consumed).toBe(false);
    });
  });
});
