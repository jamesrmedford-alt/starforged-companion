// tests/unit/readyCreatorsCanonicalGm.test.js
// The ready-time document creators run on the canonical GM only (issue #326
// W54). The help journal (and its page rebuild on a CONTENT_VERSION bump),
// the ✦ Quickstart / ✦ Campaign Start macros, the World Journal folder and
// four journals, and the ready-time migrations were gated on
// game.user.isGM: two GMs whose browsers reconnected together (a server
// restart) each found nothing and created one. CLAUDE.md: single-emitter
// writes gate on isCanonicalGM(), not isGM.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ensureHelpJournal } from "../../src/help/helpJournal.js";
import { initWorldJournals } from "../../src/world/worldJournal.js";
import { ensureQuickstartMacro } from "../../src/session/quickstart.js";
import { ensureCampaignStartMacro } from "../../src/session/campaignStart.js";
import { isCanonicalGM } from "../../src/multiplayer/gmGate.js";

const saved = {};
let restoreUser;

function twoGms(thisClient) {
  game.users._set([
    { id: "gm-aaaa", isGM: true, active: true },
    { id: "gm-bbbb", isGM: true, active: true },
  ]);
  restoreUser = withUser({ isGM: true, id: thisClient });
}

beforeEach(() => {
  saved.JournalEntry = JournalEntry.create;
  saved.Macro = globalThis.Macro;
  saved.Folder = globalThis.Folder;
  JournalEntry.create = vi.fn(async (data) => ({
    id: "j-1", name: data.name, pages: [], createEmbeddedDocuments: async () => [], setFlag: async () => {},
  }));
  globalThis.Macro = { create: vi.fn(async (data) => ({ id: "m-1", ...data })) };
  globalThis.Folder = { create: vi.fn(async (data) => ({ id: "f-1", ...data })) };
  game.macros = { contents: [] };
});

afterEach(() => {
  JournalEntry.create = saved.JournalEntry;
  globalThis.Macro = saved.Macro;
  globalThis.Folder = saved.Folder;
  restoreUser?.();
  game.users._set([{ id: "test-user-gm", isGM: true, active: true }]);
});

describe("the ready-time creators run on the canonical GM only (issue #326 W54)", () => {
  it("control: with two GMs online, the second is not the canonical one", () => {
    twoGms("gm-bbbb");
    expect(isCanonicalGM()).toBe(false);
  });

  it("the non-canonical GM's ready creates no help journal, macro or World Journal", async () => {
    twoGms("gm-bbbb");
    await ensureHelpJournal();
    expect(await ensureQuickstartMacro()).toBeNull();
    expect(await ensureCampaignStartMacro()).toBeNull();
    await initWorldJournals();
    expect(JournalEntry.create).not.toHaveBeenCalled();
    expect(Macro.create).not.toHaveBeenCalled();
    expect(Folder.create).not.toHaveBeenCalled();
  });

  it("control: the canonical GM creates them", async () => {
    twoGms("gm-aaaa");
    await ensureHelpJournal();
    await ensureQuickstartMacro();
    await ensureCampaignStartMacro();
    expect(JournalEntry.create).toHaveBeenCalled();
    expect(Macro.create).toHaveBeenCalledTimes(2);
  });
});
