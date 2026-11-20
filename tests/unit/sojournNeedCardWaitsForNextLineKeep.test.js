/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/sojournNeedCardWaitsForNextLineKeep.test.js
 *
 * Issue #364 SOJOURN-NEED-CARD-DURING-OTHER-KEEP (found while fixing
 * SOJOURN-OATH-NARRATED-BEFORE-MISS).
 *
 * The community's need card waits for the narration of the held Sojourn miss
 * its pick keeps (sufferCard.js handleSufferPick). A held miss can also be
 * being kept when the pick is made — its roller's next line keeps it first
 * (index.js, heldResult.js keepHeldResultsOf), its wait closed before its
 * narration is written — and then the pick kept nothing to wait for: the need
 * card was posted at once, and its vow could be sworn and told before the
 * miss, the oath before the trouble it answers.
 *
 * Now a pick answered on a card of its own also waits until no keep, burn or
 * improvement of its move card is being applied on the canonical GM
 * (burnMomentum.js resultUpgradeSettled).
 *
 * The harness of tests/unit/sojournNeedCardWaitsForMissNarration.test.js.
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
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: "snk-s1", currentSessionId: "snk-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "snk-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
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

describe("the need card waits for a keep of the miss already being told (issue #364 SOJOURN-NEED-CARD-DURING-OTHER-KEEP)", () => {
  it("the roller's next line is keeping the held miss when the pick is made: the need card follows its narration — and the oath after it", async () => {
    const sojourn = await sojournMisses(9);
    expect(flagsOf(sojourn).awaitingUpgrade, "setup: the miss is held").toMatchObject({ open: true });

    const held = claude.hold(missNarration);
    table.client("pl-1").chat("I wait for the elders' answer.", { speaker: { actor: pc.id } });
    await held.arrived;
    await table.settle();
    expect(flagsOf(sojourn).awaitingUpgrade, "setup: her next line is keeping it").toMatchObject({ open: false, resolvedBy: "later" });

    await table.client("pl-1").click(choice()._id, NEED);
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

    await swearTheVow(need);
    const [swear] = narrations("Swear an Iron Vow");
    expect(swear, "the oath is told").toBeTruthy();
    expect(at(swear), "the oath is told after the miss").toBeGreaterThan(at(missCalls()[0]));
    expect(flagsOf(need), "the vow resolves the Sojourn").toMatchObject({ resolved: true });
    expect(refuges(), "its refuge is told once").toHaveLength(1);
  }, 120_000);
});
