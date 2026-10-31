/**
 * PROBE (ui audit) — PROGRESS-PANEL-PLAYER-REFUSED
 *
 * The Progress Tracks panel is on every user's toolbar ("Everyone" in the
 * help's Toolbar Buttons table: "Create, mark, and complete ... combat
 * tracks"), but every action handler writes the GM-owned "Starforged Progress
 * Tracks" journal directly (saveTracks → journal.setFlag). The journal is
 * created `ownership: { default: NONE }`, so Foundry refuses a player's
 * update. Nothing relays the write to the GM (no GM_ACTIONS kind exists for
 * progress tracks), so a player's "+" / position toggle / ✓ does nothing.
 *
 * The journal stub below is permission-faithful the same way tests/setup.js's
 * Actor stub is (tests/helpers/foundryPermissions.js): a non-owner's setFlag
 * rejects with Foundry's wording.
 *
 * Asserts the CORRECT behaviour (a player's click lands in the world journal,
 * relayed through the canonical GM), so it FAILS today.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS } from "../../helpers/multiClient.js";
import { userOwnsDocument, permissionError } from "../../helpers/foundryPermissions.js";

const MODULE_ID = "starforged-companion";

function makeTracksJournal(tracks) {
  const flags = { [MODULE_ID]: { tracks: structuredClone(tracks) } };
  const journal = {
    id:        "pt-journal",
    name:      "Starforged Progress Tracks",
    // progressTracks.js getOrCreateJournal: ownership { default: NONE }
    ownership: { default: 0 },
    getFlag:   (mod, key) => flags[mod]?.[key],
    async setFlag(mod, key, value) {
      const user = globalThis.game?.user;
      if (!userOwnsDocument(user, journal)) {
        throw permissionError(user, "update", "JournalEntry", journal.id, "needs OWNER permission");
      }
      flags[mod] ??= {};
      flags[mod][key] = structuredClone(value);
    },
  };
  return journal;
}

const fight = () => ({
  id: "fight-1", label: "Corsair boarding party", type: "combat", rank: "dangerous",
  ticks: 0, completed: false, combatState: null, createdAt: 1,
});

describe("Progress Tracks panel — a player's click (PROGRESS-PANEL-PLAYER-REFUSED)", () => {
  let table;
  let journal;

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: { campaignState: { sessionActive: true } } } });
    journal = makeTracksJournal([fight()]);
    table.journal.set(journal.id, journal);
  });

  async function playerClicks(action, trackId) {
    silenceConsoleErrors();
    const player = table.client("pl-1");
    const { ProgressTrackApp } = await player.import("../../src/ui/progressTracks.js");
    const app = { render() {}, element: null };
    let error = null;
    await player.run(() =>
      ProgressTrackApp.DEFAULT_OPTIONS.actions[action].call(app, {}, { dataset: { trackId } }),
    ).catch(err => { error = err; });
    await table.settle();
    return error;
  }

  it("a player's Mark Progress (+) on a dangerous fight lands: 0 → 8 ticks", async () => {
    const error = await playerClicks("markProgress", "fight-1");
    const stored = journal.getFlag(MODULE_ID, "tracks").find(t => t.id === "fight-1");
    // Today: the player's setFlag is refused ("lacks permission to update
    // JournalEntry") and nothing relays it — the fight stays at 0.
    expect({ ticks: stored.ticks, error: error?.message ?? null })
      .toEqual({ ticks: 8, error: null });
  });

  it("a player's position toggle (Neutral → In control) lands", async () => {
    await playerClicks("toggleCombatState", "fight-1");
    const stored = journal.getFlag(MODULE_ID, "tracks").find(t => t.id === "fight-1");
    expect(stored.combatState).toBe("in_control");
  });

  it("the same click by the GM lands (control: the handler itself works)", async () => {
    const gm = table.client("gm-1");
    const { ProgressTrackApp } = await gm.import("../../src/ui/progressTracks.js");
    await gm.run(() =>
      ProgressTrackApp.DEFAULT_OPTIONS.actions.markProgress.call({ render() {} }, {}, { dataset: { trackId: "fight-1" } }),
    );
    expect(journal.getFlag(MODULE_ID, "tracks")[0].ticks).toBe(8);
  });
});
