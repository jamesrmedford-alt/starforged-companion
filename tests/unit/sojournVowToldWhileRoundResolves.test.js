/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/sojournVowToldWhileRoundResolves.test.js
 *
 * Issue #364 SOJOURN-VOW-SWORN-WHILE-ROUND-RESOLVING.
 *
 * A Sojourn miss answered with a vow is resolved as a strong hit once that
 * vow's Swear an Iron Vow has been told (src/moves/sojournNeed.js). The
 * resolve was one call, made when the swear was told — and refused while a
 * Batch Mode round is being resolved (the round tells its entries once; the
 * refuge follows it). A refused resolve was only logged: nothing tried again,
 * and nobody at the table was told. A round keeps an acting player's held
 * free-flow result before it rolls (batch/driver.js rollRound), so a held
 * swear is told exactly then — while the round is being resolved.
 *
 * That a vow's swear has been told is now written on the vow
 * (`sojournSwearTold`, beside its `sojournNeedCard`), and the Sojourns of the
 * told vows are resolved where a resolve can be made again: once the round is
 * narrated and closed, and at the canonical GM's load — once, whichever of
 * them, or ✔ It is done, comes first.
 *
 * End to end on a booted GM / two-player table (tests/helpers/multiClient.js)
 * through the real cards, relays and rounds. Scripted at their boundaries:
 * the pacing decision and the interpretation (by the line's words), the
 * ability scan, entity detection and the dice. The vow's Item is made by a
 * stand-in `Item.create` that fires the createItem hook, as the system does.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: {}, pace: null }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async ({ playerText }) => control.pace(playerText)),
  decidePacing: vi.fn(async ({ playerText }) => control.pace(playerText)),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => {
    const base = { adds: 0, rationale: "test", mischiefApplied: false, playerNarration: text, inputMethod: "chat" };
    return /airlock/.test(text)
      ? { ...base, moveId: "face_danger", moveName: "Face Danger", statUsed: "edge" }
      : { ...base, moveId: "sojourn", moveName: "Sojourn", statUsed: "heart" };
  }),
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

// Sojourn: challenge 7 and 8, action die 1 (+heart 2) — a miss; then the price's d100 = 71.
const MISS = [0.65, 0.75, 0, 0.705];
// Swear an Iron Vow: challenge 3 and 8, action die 3 — no strong hit; momentum 9 beats both, so Burn is offered: held.
const HELD = [0.25, 0.75, 0.4];
// Swear an Iron Vow: challenge 1 and 2, action die 6 — a strong hit, nothing to upgrade.
const STRONG = [0, 0.1, 0.9];
// Face Danger: challenge 4 and 8, action die 3 (+edge 2) — a weak hit Ren's momentum 9 can burn: his round waits for him.
const REN_WEAK = [0.35, 0.75, 0.4];

const NARRATION_MODEL = "claude-sonnet-5-5";
const REPLY = 'The gates loom.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const SOJOURN_LINE = "I ask the settlement for shelter.";
const REN_LINE     = "I hold the airlock against the drones.";
const WATCH_LINE   = "I keep watch at the door.";
const MOVE      = { runMove: true, decision: "MOVE", suggestedMove: null };
const NARRATIVE = { runMove: false, decision: "NARRATIVE", suggestedMove: null, suggestedTargetId: null };

const NEED     = '[data-action="sf-suffer-pick"][data-option-index="0"]';
const SWEAR    = '[data-action="sf-sojourn-need-swear"]';
const DONE     = '[data-action="sf-sojourn-need-done"]';
const SWEAR_IT = '[data-action="sf-player-vow-swear"]';
const BY_VOW   = "an iron vow was sworn to see the community's need done";
const BY_DONE  = "the community's need was met";

let table, pc, savedItem;
const gm         = () => table.client("gm-1");
const round      = () => table.world.getSetting("batchMode.round");
const flagsOf    = (card) => table.world.message(card._id).flags[MODULE_ID];
const contentOf  = (card) => table.world.message(card._id).content;
const named      = (move) => table.cards(f => f.moveResolution).find(m => m.content.includes(`<div class="sf-move-name">${move}</div>`)) ?? null;
const sojournCard = () => named("Sojourn");
const swearCard   = () => named("Swear an Iron Vow");
const choice     = () => table.cards(f => f.sufferCard && f.moveId === "sojourn").at(-1) ?? null;
const needCard   = () => table.cards(f => f.sojournNeedCard).at(-1) ?? null;
const vowCards   = () => table.cards(f => f.playerVowCard);
const moveCalls  = (move) => table.claude.calls.filter(c => c.model === NARRATION_MODEL
  && /Narrate the consequence/.test(c.userText ?? "") && new RegExp(`MOVE: ${move}`, "i").test(c.userText ?? ""));
const refuges    = () => moveCalls("Sojourn").filter(c => /A miss, resolved as a strong hit/.test(c.userText ?? ""));
const roundCalls = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /THIS ROUND/.test(c.userText ?? ""));
const at         = (call) => table.claude.calls.indexOf(call);

async function settled() { await table.settle(); await table.drain(); }
async function click(card, selector, as = "pl-1") {
  await table.client(as).click(card._id, selector);
  await settled();
}
async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import("../../src/multiplayer/gmRelay.js");
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}
/** The module as `userId`'s page holds it. */
async function on(userId, specifier) {
  return table.client(userId).import(specifier);
}

/** Free-flow: Kira's Sojourn missed and was told, "Community needs help" picked, and the vow written from the need card. */
async function vowWrittenForNeed() {
  await table.client("pl-1").chat(SOJOURN_LINE, { speaker: { actor: pc.id } });
  await settled();
  await click(choice(), NEED);
  const need = needCard();
  table.client("pl-1").render(need._id).querySelector(".sf-sojourn-need-vow-name").value = "Clear the reactor of raiders";
  table.client("pl-1").click(need._id, SWEAR);
  await settled(); await settled();
  expect(pc.items.contents, "setup: the vow is on the sheet").toHaveLength(1);
  expect(flagsOf(need), "setup: the need is open").toMatchObject({ resolved: false });
  return need;
}
/** ⚔ Swear it (roll) on the vow's own card, pressed by `as`: the forced swear is held a moment before it runs. */
async function pressSwearIt(as, dice) {
  control.dice.swear_an_iron_vow = dice;
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    table.client(as).click(vowCards()[0]._id, SWEAR_IT);
    for (let i = 0; i < 4; i += 1) { await table.settle(); await vi.advanceTimersByTimeAsync(2_100); }
    await table.settle();
  } finally {
    vi.useRealTimers();
    await table.drain();
  }
}
async function batchModeOn() {
  await gm().setSetting("batchMode.enabled", true);
  await settled();
}
/** Kira passes and Ren acts: the round rolls his weak hit, and waits for his Burn / Keep — a round being resolved. */
async function roundWaitingForRen() {
  await relay("pl-1", "batch.pass", { roundId: round().id });
  await relay("pl-2", "batch.submit", { roundId: round().id, text: REN_LINE, submissionId: "r1" });
  await relay("pl-2", "batch.confirm", { roundId: round().id, submissionId: "r1", choices: {} });
  await settled();
  expect(round(), "setup: the round waits at its upgrade step").toMatchObject({ phase: "upgrading" });
  expect(roundCalls(), "setup: the round is not told yet").toHaveLength(0);
}
/** The world refuses the write that claims `card` as resolved (sojournNeed.js resolveSojournNeed); every other write lands. */
function refuseClaim(card) {
  const refused = [];
  const off = table.interceptWrites((w) => {
    if (w.kind !== "message.update" || w.id !== card._id || !(`flags.${MODULE_ID}.resolved` in (w.changes ?? {}))) return undefined;
    refused.push(w);
    return new Error("The server refused the card's write (test fault)");
  });
  return { refused, off };
}
/** The vow's swear has been told while the round waits: the resolve is refused, as the round is being resolved. */
async function swearToldWhileRoundWaits(vow) {
  const sojournNeed = await on("gm-1", "../../src/moves/sojournNeed.js");
  const resolved = await gm().run(() => sojournNeed.resolveSojournNeedsForVow(vow.id));
  await settled();
  return resolved;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.pace = (text) => (/^I keep watch/.test(text) ? NARRATIVE : MOVE);
  control.dice = { sojourn: MISS, swear_an_iron_vow: STRONG, face_danger: REN_WEAK };
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: "svt-s1", currentSessionId: "svt-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "svt-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Kira's momentum 2 beats neither of her Sojourn's dice: its miss is narrated at once.
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [] },
    system: { heart: 2, momentum: { value: 2 }, supply: { value: 3 }, health: { value: 5 }, spirit: { value: 5 } } });
  table.addActor({ id: "pc-ren", name: "Ren", ownership: { "pl-2": 3 }, items: { contents: [] },
    system: { edge: 2, momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => REPLY });
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
  gm().answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

describe("a vow sworn for a Sojourn's need, its swear told while a round is being resolved (issue #364 SOJOURN-VOW-SWORN-WHILE-ROUND-RESOLVING)", () => {
  it("a round keeps its acting player's held swear before it rolls: the Sojourn is resolved by the vow once the round is narrated", async () => {
    const need = await vowWrittenForNeed();
    // Kira's player is away: Kira is in no round, so her vow card's ⚔ Swear it (roll) runs as free-flow, and is held.
    await table.leave("pl-1");
    await batchModeOn();
    pc.system.momentum.value = 9;
    await pressSwearIt("gm-1", HELD);
    const swear = swearCard();
    expect(swear && flagsOf(swear).awaitingUpgrade, "setup: the swear is held").toMatchObject({ open: true, swornVowId: pc.items.contents[0].id });

    // She comes back and acts in the next round, with no roll: the round keeps her held swear before it rolls.
    await relay("pl-2", "batch.pass", { roundId: round().id });
    await table.drain();
    await table.join("pl-1");
    await settled();
    expect(round()?.entries?.["pl-1"], "setup: Kira is in the next round").toBeTruthy();
    await relay("pl-2", "batch.pass", { roundId: round().id });
    await relay("pl-1", "batch.submit", { roundId: round().id, text: WATCH_LINE, submissionId: "k-watch" });
    await relay("pl-1", "batch.confirm", { roundId: round().id, submissionId: "k-watch", choices: {} });
    await settled();

    expect(flagsOf(swear).awaitingUpgrade, "the round kept the held swear").toMatchObject({ open: false, resolvedBy: "later" });
    const [swearTold] = moveCalls("Swear an Iron Vow");
    expect(swearTold, "the kept swear was narrated").toBeTruthy();
    expect(roundCalls(), "the round was narrated once").toHaveLength(1);
    expect(at(roundCalls()[0]), "the oath is told before the round").toBeGreaterThan(at(swearTold));
    // Its Sojourn is resolved by the vow — after the round, with no press — from what the vow says of its swear.
    expect(flagsOf(need), "the Sojourn is resolved once the round is narrated").toMatchObject({ resolved: true });
    expect(pc.items.contents[0].flags[MODULE_ID]).toMatchObject({ sojournNeedCard: need._id, sojournSwearTold: true });
    expect(contentOf(need)).toContain(BY_VOW);
    expect(contentOf(need)).not.toContain("data-action");
    expect(refuges()).toHaveLength(1);
    expect(refuges()[0].userText).toContain(BY_VOW);
    expect(at(refuges()[0]), "the refuge follows the round's narration").toBeGreaterThan(at(roundCalls()[0]));
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
    expect(contentOf(sojournCard())).toContain(`✦ Resolved as a strong hit — ${BY_VOW}.`);
  }, 120_000);

  it("told while a round waits for its upgrades: nothing is resolved beside the round, and the round's close resolves it — once", async () => {
    const need = await vowWrittenForNeed();
    const [vow] = pc.items.contents;
    await batchModeOn();
    await roundWaitingForRen();

    expect(await swearToldWhileRoundWaits(vow), "refused while the round is being resolved").toBe(0);

    expect(vow.flags[MODULE_ID], "the vow says its swear is told").toMatchObject({ sojournNeedCard: need._id, sojournSwearTold: true });
    expect(flagsOf(need)).toMatchObject({ resolved: false });
    expect(refuges(), "no refuge beside the round").toHaveLength(0);
    expect(contentOf(sojournCard())).not.toContain("sf-sojourn-resolved");

    await relay("pl-2", "batch.keep", { roundId: round().id });
    await settled();

    expect(roundCalls(), "the round was narrated once").toHaveLength(1);
    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain(BY_VOW);
    expect(refuges()).toHaveLength(1);
    expect(at(refuges()[0]), "the refuge follows the round's narration").toBeGreaterThan(at(roundCalls()[0]));
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);

    // The next round closes, and ✔ It is done is relayed again: nothing resolves the Sojourn a second time.
    expect(round()).toMatchObject({ phase: "collecting" });
    await relay("pl-1", "batch.pass", { roundId: round().id });
    await relay("pl-2", "batch.pass", { roundId: round().id });
    await relay("pl-1", "sojourn.need", { messageId: need._id, way: "done" });
    await settled();
    expect(refuges()).toHaveLength(1);
    expect(contentOf(need)).toContain(BY_VOW);
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 120_000);

  it("the GM's page reloaded while that round waits: the vow still says so, and the round it resumes resolves the Sojourn", async () => {
    const need = await vowWrittenForNeed();
    const [vow] = pc.items.contents;
    await batchModeOn();
    await roundWaitingForRen();
    expect(await swearToldWhileRoundWaits(vow)).toBe(0);

    // The fresh page remembers nothing: its load finds the told vow, and the round still being resolved.
    await table.reload("gm-1");
    await settled();
    expect(round(), "setup: the round still waits for Ren").toMatchObject({ phase: "upgrading" });
    expect(flagsOf(need)).toMatchObject({ resolved: false });
    expect(refuges()).toHaveLength(0);

    await relay("pl-2", "batch.keep", { roundId: round().id });
    await settled();

    expect(roundCalls()).toHaveLength(1);
    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain(BY_VOW);
    expect(refuges()).toHaveLength(1);
    expect(at(refuges()[0])).toBeGreaterThan(at(roundCalls()[0]));
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 120_000);

  it("a resolve not made when the swear was told — its card's claim refused — is made at the canonical GM's next load, by the vow — once", async () => {
    const need = await vowWrittenForNeed();
    const [vow] = pc.items.contents;
    const fault = refuseClaim(need);

    // A free-flow swear, told at its roll: the world refuses the write that claims the need card.
    await pressSwearIt("pl-1", STRONG);

    expect(fault.refused.length, "setup: the claim was refused").toBeGreaterThan(0);
    expect(moveCalls("Swear an Iron Vow"), "setup: the swear is told").toHaveLength(1);
    expect(flagsOf(need)).toMatchObject({ resolved: false });
    expect(refuges()).toHaveLength(0);
    fault.off();

    // A player's page loading resolves nothing: the canonical GM's does, from what the vow says.
    await table.reload("pl-2");
    await settled();
    expect(flagsOf(need)).toMatchObject({ resolved: false });
    await table.reload("gm-1");
    await settled(); await settled();

    expect(flagsOf(need), "the load resolves the Sojourn").toMatchObject({ resolved: true });
    expect(vow.flags[MODULE_ID]).toMatchObject({ sojournNeedCard: need._id, sojournSwearTold: true });
    expect(contentOf(need)).toContain(BY_VOW);
    expect(refuges()).toHaveLength(1);
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);

    await table.reload("gm-1");
    await settled(); await settled();
    expect(refuges(), "a later load resolves nothing twice").toHaveLength(1);
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 120_000);

});

describe("controls: what a told swear resolved before, it resolves as before", () => {
  it("✔ It is done pressed before the deferred resolve runs: resolved once, as done — the load after it resolves nothing", async () => {
    const need = await vowWrittenForNeed();
    // The swear is told, and the resolve it makes is refused (the card's claim): the Sojourn waits for the next load.
    const fault = refuseClaim(need);
    await pressSwearIt("pl-1", STRONG);
    expect(fault.refused.length, "setup: the vow's resolve was refused").toBeGreaterThan(0);
    expect(flagsOf(need)).toMatchObject({ resolved: false });
    fault.off();

    await click(need, DONE);
    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain(BY_DONE);
    expect(refuges()).toHaveLength(1);

    await table.reload("gm-1");
    await settled(); await settled();
    expect(refuges()).toHaveLength(1);
    expect(contentOf(need)).toContain(BY_DONE);
    expect(contentOf(need)).not.toContain(BY_VOW);
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 120_000);

  it("a free-flow swear resolves its Sojourn once, after its own narration; a load after it resolves nothing twice", async () => {
    const need = await vowWrittenForNeed();

    await pressSwearIt("pl-1", STRONG);

    const [swearTold] = moveCalls("Swear an Iron Vow");
    expect(swearTold, "the swear is narrated at its roll").toBeTruthy();
    expect(moveCalls("Swear an Iron Vow")).toHaveLength(1);
    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain(BY_VOW);
    expect(refuges()).toHaveLength(1);
    expect(at(refuges()[0]), "the refuge follows the oath").toBeGreaterThan(at(swearTold));
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);

    await table.reload("gm-1");
    await settled(); await settled();
    expect(refuges()).toHaveLength(1);
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 120_000);

  it("a vow written for no need card: its swear told marks nothing and resolves nothing; nor does a player's page", async () => {
    const need = await vowWrittenForNeed();
    const [vow] = pc.items.contents;
    const plain = { id: "vow-plain", type: "progress", name: "Find Chen", flags: {}, system: { subtype: "vow", rank: "dangerous" },
      async setFlag(scope, key, value) { (plain.flags[scope] ??= {})[key] = value; return plain; } };
    pc.items.contents.push(plain);
    const cards = table.cards().length;

    const onGm = await on("gm-1", "../../src/moves/sojournNeed.js");
    expect(await gm().run(() => onGm.resolveSojournNeedsForVow("vow-plain"))).toBe(0);
    expect(await gm().run(() => onGm.resolveSojournNeedsForVow("no-such-vow"))).toBe(0);
    const onPlayer = await on("pl-1", "../../src/moves/sojournNeed.js");
    expect(await table.client("pl-1").run(() => onPlayer.resolveSojournNeedsForVow(vow.id))).toBe(0);
    await settled();

    expect(plain.flags).toEqual({});
    expect(vow.flags[MODULE_ID]).not.toHaveProperty("sojournSwearTold");
    expect(flagsOf(need)).toMatchObject({ resolved: false });
    expect(refuges()).toHaveLength(0);
    expect(table.cards()).toHaveLength(cards);
  }, 120_000);
});
