/**
 * Probe UI-14 — SCENE-CHALLENGE-ROLL-NOT-FINISH-THE-SCENE (RULES)
 *
 * What the user does: during a session, the table fills a scene challenge's
 * progress (or its tension clock fills) and presses the ⬡ Progress Roll button
 * on its Progress Tracks row — the only roll the module offers for it.
 *
 * What happens: rollProgress (progressTracks.js:265) routes combat and
 * expedition rows through the move pipeline but leaves scene challenges on a
 * bespoke display card ("Strong Hit" / "Weak Hit" / "Miss", score vs dice) —
 * TRACK_TYPE_TO_MOVE's comment and playkit-rules-and-coverage.md say "no
 * Starforged move maps to it". The rulebook's scene challenge has its own
 * progress move, Finish the Scene (Starforged p. 241; vendored
 * json-packs/starforged-moves/Finish_the_Scene_0daf0460e4faa6fa.json): "On a
 * weak hit, you succeed, but not without cost. You must Pay the Price … On a
 * miss, you fail … Pay the Price. Make it hurt." The card asks for no price,
 * offers no Pay the Price, flags no match, and the challenge stays open (its
 * tension clock keeps advancing on every later Pay the Price until someone
 * presses ✓).
 *
 * What should happen: the roll resolves as Finish the Scene — through the
 * pipeline like the other two types (a `finish_the_scene` move whose weak hit
 * and miss route Pay the Price), or at least a card that names the move, asks
 * for the price on a weak hit / miss and ends the challenge.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const MODULE_ID = "starforged-companion";

beforeEach(() => {
  game.settings._store.set(`${MODULE_ID}.campaignState`, { sessionActive: true, currentSessionId: "s1" });
});
afterEach(() => {
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
  ChatMessage._reset();
  vi.restoreAllMocks();
});

describe("UI-14 a scene challenge's progress roll is Finish the Scene", () => {
  it("control: a fight's Progress Roll goes through the move pipeline (Take Decisive Action)", async () => {
    const { rollProgress } = await import("../../../src/ui/progressTracks.js");
    await rollProgress({ id: "f1", label: "Corsairs", type: "combat", rank: "dangerous", ticks: 24 });
    expect(ChatMessage._created.at(-1).flags[MODULE_ID].forcedMoveId).toBe("take_decisive_action");
  });

  it("a scene challenge's weak hit or miss asks for the price (Finish the Scene)", async () => {
    const { rollProgress } = await import("../../../src/ui/progressTracks.js");
    // Score 3 against challenge dice 2 and 9: a weak hit.
    vi.spyOn(Math, "random").mockReturnValueOnce(0.15).mockReturnValueOnce(0.85);
    await rollProgress({ id: "sc1", label: "Outrun the storm", type: "scene_challenge", rank: "dangerous", ticks: 12 });
    const card = ChatMessage._created.at(-1);
    const routed = card.flags?.[MODULE_ID]?.forcedMoveId === "finish_the_scene";
    const asksPrice = /Pay the Price/i.test(card.content);
    // FAILS today: a bare "Weak Hit" display card — no move, no price.
    expect({ routed, asksPrice }).not.toEqual({ routed: false, asksPrice: false });
  });
});
