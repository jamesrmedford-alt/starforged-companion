/**
 * PROBE — UI-02 PANEL-RERENDER-WIPES-INPUT (tenth audit, area ui; UX /
 * LOSE-STATE — a hook-driven re-render replaces the panel's whole content,
 * typed text included)
 *
 * What the user does: the GM opens the Progress Tracks panel and starts
 * typing a new track's name ("The Ravager Nest") while a player's Strike
 * resolves and marks the fight (the pipeline writes the tracks flag — an
 * updateJournalEntry every client hears). Or the GM types a new clock's name
 * in the Clocks panel while a player's Pay the Price advances a tension
 * clock (a campaignState write). Or a player is editing a Chronicle entry's
 * text in place when the chronicle writer files an automatic entry after a
 * narration.
 *
 * What happens: each panel's hook calls `render()`, and `_replaceHTML` does
 * `content.innerHTML = ''` before appending a fresh tree
 * (src/ui/progressTracks.js:564-567, :580-588 — any tracks-flag change;
 * src/clocks/clocks.js:125-128, :205-210 — any change to the clocks shown;
 * src/character/chroniclePanel.js:99-101, :319-333 — any change to the
 * actor's chronicle page). The half-typed name is gone; the selects reset;
 * the contenteditable edit in progress is discarded without its blur save.
 * The Clocks hook's own comment acknowledges the hazard ("a re-render would
 * clear a clock name being typed") and the issue #322 V12 test says the
 * fingerprint spares the name only for an unrelated write — a change to what
 * the panel shows, which is exactly when the table is busy, still wipes it.
 *
 * What should happen: a re-render keeps the add-form's typed values (and an
 * in-progress inline edit) — read them from the live element before the
 * re-render and restore them after, as ApplicationV2 forms are expected to.
 *
 * Controls: the re-render itself happens (the new track / clock appears);
 * a typed value survives when nothing re-renders.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/ui/panelRerenderWipesInput.probe.js
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { StubElement } from "../../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";
const CS = `${MODULE_ID}.campaignState`;
const TRACKS_JOURNAL = "Starforged Progress Tracks";

let progress, clocks;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  progress = await import("../../../src/ui/progressTracks.js");
  clocks   = await import("../../../src/clocks/clocks.js");
  progress.registerProgressTrackHooks();
  clocks.registerClocksPanelHooks();
});

/** What ApplicationV2.render does: prepare → render → replace the window's content. */
async function renderLikeFoundry(app) {
  const ctx = await app._prepareContext({});
  const result = await app._renderHTML(ctx, {});
  if (!app.element) app.element = new StubElement("div");
  app._replaceHTML(result, app.element, {});
  app.rendered = true;
}

let savedJournal, journal, tracks;

beforeEach(() => {
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  tracks = [{ id: "t-1", label: "Ravager", type: "combat", rank: "dangerous", ticks: 4, completed: false }];
  journal = {
    id: "pt", name: TRACKS_JOURNAL,
    getFlag: (m, k) => (m === MODULE_ID && k === "tracks" ? tracks : undefined),
    setFlag: async (m, k, v) => { tracks = JSON.parse(JSON.stringify(v)); },
  };
  savedJournal = game.journal;
  game.journal = { ...savedJournal, find: (fn) => (fn(journal) ? journal : null) };
  game.settings._store.set(CS, { currentSessionId: "s-1", clocks: [
    { _id: "c1", name: "Pursuit", type: "tension", segments: 4, filled: 1, active: true, advanceOdds: "likely" },
  ] });
});

afterEach(() => {
  game.journal = savedJournal;
  game.settings._store.delete(CS);
  delete globalThis.document;
});

describe("UI-02 a hook-driven re-render keeps what the user has typed", () => {
  it("Progress Tracks: a track name being typed survives another client's mark on a fight", async () => {
    const app = progress.ProgressTrackApp.open();
    app.render = () => renderLikeFoundry(app);
    await renderLikeFoundry(app);
    const input = app.element.querySelector('[name="newLabel"]');
    expect(input).toBeTruthy();
    input.value = "The Ravager Nest";
    app.element.querySelector('[name="newRank"]').value = "formidable";

    // A player's Strike marks the fight: the tracks flag changes, every client hears updateJournalEntry.
    tracks = [{ ...tracks[0], ticks: 12 }];
    await Hooks.call("updateJournalEntry", journal, { flags: { [MODULE_ID]: { tracks } } }, {}, "gm-1");
    await new Promise(r => setTimeout(r, 0));

    expect(app.element.textContent).toContain("Ravager");                          // control: it re-rendered
    expect(app.element.querySelector('[name="newLabel"]').value).toBe("The Ravager Nest");   // today: ""
    expect.soft(app.element.querySelector('[name="newRank"]').value).toBe("formidable");
  });

  it("Clocks: a clock name being typed survives a tension clock advanced elsewhere", async () => {
    const app = clocks.openClocksPanel();
    app.render = () => renderLikeFoundry(app);
    await renderLikeFoundry(app);
    app.element.querySelector('[name="newClockName"]').value = "Reactor leak";

    // A player's Pay the Price advances the clock: the campaignState write lands on every client.
    game.settings._store.set(CS, { ...game.settings._store.get(CS), clocks: [
      { _id: "c1", name: "Pursuit", type: "tension", segments: 4, filled: 2, active: true, advanceOdds: "likely" },
    ] });
    clocks.onClocksSettingChanged({ key: CS });
    await new Promise(r => setTimeout(r, 0));

    expect(app.element.textContent).toContain("2/4");                                       // control: it re-rendered
    expect(app.element.querySelector('[name="newClockName"]').value).toBe("Reactor leak");   // today: ""
  });

  it("control: with nothing to re-render for, the typed name stays", async () => {
    const app = clocks.openClocksPanel();
    app.render = () => renderLikeFoundry(app);
    await renderLikeFoundry(app);
    app.element.querySelector('[name="newClockName"]').value = "Reactor leak";
    game.settings._store.set(CS, { ...game.settings._store.get(CS), sessionNumber: 3 });   // an unrelated field
    clocks.onClocksSettingChanged({ key: CS });
    await new Promise(r => setTimeout(r, 0));
    expect(app.element.querySelector('[name="newClockName"]').value).toBe("Reactor leak");
  });
});
