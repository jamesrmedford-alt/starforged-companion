/**
 * PROBE (oracles audit) — storeWorldTruths overwrites any journal that happens
 * to be named "World Truths".
 *
 * storeWorldTruths (src/truths/generator.js, the Playtest Quickstart's World
 * Truths phase) looks its journal up by display name alone:
 *
 *     const existing = game.journal?.getName(JOURNAL_NAME);   // "World Truths"
 *     if (existing) { await updateTruthsJournal(existing, truthSet); … }
 *
 * and updateTruthsJournal replaces the FIRST page's text with the rolled
 * truths. The journal it creates carries flags[MODULE].entityType =
 * "worldTruths", but the lookup never checks it — so a GM's own hand-written
 * "World Truths" notes lose their first page to the quickstart (whose confirm
 * dialog says it only "adds new content").
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rollWorldTruths, storeWorldTruths } from "../../../src/truths/generator.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const KEY = "starforged-companion.campaignState";
const savedGetName = game.journal.getName;

let gmNotesPage;
beforeEach(() => {
  game.settings._store.set(KEY, JSON.parse(JSON.stringify(CampaignStateSchema)));
  gmNotesPage = {
    name: "My setting notes",
    text: { content: "<p>The GM's own truths, written by hand.</p>" },
    flags: {},
    update: async (changes) => {
      if (changes["text.content"] !== undefined) gmNotesPage.text.content = changes["text.content"];
      return gmNotesPage;
    },
  };
  const gmJournal = { id: "j-gm-notes", name: "World Truths", flags: {}, pages: { contents: [gmNotesPage] } };
  game.journal.getName = (name) => (name === "World Truths" ? gmJournal : null);
});
afterEach(() => { game.journal.getName = savedGetName; });

describe("PROBE: storeWorldTruths only rewrites its own truths journal", () => {
  it("a GM journal named \"World Truths\" (no module flag) keeps its content", async () => {
    const campaignState = game.settings.get("starforged-companion", "campaignState");
    await storeWorldTruths(rollWorldTruths(), campaignState);
    expect(gmNotesPage.text.content).toBe("<p>The GM's own truths, written by hand.</p>");   // FAILS today: overwritten
  });
});
