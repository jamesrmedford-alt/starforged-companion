/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/sojournSwearToldDuringSojournNarration.test.js
 *
 * Issue #364 SOJOURN-NARRATION-IN-FLIGHT-NO-RETRY (found while fixing
 * SOJOURN-VOW-SWORN-WHILE-ROUND-RESOLVING).
 *
 * A Sojourn miss answered with a vow is resolved as a strong hit once that
 * vow's Swear an Iron Vow has been told (src/moves/sojournNeed.js). The
 * resolve is refused while the Sojourn's own kept narration is still being
 * written (`narration-in-flight`) — that narration comes first. A free-flow
 * Sojourn miss held for Burn / Improve / Keep is kept when "Community needs
 * help" is picked, and that keep is not awaited: the need card is posted
 * while the miss is still being narrated, so the vow can be written and its
 * swear told before the miss's narration is posted. The refused resolve
 * then waited for the next round's close or the canonical GM's load.
 *
 * The Sojourn's keep now resolves the told vows' Sojourns once its narration
 * is written and its card's claim released (heldResult.js keepHeldResult).
 *
 * Since issue #364 SOJOURN-OATH-NARRATED-BEFORE-MISS the pick's own keep is
 * waited for — the need card is posted once the miss is told — so the swear
 * is told during the miss's narration here by another keep: the world
 * refuses the pick's keep its close of the wait (the miss stays held, and
 * nothing is narrated), and the roller's next line keeps it.
 *
 * End to end on a booted GM / player table (tests/helpers/multiClient.js)
 * through the real cards and relays: the miss's narration is held at the
 * Claude boundary (scriptClaude().hold) while the vow is written and sworn.
 * Scripted at their boundaries: the pacing decision, the interpretation, the
 * ability scan, entity detection and the dice. The vow's Item is made by a
 * stand-in `Item.create` that fires the createItem hook.
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

// Sojourn: challenge 7 and 8, action die 1 (+heart 2) — a miss; momentum 9 beats both dice, so Burn is offered: held.
const MISS = [0.65, 0.75, 0, 0.705];
// Swear an Iron Vow: challenge 1 and 2, action die 6 — a strong hit, nothing to upgrade.
const STRONG = [0, 0.1, 0.9];

const NARRATION_MODEL = "claude-sonnet-5-5";
const REPLY = 'The gates loom.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const NEED     = '[data-action="sf-suffer-pick"][data-option-index="0"]';
const SWEAR    = '[data-action="sf-sojourn-need-swear"]';
const SWEAR_IT = '[data-action="sf-player-vow-swear"]';
const BY_VOW   = "an iron vow was sworn to see the community's need done";

let table, pc, savedItem, claude;
const flagsOf     = (card) => table.world.message(card._id).flags[MODULE_ID];
const contentOf   = (card) => table.world.message(card._id).content;
const sojournCard = () => table.cards(f => f.moveResolution).find(m => m.content.includes('<div class="sf-move-name">Sojourn</div>')) ?? null;
const choice      = () => table.cards(f => f.sufferCard && f.moveId === "sojourn").at(-1) ?? null;
const needCard    = () => table.cards(f => f.sojournNeedCard).at(-1) ?? null;
const vowCards    = () => table.cards(f => f.playerVowCard);
const narrations  = (move) => table.claude.calls.filter(c => c.model === NARRATION_MODEL
  && /Narrate the consequence/.test(c.userText ?? "") && new RegExp(`MOVE: ${move}`, "i").test(c.userText ?? ""));
const refuges     = () => narrations("Sojourn").filter(c => /A miss, resolved as a strong hit/.test(c.userText ?? ""));
const narratorCardsOf = (resolutionId) => table.cards(f => f.narratorCard && f.resolutionId === resolutionId);
const at          = (call) => table.claude.calls.indexOf(call);
// The kept miss's own narration: the Sojourn's first, before any refuge.
const missNarration = (call) => call.model === NARRATION_MODEL && /Narrate the consequence/.test(call.userText ?? "")
  && /MOVE: Sojourn/i.test(call.userText ?? "") && !/A miss, resolved as a strong hit/.test(call.userText ?? "");

/**
 * Kira's Sojourn missed, held for Burn / Keep; "Community needs help" is
 * picked, and the world refuses its keep the close of the wait: the need card
 * is posted with the miss still held and untold. Kira's next line keeps it —
 * and its narration is held at Claude. Meanwhile the vow is written from the
 * need card and sworn (⚔ Swear it (roll)), and its swear is told while the
 * miss's narration is still being written.
 */
async function swearToldWhileSojournIsNarrated() {
  pc.system.momentum.value = 9;
  control.dice.sojourn = MISS;
  await table.client("pl-1").chat("I ask the settlement for shelter.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  const sojourn = sojournCard();
  expect(flagsOf(sojourn).awaitingUpgrade, "setup: the miss is held").toMatchObject({ open: true });

  const refuse = table.interceptWrites(w => (w.kind === "message.update" && w.id === sojourn._id
    && w.changes?.[`flags.${MODULE_ID}.awaitingUpgrade.resolvedBy`] === "choice" ? new Error("refused") : undefined));
  try {
    await table.client("pl-1").click(choice()._id, NEED);
    await table.settle(); await table.drain();
  } finally {
    refuse();
  }
  const need = needCard();
  expect(need, "setup: the need card is posted").toBeTruthy();
  expect(flagsOf(sojourn).awaitingUpgrade, "setup: the miss is still held").toMatchObject({ open: true });

  const held = claude.hold(missNarration);
  table.client("pl-1").chat("I wait for the elders' answer.", { speaker: { actor: pc.id } });
  await held.arrived;
  await table.settle();
  expect(narratorCardsOf(flagsOf(sojourn).resolutionId), "setup: the miss's narration is not posted yet").toHaveLength(0);

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
  await table.settle();
  expect(narrations("Swear an Iron Vow"), "setup: the swear is told").toHaveLength(1);
  expect(pc.items.contents[0].flags[MODULE_ID], "setup: the vow says its swear is told").toMatchObject({ sojournNeedCard: need._id, sojournSwearTold: true });
  expect(flagsOf(need), "setup: refused — the Sojourn's own narration is being written").toMatchObject({ resolved: false });
  expect(refuges()).toHaveLength(0);
  return { need, sojourn, held };
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.dice = {};
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: "snf-s1", currentSessionId: "snf-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "snf-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
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

describe("a swear told while the Sojourn's own kept narration is written (issue #364 SOJOURN-NARRATION-IN-FLIGHT-NO-RETRY)", () => {
  it("once the miss's narration is posted the Sojourn is resolved by the vow — the refuge after the miss, once", async () => {
    const { need, sojourn, held } = await swearToldWhileSojournIsNarrated();

    held.release();
    await table.settle(); await table.drain(); await table.drain();

    const [miss] = narrations("Sojourn").filter(c => !/A miss, resolved as a strong hit/.test(c.userText ?? ""));
    expect(narratorCardsOf(flagsOf(sojourn).resolutionId), "the miss's narration is posted").toHaveLength(1);
    expect(flagsOf(need), "the Sojourn is resolved with no press").toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain(BY_VOW);
    expect(contentOf(need)).not.toContain("data-action");
    expect(refuges(), "its refuge is narrated once").toHaveLength(1);
    expect(refuges()[0].userText).toContain(BY_VOW);
    expect(at(refuges()[0]), "the refuge follows the miss's narration").toBeGreaterThan(at(miss));
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);

    // The canonical GM's next load resolves nothing a second time.
    await table.reload("gm-1");
    await table.settle(); await table.drain();
    expect(refuges()).toHaveLength(1);
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 120_000);
});
