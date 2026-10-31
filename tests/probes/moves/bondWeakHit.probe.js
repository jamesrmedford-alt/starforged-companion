/**
 * PROBE (moves audit) — BOND-WEAK-HIT-DIVERGES.
 *
 * A bonded Develop Your Relationship has two implementations: the move
 * pipeline (planDevelopRelationship, BOND_LEGACY_TICKS — decisions.md
 * "Develop Your Relationship bond legacy": strong 2 / weak 1 / miss 0, "recorded
 * here so it isn't re-litigated") and `!bond` (handleBondCommand: strong 2
 * ticks, weak +2 momentum). Issue #314 Q06 unified their adds
 * (BOND_ROLL_ADDS) but not their outcomes, so the same weak hit pays 1 bonds
 * tick when narrated and +2 momentum (no tick) when typed as `!bond`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/multiplayer/gmRelay.js", () => ({ requestGmAction: vi.fn(async () => ({ ok: true })) }));
vi.mock("../../../src/multiplayer/speaker.js", () => ({ resolveSpeakerActorId: vi.fn(() => "pc1") }));
vi.mock("../../../src/dice/diceAnimation.js", () => ({ showActionRoll: vi.fn(async () => {}) }));
vi.mock("../../../src/entities/connection.js", () => ({
  getConnection: vi.fn(() => ({ _id: "rec-sable", name: "Sable", rank: "dangerous", bonded: true, active: true })),
}));

import { handleBondCommand } from "../../../src/moves/bondCommand.js";
import { planDevelopRelationship } from "../../../src/moves/developRelationship.js";
import { requestGmAction } from "../../../src/multiplayer/gmRelay.js";

const MODULE_ID = "starforged-companion";

beforeEach(() => {
  requestGmAction.mockClear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { connectionIds: ["host-sable"] });
});
afterEach(() => vi.restoreAllMocks());

describe("BOND-WEAK-HIT-DIVERGES", () => {
  it("`!bond` pays a weak hit what the pipeline's bonded Develop Your Relationship pays", async () => {
    // action die 3 (0.4), challenge [3, 8] (0.2, 0.75): 3 + dangerous 2 = 5 → weak hit
    const seq = [0.4, 0.2, 0.75];
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() => seq[i++] ?? 0);

    await handleBondCommand({ content: "!bond Sable", flags: {} });

    const pipeline = planDevelopRelationship(
      { _id: "rec-sable", name: "Sable", rank: "dangerous", bonded: true, __hostId: "host-sable" },
      "weak_hit", false,
    );
    expect(pipeline).toMatchObject({ action: "bond-legacy", ticks: 1 });   // control: the recorded decision

    const [kind, payload] = requestGmAction.mock.calls[0] ?? [];
    expect(kind).toBe("bond.apply");
    expect({ ticks: payload.ticksOnBonds, momentum: payload.momentumChange })
      .toEqual({ ticks: pipeline.ticks, momentum: 0 });   // today: { ticks: 0, momentum: 2 }
  });
});
