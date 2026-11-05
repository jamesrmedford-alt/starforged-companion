/**
 * Issue #335 Y08 PACED-ROLL-DROPPED-AT-LOCK — the paced card's Roll and the
 * "Which fight?" pick are held, not dropped, at the move lock and the
 * session gate.
 *
 * Two players. Ren's Face Danger is being narrated (the move lock held). The
 * GM presses Kira's paced card's "Roll Face Danger": the card is stamped
 * `rolled` ("Rolled" on every client) and the forced move was posted with no
 * `deferWhileBusy`, so the pipeline met the lock, said "A move is already
 * being resolved" and dropped it — Kira's line was lost. The "Which fight?"
 * pick (stamped `whichFightPicked`) was dropped the same way. Both now post
 * `deferWhileBusy`, as every other claimed button does (issue #325 W02 /
 * #329 X14: "a claimed card's forced move is held, not dropped, before a
 * session begins as while the lock is held").
 *
 * (Converted from the tenth audit's probe
 * tests/probes/pipeline/pacedRollDroppedAtLock.probe.js.)
 */

/* global silenceConsoleErrors, structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text, { expectedMoveSlug } = {}) => ({
    moveId: expectedMoveSlug ?? "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0,
    rationale: "test", mischiefApplied: false, playerNarration: text, inputMethod: "chat",
  })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { deferred } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const NARRATION_MODEL = "claude-sonnet-4-5-20250929";
const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG_ACTION = [0.0, 0.15, 0.99];   // challenge 1, 2; action die 6

function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

let table;
const world = () => table.world.campaignState();
const gm = () => table.client("gm-1");
const moveCardsOf = (actorId) => table.cards(f => f.moveResolution && f.actorId === actorId);

/** Ren's Face Danger, held at its narration: the lock stays claimed until `release()`. */
async function renMovesAndIsNarrated() {
  const held = deferred();
  table.claude.respond((call) => (call.model === NARRATION_MODEL ? held.promise : REPLY));
  control.dice = STRONG_ACTION;
  await table.client("pl-2").chat("Ren braces against the hull and pushes through the breach.", { speaker: { actor: "pc-ren", alias: "Ren" } });
  await table.settle();
  expect(world()).toMatchObject({ pendingMove: true, pendingMoveBy: "gm-1" });
  return async () => {
    held.resolve(REPLY);
    await table.settle(); await table.drain();
    expect(world().pendingMove).toBe(false);
  };
}

async function postPacedCard() {
  const msg = await gm().run(() => globalThis.ChatMessage.create({
    content: `<div class="sf-narration-card sf-narration-card--paced"><div class="sf-narration-prose">The hatch hisses.</div>`
      + `<div class="sf-paced-actions"><button type="button" class="sf-paced-roll-btn" data-action="sf-paced-roll">Roll Face Danger</button></div></div>`,
    flags: { [MODULE_ID]: {
      narratorCard: true, narrationCard: true, pacedNarrative: true, narrationText: "The hatch hisses.",
      playerText: "Kira forces the hatch and dives through.", playerName: "Kira", actorId: "pc-kira",
      suggestedMove: "face_danger", sessionId: "pr-s1",
    } },
  }));
  await table.settle();
  return msg.id;
}

async function postWhichFightCard() {
  const msg = await gm().run(() => globalThis.ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>Take Decisive Action — which fight?</strong><div class="sf-milestone-suggest-row">`
      + `<button type="button" class="sf-followup-btn" data-action="sf-which-fight" data-track-id="fight-1">⚔ Corsairs</button>`
      + `<button type="button" class="sf-followup-btn" data-action="sf-which-fight" data-track-id="fight-2">⚔ Drones</button></div></div>`,
    flags: { [MODULE_ID]: {
      whichFightCard: true, moveId: "take_decisive_action", narration: "Kira takes decisive action.", actorId: "pc-kira",
      fights: [{ id: "fight-1", label: "Corsairs" }, { id: "fight-2", label: "Drones" }],
    } },
  }));
  await table.settle();
  return msg.id;
}

async function resetWorld({ sessionActive = true } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive, currentSessionId: "pr-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "pr-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
  table.addActor({ id: "pc-ren",  name: "Ren",  ownership: { "pl-2": 3 } });
  table.journal._set(makeTracksJournal([
    { id: "fight-1", label: "Corsairs", type: "combat", rank: "dangerous", ticks: 24, completed: false, combatState: "in_control", positions: { "pc-kira": "in_control" } },
    { id: "fight-2", label: "Drones",   type: "combat", rank: "dangerous", ticks: 8,  completed: false, combatState: "in_control", positions: {} },
  ]));
  silenceConsoleErrors();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { await resetWorld(); });

describe("issue #335 Y08 — a stamped one-shot button's move is held at the move lock", () => {
  it("the paced card's Roll pressed while another move is narrated is held, then rolls Kira's Face Danger", async () => {
    const release = await renMovesAndIsNarrated();
    const pacedId = await postPacedCard();

    control.dice = STRONG_ACTION;
    gm().click(pacedId, '[data-action="sf-paced-roll"]');
    await table.settle();
    expect(table.world.message(pacedId).flags[MODULE_ID].rolled, "the card is stamped as rolled").toBe(true);
    expect(gm().notifications.some(n => /already being resolved/.test(n.message)), "the lock met it").toBe(true);
    expect(moveCardsOf("pc-kira"), "not yet rolled").toHaveLength(0);

    await release();

    expect(moveCardsOf("pc-kira")).toHaveLength(1);
  }, 30_000);

  it("the which-fight pick pressed while another move is narrated is held, then rolls the Take Decisive Action", async () => {
    const release = await renMovesAndIsNarrated();
    const whichId = await postWhichFightCard();

    control.dice = [0.05, 0.15];                      // challenge 1, 2 against 6 boxes: a strong hit
    gm().click(whichId, '[data-action="sf-which-fight"][data-track-id="fight-1"]');
    await table.settle();
    expect(table.world.message(whichId).flags[MODULE_ID].whichFightPicked, "the card is stamped as picked").toBe("fight-1");
    expect(moveCardsOf("pc-kira"), "not yet rolled").toHaveLength(0);

    await release();

    const rolled = moveCardsOf("pc-kira");
    expect(rolled).toHaveLength(1);
    expect(rolled[0].content).toMatch(/Take Decisive Action/i);
    expect(rolled[0].content, "scored from the picked fight (Corsairs, 24 ticks)").toMatch(/progress \(24 ticks\)/);
  }, 30_000);

  it("Kira's own press on her paced card (no stamp: not the card's author) is held too", async () => {
    const release = await renMovesAndIsNarrated();
    const pacedId = await postPacedCard();

    control.dice = STRONG_ACTION;
    table.client("pl-1").click(pacedId, '[data-action="sf-paced-roll"]');
    await table.settle();
    expect(moveCardsOf("pc-kira")).toHaveLength(0);

    await release();

    expect(moveCardsOf("pc-kira")).toHaveLength(1);
  }, 30_000);

  it("before a session begins the paced Roll is held, and rolled once Begin a Session starts one (X14)", async () => {
    await resetWorld({ sessionActive: false });
    table.claude.respond(() => REPLY);
    const pacedId = await postPacedCard();

    control.dice = STRONG_ACTION;
    gm().click(pacedId, '[data-action="sf-paced-roll"]');
    await table.settle(); await table.drain();
    expect(moveCardsOf("pc-kira")).toHaveLength(0);
    expect(table.cards(f => f.sessionGateNotice).at(-1).content).toMatch(/will be rolled once/);

    await gm().setSetting("campaignState", { ...world(), sessionActive: true });
    await table.settle(); await table.drain();
    expect(moveCardsOf("pc-kira")).toHaveLength(1);
  }, 30_000);

  it("control: with no move in flight the paced Roll rolls Kira's Face Danger as Kira", async () => {
    table.claude.respond(() => REPLY);
    const pacedId = await postPacedCard();
    control.dice = STRONG_ACTION;
    gm().click(pacedId, '[data-action="sf-paced-roll"]');
    await table.settle(); await table.drain();
    expect(moveCardsOf("pc-kira")).toHaveLength(1);
    expect(table.world.message(pacedId).flags[MODULE_ID].rolled).toBe(true);
  }, 30_000);

  it("control: a ⚑ Mark Progress press during the narration is held and runs once the lock frees (W02)", async () => {
    const vow = {
      id: "vow-kira", type: "progress", name: "Find Chen", flags: { [MODULE_ID]: { vowId: "vid-kira" } },
      system: { subtype: "vow", rank: "dangerous", current: 8, completed: false },
      async update(changes) { for (const [k, v] of Object.entries(changes)) if (k === "system.current") vow.system.current = v; return vow; },
      async setFlag(scope, key, value) { (vow.flags[scope] ??= {})[key] = value; return vow; },
    };
    table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [vow] } });   // Kira with her vow
    const release = await renMovesAndIsNarrated();
    const cardId = (await gm().run(() => globalThis.ChatMessage.create({
      content: `<div class="sf-move-result"><div class="sf-milestone-suggest-row"><button type="button" class="sf-followup-btn" data-action="sf-reach-milestone">⚑ Mark Progress on Vow</button></div></div>`,
      flags: { [MODULE_ID]: { moveResolution: true, resolutionId: "res-old", actorId: "pc-kira", milestoneSuggestion: { eligible: true, vowCount: 1, vowItemId: "vow-kira" } } },
    }))).id;
    await table.settle();
    gm().click(cardId, '[data-action="sf-reach-milestone"]');
    await table.settle();
    expect(vow.system.current).toBe(8);                 // held, not yet marked

    await release();
    expect(vow.system.current).toBe(16);                // rolled after the lock freed: the milestone marked
  }, 30_000);
});
