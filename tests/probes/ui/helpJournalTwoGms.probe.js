/**
 * Probe UI-13 — HELP-JOURNAL-EVERY-GM (DUPLICATE)
 *
 * What the user does: a table with two GMs (an assistant GM — the multiplayer
 * shape the module supports, isCanonicalGM picks one) loads a fresh world, or
 * loads it after a module update that bumps CONTENT_VERSION.
 *
 * What happens: the ready hook calls ensureHelpJournal() on every GM client
 * (index.js:6441 `if (game.user.isGM)`), and ensureHelpJournal gates on
 * `game.user.isGM` alone (helpJournal.js:104). Each GM reads the world, finds
 * no "Starforged Companion — Help & Reference" journal (or a stale version
 * flag) and writes: two journals are created, or each deletes the old pages
 * and creates the 19 new ones — a second set of pages, or a delete of ids the
 * other GM already removed. CLAUDE.md: "Single-emitter writes gate on
 * isCanonicalGM(), not game.user.isGM."
 *
 * What should happen: only the canonical GM creates or rebuilds the help
 * journal (isCanonicalGM()).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ensureHelpJournal } from "../../../src/help/helpJournal.js";

const savedCreate = JournalEntry.create;
let restoreUser;

beforeEach(() => {
  JournalEntry.create = vi.fn(async (data) => ({
    id: "help-1", name: data.name, pages: [], createEmbeddedDocuments: async () => [], setFlag: async () => {},
  }));
  // Two GMs online; this client is the second (not canonical: lowest id wins).
  game.users._set([
    { id: "gm-aaaa", isGM: true, active: true },
    { id: "gm-bbbb", isGM: true, active: true },
  ]);
  restoreUser = withUser({ isGM: true, id: "gm-bbbb" });
});

afterEach(() => {
  JournalEntry.create = savedCreate;
  restoreUser();
  game.users._set([{ id: "test-user-gm", isGM: true, active: true }]);
});

describe("UI-13 the help journal is written by one GM", () => {
  it("control: this client is not the canonical GM", async () => {
    const { isCanonicalGM } = await import("../../../src/multiplayer/gmGate.js");
    expect(isCanonicalGM()).toBe(false);
  });

  it("the non-canonical GM's ready creates no help journal", async () => {
    await ensureHelpJournal();
    // FAILS today: both GMs create one.
    expect(JournalEntry.create).not.toHaveBeenCalled();
  });
});
