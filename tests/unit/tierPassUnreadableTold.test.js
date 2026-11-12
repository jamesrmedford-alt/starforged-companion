/**
 * STARFORGED COMPANION
 * tests/unit/tierPassUnreadableTold.test.js
 *
 * known-issues TIER-PASS-TRUNC-SILENT: the generative-tier pass (the details
 * a narration gives the established entities in it) read a reply cut off at
 * max_tokens, or otherwise malformed, as "no updates": every detail was lost
 * and only a console warning ("Haiku reply cut off at max_tokens") named a
 * cut. The GM is told now, as the detection pass's own loss is (issue #321
 * U15); a readable reply with no updates stays quiet.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appendGenerativeTierUpdates } from "../../src/entities/entityExtractor.js";
import { installJournalMock, addConnectionEntity } from "../helpers/fullStateFixture.js";

let installed;
let warn;
let savedUser;

beforeEach(() => {
  installed = installJournalMock();
  savedUser = game.user;
  game.user = { id: "gm-1", isGM: true };
  warn = vi.fn();
  global.ui = { ...(global.ui ?? {}), notifications: { ...(global.ui?.notifications ?? {}), warn } };
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  installed.restore();
  game.user = savedUser;
  vi.restoreAllMocks();
});

function run(reply) {
  const ref = addConnectionEntity(installed.journals, { name: "Kael" });
  return appendGenerativeTierUpdates(
    "Kael steadies the wheel and finally admits the debt.",
    [{ journalId: ref.journalId, type: "connection" }],
    "ses-1", 1,
    { callTierAPI: async () => reply },
  );
}

describe("TIER-PASS-TRUNC-SILENT — an unreadable tier reply is told", () => {
  it("a reply cut off mid-object: nothing applied, and the GM is told whose details were lost", async () => {
    const applied = await run('{"updates":[{"entityId":"x","detail":"Owes the syndicate a ');
    expect(applied).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/new details for Kael from this narration were not recorded — the reply was cut off or malformed/);
  });

  it("control: a readable reply with no updates is quiet", async () => {
    await run('{"updates":[]}');
    expect(warn).not.toHaveBeenCalled();
  });

  it("control: a player's client is not notified", async () => {
    game.user = { id: "pl-1", isGM: false };
    await run('{"updates":[{"entityId"');
    expect(warn).not.toHaveBeenCalled();
  });
});
