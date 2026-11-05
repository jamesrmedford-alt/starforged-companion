/**
 * PROBE — RULES-05 SACRIFICE-WHILE-UNPREPARED-ABOVE-ZERO (tenth audit, area rules; needs a decision)
 *
 * What the user does: the crew's supply hit 0 last scene and everyone was
 * marked unprepared (issue #315 S07). Vex Resupplies with a strong hit —
 * "clear the impact and take +1 supply" — which clears Vex's unprepared alone
 * (known-issues UNPREPARED-CLEAR-ONE-PC) and raises the shared supply to 1.
 * Kira, still unprepared, then takes a Face Danger weak hit and picks
 * Sacrifice Resources (-1).
 *
 * What happens: the executor takes the supply 1 → 0 (sufferExecutor.js:546
 * redirects only when `before <= 0 && unprepared`; sufferDialog.js
 * unpreparedAtZeroSupply:499 greys the option only at 0) — Kira's loss is a
 * supply loss like any other.
 *
 * What should happen: "When you suffer a loss of resources while unprepared,
 * envision how this causes you hardship and apply the cost to a different
 * suffer move" (vendored Sacrifice_Resources) — the redirect is keyed on the
 * impact, not on the meter. Issue #325 W16 decided "a loss while unprepared
 * at 0 goes to another suffer move" for the 0 → 0 case; the book's own text
 * (and Outcast's "On a strong hit … take +1 supply" at 0) leaves a PC
 * unprepared above 0. Option A (recommended): redirect whenever the PC is
 * unprepared. Option B: keep "at 0" and record the narrowing (and its
 * interplay with UNPREPARED-CLEAR-ONE-PC) in decisions.md.
 *
 * Control: unprepared at 0 is redirected (W16); a PC not unprepared at 2
 * loses the supply.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/rules/sacrificeWhileUnpreparedAboveZero.probe.js
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/character/actorBridge.js", () => ({
  getActor:            vi.fn(() => null),
  readCompanionHealth: vi.fn(() => null),
  getPlayerActors:     vi.fn(() => []),
  isPlayerCharacterActor: (a) => a?.type === "character",
  applyMeterChanges: vi.fn(async (actor, changes) => {
    for (const [k, delta] of Object.entries(changes)) {
      actor.system[k].value = Math.max(0, (actor.system[k].value ?? 0) + delta);
    }
  }),
  setDebility: vi.fn(async (actor, key, value) => {
    actor.system.debility = { ...(actor.system.debility ?? {}), [key]: value };
  }),
}));
vi.mock("../../../src/moves/sufferCard.js", () => ({
  postSufferChoiceCard: vi.fn(async () => true),
}));

import { sacrificeResources } from "../../../src/moves/sufferExecutor.js";
import { isOptionAvailable, unpreparedAtZeroSupply } from "../../../src/moves/sufferDialog.js";

const actor = (supply, unprepared) => ({ id: "pc-kira", type: "character", name: "Kira",
  system: { supply: { value: supply, max: 5, min: 0 }, debility: { unprepared } } });
const sacrificeOption = { label: "Sacrifice Resources (-1)", suffer: "sacrifice_resources", amount: 1 };

beforeEach(() => {
  globalThis.ChatMessage = { create: vi.fn(async (data) => data) };
});

describe("PROBE RULES-05 SACRIFICE-WHILE-UNPREPARED-ABOVE-ZERO", () => {
  it("recommended: a loss while unprepared at supply 1 goes to another suffer move, not to the supply", async () => {
    const kira = actor(1, true);
    const r = await sacrificeResources(kira, 1);
    // Expected: redirected, supply untouched. Actual: supply 1 → 0, nothing redirected.
    expect(r.redirected).toBe(true);
    expect.soft(kira.system.supply.value).toBe(1);
    expect.soft(isOptionAvailable(sacrificeOption, { actor: actor(1, true) })).toBe(false);
    expect.soft(unpreparedAtZeroSupply(actor(2, true))).toBe(true);
  });

  it("control: unprepared at 0 is redirected (issue #325 W16)", async () => {
    const kira = actor(0, true);
    const r = await sacrificeResources(kira, 1);
    expect(r.redirected).toBe(true);
    expect(kira.system.supply.value).toBe(0);
    expect(isOptionAvailable(sacrificeOption, { actor: actor(0, true) })).toBe(false);
  });

  it("control: a PC who is not unprepared loses the supply", async () => {
    const kira = actor(2, false);
    const r = await sacrificeResources(kira, 1);
    expect(r.redirected).toBeUndefined();
    expect(kira.system.supply.value).toBe(1);
    expect(isOptionAvailable(sacrificeOption, { actor: actor(2, false) })).toBe(true);
  });
});
