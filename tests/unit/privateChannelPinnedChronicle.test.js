/* global makeTestActor -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/privateChannelPinnedChronicle.test.js
 *
 * known-issues PRIVATE-CHANNEL-NO-PINS (issue #345 AA07's residual): the main
 * narrator's CHARACTER block carries its PC's pinned Chronicle entries, but
 * the Private Channel builds its own CHARACTER block outside the shared
 * assembly, so its narrator never saw them. buildPrivateChannelStory now
 * returns the player's own PC's pinned entries and the Private Channel's
 * CHARACTER block lists them, worded as the main block words them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/character/chronicle.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getChronicleEntries: vi.fn(async (actorId) => (actorId === "pc-dax" ? [
    { text: "Dax traded his mother's compass for a nav-core.", pinned: false },
    { text: "Dax swore over his sister's grave never to fly for the Covenant.", pinned: true },
  ] : [
    { text: "Kira's own pinned moment.", pinned: true },
  ])),
}));
vi.mock("../../src/system/campaignTruths.js", async (importOriginal) => ({
  ...(await importOriginal()),
  buildCampaignTruthsBlock: vi.fn(async () => ""),
}));

import { buildPrivateContext } from "../../src/private-channel/context.js";

const MODULE_ID = "starforged-companion";
let saved;

beforeEach(() => {
  saved = { users: global.game.users };
  global.game.actors._setAll([
    makeTestActor({ id: "pc-kira", name: "Kira", ownership: { "player-2": 3 } }),
    makeTestActor({ id: "pc-dax",  name: "Dax",  ownership: { "player-1": 3 } }),
  ]);
  const users = new Map([
    ["player-1", { id: "player-1", name: "Sam", isGM: false, active: true, character: null }],
    ["player-2", { id: "player-2", name: "Ali", isGM: false, active: true, character: { id: "pc-kira", name: "Kira" } }],
  ]);
  global.game.users = { get: (id) => users.get(id) ?? null, get contents() { return [...users.values()]; } };
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: "ses-1" });
});

afterEach(() => {
  global.game.actors._reset();
  global.game.users = saved.users;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

describe("PRIVATE-CHANNEL-NO-PINS — the Private Channel's CHARACTER block carries the player's pins", () => {
  it("Dax's player: his pinned entry, not the unpinned one, and not Kira's", async () => {
    const { system } = await buildPrivateContext({
      campaignState: { currentSessionId: "ses-1" }, userId: "player-1", playerMessage: "What do I owe my sister?",
    });
    const block = system.slice(system.indexOf("## CHARACTER"));
    expect(block).toContain("Name: Dax");
    expect(block).toContain("Pinned in their Chronicle (moments the player wants kept in mind):");
    expect(block).toContain("  - Dax swore over his sister's grave never to fly for the Covenant.");
    expect(block).not.toContain("compass");
    expect(system).not.toContain("Kira's own pinned moment.");
  });
});
