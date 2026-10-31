/**
 * PROBE (ui audit) — SCENE-CHALLENGE-CLOCK-ORPHAN
 *
 * A scene challenge created in the Progress Tracks panel (or through
 * addProgressTrack) auto-creates a paired 4-segment tension clock and stores
 * its id on the track (`tensionClockId`). Rulebook (rulebook-summary.md →
 * Clocks): "The scene ends when either the progress track is filled or the
 * tension clock is filled." But nothing ever retires the paired clock:
 * completing the track (✓ / completeProgressTrack) or removing it (✕) leaves
 * the clock `active`, and advanceTensionClocksForPayThePrice advances EVERY
 * active tension clock on EVERY Pay the Price. A finished scene challenge's
 * clock keeps ticking in later, unrelated scenes, and eventually posts
 * "(TRIGGERED)" plus a narrator trigger vignette (a narratorCard, so it
 * enters the ring / summary) for a scene that is over.
 *
 * Asserts the CORRECT behaviour (a finished / removed scene challenge's
 * clock no longer advances), so it FAILS today.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/narration/narrator.js", () => ({
  narrateClockAdvancement: vi.fn(async () => "The mine finally gives way."),
}));

const MODULE_ID = "starforged-companion";
const CS_KEY    = `${MODULE_ID}.campaignState`;

let progress;   // src/ui/progressTracks.js (imported after DialogV2 is stubbed)
let clocks;     // src/clocks/clocks.js
let ptpClocks;  // src/clocks/payThePriceClocks.js
let journal;
let savedJournal;

function makeTracksJournal() {
  const flags = {};
  return {
    id:      "tracks-journal",
    name:    "Starforged Progress Tracks",
    getFlag: (mod, key) => flags[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { flags[`${mod}.${key}`] = structuredClone(value); },
  };
}

beforeAll(async () => {
  // progressTracks.js destructures DialogV2 at import time.
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  progress  = await import("../../../src/ui/progressTracks.js");
  clocks    = await import("../../../src/clocks/clocks.js");
  ptpClocks = await import("../../../src/clocks/payThePriceClocks.js");
});

beforeEach(() => {
  journal = makeTracksJournal();
  savedJournal = game.journal;
  game.journal = { ...savedJournal, find: (fn) => (fn(journal) ? journal : null) };
  game.settings._store.set(CS_KEY, { clocks: [] });
  ChatMessage._reset();
});

afterEach(() => {
  game.journal = savedJournal;
  game.settings._store.delete(CS_KEY);
});

const pairedClock = (track) =>
  (game.settings.get(MODULE_ID, "campaignState").clocks ?? []).find(c => c._id === track.tensionClockId);

describe("a finished scene challenge's tension clock (SCENE-CHALLENGE-CLOCK-ORPHAN)", () => {
  it("completing the scene challenge stops its paired clock advancing on a later Pay the Price", async () => {
    const track = await progress.addProgressTrack({ label: "Escape the collapsing mine", type: "scene_challenge", rank: "formidable" });
    expect(track.tensionClockId).toBeTruthy();
    expect(pairedClock(track)).toMatchObject({ type: "tension", segments: 4, filled: 0 });

    await progress.completeProgressTrack(track.id);   // the scene is won and over

    // Three sessions later, an unrelated miss pays the price.
    const advanced = await clocks.advanceTensionClocksForPayThePrice();
    expect(advanced.map(c => c.name)).not.toContain("Escape the collapsing mine");
    expect(pairedClock(track)?.filled ?? 0).toBe(0);
  });

  it("removing the scene challenge (✕) stops its paired clock too", async () => {
    const track = await progress.addProgressTrack({ label: "Out-talk the magistrate", type: "scene_challenge", rank: "dangerous" });
    const app = { render() {}, element: null };
    await progress.ProgressTrackApp.DEFAULT_OPTIONS.actions.removeTrack.call(app, {}, { dataset: { trackId: track.id } });
    expect(await progress.listProgressTracks()).toEqual([]);   // the track is gone

    const advanced = await clocks.advanceTensionClocksForPayThePrice();
    expect(advanced.map(c => c.name)).not.toContain("Out-talk the magistrate");
  });

  it("a Pay the Price long after the scene ended does not announce the old scene's clock TRIGGERED", async () => {
    const track = await progress.addProgressTrack({ label: "Escape the collapsing mine", type: "scene_challenge", rank: "formidable" });
    await progress.completeProgressTrack(track.id);
    // Three earlier misses already ticked it (each advanced every active tension clock).
    for (let i = 0; i < 3; i++) await clocks.advanceTensionClocksForPayThePrice();

    await ptpClocks.advanceClocksOnPayThePrice();   // the fourth, in a different scene
    const turnCards = ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.payThePriceAdvance);
    const text = turnCards.map(m => m.content).join("\n");
    expect(text).not.toMatch(/Escape the collapsing mine — 4\/4 <strong>\(TRIGGERED\)<\/strong>/);
  });
});
