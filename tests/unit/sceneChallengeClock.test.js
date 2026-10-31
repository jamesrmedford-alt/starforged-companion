/**
 * STARFORGED COMPANION
 * tests/unit/sceneChallengeClock.test.js
 *
 * A scene challenge's paired danger clock ends with the challenge (issue #316
 * T03), on a booted GM / player table (tests/helpers/multiClient.js): the GM
 * completes or removes the challenge through the real Progress Tracks panel
 * action (src/ui/progressTracks.js), and a player's Pay the Price relays the
 * clock advance to the canonical GM (gmRelay "payThePrice.advanceClocks").
 *
 * Completing the track only archived the track: its tension clock stayed
 * active, the next Pay the Price advanced it to 1/4 and posted a clock card
 * naming the finished challenge. Completion retires the clock now (kept, as
 * retired); removing the track removes its clock. Either runs before the
 * track write, so a refused clock write changes nothing and the press is the
 * retry.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, journal, store, clocks;
const gm    = () => table.client("gm-1");
const world = () => table.world.campaignState();
const clock = (id) => world().clocks.find(c => c._id === id) ?? null;
const tracks = () => journal.getFlag(MODULE_ID, "tracks") ?? [];
const ptpCards = () => table.cards(f => f.payThePriceAdvance).map(m => m.content);

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal() {
  const flags = {};
  return {
    id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (scope, key) => flags[`${scope}.${key}`],
    setFlag: async (scope, key, value) => { flags[`${scope}.${key}`] = structuredClone(value); },
  };
}

const panelAction = (action, trackId) => gm().run(() =>
  store.ProgressTrackApp.DEFAULT_OPTIONS.actions[action].call({ render() {} }, null, { dataset: { trackId } }));

async function addChallenge(label = "Escape the flooding chamber") {
  const track = await gm().run(() => store.addProgressTrack({ type: "scene_challenge", label, rank: "dangerous" }));
  await table.settle();
  return track;
}

async function payThePrice() {
  const api = await table.client("pl-1").import("../../src/multiplayer/gmRelay.js");
  await table.client("pl-1").run(() => api.requestGmAction("payThePrice.advanceClocks", {}));
  await table.settle(); await table.drain();
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  store  = await gm().import("../../src/ui/progressTracks.js");
  clocks = await gm().import("../../src/clocks/clocks.js");
}, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "scc-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "scc-scene", sceneTruths: [], clocks: [] },
  } } });
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
  journal = makeTracksJournal();
  table.journal._set(journal);
  scriptClaude(table, { fallback: () => "The water rises." });
});

describe("T03 — a completed scene challenge's danger clock stops advancing", () => {
  it("the panel's ✓ retires the paired clock: Pay the Price leaves it at 0/4 and names it on no card; another tension clock still advances", async () => {
    const challenge = await addChallenge();
    const reactor = await gm().run(() => clocks.createClock({ name: "Reactor breach", segments: 4, type: "tension" }));
    await table.settle();
    expect(clock(challenge.tensionClockId)).toMatchObject({ active: true, filled: 0 });

    await panelAction("completeTrack", challenge.id);
    await table.settle();
    expect(tracks()[0]).toMatchObject({ id: challenge.id, completed: true });
    expect(clock(challenge.tensionClockId)).toMatchObject({ active: false, filled: 0 });

    await payThePrice();
    expect(clock(challenge.tensionClockId).filled).toBe(0);
    expect(clock(reactor._id)).toMatchObject({ active: true, filled: 1 });
    expect(ptpCards()).toHaveLength(1);
    expect(ptpCards()[0]).toMatch(/Reactor breach — 1\/4/);
    expect(ptpCards()[0]).not.toMatch(/flooding chamber/);

    // The record stays, marked retired, for `!clock list`.
    await gm().chat("!clock list");
    await table.settle();
    expect(table.cards(f => f.clockCard).at(-1).content).toMatch(/Escape the flooding chamber — tension 0\/4 <em>\(retired\)<\/em>/);
  });

  it("completeProgressTrack (a programmatic completion) retires the clock the same way", async () => {
    const challenge = await addChallenge();
    await gm().run(() => store.completeProgressTrack(challenge.id));
    await table.settle();
    expect(tracks()[0].completed).toBe(true);
    expect(clock(challenge.tensionClockId).active).toBe(false);
  });

  it("the panel's ✕ removes the paired clock with the challenge, once the GM confirms", async () => {
    const challenge = await addChallenge();
    gm().answerDialogs(d => {
      expect(d.content).toMatch(/Its danger clock goes with it/);
      return d.choose("yes");
    });
    await panelAction("removeTrack", challenge.id);
    await table.settle();
    expect(tracks()).toEqual([]);
    expect(clock(challenge.tensionClockId)).toBeNull();
  });

  it("control: a cancelled removal changes nothing", async () => {
    const challenge = await addChallenge();
    gm().answerDialogs(d => d.choose("no"));
    await panelAction("removeTrack", challenge.id);
    await table.settle();
    expect(tracks()).toHaveLength(1);
    expect(clock(challenge.tensionClockId)).toMatchObject({ active: true });
  });

  it("a refused clock write leaves the challenge open and warns; the next press completes and retires it", async () => {
    const challenge = await addChallenge();
    let refused = false;
    table.interceptWrites(w => {
      if (!refused && w.kind === "setting" && w.key === `${MODULE_ID}.campaignState`
          && w.value?.clocks?.some(c => c._id === challenge.tensionClockId && c.active === false)) {
        refused = true;
        return new Error("test: refuse the clock write once");
      }
    });
    await panelAction("completeTrack", challenge.id);
    await table.settle();
    expect(refused).toBe(true);
    expect(tracks()[0].completed).toBe(false);
    expect(clock(challenge.tensionClockId).active).toBe(true);
    expect(gm().notifications.map(n => `${n.level}: ${n.message}`)).toContainEqual(
      expect.stringMatching(/^warn: .*danger clock could not be retired — nothing was changed/));

    await panelAction("completeTrack", challenge.id);
    await table.settle();
    expect(tracks()[0].completed).toBe(true);
    expect(clock(challenge.tensionClockId).active).toBe(false);
  });

  it("control: a combat track's completion touches no clock", async () => {
    const fight = await gm().run(() => store.addProgressTrack({ type: "combat", label: "Raiders", rank: "dangerous" }));
    const reactor = await gm().run(() => clocks.createClock({ name: "Reactor breach", segments: 4, type: "tension" }));
    await table.settle();
    await panelAction("completeTrack", fight.id);
    await table.settle();
    expect(tracks()[0].completed).toBe(true);
    expect(clock(reactor._id)).toMatchObject({ active: true, filled: 0 });
  });
});
