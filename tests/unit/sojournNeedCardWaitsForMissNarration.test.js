/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/sojournNeedCardWaitsForMissNarration.test.js
 *
 * Issue #364 SOJOURN-OATH-NARRATED-BEFORE-MISS (found while fixing
 * SOJOURN-NARRATION-IN-FLIGHT-NO-RETRY).
 *
 * A free-flow Sojourn miss held for Burn / Improve / Keep is kept when
 * "Community needs help" is picked on its choice card. That keep was not
 * awaited (resultUpgrade.js closeUpgradesForChoice) while the pick posted the
 * community's need card at once (sufferDialog.js) — so the vow could be
 * written from it, sworn and told before the miss itself had been told: the
 * oath came before the trouble it answers.
 *
 * The need card now waits for the kept miss's narration (sufferCard.js
 * handleSufferPick awaits the keep the pick started); a miss that was not
 * held posts it at once, as before.
 *
 * End to end on a booted GM / player table (tests/helpers/multiClient.js)
 * through the real cards and relays — the pick is the player's, relayed to
 * the canonical GM: the miss's narration is held at the Claude boundary
 * (scriptClaude().hold). Scripted at their boundaries: the pacing decision,
 * the interpretation, the ability scan, entity detection and the dice. The
 * vow's Item is made by a stand-in `Item.create` that fires the createItem
 * hook.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: {} }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({
    moveId: "sojourn", moveName: "Sojourn", statUsed: "heart", adds: 0,
    playerNarration: text, inputMethod: "chat", rationale: "test", mischiefApplied: false,
  })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/entities/entityExtractor.js", async (original) => ({
  ...(await original()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
// The dice, by the move rolled (challenge, challenge, action; then a price's d100).
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const n of control.dice[args[0]?.moveId] ?? []) rng.mockReturnValueOnce(n);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

// Sojourn: challenge 7 and 8, action die 1 (+heart 2) — a miss. Momentum 9
// beats both dice, so Burn is offered and the miss is held; momentum 2 does
// not, and the miss is narrated as it is rolled.
const MISS = [0.65, 0.75, 0, 0.705];
// Swear an Iron Vow: challenge 1 and 2, action die 6 — a strong hit, nothing to upgrade.
const STRONG = [0, 0.1, 0.9];

const NARRATION_MODEL = "claude-sonnet-5-5";
const REPLY = 'The gates loom.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const NEED     = '[data-action="sf-suffer-pick"][data-option-index="0"]';
const SWEAR    = '[data-action="sf-sojourn-need-swear"]';
const SWEAR_IT = '[data-action="sf-player-vow-swear"]';

let table, pc, savedItem, claude;
const flagsOf     = (card) => table.world.message(card._id).flags[MODULE_ID];
const sojournCard = () => table.cards(f => f.moveResolution).find(m => m.content.includes('<div class="sf-move-name">Sojourn</div>')) ?? null;
const choice      = () => table.cards(f => f.sufferCard && f.moveId === "sojourn").at(-1) ?? null;
const needCards   = () => table.cards(f => f.sojournNeedCard);
const vowCards    = () => table.cards(f => f.playerVowCard);
const narrations  = (move) => table.claude.calls.filter(c => c.model === NARRATION_MODEL
  && /Narrate the consequence/.test(c.userText ?? "") && new RegExp(`MOVE: ${move}`, "i").test(c.userText ?? ""));
const refuges     = () => narrations("Sojourn").filter(c => /A miss, resolved as a strong hit/.test(c.userText ?? ""));
const missCalls   = () => narrations("Sojourn").filter(c => !/A miss, resolved as a strong hit/.test(c.userText ?? ""));
const narratorCardsOf = (resolutionId) => table.cards(f => f.narratorCard && f.resolutionId === resolutionId);
const at          = (call) => table.claude.calls.indexOf(call);
const posted      = (card) => table.world.messages().findIndex(m => m._id === card._id);
// The kept miss's own narration: the Sojourn's first, before any refuge.
const missNarration = (call) => call.model === NARRATION_MODEL && /Narrate the consequence/.test(call.userText ?? "")
  && /MOVE: Sojourn/i.test(call.userText ?? "") && !/A miss, resolved as a strong hit/.test(call.userText ?? "");

/** Kira's Sojourn misses — held for Burn / Keep when her momentum beats both dice. */
async function sojournMisses(momentum) {
  pc.system.momentum.value = momentum;
  control.dice.sojourn = MISS;
  await table.client("pl-1").chat("I ask the settlement for shelter.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return sojournCard();
}

/** The vow written from the need card and sworn (⚔ Swear it (roll)), its swear told. */
async function swearTheVow(need) {
  table.client("pl-1").render(need._id).querySelector(".sf-sojourn-need-vow-name").value = "Clear the reactor of raiders";
  table.client("pl-1").click(need._id, SWEAR);
  await table.settle(); await table.settle();
  expect(pc.items.contents, "setup: the vow is on the sheet").toHaveLength(1);
  control.dice.swear_an_iron_vow = STRONG;
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    table.client("pl-1").click(vowCards()[0]._id, SWEAR_IT);
    for (let i = 0; i < 4; i += 1) { await table.settle(); await vi.advanceTimersByTimeAsync(2_100); }
    await table.settle();
  } finally {
    vi.useRealTimers();
  }
  await table.settle(); await table.drain(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.dice = {};
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: "snw-s1", currentSessionId: "snw-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "snw-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [] },
    system: { heart: 2, momentum: { value: 2 }, supply: { value: 3 }, health: { value: 5 }, spirit: { value: 5 } } });
  claude = scriptClaude(table, { fallback: () => REPLY });
  savedItem = globalThis.Item;
  let made = 0;
  globalThis.Item = { async create(data, { parent } = {}) {
    made += 1;
    const item = {
      id: `vow-${made}`, type: data.type, name: data.name, parent, flags: JSON.parse(JSON.stringify(data.flags ?? {})),
      system: { ...data.system, completed: false },
      async update(changes) { if (typeof changes?.name === "string") item.name = changes.name; return item; },
      async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
    };
    parent.items.contents.push(item);
    for (const c of table.connectedClients) c.run(() => Hooks.callAll("createItem", item, {}, "gm-1"));
    return item;
  } };
  silenceConsoleErrors();
});
afterEach(async () => {
  globalThis.Item = savedItem;
  table.client("gm-1").answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

describe("the community's need card waits for the kept miss's narration (issue #364 SOJOURN-OATH-NARRATED-BEFORE-MISS)", () => {
  it("a held miss kept by the pick is told before its need card is posted — and before the oath", async () => {
    const sojourn = await sojournMisses(9);
    expect(flagsOf(sojourn).awaitingUpgrade, "setup: the miss is held").toMatchObject({ open: true });

    const held = claude.hold(missNarration);
    await table.client("pl-1").click(choice()._id, NEED);
    await held.arrived;
    await table.settle(); await table.settle();
    expect(flagsOf(choice()), "the choice card is claimed by the pick").toMatchObject({ resolved: true, chosenIndex: 0 });
    expect(narratorCardsOf(flagsOf(sojourn).resolutionId), "the miss is still being told").toHaveLength(0);
    expect(needCards(), "no need card while the miss is still being told").toHaveLength(0);

    held.release();
    await table.settle(); await table.drain(); await table.drain();

    const [missCard] = narratorCardsOf(flagsOf(sojourn).resolutionId);
    expect(missCard, "the miss's narration is posted").toBeTruthy();
    expect(needCards(), "the need card is posted, once").toHaveLength(1);
    const need = needCards()[0];
    expect(posted(need), "the need card follows the miss's narration").toBeGreaterThan(posted(missCard));
    expect(flagsOf(need)).toMatchObject({ resolutionId: flagsOf(sojourn).resolutionId, actorId: pc.id, resolved: false });

    await swearTheVow(need);
    const [swear] = narrations("Swear an Iron Vow");
    expect(swear, "the oath is told").toBeTruthy();
    expect(missCalls(), "the miss is told once").toHaveLength(1);
    expect(at(swear), "the oath is told after the miss").toBeGreaterThan(at(missCalls()[0]));
    expect(flagsOf(need), "the vow resolves the Sojourn").toMatchObject({ resolved: true });
    expect(refuges(), "its refuge is told once").toHaveLength(1);
    expect(at(refuges()[0]), "the refuge follows the oath").toBeGreaterThan(at(swear));
  }, 120_000);

  it("a miss that was not held posts its need card at once", async () => {
    const sojourn = await sojournMisses(2);
    expect(flagsOf(sojourn).awaitingUpgrade?.open ?? false, "setup: the miss is not held").toBe(false);
    expect(narratorCardsOf(flagsOf(sojourn).resolutionId), "setup: the miss was told as it was rolled").toHaveLength(1);

    const held = claude.hold(() => true);
    await table.client("pl-1").click(choice()._id, NEED);
    await table.settle(); await table.settle();
    expect(needCards(), "the need card is posted at once").toHaveLength(1);
    expect(table.claude.calls.filter(missNarration), "nothing is narrated again").toHaveLength(1);
    held.release();
  }, 120_000);
});
