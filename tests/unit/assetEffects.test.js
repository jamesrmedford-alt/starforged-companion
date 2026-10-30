/**
 * STARFORGED COMPANION
 * tests/unit/assetEffects.test.js
 *
 * Asset effects after a move (consequence riders, issue #217) and the move
 * lock around their prompt, end to end on a booted GM / two-player table
 * (tests/helpers/multiClient.js): a player's narration goes through the GM's
 * real move pipeline — resolver, persist, the early lock release, the rider
 * prompt (riderDialog.js) and the effects' writes. The interpretation, the
 * applicable abilities, the extracted riders (contract-valid extractor
 * output) and the dice are scripted at their boundaries.
 *
 *   S01 — a move's finally never releases a lock a later move holds (issue #315).
 *   S02 — an optional or "choose one" progress mark stays the player's choice
 *         when one track is open; the track is only its preselected destination.
 *   S03 — a progress effect marks its amount, either sign, within the track.
 *   S05 — an integrity effect cannot raise a battered ship's integrity.
 *   S06 — a finished track is never a progress effect's target.
 *   S08 — an effect is summarised as applied only once its write has landed;
 *         a refused one goes to the GMs, whose Retry applies it alone.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

// `riders` is the extractor's output for the next move; a narration containing
// "HOLD" waits in the interpreter on `hold` (after resolving `arrived`).
const control = vi.hoisted(() => ({ riders: [], entered: [], hold: null, arrived: null, choice: null }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => {
    control.entered.push(text);
    if (text.includes("HOLD") && control.hold) { control.arrived.resolve(); await control.hold.promise; }
    return { moveId: "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0,
      playerNarration: text, inputMethod: "chat", rationale: "test", mischiefApplied: false };
  }),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => control.riders.length
    ? [{ key: "kit:0", assetId: "kit", assetName: "Field Kit", abilityIndex: 0, text: "An asset ability with an effect on the outcome." }]
    : []),
}));
vi.mock("../../src/moves/consequenceRiders.js", async (original) => ({
  ...(await original()), extractRiders: vi.fn(async () => structuredClone(control.riders)),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice 2 and 3, action die 6, inside the REAL resolveMove: a strong hit, no match.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random").mockReturnValueOnce(0.15).mockReturnValueOnce(0.25).mockReturnValueOnce(0.99);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude, deferred, failWrites, campaignStateWrite } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, pc, journal;
const world   = () => table.world.campaignState();
const gm      = () => table.client("gm-1");
const moves   = () => table.cards(f => f.moveResolution);
const entered = (text) => control.entered.some(t => t.includes(text));
const notices = (userId) => table.client(userId).notifications.map(n => `${n.level}: ${n.message}`);
const summary = () => table.cards(f => f.riderSummary).at(-1)?.content ?? "";
const failCards = () => table.cards(f => f.payoffFailureCard);
const prompts = () => table.dialogs.filter(d => d.title.includes("Apply asset effects"));
const ticks   = () => (journal.getFlag(MODULE_ID, "tracks") ?? []).map(t => t.ticks);
const saved   = () => (journal.savedFlag(MODULE_ID, "tracks") ?? []).map(t => t.ticks);

/** The firing riders of one asset ability (a strong hit fires `strong_hit`). */
function riders(...rows) {
  control.riders = [{ key: "kit:0", assetName: "Field Kit", abilityName: "",
    riders: rows.map(r => ({ condition: "strong_hit", optional: false, choiceGroup: null, ...r })) }];
}

/** The player narrates a move; the canonical GM's pipeline runs it. */
async function say(text) {
  await table.client("pl-1").chat(`I attempt ${text}.`, { speaker: { actor: pc.id } });
  await table.settle();
}

/** A move that runs to the end, its prompt (if any) answered by the GM's responder. */
async function finishMove(text = "MOVE") { await say(text); await table.drain(); }

/**
 * The progress store's journal. `getFlag` hands back this client's cached
 * value, as Foundry's does; the world's copy is kept apart (`savedFlag`), so a
 * test can tell a change left in the cache from a save that landed.
 * `refuseNext(fn)` refuses the next save whose value fn matches.
 */
function progressJournal() {
  const cached = {}, world = {};
  let refuse = null;
  return {
    id: "fx-progress", name: "Starforged Progress Tracks",
    getFlag: (scope, key) => cached[`${scope}.${key}`],
    savedFlag: (scope, key) => structuredClone(world[`${scope}.${key}`]),
    refuseNext: (fn) => { refuse = fn; },
    setFlag: async (scope, key, value) => {
      if (refuse?.(value)) { refuse = null; throw new Error("The server refused the save (test fault)"); }
      cached[`${scope}.${key}`] = structuredClone(value);
      world[`${scope}.${key}`]  = structuredClone(value);
    },
  };
}

/** An expedition through the real store, on the GM. */
async function openTrack({ label = "Reach Farpoint", ticks = 0, completed = false } = {}) {
  const store = await gm().import("../../src/ui/progressTracks.js");
  return gm().run(async () => {
    const track = await store.addProgressTrack({ type: "expedition", label, rank: "dangerous" });
    await store.updateTrackFields(track.id, { ticks, completed });
    return track;
  });
}

/** The command vehicle: integrity on its flag record, battered on the native field and the flag. */
async function commandShip({ integrity = 1, battered = false } = {}) {
  const ship = table.addActor({ id: "ship-a", type: "starship", name: "Wayfarer",
    system: { debility: { battered } }, flags: { [MODULE_ID]: {
      entityType: "ship", ship: { _id: "ship-entity", name: "Wayfarer", integrity, integrityMax: 5, battered, isCommandVehicle: true },
    } } });
  await gm().run(() => game.settings.set(MODULE_ID, "campaignState", { ...world(), shipIds: [ship.id] }));
  await table.settle();
  return ship;
}
const integrityOf = (ship) => ship.flags[MODULE_ID].ship.integrity;

/** Refuse the next write of `integrity` to the ship's record. */
function refuseIntegrity(ship, integrity) {
  let refused = 0;
  table.interceptWrites(w => {
    if (refused || w.kind !== "actor.update" || w.id !== ship.id) return undefined;
    if (w.changes?.[`flags.${MODULE_ID}.ship`]?.integrity !== integrity) return undefined;
    refused += 1;
    return new Error("The server refused the integrity (test fault)");
  });
  return { get refused() { return refused; } };
}

/** A GM presses the payoff card's Retry. */
async function retry(card) {
  gm().click(card._id, '[data-action="sf-payoff-retry"]');
  await table.settle();
  await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.riders = []; control.entered = []; control.hold = null; control.arrived = null; control.choice = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "fx-s1", sessionNumber: 1,
      currentSceneId: "fx-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  pc = table.addActor({ id: "pc-a", name: "Kira", ownership: { "pl-1": 3 } });
  journal = progressJournal();
  table.journal._set(journal);
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});
// A move a failed test left waiting must not run into the next test.
afterEach(async () => {
  control.hold?.resolve();
  control.choice?.resolve({ apply: [], progress: [] });
  gm().answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// S01 — the lock is released before the rider prompt, so a later move may hold
// it by the time the prompt closes: the earlier move's finally must not clear it.
// ─────────────────────────────────────────────────────────────────────────────

describe("S01 — a move's finally never releases a later move's lock", () => {
  it("A's prompt is open, B holds the lock, A finishes: B keeps it, so C is refused until B is done", async () => {
    const choice = control.choice = deferred(), choiceArrived = deferred();
    riders({ resource: "momentum", amount: 1, optional: true, label: "+1 momentum" });
    gm().answerDialogs(async d => {
      if (d.title.includes("Apply asset effects")) { choiceArrived.resolve(); return choice.promise; }
      return d.close();
    });
    await say("MOVE A");
    await choiceArrived.promise;
    expect(world().pendingMove).toBe(false);          // released before the prompt

    control.riders = []; control.hold = deferred(); control.arrived = deferred();
    await say("HOLD B");
    await control.arrived.promise;
    expect(world().pendingMove).toBe(true);           // B's lock

    choice.resolve({ apply: [], progress: [] });      // A's prompt closes: skip
    await table.settle();
    expect(world().pendingMove).toBe(true);           // still B's

    await say("MOVE C");
    expect(entered("MOVE C")).toBe(false);
    expect(notices("gm-1")).toContainEqual(expect.stringMatching(/A move is already being resolved/));

    control.hold.resolve();
    await table.drain();
    expect(world().pendingMove).toBe(false);          // B released its own lock
    expect(moves()).toHaveLength(2);

    await say("MOVE D");                              // and play goes on
    await table.drain();
    expect(entered("MOVE D")).toBe(true);
    expect(moves()).toHaveLength(3);
    expect(world().pendingMove).toBe(false);
  });

  it("an early release that is refused holds the lock through the prompt; the finally then releases it", async () => {
    expectConsoleError(/Failed to release pendingMove lock/);
    const choice = control.choice = deferred(), choiceArrived = deferred();
    riders({ resource: "momentum", amount: 1, optional: true, label: "+1 momentum" });
    gm().answerDialogs(async d => {
      if (d.title.includes("Apply asset effects")) { choiceArrived.resolve(); return choice.promise; }
      return d.close();
    });
    const refused = failWrites(table, w => campaignStateWrite("gm-1")(w) && w.value?.pendingMove === false);

    await say("MOVE A");
    await choiceArrived.promise;
    expect(refused.refused).toBe(1);
    expect(world().pendingMove).toBe(true);           // the early release did not land

    control.riders = [];
    await say("MOVE B");
    expect(entered("MOVE B")).toBe(false);            // still A's lock

    choice.resolve({ apply: [], progress: [] });
    await table.drain();
    expect(world().pendingMove).toBe(false);          // A's finally retried the release

    await say("MOVE C");
    await table.drain();
    expect(entered("MOVE C")).toBe(true);
    expect(moves()).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S02 — with one track open, every progress rider marked it unasked: a "you
// may mark progress" was never offered, and a "mark progress or +2 momentum"
// marked the track before the dialog offered momentum alone — choosing it
// applied both. The lone track is now the preselected destination only.
// ─────────────────────────────────────────────────────────────────────────────

describe("S02 — an optional or exclusive progress mark stays a choice with one track open", () => {
  // The radio of a "choose one" group, by option index.
  const pick = (index, of = 2) => Object.fromEntries(Array.from({ length: of }, (_, i) =>
    [`input[name="choice-0"][value="${i}"]`, i === index]));

  it("a 'you may mark progress' is offered, the lone track preselected — Skip all leaves it at 0", async () => {
    await openTrack();
    riders({ resource: "progress", amount: 1, optional: true, label: "May mark progress" });
    gm().answerDialogs(d => d.choose("skip"));

    await finishMove();

    expect(prompts()).toHaveLength(1);
    expect(prompts()[0].content).toMatch(/<option value="[^"]+" selected>Reach Farpoint/);
    expect(saved()).toEqual([0]);
    expect(table.cards(f => f.riderSummary)).toHaveLength(0);
  });

  it("…and Apply marks the preselected track", async () => {
    await openTrack();
    riders({ resource: "progress", amount: 1, optional: true, label: "May mark progress" });
    gm().answerDialogs(d => d.choose("apply"));

    await finishMove();

    expect(saved()).toEqual([8]);
    expect(summary()).toMatch(/Asset effects applied[\s\S]*May mark progress → Reach Farpoint/);
  });

  it("'mark progress or +2 momentum': both are options of one choice, and choosing momentum leaves the track alone", async () => {
    await openTrack();
    riders({ resource: "progress", amount: 1, choiceGroup: "one", label: "Mark progress" },
      { resource: "momentum", amount: 2, choiceGroup: "one", label: "+2 momentum" });
    gm().answerDialogs(d => d.choose("apply", pick(1)));

    await finishMove();

    const [dialog] = prompts();
    expect(dialog.content).toMatch(/name="choice-0" value="0" checked> Mark progress on track: <select name="choice-0-track-0">/);
    expect(dialog.content).toMatch(/name="choice-0" value="1"> \+2 momentum/);
    expect(saved()).toEqual([0]);
    expect(pc.system.momentum.value).toBe(5);         // 2, +1 Face Danger, +2 the choice
  });

  it("…and choosing the mark marks its preselected track, with no momentum", async () => {
    await openTrack();
    riders({ resource: "progress", amount: 1, choiceGroup: "one", label: "Mark progress" },
      { resource: "momentum", amount: 2, choiceGroup: "one", label: "+2 momentum" });
    gm().answerDialogs(d => d.choose("apply", pick(0)));

    await finishMove();

    expect(saved()).toEqual([8]);
    expect(pc.system.momentum.value).toBe(3);         // 2, +1 Face Danger
    expect(summary()).toMatch(/Mark progress → Reach Farpoint/);
  });

  it("control: a mark that is the outcome's own still marks the lone track, unasked", async () => {
    await openTrack();
    riders({ resource: "progress", amount: 1, label: "Mark progress" });

    await finishMove();

    expect(prompts()).toHaveLength(0);
    expect(saved()).toEqual([8]);
  });

  it("control: with two tracks, skipping an optional mark leaves both at 0", async () => {
    await openTrack(); await openTrack({ label: "Chart the Rift" });
    riders({ resource: "progress", amount: 1, optional: true, label: "May mark progress" });
    gm().answerDialogs(d => d.choose("skip"));

    await finishMove();

    expect(prompts()).toHaveLength(1);
    expect(prompts()[0].content).not.toMatch(/ selected>/);   // ambiguous: nothing preselected
    expect(saved()).toEqual([0, 0]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S03 — progress is counted in marks, signed (the extractor's contract), but
// both progress writes dropped the amount: +2 marked once, -1 marked once.
// A dangerous expedition takes 8 ticks a mark.
// ─────────────────────────────────────────────────────────────────────────────

describe("S03 — a progress effect marks its amount, either sign, within 0–40 ticks", () => {
  for (const [amount, from, to] of [[1, 0, 8], [2, 0, 16], [-1, 16, 8], [-2, 8, 0], [2, 32, 40]]) {
    it(`${amount > 0 ? "+" : ""}${amount} mark${Math.abs(amount) === 1 ? "" : "s"} at ${from} ticks: ${to}`, async () => {
      await openTrack({ ticks: from });
      riders({ resource: "progress", amount, label: `${amount} marks` });

      await finishMove();

      expect(saved()).toEqual([to]);
      expect(summary()).toMatch(/Asset effects applied/);
    });
  }

  it("through the picker too: +2 on the track chosen of two", async () => {
    await openTrack(); const rift = await openTrack({ label: "Chart the Rift" });
    riders({ resource: "progress", amount: 2, label: "+2 marks" });
    gm().answerDialogs(d => d.choose("apply", { 'select[name="prog-0"]': rift.id }));

    await finishMove();

    expect(saved()).toEqual([0, 16]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S05 — an asset effect's integrity was written directly: a battered command
// ship at 0 went to 1, still battered, and the card said "+1 integrity". The
// rule: until you successfully Repair, you cannot raise the vehicle's integrity.
// ─────────────────────────────────────────────────────────────────────────────

describe("S05 — an integrity effect cannot raise a battered ship's integrity", () => {
  it("+1 integrity on a battered ship at 0: not applied, still battered, and the card says why", async () => {
    const ship = await commandShip({ integrity: 0, battered: true });
    const ships = await gm().import("../../src/entities/ship.js");
    await gm().run(() => ships.repairIntegrity(ship.id, 1).catch(() => null));   // the Repair helper refuses too
    expect(integrityOf(ship)).toBe(0);
    riders({ resource: "integrity", amount: 1, label: "+1 integrity" });

    await finishMove();

    expect(integrityOf(ship)).toBe(0);
    expect(ship.system.debility.battered).toBe(true);
    expect(summary()).toMatch(/Asset effects not applied[\s\S]*\+1 integrity[\s\S]*— the vehicle is battered/);
    expect(failCards()).toHaveLength(0);              // a rule, not a refused write: no Retry
  });

  it("control: once Repair clears battered, the effect lands", async () => {
    const ship = await commandShip({ integrity: 0, battered: false });
    riders({ resource: "integrity", amount: 1, label: "+1 integrity" });

    await finishMove();

    expect(integrityOf(ship)).toBe(1);
    expect(summary()).toMatch(/Asset effects applied[\s\S]*\+1 integrity/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S06 — the rider path counted every track, finished ones too: a sole archived
// expedition (completed, 16 ticks) was marked to 24, unasked, and named on the
// summary. Only open tracks are targets, and the chosen one is checked again
// when its mark is written.
// ─────────────────────────────────────────────────────────────────────────────

describe("S06 — a finished track is never a progress effect's target", () => {
  it("only a finished expedition: it is left at 16, nothing is asked, and the card says there is no open track", async () => {
    await openTrack({ ticks: 16, completed: true });
    riders({ resource: "progress", amount: 1, label: "Mark progress" });

    await finishMove();

    expect(saved()).toEqual([16]);
    expect(prompts()).toHaveLength(0);
    expect(summary()).toMatch(/Asset effects not applied[\s\S]*Mark progress[\s\S]*— no open progress track/);
    expect(failCards()).toHaveLength(0);              // nothing to retry
  });

  it("one open beside a finished one: the open one is the sole target, marked unasked", async () => {
    await openTrack({ label: "Old Survey", ticks: 16, completed: true });
    await openTrack();
    riders({ resource: "progress", amount: 1, label: "Mark progress" });

    await finishMove();

    expect(prompts()).toHaveLength(0);
    expect(saved()).toEqual([16, 8]);
    expect(summary()).toMatch(/Mark progress → Reach Farpoint/);
  });

  it("the picker offers open tracks only", async () => {
    await openTrack({ label: "Old Survey", ticks: 16, completed: true });
    await openTrack(); await openTrack({ label: "Chart the Rift" });
    riders({ resource: "progress", amount: 1, label: "Mark progress" });
    gm().answerDialogs(d => d.choose("skip"));

    await finishMove();

    expect(prompts()[0].content).toMatch(/Reach Farpoint[\s\S]*Chart the Rift/);
    expect(prompts()[0].content).not.toMatch(/Old Survey/);
  });

  it("a track finished while the prompt is open is not marked, and the card says so", async () => {
    await openTrack(); const rift = await openTrack({ label: "Chart the Rift" });
    riders({ resource: "progress", amount: 1, label: "Mark progress" });
    const store = await gm().import("../../src/ui/progressTracks.js");
    gm().answerDialogs(async d => {
      await store.completeProgressTrack(rift.id);     // finished meanwhile, from the panel
      return d.choose("apply", { 'select[name="prog-0"]': rift.id });
    });

    await finishMove();

    expect(saved()).toEqual([0, 0]);
    expect(summary()).toMatch(/Asset effects not applied[\s\S]*Mark progress → Chart the Rift[\s\S]*— its track is finished/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S08 — the summary listed every effect asked for: a refused integrity write
// and a refused progress save both read "Asset effects applied", and nothing
// told the GMs. An effect is applied once its write lands; a refused one is
// said, and goes to the GMs' payoff card, whose Retry applies it alone.
// ─────────────────────────────────────────────────────────────────────────────

describe("S08 — an asset effect is applied only once its write lands", () => {
  it("a refused integrity write: the ship is unchanged, the card says why, and the GMs' Retry applies it once", async () => {
    const ship = await commandShip({ integrity: 1 });
    const refused = refuseIntegrity(ship, 2);
    riders({ resource: "integrity", amount: 1, label: "+1 integrity" });

    await finishMove();

    expect(refused.refused).toBe(1);
    expect(integrityOf(ship)).toBe(1);
    expect(summary()).not.toMatch(/Asset effects applied/);
    expect(summary()).toMatch(/Asset effects not applied[\s\S]*\+1 integrity[\s\S]*the world did not save it/);
    expect(failCards()).toHaveLength(1);
    const card = failCards()[0];
    expect(card.flags[MODULE_ID]).toMatchObject({ source: "rider", actorId: pc.id,
      steps: [{ step: "rider", rider: { resource: "integrity", amount: 1 }, shipActorId: ship.id }] });
    expect(card.content).toMatch(/Wayfarer's integrity stands at 1 now/);

    await retry(card);
    expect(integrityOf(ship)).toBe(2);
    await retry(card);                                // claimed: a second press does nothing
    expect(integrityOf(ship)).toBe(2);
  });

  it("a refused progress save: nothing is marked, in the world or this client's cache, and the Retry marks it once", async () => {
    await openTrack();
    journal.refuseNext(value => value?.[0]?.ticks === 8);
    riders({ resource: "progress", amount: 1, label: "Mark progress" });

    await finishMove();

    expect(saved()).toEqual([0]);
    expect(ticks()).toEqual([0]);                     // the cache was not changed either
    expect(summary()).toMatch(/Asset effects not applied[\s\S]*Mark progress → Reach Farpoint[\s\S]*the world did not save it/);
    const [card] = failCards();
    expect(card.flags[MODULE_ID].steps).toEqual([expect.objectContaining({ step: "rider", track: expect.objectContaining({ label: "Reach Farpoint" }) })]);
    expect(card.content).toMatch(/It stands at 0\/40 ticks now/);

    await retry(card);
    expect(saved()).toEqual([8]);
  });

  it("one effect lands and one is refused: the card splits them, and the Retry replays the refused one only", async () => {
    const ship = await commandShip({ integrity: 1 });
    refuseIntegrity(ship, 2);
    riders({ resource: "momentum", amount: 1, label: "+1 momentum" }, { resource: "integrity", amount: 1, label: "+1 integrity" });

    await finishMove();

    expect(pc.system.momentum.value).toBe(4);        // 2, +1 Face Danger, +1 the effect
    expect(integrityOf(ship)).toBe(1);
    expect(summary()).toMatch(/Asset effects applied<\/strong><ul><li>\+1 momentum[\s\S]*Not applied:[\s\S]*\+1 integrity/);
    const [card] = failCards();
    expect(card.flags[MODULE_ID].steps.map(s => s.rider.resource)).toEqual(["integrity"]);

    await retry(card);
    expect(integrityOf(ship)).toBe(2);
    expect(pc.system.momentum.value).toBe(4);        // not replayed
  });

  it("control: every write lands — the summary lists them, and the GMs get no card", async () => {
    const ship = await commandShip({ integrity: 1 });
    await openTrack();
    riders({ resource: "integrity", amount: 1, label: "+1 integrity" }, { resource: "progress", amount: 1, label: "Mark progress" });

    await finishMove();

    expect(integrityOf(ship)).toBe(2);
    expect(saved()).toEqual([8]);
    expect(summary()).toMatch(/Asset effects applied[\s\S]*\+1 integrity[\s\S]*Mark progress → Reach Farpoint/);
    expect(summary()).not.toMatch(/Not applied/);
    expect(failCards()).toHaveLength(0);
  });
});
