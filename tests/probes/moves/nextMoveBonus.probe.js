/**
 * PROBE (moves audit) — NEXT-MOVE-BONUS-DEAD.
 *
 * "+1 on your next move (not a progress move)" is half of Secure an
 * Advantage's strong hit ("take both"), one of its two weak-hit picks, and one
 * of Gain Ground's three. The pick's executor (sufferDialog `next-bonus`) only
 * posts a reminder card ("Remember to add +1 to your action die result on the
 * next roll"), flagged `nextBonus: true` — a flag nothing reads — and the
 * pipeline rolls the next move itself: the confirm dialog has no adds input
 * (only asset checkboxes), so there is nowhere to add it. The strong hit's +1
 * is text alone. Take a Break's identical "+1 on the next move" is applied by
 * the pipeline (campaignState.nextMoveAdd → takeNextMoveAdd), the fix for the
 * same "the card promised a +1 nobody received" defect (decisions.md).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mapConsequences } from "../../../src/moves/resolver.js";
import { resolveSufferSelection, runSufferResolution } from "../../../src/moves/sufferDialog.js";
import { takeNextMoveAdd } from "../../../src/moves/nextMoveAdd.js";

const MODULE_ID = "starforged-companion";

beforeEach(() => {
  game.actors._reset();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: "s1" });
});

describe("NEXT-MOVE-BONUS-DEAD", () => {
  it("Secure an Advantage weak hit: picking '+1 on your next move' adds +1 to the next action roll", async () => {
    const actor = makeTestActor({ id: "pc1", type: "character", hasPlayerOwner: true });
    const prompt = mapConsequences("secure_an_advantage", "weak_hit", false).sufferPrompt;
    const idx = prompt.options.findIndex(o => o.nextBonus === 1);
    const calls = resolveSufferSelection(prompt, { optionIndices: [idx] });
    expect(calls).toEqual([{ kind: "next-bonus", amount: 1 }]);

    await runSufferResolution(calls, actor, {});

    // The next action roll's adds — what the pipeline adds before rolling.
    const state = structuredClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
    expect(takeNextMoveAdd(state, "face_danger")).toBe(1);   // today: 0 — only a reminder card
  });

  it("Secure an Advantage strong hit ('take both') schedules the +1 as well as the +2 momentum", () => {
    const c = mapConsequences("secure_an_advantage", "strong_hit", false);
    expect(c.momentumChange).toBe(2);
    // Something mechanical must carry the strong hit's +1 on the next move;
    // today it is only the otherEffect text.
    const carriesNextBonus = JSON.stringify(c).includes("nextBonus") || c.nextMoveAdd != null;
    expect(carriesNextBonus).toBe(true);
  });
});
