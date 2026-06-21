/**
 * STARFORGED COMPANION
 * tests/unit/diceAnimation.test.js
 *
 * Dice So Nice bridge — verifies the helper builds evaluated Rolls carrying the
 * predetermined results and hands them to game.dice3d.showForRoll, and that it
 * fails open (no throw, returns false) when DSN or the dice classes are absent.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  showActionRoll,
  showD100,
  showMoveRoll,
} from "../../src/dice/diceAnimation.js";

// A minimal stand-in for Foundry's Die term. Records faces/number and exposes
// the preset results the helper stamps on it.
class FakeDie {
  constructor({ number, faces }) {
    this.number = number;
    this.faces = faces;
    this.results = [];
    this._evaluated = false;
  }
}

// A minimal stand-in for Foundry's Roll. fromTerms captures the terms so the
// test can assert on the dice it was built from.
class FakeRoll {
  constructor() {
    this.terms = [];
    this._evaluated = false;
  }
  static fromTerms(terms) {
    const r = new FakeRoll();
    r.terms = terms;
    return r;
  }
  get dice() {
    return this.terms;
  }
}

function installFoundry({ withDice3d = true } = {}) {
  globalThis.Roll = FakeRoll;
  globalThis.foundry = { dice: { terms: { Die: FakeDie } } };
  const shown = [];
  globalThis.game = {
    user: { id: "u1" },
    ...(withDice3d
      ? {
          dice3d: {
            showForRoll: vi.fn(async roll => {
              shown.push(roll);
              return true;
            }),
          },
        }
      : {}),
  };
  return shown;
}

afterEach(() => {
  delete globalThis.Roll;
  delete globalThis.foundry;
  delete globalThis.game;
  delete globalThis.Die;
  vi.restoreAllMocks();
});

// ── Fail-open ─────────────────────────────────────────────────────────────────

describe("diceAnimation — fail-open", () => {
  it("returns false (no throw) when game.dice3d is absent", async () => {
    installFoundry({ withDice3d: false });
    await expect(showActionRoll(5, [3, 8])).resolves.toBe(false);
    await expect(showD100(42)).resolves.toBe(false);
  });

  it("returns false when no Foundry globals exist at all", async () => {
    // afterEach has cleaned globals; nothing installed here.
    await expect(showD100(42)).resolves.toBe(false);
    await expect(showActionRoll(4, [1, 2])).resolves.toBe(false);
  });
});

// ── Action roll ───────────────────────────────────────────────────────────────

describe("showActionRoll", () => {
  it("shows the action d6 and the challenge 2d10 with preset results", async () => {
    const shown = installFoundry();
    const ok = await showActionRoll(5, [3, 8]);
    expect(ok).toBe(true);
    expect(globalThis.game.dice3d.showForRoll).toHaveBeenCalledTimes(2);

    // Group 1: 1d6 = 5
    const d6 = shown[0].terms[0];
    expect(d6.faces).toBe(6);
    expect(d6.number).toBe(1);
    expect(d6.results.map(r => r.result)).toEqual([5]);
    expect(d6._evaluated).toBe(true);
    expect(shown[0]._evaluated).toBe(true);

    // Group 2: 2d10 = [3, 8]
    const d10 = shown[1].terms[0];
    expect(d10.faces).toBe(10);
    expect(d10.number).toBe(2);
    expect(d10.results.map(r => r.result)).toEqual([3, 8]);
    expect(d10.results.every(r => r.active)).toBe(true);
  });

  it("animates only the challenge dice for a progress move (no action die)", async () => {
    const shown = installFoundry();
    const ok = await showActionRoll(0, [6, 6]);
    expect(ok).toBe(true);
    expect(globalThis.game.dice3d.showForRoll).toHaveBeenCalledTimes(1);
    expect(shown[0].terms[0].faces).toBe(10);
    expect(shown[0].terms[0].results.map(r => r.result)).toEqual([6, 6]);
  });

  it("returns false when there are no dice to show", async () => {
    installFoundry();
    await expect(showActionRoll(0, [])).resolves.toBe(false);
    expect(globalThis.game.dice3d.showForRoll).not.toHaveBeenCalled();
  });
});

// ── d100 ──────────────────────────────────────────────────────────────────────

describe("showD100", () => {
  it("shows a single d100 with the rolled value", async () => {
    const shown = installFoundry();
    const ok = await showD100(73);
    expect(ok).toBe(true);
    const die = shown[0].terms[0];
    expect(die.faces).toBe(100);
    expect(die.number).toBe(1);
    expect(die.results.map(r => r.result)).toEqual([73]);
  });

  it("returns false for a non-numeric value", async () => {
    installFoundry();
    await expect(showD100(undefined)).resolves.toBe(false);
    expect(globalThis.game.dice3d.showForRoll).not.toHaveBeenCalled();
  });
});

// ── showMoveRoll ──────────────────────────────────────────────────────────────

describe("showMoveRoll", () => {
  it("reads actionDie + challengeDice off the resolution", async () => {
    const shown = installFoundry();
    await showMoveRoll({ actionDie: 4, challengeDice: [9, 2] });
    expect(globalThis.game.dice3d.showForRoll).toHaveBeenCalledTimes(2);
    expect(shown[0].terms[0].results.map(r => r.result)).toEqual([4]);
    expect(shown[1].terms[0].results.map(r => r.result)).toEqual([9, 2]);
  });

  it("returns false for a null resolution", async () => {
    installFoundry();
    await expect(showMoveRoll(null)).resolves.toBe(false);
  });

  it("does not throw when showForRoll rejects (fails open)", async () => {
    installFoundry();
    globalThis.game.dice3d.showForRoll = vi.fn().mockRejectedValue(new Error("dsn boom"));
    await expect(showActionRoll(5, [3, 8])).resolves.toBe(false);
  });
});
