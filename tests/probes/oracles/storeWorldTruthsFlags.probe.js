/**
 * PROBE (oracles audit) — the module's own truth roller never marks the
 * truths as established.
 *
 * CampaignStateSchema documents `worldTruthsSet` as "true once truths
 * established via any method" and `worldTruthsJournalId` as the truths
 * journal, "system-created or ours". Only the system-dialog hooks
 * (src/index.js createJournalEntry / createJournalEntryPage) write them, and
 * both skip a journal carrying this module's flags — which is exactly what
 * storeWorldTruths (src/truths/generator.js, the Playtest Quickstart's
 * "World Truths" phase) creates. So after the quickstart rolls and stores
 * all 14 truths, every world load still whispers the GM "No World Truths have
 * been established for this campaign" (index.js ready hook,
 * `if (!freshState.worldTruthsSet)`), whose button opens the system dialog —
 * inviting a second, contradictory truth set.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { rollWorldTruths, storeWorldTruths } from "../../../src/truths/generator.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const KEY = "starforged-companion.campaignState";

beforeEach(() => {
  game.settings._store.set(KEY, JSON.parse(JSON.stringify(CampaignStateSchema)));
});

describe("PROBE: storeWorldTruths records that truths are established", () => {
  it("sets worldTruthsSet and worldTruthsJournalId alongside worldTruths", async () => {
    const campaignState = game.settings.get("starforged-companion", "campaignState");
    const journal = await storeWorldTruths(rollWorldTruths(), campaignState);

    const stored = game.settings._store.get(KEY);
    expect(Object.keys(stored.worldTruths)).toHaveLength(14);      // the truths did land
    expect(journal?.id).toBeTruthy();
    expect(stored.worldTruthsSet).toBe(true);                       // FAILS today: false
    expect(stored.worldTruthsJournalId).toBe(journal.id);           // FAILS today: null
  });
});
