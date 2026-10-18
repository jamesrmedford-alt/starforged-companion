/**
 * STARFORGED COMPANION
 * tests/unit/renarrateAttribution.test.js
 *
 * Review finding #6 — Burn Momentum / Improve Result re-narration called
 * `narrate(resolution, null, campaignState, {})`, a leftover of the retired
 * context-packet slot: narrateResolution's signature is
 * (resolution, campaignState, options), so the narrator received null for
 * campaignState and no speakerActorId — in a 2-PC game the upgraded
 * narration described the first PC, not the one who burned (credit the
 * roller). Both now pass (resolution, campaignState, { speakerActorId }) and
 * thread the actor into the log-only persist too.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { applyBurnFromRelay, registerBurnMomentumHook } from "../../src/moves/burnMomentum.js";
import { applyImproveFromRelay, registerImproveResultHook } from "../../src/moves/improveResult.js";
import { invalidateActorCache } from "../../src/character/actorBridge.js";

const MODULE_ID = "starforged-companion";
const GM_CTX    = { requesterId: "gm-1", requester: { id: "gm-1", isGM: true }, requesterIsGM: true, local: true };

function installPc(id, name) {
  const pc = makeTestActor({
    id, type: "character", name, hasPlayerOwner: true,
    system: { momentum: { value: 8, max: 10, min: -6, resetValue: 2 } },
  });
  game.actors._set(id, pc);
  invalidateActorCache(id);
  return pc;
}

function makeCard(id, moduleFlags) {
  const msg = {
    id,
    content: `<div class="sf-move-card"></div>`,
    flags:   { [MODULE_ID]: moduleFlags },
    update:  vi.fn(async (changes) => {
      for (const [path, val] of Object.entries(changes)) {
        if (path === "content") { msg.content = val; continue; }
        const parts = path.split(".");
        let t = msg;
        for (let i = 0; i < parts.length - 1; i++) t = (t[parts[i]] ??= {});
        t[parts.at(-1)] = val;
      }
    }),
  };
  game.messages = { contents: [msg], get: (mid) => (mid === id ? msg : null) };
  return msg;
}

const ORIGINAL = { momentumChange: 1, healthChange: 0, spiritChange: 0, supplyChange: 0 };

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
  installPc("pc-first", "Ash");    // first PC — the old fallback target
  installPc("pc-roller", "Kira");  // the PC whose card it is
});

describe("re-narration credits the roller", () => {
  it("Burn Momentum narrates with campaignState and the burning PC as speaker", async () => {
    makeCard("m-burn", {
      burn: {
        canBurn: true, challengeDice: [2, 7], momentum: 8, markedImpactCount: 0,
        moveId: "gather_information", originalOutcome: "weak_hit",
        originalConsequences: ORIGINAL, previewOutcome: "strong_hit",
        originalApplied: true, actorId: "pc-roller", resolutionId: null, ptpReversals: null,
      },
    });

    expect(await applyBurnFromRelay({ messageId: "m-burn" }, GM_CTX)).toEqual({ applied: true });

    expect(narrate).toHaveBeenCalledTimes(1);
    const [resolution, state, options] = narrate.mock.calls[0];
    expect(resolution.outcome).toBe("strong_hit");
    expect(state).toMatchObject({ currentSessionId: "s1" });
    expect(options).toEqual({ speakerActorId: "pc-roller" });
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ inputMethod: "burn" }), state, "pc-roller");
  });

  it("Improve Result narrates with campaignState and the improving PC as speaker", async () => {
    makeCard("m-imp", {
      improve: {
        canImprove: true, improveTo: "strong_hit", moveId: "gather_information", isMatch: false,
        originalOutcome: "weak_hit", originalConsequences: ORIGINAL, originalApplied: true,
        actorId: "pc-roller", resolutionId: null, assetId: null, abilityIndex: null,
        assetName: "Fugitive", abilityName: "", hasClock: false, clockMax: 4, consumed: false,
      },
    });

    expect(await applyImproveFromRelay({ messageId: "m-imp" }, GM_CTX)).toEqual({ applied: true });

    expect(narrate).toHaveBeenCalledTimes(1);
    const [resolution, state, options] = narrate.mock.calls[0];
    expect(resolution.outcome).toBe("strong_hit");
    expect(state).toMatchObject({ currentSessionId: "s1" });
    expect(options).toEqual({ speakerActorId: "pc-roller" });
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ inputMethod: "improve" }), state, "pc-roller");
  });
});
