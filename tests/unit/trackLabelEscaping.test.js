/**
 * A progress track's name is text wherever the Progress Tracks panel shows it
 * (issue #325 W26): the row, the tension tooltip, the ✕ confirm and the
 * display Progress Roll card rendered it raw. A player could Add a track whose
 * name is an `img` tag with an onerror handler (the relay handler only trims
 * and caps it) and it ran in every client that opened the panel — the GM's
 * included.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StubElement } from "../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";
const JOURNAL_NAME = "Starforged Progress Tracks";

let journal;
let savedFind;
const savedCreate = JournalEntry.create;

function makeTracksJournal(tracks) {
  const flags = { [MODULE_ID]: { tracks: structuredClone(tracks) } };
  return {
    id: "pt-journal", name: JOURNAL_NAME, ownership: { default: 0 },
    getFlag: (mod, key) => flags[mod]?.[key],
    async setFlag(mod, key, value) { flags[mod] ??= {}; flags[mod][key] = structuredClone(value); },
  };
}

beforeEach(() => {
  savedFind = game.journal.find;
  journal = makeTracksJournal([]);
  game.journal.find = (fn) => (fn(journal) ? journal : null);
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  game.settings._store.set(`${MODULE_ID}.campaignState`, { clocks: [] });
});

afterEach(() => {
  game.journal.find = savedFind;
  JournalEntry.create = savedCreate;
  delete globalThis.document;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
  ChatMessage._reset();
});

async function renderPanel() {
  const { ProgressTrackApp } = await import("../../src/ui/progressTracks.js");
  const app = new ProgressTrackApp();
  return app._renderHTML(await app._prepareContext({}), {});
}

describe("a track's name is text wherever it is shown", () => {
  it("a player's Add with markup in the name: the GM's panel shows the name, and no element is injected", async () => {
    const { applyProgressTrackEditFromRelay } = await import("../../src/ui/progressTracks.js");
    const label = 'Escape <img src=x onerror="alert(1)"> the Vault';
    // The relay a player's Add reaches (progressTracks.js #onAddTrack → requestGmAction).
    const res = await applyProgressTrackEditFromRelay(
      { op: "add", label, type: "combat", rank: "dangerous" },
      { requesterId: "player-1", requesterIsGM: false },
    );
    expect(res.applied).toBe(true);

    const root = await renderPanel();
    const name = root.querySelector(".track-name");
    expect({ injected: name.querySelectorAll("img").length, text: name.textContent })
      .toEqual({ injected: 0, text: label });
  });

  it("an ordinary name with angle brackets is shown whole", async () => {
    journal = makeTracksJournal([{
      id: "t1", label: "Escape <the Vault>", type: "expedition", rank: "formidable",
      ticks: 4, completed: false, createdAt: 1,
    }]);
    const root = await renderPanel();
    expect(root.querySelector(".track-name").textContent).toBe("Escape <the Vault>");
  });

  it("the display Progress Roll card (pre-session / scene challenge) escapes the name too", async () => {
    const { rollProgress } = await import("../../src/ui/progressTracks.js");
    await rollProgress({ id: "t2", label: "Outrun <the storm>", type: "scene_challenge", rank: "dangerous", ticks: 20 });
    const card = ChatMessage._created.at(-1);
    expect(card.content).toContain("Outrun &lt;the storm&gt;");
  });
});
