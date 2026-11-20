/**
 * STARFORGED COMPANION
 * tests/unit/sojournNeedVowDeletedOffersVowAgain.test.js
 *
 * Issue #364 SOJOURN-VOW-DELETED-BEFORE-SWORN.
 *
 * The community's need card of a Sojourn miss (src/moves/sojournNeed.js):
 * its ⚔ Swear an Iron Vow writes a vow on the roller's sheet, and the card
 * then says the vow is on the sheet and where its swear roll is. A vow
 * deleted from the sheet before its swear was rolled left the card saying
 * so for good — nothing could swear the vow it named, and ⚔ never came back
 * (only ✔ It is done was left).
 *
 * The card now reads its vow from the sheet: the canonical GM's deleteItem
 * hook opens the card again for every client, and — when no GM saw the
 * deletion, or the world refused that write — each client's own render
 * offers ⚔ again from the card's flags and the sheet, a reloaded page's
 * included. A ⚔ press then writes another vow, and that vow's swear resolves
 * the Sojourn.
 *
 * End to end on a booted GM / two-player table (tests/helpers/multiClient.js);
 * the vow's Item is made by a stand-in `Item.create` that fires the
 * createItem hook, and deleted as the system deletes one: off its parent's
 * sheet, then the deleteItem hook on every client.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
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
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const n of control.dice) rng.mockReturnValueOnce(n);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude, failWrites } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { buildSojournNeedHtml } from "../../src/moves/sojournNeed.js";

// challenge 7 and 8; action die 1 (+heart 2) — a miss, no match; then the price's d100 = 71.
const MISS = [0.65, 0.75, 0, 0.705];
// challenge 1 and 2; action die 6 (+heart 2) — a strong hit, no match.
const STRONG = [0, 0.1, 0.9];
const NARRATION_MODEL = "claude-sonnet-5-5";
const REPLY = 'The gates loom.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

const NEED     = '[data-action="sf-suffer-pick"][data-option-index="0"]';
const SWEAR    = '[data-action="sf-sojourn-need-swear"]';
const DONE     = '[data-action="sf-sojourn-need-done"]';
const SWEAR_IT = '[data-action="sf-player-vow-swear"]';
const ON_SHEET = "is on Kira's sheet — ";
const GONE     = "The vow written from this card is no longer on Kira's sheet";

let table, pc, savedItem;
const flagsOf    = (card) => table.world.message(card._id).flags[MODULE_ID];
const contentOf  = (card) => table.world.message(card._id).content;
const moveCard   = () => table.cards(f => f.moveResolution).find(m => m.content.includes('<div class="sf-move-name">Sojourn</div>'));
const choice     = () => table.cards(f => f.sufferCard && f.moveId === "sojourn").at(-1) ?? null;
const needCard   = () => table.cards(f => f.sojournNeedCard).at(-1) ?? null;
const vowCards   = () => table.cards(f => f.playerVowCard);
const refuges    = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL
  && /Narrate the consequence/.test(c.userText ?? "") && /A miss, resolved as a strong hit/.test(c.userText ?? ""));
/** The card as a client's chat log shows it now: rendered afresh, its render hooks run. */
const shown      = (card, as) => table.client(as).render(card._id);

async function settled() { await table.settle(); await table.drain(); }
async function click(card, selector, as = "pl-1") {
  await table.client(as).click(card._id, selector);
  await settled();
}
/** ⚔ Swear an Iron Vow on the need card as pl-1's chat log shows it, with the name typed. */
async function swearOnNeed(card, name) {
  shown(card, "pl-1").querySelector(".sf-sojourn-need-vow-name").value = name;
  table.client("pl-1").click(card._id, SWEAR);
  await settled(); await settled();
}
/** The Sojourn missed, "Community needs help" picked, and a vow written from the need card. */
async function vowWrittenForNeed() {
  control.dice = MISS;
  await table.client("pl-1").chat("I ask the settlement for shelter.", { speaker: { actor: pc.id } });
  await settled();
  await click(choice(), NEED);
  const need = needCard();
  await swearOnNeed(need, "Clear the reactor of raiders");
  return need;
}
/** The vow is deleted from the sheet; `heard` — the deleteItem hook reaches the clients, as it does while they are connected. */
async function deleteVow(item, { heard = true } = {}) {
  pc.items.contents.splice(pc.items.contents.indexOf(item), 1);
  if (heard) table.fireDocumentHook("pl-1", "deleteItem", item, {});
  await settled();
}
/** ⚔ Swear it (roll) on a vow's own card: the forced swear is held a moment before it runs. */
async function swearIt(cardId) {
  control.dice = STRONG;
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    table.client("pl-1").click(cardId, SWEAR_IT);
    for (let i = 0; i < 4; i += 1) { await table.settle(); await vi.advanceTimersByTimeAsync(2_100); }
    await table.settle();
  } finally {
    vi.useRealTimers();
    await table.drain();
  }
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "sjd-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "sjd-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { heart: 2, momentum: { value: 2 }, supply: { value: 3 }, spirit: { value: 5 } } });
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
  globalThis.silenceConsoleErrors?.();
});
afterEach(async () => {
  globalThis.Item = savedItem;
  table.client("gm-1").answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

describe("the community's need card whose vow was deleted before it was sworn (issue #364 SOJOURN-VOW-DELETED-BEFORE-SWORN)", () => {
  it("the card stops saying the vow is on the sheet and offers ⚔ again on every client; a second vow, sworn, resolves the Sojourn", async () => {
    const need = await vowWrittenForNeed();
    const [first] = pc.items.contents;
    expect(contentOf(need)).toContain(ON_SHEET);
    expect(contentOf(need)).not.toContain("sf-sojourn-need-swear");

    await deleteVow(first);

    // The canonical GM opened the card again: its stored text and flags, for every client.
    expect(flagsOf(need)).toMatchObject({ resolved: false, vowRequested: false });
    expect(flagsOf(need).vowId ?? null).toBeNull();
    expect(contentOf(need)).not.toContain(ON_SHEET);
    expect(contentOf(need)).toContain(GONE);
    expect(contentOf(need)).toContain("⚔ Swear an Iron Vow</button>");
    expect(contentOf(need)).toContain("✔ It is done</button>");
    for (const who of ["gm-1", "pl-1", "pl-2"]) {
      expect(shown(need, who).querySelector(SWEAR)?.disabled, `${who} may press ⚔ again`).toBe(false);
    }

    await swearOnNeed(need, "Hold the east gate");

    expect(pc.items.contents.map(i => i.name)).toEqual(["Hold the east gate"]);
    const [second] = pc.items.contents;
    expect(flagsOf(need)).toMatchObject({ resolved: false, vowRequested: true, vowId: second.id });
    expect(contentOf(need)).toContain(`"Hold the east gate" ${ON_SHEET}`);
    expect(contentOf(need)).not.toContain(GONE);

    await swearIt(vowCards().at(-1)._id);

    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(refuges()).toHaveLength(1);
    expect(contentOf(moveCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 120_000);

  it("a deletion the card was never told of: each client's render reads the sheet, a reloaded page's too, and ⚔ writes another vow", async () => {
    const need = await vowWrittenForNeed();
    const [first] = pc.items.contents;

    // No client heard the hook (deleted with no GM at the table): the stored card is as it was.
    await deleteVow(first, { heard: false });
    expect(flagsOf(need)).toMatchObject({ vowRequested: true, vowId: first.id });
    expect(contentOf(need)).toContain(ON_SHEET);

    for (const who of ["gm-1", "pl-1", "pl-2"]) {
      const root = shown(need, who);
      expect(root.querySelector(SWEAR)?.disabled, `${who} is offered ⚔ again`).toBe(false);
      expect(root.querySelector(".sf-sojourn-need-vow-name"), `${who} may name the vow`).toBeTruthy();
      expect(root.textContent).toContain(GONE);
      expect(root.textContent).not.toContain(ON_SHEET);
      expect(root.querySelector(DONE)?.disabled, `${who} may still press ✔`).toBe(false);
    }
    await table.reload("pl-1");
    await settled();
    expect(shown(need, "pl-1").querySelector(SWEAR)?.disabled, "after a reload").toBe(false);

    await swearOnNeed(need, "Hold the east gate");

    expect(pc.items.contents.map(i => i.name)).toEqual(["Hold the east gate"]);
    expect(flagsOf(need)).toMatchObject({ resolved: false, vowRequested: true, vowId: pc.items.contents[0].id });
    expect(contentOf(need)).toContain(`"Hold the east gate" ${ON_SHEET}`);
    // The new vow is on the sheet: the card says so, and offers no third.
    expect(shown(need, "pl-2").querySelector(SWEAR)).toBeNull();
  }, 120_000);

  it("a card rewrite the world refuses changes nothing stored, and the render still offers ⚔", async () => {
    const need = await vowWrittenForNeed();
    const [first] = pc.items.contents;
    const refused = failWrites(table, w => w.kind === "message.update" && w.id === need._id);

    await deleteVow(first);

    expect(refused.refused).toBe(1);
    expect(flagsOf(need)).toMatchObject({ vowRequested: true, vowId: first.id });
    expect(shown(need, "pl-1").querySelector(SWEAR)?.disabled).toBe(false);
  }, 60_000);

  it("✔ It is done still resolves the Sojourn of a card whose vow is gone", async () => {
    const need = await vowWrittenForNeed();
    await deleteVow(pc.items.contents[0]);

    await click(need, DONE);

    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain("the community's need was met");
    expect(refuges()).toHaveLength(1);
  }, 60_000);

  it("the vow still on the sheet: another Item's deletion changes nothing, and no second vow is written", async () => {
    const need = await vowWrittenForNeed();
    const [vow] = pc.items.contents;
    const before = contentOf(need);

    table.fireDocumentHook("pl-1", "deleteItem", { id: "asset-1", type: "asset", parent: pc }, {});
    table.fireDocumentHook("pl-1", "deleteItem", { id: "vow-other", type: "progress", parent: pc }, {});
    await settled();

    expect(contentOf(need)).toBe(before);
    expect(flagsOf(need)).toMatchObject({ vowRequested: true, vowId: vow.id });
    for (const who of ["gm-1", "pl-1", "pl-2"]) expect(shown(need, who).querySelector(SWEAR)).toBeNull();
    const { applySojournNeedFromRelay } = await table.client("gm-1").import("../../src/moves/sojournNeed.js");
    expect(await table.client("gm-1").run(() => applySojournNeedFromRelay({ messageId: need._id, way: "vow", vowName: "Another" }, { requesterIsGM: true })))
      .toEqual({ applied: false, reason: "vow-already-written" });
    expect(pc.items.contents).toHaveLength(1);
  }, 60_000);

  it("the card built for a vow that is gone says so and offers the vow's fields and both buttons", () => {
    const html = buildSojournNeedHtml({ actorName: "Kira <i>", vowGone: true });
    expect(html).toContain("The vow written from this card is no longer on Kira &lt;i&gt;'s sheet");
    expect(html).toContain('data-action="sf-sojourn-need-swear">');
    expect(html).toContain('data-action="sf-sojourn-need-done"');
    expect(buildSojournNeedHtml({ actorName: "Kira" })).not.toContain("no longer on");
  });
});
