/**
 * STARFORGED COMPANION
 * tests/unit/clocksPanelRefresh.test.js
 *
 * Issue #322 V12 (traced): an open Clocks panel, and a scene challenge's
 * "Tension: n/4" line in the Progress Tracks panel, re-rendered only after
 * their own buttons. A clock advanced anywhere else — Pay the Price, Begin a
 * Session, `!clock`, another GM — stayed stale on screen until the panel was
 * reopened. Both clocks live in campaignState, so each panel now re-renders
 * on the campaignState setting hook when the clocks it showed changed — and
 * only then, so a campaignState write about anything else leaves a clock name
 * being typed alone.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";

const MODULE_ID = "starforged-companion";
const CS = `${MODULE_ID}.campaignState`;

const clock = (over = {}) => ({
  _id: "c1", name: "Pursuit", type: "tension", segments: 4, filled: 1, active: true, advanceOdds: "likely", ...over,
});

let clocks, progress;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  clocks   = await import("../../src/clocks/clocks.js");
  progress = await import("../../src/ui/progressTracks.js");
});

beforeEach(() => {
  game.settings._store.set(CS, { clocks: [clock()], currentSessionId: "s1" });
});

/** Store a clocks change the way a setting write lands, and fire the hook. */
function storeClocks(next, hook) {
  game.settings._store.set(CS, { ...game.settings._store.get(CS), clocks: next });
  hook({ key: CS });
}

describe("the Clocks panel follows clocks changed elsewhere", () => {
  let panel;

  beforeEach(async () => {
    panel = clocks.openClocksPanel();
    panel.rendered = true;
    await panel._prepareContext();        // what is on screen
    panel.render = vi.fn();
  });
  afterEach(() => { panel.rendered = false; });

  it("re-renders when a clock it shows advanced", () => {
    storeClocks([clock({ filled: 2 })], clocks.onClocksSettingChanged);
    expect(panel.render).toHaveBeenCalledTimes(1);
  });

  it("re-renders when a clock was added or removed", () => {
    storeClocks([clock(), clock({ _id: "c2", name: "Storm" })], clocks.onClocksSettingChanged);
    expect(panel.render).toHaveBeenCalledTimes(1);
  });

  it("leaves itself alone when campaignState changed but its clocks did not", () => {
    game.settings._store.set(CS, { ...game.settings._store.get(CS), sessionNumber: 7 });
    clocks.onClocksSettingChanged({ key: CS });
    expect(panel.render).not.toHaveBeenCalled();
  });

  it("ignores another setting, and a closed panel", () => {
    clocks.onClocksSettingChanged({ key: `${MODULE_ID}.narrationTone` });
    panel.rendered = false;
    storeClocks([clock({ filled: 3 })], clocks.onClocksSettingChanged);
    expect(panel.render).not.toHaveBeenCalled();
  });

  it("the hook is registered for both setting events", () => {
    const on = vi.spyOn(Hooks, "on");
    clocks.registerClocksPanelHooks();
    expect(on).toHaveBeenCalledWith("updateSetting", clocks.onClocksSettingChanged);
    expect(on).toHaveBeenCalledWith("createSetting", clocks.onClocksSettingChanged);
    on.mockRestore();
  });
});

describe("the Progress Tracks panel's tension line follows its clock", () => {
  let panel, journal, savedJournal;

  beforeEach(async () => {
    const flags = { [`${MODULE_ID}.tracks`]: [{
      id: "sc-1", label: "Restart the reactor", type: "scene_challenge", rank: "dangerous",
      ticks: 0, completed: false, tensionClockId: "c1",
    }] };
    journal = {
      id: "pt", name: "Starforged Progress Tracks",
      getFlag: (m, k) => flags[`${m}.${k}`],
      setFlag: async (m, k, v) => { flags[`${m}.${k}`] = structuredClone(v); },
    };
    savedJournal = game.journal;
    game.journal = { ...savedJournal, find: (fn) => (fn(journal) ? journal : null) };
    panel = progress.openProgressTracks();
    panel.rendered = true;
    const ctx = await panel._prepareContext({});
    expect(ctx.active[0].tensionClock).toMatchObject({ filled: 1, segments: 4 });   // "Tension: 1/4" on screen
    panel.render = vi.fn();
  });
  afterEach(() => { panel.rendered = false; game.journal = savedJournal; });

  it("re-renders when the paired clock advanced elsewhere", () => {
    storeClocks([clock({ filled: 2 })], progress.ProgressTrackApp.onSettingChanged);
    expect(panel.render).toHaveBeenCalledTimes(1);
  });

  it("leaves itself alone when the clocks did not change", () => {
    game.settings._store.set(CS, { ...game.settings._store.get(CS), xCardActive: false });
    progress.ProgressTrackApp.onSettingChanged({ key: CS });
    expect(panel.render).not.toHaveBeenCalled();
  });
});
