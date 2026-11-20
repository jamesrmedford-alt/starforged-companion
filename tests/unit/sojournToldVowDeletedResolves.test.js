/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/sojournToldVowDeletedResolves.test.js
 *
 * Issue #364 SOJOURN-TOLD-VOW-DELETED (found while fixing
 * SOJOURN-VOW-SWORN-WHILE-ROUND-RESOLVING; decided by the maintainer: an
 * oath sworn and told still resolves the Sojourn).
 *
 * A Sojourn miss answered with a vow is resolved as a strong hit once that
 * vow's Swear an Iron Vow has been told (src/moves/sojournNeed.js); a resolve
 * that cannot be made then is made later from what the vow says
 * (`sojournSwearTold`). A vow deleted before that deferred resolve ran took
 * its mark with it: the need card was opened again, offering ⚔ Swear an Iron
 * Vow, and nothing resolved the Sojourn of the oath already sworn.
 *
 * Now the canonical GM's deleteItem hook resolves it — as the swear's own
 * resolve would have — and one that must still wait (a Batch Mode round is
 * being resolved) is kept on the card, which says the oath stands instead of
 * offering ⚔ again, and is resolved once the round is told — a reload
 * between them included. A vow deleted before its swear was told still opens
 * the card again, as before.
 *
 * End to end on a booted GM / two-player table (tests/helpers/multiClient.js)
 * through the real cards, relays and rounds. Scripted at their boundaries:
 * the pacing decision and the interpretation (by the line's words), the
 * ability scan, entity detection and the dice. The vow's Item is made by a
 * stand-in `Item.create` that fires the createItem hook, and deleted as the
 * system deletes one: off its parent's sheet, then the deleteItem hook on
 * every client.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: {} }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
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
import { buildSojournNeedHtml } from "../../src/moves/sojournNeed.js";

// Sojourn: challenge 7 and 8, action die 1 (+heart 2) — a miss; then the price's d100 = 71.
const MISS = [0.65, 0.75, 0, 0.705];
// Swear an Iron Vow: challenge 1 and 2, action die 6 — a strong hit, nothing to upgrade.
const STRONG = [0, 0.1, 0.9];
// Face Danger: challenge 4 and 8, action die 3 (+edge 2) — a weak hit Ren's momentum 9 can burn: his round waits for him.
const REN_WEAK = [0.35, 0.75, 0.4];

const NARRATION_MODEL = "claude-sonnet-5-5";
const REPLY = 'The gates loom.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const NEED     = '[data-action="sf-suffer-pick"][data-option-index="0"]';
const SWEAR    = '[data-action="sf-sojourn-need-swear"]';
const DONE     = '[data-action="sf-sojourn-need-done"]';
const SWEAR_IT = '[data-action="sf-player-vow-swear"]';
const BY_VOW   = "an iron vow was sworn to see the community's need done";
const GONE     = "The vow written from this card is no longer on Kira's sheet";
const STANDS   = "it is no longer on Kira's sheet, but the oath stands";

let table, pc, savedItem;
const gm         = () => table.client("gm-1");
const round      = () => table.world.getSetting("batchMode.round");
const flagsOf    = (card) => table.world.message(card._id).flags[MODULE_ID];
const contentOf  = (card) => table.world.message(card._id).content;
const sojournCard = () => table.cards(f => f.moveResolution).find(m => m.content.includes('<div class="sf-move-name">Sojourn</div>')) ?? null;
const choice     = () => table.cards(f => f.sufferCard && f.moveId === "sojourn").at(-1) ?? null;
const needCard   = () => table.cards(f => f.sojournNeedCard).at(-1) ?? null;
const vowCards   = () => table.cards(f => f.playerVowCard);
const refuges    = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL
  && /Narrate the consequence/.test(c.userText ?? "") && /A miss, resolved as a strong hit/.test(c.userText ?? ""));
const roundCalls = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /THIS ROUND/.test(c.userText ?? ""));
const at         = (call) => table.claude.calls.indexOf(call);
/** The card as a client's chat log shows it now: rendered afresh, its render hooks run. */
const shown      = (card, as) => table.client(as).render(card._id);

async function settled() { await table.settle(); await table.drain(); }
async function click(card, selector, as = "pl-1") {
  await table.client(as).click(card._id, selector);
  await settled();
}
async function relay(userId, kind, payload) {
  const gmRelay = await table.client(userId).import("../../src/multiplayer/gmRelay.js");
  const res = await table.client(userId).run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}
/** Free-flow: Kira's Sojourn missed and was told, "Community needs help" picked, and the vow written from the need card. */
async function vowWrittenForNeed() {
  await table.client("pl-1").chat("I ask the settlement for shelter.", { speaker: { actor: pc.id } });
  await settled();
  await click(choice(), NEED);
  const need = needCard();
  shown(need, "pl-1").querySelector(".sf-sojourn-need-vow-name").value = "Clear the reactor of raiders";
  table.client("pl-1").click(need._id, SWEAR);
  await settled(); await settled();
  expect(pc.items.contents, "setup: the vow is on the sheet").toHaveLength(1);
  expect(flagsOf(need), "setup: the need is open").toMatchObject({ resolved: false });
  return need;
}
/** The world refuses the write that claims `card` as resolved; every other write lands. */
function refuseClaim(card) {
  const refused = [];
  const off = table.interceptWrites((w) => {
    if (w.kind !== "message.update" || w.id !== card._id || !(`flags.${MODULE_ID}.resolved` in (w.changes ?? {}))) return undefined;
    refused.push(w);
    return new Error("The server refused the card's write (test fault)");
  });
  return { refused, off };
}
/** ⚔ Swear it (roll) on the vow's own card: the forced swear is held a moment before it runs. */
async function pressSwearIt() {
  control.dice.swear_an_iron_vow = STRONG;
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    table.client("pl-1").click(vowCards()[0]._id, SWEAR_IT);
    for (let i = 0; i < 4; i += 1) { await table.settle(); await vi.advanceTimersByTimeAsync(2_100); }
    await table.settle();
  } finally {
    vi.useRealTimers();
    await table.drain();
  }
}
/** The vow is deleted from the sheet, and the deleteItem hook reaches every connected client. */
async function deleteVow(item) {
  pc.items.contents.splice(pc.items.contents.indexOf(item), 1);
  table.fireDocumentHook("pl-1", "deleteItem", item, {});
  await settled(); await settled();
}
/** Neither ⚔ Swear an Iron Vow nor its fields, on any client's card. */
function offersNoVow(need) {
  for (const who of ["gm-1", "pl-1", "pl-2"]) {
    const root = shown(need, who);
    expect(root.querySelector(SWEAR), `${who} is offered no other vow`).toBeNull();
    expect(root.textContent, who).not.toContain(GONE);
  }
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.dice = { sojourn: MISS, swear_an_iron_vow: STRONG, face_danger: REN_WEAK };
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: "tvd-s1", currentSessionId: "tvd-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "tvd-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
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

describe("a vow deleted once its swear was told, before its Sojourn was resolved (issue #364 SOJOURN-TOLD-VOW-DELETED)", () => {
  it("the deletion resolves the Sojourn as the swear would have: once, by the vow — no ⚔ offered again", async () => {
    const need = await vowWrittenForNeed();
    const [vow] = pc.items.contents;
    // The swear is told, and its resolve refused (the card's claim): the vow says its swear is told, and the Sojourn waits.
    const fault = refuseClaim(need);
    await pressSwearIt();
    expect(fault.refused.length, "setup: the resolve was refused").toBeGreaterThan(0);
    fault.off();
    expect(vow.flags[MODULE_ID], "setup: the vow says its swear is told").toMatchObject({ sojournNeedCard: need._id, sojournSwearTold: true });
    expect(flagsOf(need)).toMatchObject({ resolved: false });

    await deleteVow(vow);

    expect(flagsOf(need), "the oath stands: the Sojourn is resolved").toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain(BY_VOW);
    expect(contentOf(need)).not.toContain("data-action");
    offersNoVow(need);
    expect(refuges()).toHaveLength(1);
    expect(refuges()[0].userText).toContain(BY_VOW);
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);

    // The canonical GM's next load resolves nothing a second time.
    await table.reload("gm-1");
    await settled(); await settled();
    expect(refuges()).toHaveLength(1);
  }, 120_000);

  it("deleted while a round is being resolved: the card keeps that the oath stands, a reload loses nothing, and the round's close resolves it — once", async () => {
    const need = await vowWrittenForNeed();
    const [vow] = pc.items.contents;
    await gm().setSetting("batchMode.enabled", true);
    await settled();
    // Kira passes and Ren acts: the round rolls his weak hit and waits for his Burn / Keep — a round being resolved.
    await relay("pl-1", "batch.pass", { roundId: round().id });
    await relay("pl-2", "batch.submit", { roundId: round().id, text: "I hold the airlock against the drones.", submissionId: "r1" });
    await relay("pl-2", "batch.confirm", { roundId: round().id, submissionId: "r1", choices: {} });
    await settled();
    expect(round(), "setup: the round waits at its upgrade step").toMatchObject({ phase: "upgrading" });
    // The vow's swear is told while the round waits: the resolve is refused, and the vow says its swear is told.
    const sojournNeed = await gm().import("../../src/moves/sojournNeed.js");
    expect(await gm().run(() => sojournNeed.resolveSojournNeedsForVow(vow.id)), "setup: refused while the round is resolved").toBe(0);
    await settled();
    expect(vow.flags[MODULE_ID]).toMatchObject({ sojournSwearTold: true });

    await deleteVow(vow);

    // Still refused (the round), but not taken back: the card keeps that the oath stands, and offers no other vow.
    expect(flagsOf(need)).toMatchObject({ resolved: false, swornVowDeleted: true });
    expect(contentOf(need)).toContain(STANDS);
    offersNoVow(need);
    expect(shown(need, "pl-1").querySelector(DONE)?.disabled, "✔ It is done stays live").toBe(false);
    expect(refuges(), "no refuge beside the round").toHaveLength(0);
    const writeVow = await gm().run(() => sojournNeed.applySojournNeedFromRelay({ messageId: need._id, way: "vow", vowName: "Another" }, { requesterIsGM: true }));
    expect(writeVow).toEqual({ applied: false, reason: "vow-already-written" });
    expect(pc.items.contents).toHaveLength(0);

    // The GM's page reloads while the round still waits: its load finds the card, and still waits for the round.
    await table.reload("gm-1");
    await settled();
    expect(round()).toMatchObject({ phase: "upgrading" });
    expect(flagsOf(need)).toMatchObject({ resolved: false });

    await relay("pl-2", "batch.keep", { roundId: round().id });
    await settled(); await settled();

    expect(roundCalls(), "the round was narrated once").toHaveLength(1);
    expect(flagsOf(need), "the round's close resolved it").toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain(BY_VOW);
    expect(refuges()).toHaveLength(1);
    expect(at(refuges()[0]), "the refuge follows the round's narration").toBeGreaterThan(at(roundCalls()[0]));
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);

    // The next round closes, and ✔ It is done is relayed again: nothing resolves it a second time.
    await relay("pl-1", "batch.pass", { roundId: round().id });
    await relay("pl-2", "batch.pass", { roundId: round().id });
    await relay("pl-1", "sojourn.need", { messageId: need._id, way: "done" });
    await settled();
    expect(refuges()).toHaveLength(1);
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 120_000);

  it("control: a vow deleted before its swear was told still opens the card again, offering ⚔", async () => {
    const need = await vowWrittenForNeed();
    await deleteVow(pc.items.contents[0]);

    expect(flagsOf(need)).toMatchObject({ resolved: false });
    expect(flagsOf(need)).not.toHaveProperty("swornVowDeleted");
    expect(contentOf(need)).toContain(GONE);
    expect(shown(need, "pl-1").querySelector(SWEAR)?.disabled).toBe(false);
    expect(refuges()).toHaveLength(0);
  }, 60_000);

  it("the card of a told vow deleted says the oath stands, offers no vow's fields, and keeps ✔ It is done", () => {
    const html = buildSojournNeedHtml({ actorName: "Kira <i>", vowSworn: true });
    expect(html).toContain("it is no longer on Kira &lt;i&gt;'s sheet, but the oath stands");
    expect(html).not.toContain("sf-sojourn-need-swear");
    expect(html).not.toContain("sf-sojourn-need-vow-name");
    expect(html).toContain('data-action="sf-sojourn-need-done"');
  });
});
