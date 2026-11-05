/**
 * PROBE — PIPE-04 PACED-ROLL-DROPPED-AT-LOCK (tenth audit, area pipeline)
 *
 * What the user does: two players. Ren's Face Danger is being narrated (the
 * move lock is held). Kira's earlier line was classified NARRATIVE_WITH_MOVE_
 * AVAILABLE, so her paced narration card offers "Roll Face Danger"; the GM
 * (or Kira) presses it now. Second site: a "Which fight?" card (Take Decisive
 * Action with two fights open) whose fight the GM picks while Ren's move is
 * narrated.
 *
 * What happens: both buttons stamp their card as taken — the paced card
 * `rolled: true` ("Rolled", src/index.js:8362), the which-fight card
 * `whichFightPicked` (:7959) — and post the forced move WITHOUT
 * `deferWhileBusy`. The pipeline meets the lock, shows "A move is already
 * being resolved" on the GM's screen and returns (:897–906): the move is
 * dropped, the card stays stamped, and when Ren's narration finishes nothing
 * rolls. Kira's Face Danger / the picked Take Decisive Action is lost; the
 * card reads "Rolled" / disabled, so nobody presses again.
 *
 * What should happen: issue #325 W02 / issue #329 X14's rule — "a claimed
 * card's forced move is held, not dropped, before a session begins as while
 * the lock is held": a press that claims its card posts its move flagged
 * `deferWhileBusy`, held and rolled when the lock frees (every relayed
 * card-button move does: ⚑, 🏁, the which-vow / legacy / connection picks,
 * Battle, the way-out and the resist card).
 *
 * Control: with no move in flight the paced Roll rolls Kira's Face Danger
 * as Kira; a ⚑ press during the narration is held and rolled after it.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/pipeline/pacedRollDroppedAtLock.probe.js
 */

/* global silenceConsoleErrors, structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text, { expectedMoveSlug } = {}) => ({
    moveId: expectedMoveSlug ?? "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0,
    rationale: "test", mischiefApplied: false, playerNarration: text, inputMethod: "chat",
  })),
}));
vi.mock("../../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { deferred } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

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

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "pr-s1", sessionNumber: 1,
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
});

describe("PIPE-04 — a stamped one-shot button's move is dropped at the move lock", () => {
  it("the paced card's Roll pressed while another move is narrated: the card reads Rolled, and nothing rolls", async () => {
    const release = await renMovesAndIsNarrated();
    const pacedId = await postPacedCard();

    control.dice = STRONG_ACTION;
    gm().click(pacedId, '[data-action="sf-paced-roll"]');
    await table.settle();
    expect(table.world.message(pacedId).flags[MODULE_ID].rolled, "the card is stamped as rolled").toBe(true);
    expect(gm().notifications.some(n => /already being resolved/.test(n.message)), "the lock refused it").toBe(true);

    await release();

    // Expected: Kira's Face Danger rolled once the lock freed (held, as a ⚑ press is). Actual: never — dropped.
    expect(moveCardsOf("pc-kira")).toHaveLength(1);
  }, 30_000);

  it("the which-fight pick pressed while another move is narrated: the card is stamped, and the Take Decisive Action never rolls", async () => {
    const release = await renMovesAndIsNarrated();
    const whichId = await postWhichFightCard();

    control.dice = [0.05, 0.15];                      // challenge 1, 2 against 6 boxes: a strong hit, were it rolled
    gm().click(whichId, '[data-action="sf-which-fight"][data-track-id="fight-1"]');
    await table.settle();
    expect(table.world.message(whichId).flags[MODULE_ID].whichFightPicked, "the card is stamped as picked").toBe("fight-1");

    await release();

    expect(moveCardsOf("pc-kira")).toHaveLength(1);   // expected the TDA; actual 0
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
