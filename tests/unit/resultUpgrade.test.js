/**
 * STARFORGED COMPANION
 * tests/unit/resultUpgrade.test.js
 *
 * Burn Momentum and Improve Result end to end (issue #311): a player's
 * narration goes through the GM's real move pipeline on a booted table
 * (tests/helpers/multiClient.js) — resolver, Pay the Price route, persist,
 * the move card and its choice card — and the player clicks the upgrade on
 * their own client, which relays it to the canonical GM. The interpretation,
 * the applicable abilities, the dice and the Pay the Price roll are scripted
 * at their boundaries.
 *
 *   P04 — a burn refunds the Pay the Price meter loss that landed.
 *   P05 — an improvement undoes the superseded miss's Pay the Price, as a
 *         burn does.
 *   P06 — an upgrade is claimed before its effects; a write refused after
 *         the claim goes to the GMs with a Retry.
 *   P03 — an upgrade retires the superseded outcome's pending choice and
 *         offers the upgraded outcome's, once; a consequence chosen first
 *         closes both upgrades.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [], ptp: 78 }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => control.abilities),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
vi.mock("../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random").mockReturnValueOnce((control.ptp - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, pc;
const world   = () => table.world.campaignState();
const flags   = (id) => table.world.message(id).flags[MODULE_ID];
const lastLog = () => world().sessionLogs["upgrade-s1"].at(-1);

// [challenge, challenge, action] Math.random values.
const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — wits 2 or iron 3 misses

/** Narrate a move as the player and return its move card. */
async function roll(moveId, { statUsed = "iron", dice = MISS } = {}) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat(`I attempt ${moveId}.`, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

/** The player clicks a button on a card, on their own client. */
async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.abilities = [];
  control.ptp = 78;   // Pay the Price 78: Endure Harm (-1)
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "upgrade-s1", sessionNumber: 1,
      currentSceneId: "upgrade-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 8 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("P04 — a burn refunds the Pay the Price loss that landed", () => {
  it("a loss clamped at 0 health is not refunded: health stays 0", async () => {
    pc.system.health.value = 0;
    const card = await roll("gather_information", { statUsed: "wits" });
    expect(pc.system.health.value).toBe(0);
    expect(flags(card._id).burn.ptpReversals.sufferMeterDelta).toBeNull();

    await click(card, '[data-action="sf-burn-momentum"]');

    expect(flags(card._id).burn.consumed).toBe(true);
    expect(lastLog().outcome).toBe("strong_hit");
    expect(pc.system.health.value).toBe(0);
  });

  it("the solo fallback's real loss is refunded: companion route → Endure Harm, health 5 → 4 → 5", async () => {
    control.ptp = 53;   // a companion in harm's way; with none, Endure Harm (-1)
    const card = await roll("gather_information", { statUsed: "wits" });
    expect(pc.system.health.value).toBe(4);
    expect(flags(card._id).burn.ptpReversals.sufferMeterDelta).toMatchObject({
      move: "endure_harm", meterKey: "health", amount: 1, actorId: pc.id, before: 5, after: 4,
    });

    await click(card, '[data-action="sf-burn-momentum"]');

    expect(pc.system.health.value).toBe(5);
    expect(table.cards(f => f.burnReversal).at(-1)?.content).toContain("health +1 refunded");
  });

  it("the ordinary route still refunds its loss: Endure Harm, health 5 → 4 → 5", async () => {
    const card = await roll("gather_information", { statUsed: "wits" });
    expect(pc.system.health.value).toBe(4);
    await click(card, '[data-action="sf-burn-momentum"]');
    expect(pc.system.health.value).toBe(5);
  });
});

describe("P05 — both upgrades undo the superseded miss's Pay the Price", () => {
  // Fugitive-style: improve to a strong hit, its cost a note (no clock).
  const FUGITIVE = [{ assetId: null, abilityIndex: null, assetName: "Fugitive",
    text: "improve the result to a strong hit", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];

  async function missWithPursuit() {
    control.abilities = FUGITIVE;
    await table.client("gm-1").run(() => game.settings.set(MODULE_ID, "campaignState", { ...world(), clocks: [
      { _id: "pursuit", name: "Pursuit", type: "tension", segments: 4, filled: 0, active: true },
    ] }));
    const card = await roll("face_danger");   // iron 3 + 1 against 6 and 7: a miss; Pay the Price 78
    expect(lastLog().outcome).toBe("miss");
    expect(pc.system.health.value).toBe(4);
    expect(world().clocks[0].filled).toBe(1);
    return card;
  }

  for (const [label, selector, upgrade] of [
    ["Improve Result", '[data-action="sf-improve-result"]', "improve"],
    ["Burn Momentum",  '[data-action="sf-burn-momentum"]',  "burn"],
  ]) {
    it(`${label} to a strong hit: the clock rewinds to 0/4 and health 4 → 5`, async () => {
      const card = await missWithPursuit();

      await click(card, selector);

      expect(flags(card._id)[upgrade].consumed).toBe(true);
      expect(lastLog().outcome).toBe("strong_hit");
      expect(world().clocks[0].filled).toBe(0);
      expect(pc.system.health.value).toBe(5);
    });
  }

  it("the improvement's own cost still stands: its note is on the card", async () => {
    const card = await missWithPursuit();
    await click(card, '[data-action="sf-improve-result"]');
    expect(table.world.message(card._id).content).toContain("Fugitive: apply the ability's stated cost.");
    expect(table.cards(f => f.improveReversal).at(-1)?.content).toMatch(/Pursuit clock rewound[\s\S]*health \+1 refunded/);
  });
});

describe("P06 — an upgrade is claimed before its effects", () => {
  const FUGITIVE = [{ assetId: null, assetName: "Fugitive", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];
  const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; action die 4 — wits 2 is a weak hit

  /** Refuse the first card update that stamps `<kind>.consumed`. */
  function refuseClaim(card, kind) {
    const seen = { refused: false };
    table.interceptWrites(w => {
      if (!seen.refused && w.kind === "message.update" && w.id === card._id
          && w.changes?.[`flags.${MODULE_ID}.${kind}.consumed`] === true) {
        seen.refused = true;
        return new Error("test: refused claim");
      }
    });
    return seen;
  }

  it("a refused Improve Result claim applies nothing; the press after a fresh render applies it once", async () => {
    control.abilities = FUGITIVE;
    pc.system.momentum.value = 2;
    const card = await roll("gather_information", { statUsed: "wits", dice: WEAK });
    expect(pc.system.momentum.value).toBe(3);   // the weak hit's +1
    const claim = refuseClaim(card, "improve");

    await click(card, '[data-action="sf-improve-result"]');
    expect(claim.refused).toBe(true);
    expect(pc.system.momentum.value).toBe(3);
    expect(flags(card._id).improve.consumed).toBeFalsy();

    table.client("pl-1").render(card._id);
    await click(card, '[data-action="sf-improve-result"]');
    expect(flags(card._id).improve.consumed).toBe(true);
    expect(pc.system.momentum.value).toBe(4);   // the strong hit's +2, once

    table.client("pl-1").render(card._id);
    await click(card, '[data-action="sf-improve-result"]');
    expect(pc.system.momentum.value).toBe(4);
  });

  it("a refused Burn Momentum claim applies nothing; the press after a fresh render burns once", async () => {
    pc.system.momentum.value = 7;
    const card = await roll("gather_information", { statUsed: "wits", dice: WEAK });
    expect(pc.system.momentum.value).toBe(8);
    const claim = refuseClaim(card, "burn");

    await click(card, '[data-action="sf-burn-momentum"]');
    expect(claim.refused).toBe(true);
    expect(pc.system.momentum.value).toBe(8);
    expect(lastLog().outcome).toBe("weak_hit");

    table.client("pl-1").render(card._id);
    await click(card, '[data-action="sf-burn-momentum"]');
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(pc.system.momentum.value).toBe(4);   // reset 2 + the strong hit's +2
    expect(lastLog().outcome).toBe("strong_hit");
  });

  it("a meter write refused after the claim is told to the GMs, and their Retry applies it once", async () => {
    control.abilities = FUGITIVE;
    pc.system.momentum.value = 2;
    const card = await roll("gather_information", { statUsed: "wits", dice: WEAK });
    let refused = false;
    table.interceptWrites(w => {
      if (!refused && w.kind === "actor.update" && w.id === pc.id && w.changes?.["system.momentum.value"] === 4) {
        refused = true;
        return new Error("test: refused momentum");
      }
    });

    await click(card, '[data-action="sf-improve-result"]');
    expect(refused).toBe(true);
    expect(flags(card._id).improve.consumed).toBe(true);
    expect(pc.system.momentum.value).toBe(3);
    const failure = table.cards(f => f.payoffFailureCard && f.source === "upgrade").at(-1);
    expect(failure.flags[MODULE_ID].steps).toEqual([{ step: "upgrade", effect: "meters", pcId: pc.id, changes: { momentum: 1, health: 0, spirit: 0, supply: 0 } }]);
    expect(failure.content).toMatch(/momentum \+1 for Kira, from the upgraded result — the world did not save it[^.]*\. Kira's momentum stands at 3 now/);

    await table.client("gm-1").click(failure._id, '[data-action="sf-payoff-retry"]');
    await table.settle(); await table.drain();
    expect(pc.system.momentum.value).toBe(4);
    await table.client("gm-1").click(failure._id, '[data-action="sf-payoff-retry"]');
    await table.settle(); await table.drain();
    expect(pc.system.momentum.value).toBe(4);
  });

  it("a Pay the Price refund refused after a burn's claim is retried for that PC alone", async () => {
    const card = await roll("gather_information", { statUsed: "wits" });   // a miss; Endure Harm 5 → 4
    let refused = false;
    table.interceptWrites(w => {
      if (!refused && w.kind === "actor.update" && w.id === pc.id && w.changes?.["system.health.value"] === 5) {
        refused = true;
        return new Error("test: refused refund");
      }
    });

    await click(card, '[data-action="sf-burn-momentum"]');
    expect(refused).toBe(true);
    expect(pc.system.health.value).toBe(4);
    const failure = table.cards(f => f.payoffFailureCard && f.source === "upgrade").at(-1);
    expect(failure.flags[MODULE_ID].steps).toEqual([{ step: "upgrade", effect: "meters", pcId: pc.id, changes: { health: 1 } }]);

    await table.client("gm-1").click(failure._id, '[data-action="sf-payoff-retry"]');
    await table.settle(); await table.drain();
    expect(pc.system.health.value).toBe(5);
  });
});

describe("P03 — an upgrade reconciles the move's choice cards", () => {
  const FUGITIVE = [{ assetId: null, assetName: "Fugitive", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];
  const WEAK_IRON  = [0.25, 0.65, 0.5];   // challenge 3, 7; die 4 — iron 3 is a weak hit
  const WEAK_HEART = [0.25, 0.55, 0.5];   // challenge 3, 6; die 4 — heart 2 is a weak hit
  const BURN    = '[data-action="sf-burn-momentum"]';
  const IMPROVE = '[data-action="sf-improve-result"]';
  const choices = () => table.cards(f => f.sufferCard && f.sufferPrompt);
  const active  = () => choices().filter(c => !c.flags[MODULE_ID].resolved);

  /** Send a relay as the player — what a stale render, or another client, could still send. */
  async function relayAsPlayer(kind, payload) {
    const { requestGmAction } = await table.client("pl-1").import("../../src/multiplayer/gmRelay.js");
    await table.client("pl-1").run(() => requestGmAction(kind, payload));
    await table.settle(); await table.drain();
  }

  it("a weak Face Danger burned to a strong hit retires its suffer card — the obsolete cost is not charged", async () => {
    const card   = await roll("face_danger", { dice: WEAK_IRON });
    const choice = choices().at(-1);
    expect(flags(choice._id).resolutionId).toBe(flags(card._id).resolutionId);

    await click(card, BURN);

    expect(lastLog().outcome).toBe("strong_hit");
    expect(flags(choice._id)).toMatchObject({ resolved: true, superseded: true });
    expect(table.world.message(choice._id).content).toContain("Consequence superseded");
    expect(active()).toHaveLength(0);   // a strong Face Danger has no choice
    await relayAsPlayer("suffer.pick", { messageId: choice._id, pickKind: "any", sufferId: "endure_harm" });
    expect(pc.system.health.value).toBe(5);
  });

  it("a pick still refuses when the card could not be retired, and retires it then", async () => {
    const card   = await roll("face_danger", { dice: WEAK_IRON });
    const choice = choices().at(-1);
    let refused = false;
    table.interceptWrites(w => {
      if (!refused && w.kind === "message.update" && w.id === choice._id && w.changes?.[`flags.${MODULE_ID}.superseded`] === true) {
        refused = true;
        return new Error("test: refused retire");
      }
    });

    await click(card, BURN);
    expect(refused).toBe(true);
    expect(flags(choice._id).resolved).toBe(false);

    await click(choice, '[data-suffer-id="endure_harm"]');
    expect(pc.system.health.value).toBe(5);
    expect(flags(choice._id)).toMatchObject({ resolved: true, superseded: true });
  });

  it("a weak Hearten burned to a strong hit offers the strong hit's recovery, once", async () => {
    pc.system.spirit.value = 1;
    const card = await roll("hearten", { statUsed: "heart", dice: WEAK_HEART });
    const weak = choices().at(-1);

    await click(card, BURN);

    expect(lastLog().outcome).toBe("strong_hit");
    expect(flags(weak._id).superseded).toBe(true);
    const fresh = active();
    expect(fresh).toHaveLength(1);
    expect(flags(fresh[0]._id)).toMatchObject({ upgraded: true, resolutionId: flags(card._id).resolutionId });
    await click(fresh[0], '[data-option-index="1"]');   // Take +2 spirit (not shaken)
    expect(pc.system.spirit.value).toBe(3);
    // The reset momentum; the weak hit's Lose Momentum (-1) was never charged.
    expect(pc.system.momentum.value).toBe(2);
    expect(active()).toHaveLength(0);
  });

  it("a weak Heal improved to a strong hit offers the strong hit's recovery, with no cost", async () => {
    control.abilities = FUGITIVE;
    pc.system.health.value = 1;
    pc.system.debility.wounded = true;
    const card = await roll("heal", { dice: WEAK_IRON });

    await click(card, IMPROVE);

    const fresh = active();
    expect(fresh).toHaveLength(1);
    expect(flags(fresh[0]._id).upgraded).toBe(true);
    await click(fresh[0], '[data-option-index="0"]');   // clear wounded + 2 health
    expect(pc.system.health.value).toBe(3);
    expect(pc.system.debility.wounded).toBe(false);
    expect(pc.system.momentum.value).toBe(8);
  });

  it("a consequence chosen first closes Burn Momentum — the button says so, and the GM refuses it", async () => {
    const card   = await roll("face_danger", { dice: WEAK_IRON });
    const choice = choices().at(-1);
    await click(choice, '[data-suffer-id="endure_harm"]');
    expect(pc.system.health.value).toBe(4);

    expect(flags(card._id).burn.choiceMade).toBe(true);
    const btn = table.client("pl-1").render(card._id).querySelector(BURN);
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain("the consequence was already chosen");

    await relayAsPlayer("move.burnMomentum", { messageId: card._id });
    expect(flags(card._id).burn.consumed).toBeFalsy();
    expect(lastLog().outcome).toBe("weak_hit");
    expect(pc.system.momentum.value).toBe(8);
    expect(pc.system.health.value).toBe(4);
  });

  it("the GM checks the choice cards themselves, so a lost close stamp does not reopen the upgrade", async () => {
    control.abilities = FUGITIVE;
    const card   = await roll("face_danger", { dice: WEAK_IRON });
    const choice = choices().at(-1);
    table.interceptWrites(w => {
      if (w.kind === "message.update" && w.id === card._id && w.changes?.[`flags.${MODULE_ID}.improve.choiceMade`] === true) {
        return new Error("test: refused close stamp");
      }
    });
    await click(choice, '[data-suffer-id="endure_harm"]');
    expect(flags(card._id).improve.choiceMade).toBeUndefined();

    await click(card, IMPROVE);
    expect(flags(card._id).improve.consumed).toBeFalsy();
    expect(lastLog().outcome).toBe("weak_hit");
    expect(pc.system.health.value).toBe(4);
  });
});
