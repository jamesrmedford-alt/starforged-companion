/**
 * STARFORGED COMPANION
 * tests/unit/sojournVowSwornResolvesWithoutCardWrite.test.js
 *
 * Issue #364 SOJOURN-NEED-CARD-VOW-ID-WRITE-REFUSED.
 *
 * The community's need card of a Sojourn miss (src/moves/sojournNeed.js):
 * its ⚔ Swear an Iron Vow writes a vow on the roller's sheet, and that vow's
 * swear resolves the Sojourn as a strong hit. Which Sojourn a vow answers was
 * kept on the card — a second write of the card, made after the vow was
 * created. The world refusing that write left a vow on the sheet that no
 * card named: its swear resolved nothing, and only a console line said to
 * press ✔ It is done.
 *
 * The vow itself now says which need card it was written for (its
 * `sojournNeedCard` flag, set in the one write that creates it —
 * actorBridge.createCharacterVowItem), and the swear resolves from the vow's
 * side (actorBridge.needCardIdsOfVow). The card keeps no copy of the link:
 * what it shows of its vow is read from the sheet.
 *
 * End to end on a booted GM / two-player table (tests/helpers/multiClient.js);
 * the vow's Item is made by a stand-in `Item.create` that fires the
 * createItem hook, as the system does.
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
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { readNeedVow, vowNeedCardId, needCardIdsOfVow } from "../../src/character/actorBridge.js";

// challenge 7 and 8; action die 1 (+heart 2) — a miss, no match; then the price's d100 = 71.
const MISS = [0.65, 0.75, 0, 0.705];
// challenge 1 and 2; action die 6 (+heart 2) — a strong hit, no match.
const STRONG = [0, 0.1, 0.9];
const NARRATION_MODEL = "claude-sonnet-5-5";
const REPLY = 'The gates loom.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

const NEED     = '[data-action="sf-suffer-pick"][data-option-index="0"]';
const SWEAR    = '[data-action="sf-sojourn-need-swear"]';
const SWEAR_IT = '[data-action="sf-player-vow-swear"]';

let table, pc, savedItem;
const flagsOf    = (card) => table.world.message(card._id).flags[MODULE_ID];
const contentOf  = (card) => table.world.message(card._id).content;
const moveCard   = () => table.cards(f => f.moveResolution).find(m => m.content.includes('<div class="sf-move-name">Sojourn</div>'));
const choice     = () => table.cards(f => f.sufferCard && f.moveId === "sojourn").at(-1) ?? null;
const needCard   = () => table.cards(f => f.sojournNeedCard).at(-1) ?? null;
const vowCards   = () => table.cards(f => f.playerVowCard);
const refuges    = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL
  && /Narrate the consequence/.test(c.userText ?? "") && /A miss, resolved as a strong hit/.test(c.userText ?? ""));

async function settled() { await table.settle(); await table.drain(); }
async function click(card, selector, as = "pl-1") {
  await table.client(as).click(card._id, selector);
  await settled();
}
/** The Sojourn missed and "Community needs help" picked: the need card is on the table. */
async function needTakenOn() {
  control.dice = MISS;
  await table.client("pl-1").chat("I ask the settlement for shelter.", { speaker: { actor: pc.id } });
  await settled();
  await click(choice(), NEED);
  return needCard();
}
/** ⚔ Swear an Iron Vow on the need card as pl-1's chat log shows it, with the name typed. */
async function swearOnNeed(card, name) {
  table.client("pl-1").render(card._id).querySelector(".sf-sojourn-need-vow-name").value = name;
  table.client("pl-1").click(card._id, SWEAR);
  await settled(); await settled();
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
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "sjw-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "sjw-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
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

describe("a vow written from the community's need card says which card it answers (issue #364 SOJOURN-NEED-CARD-VOW-ID-WRITE-REFUSED)", () => {
  it("every write of the card after the vow is made refused: the vow's swear still resolves the Sojourn", async () => {
    const need = await needTakenOn();
    // The card may be written once more before the vow is made (never after it, here): every later write is refused.
    let vowMade = false;
    const off = table.interceptWrites(w => (w.kind === "message.update" && w.id === need._id && vowMade
      ? new Error("The server refused the card's write (test fault)") : undefined));
    const realCreate = globalThis.Item.create;
    globalThis.Item.create = async (...args) => { const item = await realCreate(...args); vowMade = true; return item; };

    await swearOnNeed(need, "Clear the reactor of raiders");

    expect(pc.items.contents).toHaveLength(1);
    const [vow] = pc.items.contents;
    // The link is the vow's own, made in the write that created it.
    expect(vow.flags[MODULE_ID]).toMatchObject({ sojournNeedCard: need._id });
    expect(contentOf(need), "the card's own text was never rewritten").toContain("sf-sojourn-need-swear");
    // Its render reads the sheet all the same: no second vow is offered.
    expect(table.client("pl-2").render(need._id).querySelector(SWEAR)?.disabled).toBe(true);
    off();

    await swearIt(vowCards()[0]._id);

    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain("an iron vow was sworn to see the community's need done");
    expect(refuges()).toHaveLength(1);
    expect(contentOf(moveCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 120_000);

  it("the card keeps no copy of the link: one store, the vow's flag, read through the actor bridge", async () => {
    const need = await needTakenOn();

    await swearOnNeed(need, "Clear the reactor of raiders");

    const [vow] = pc.items.contents;
    expect(vow.flags[MODULE_ID]).toMatchObject({ sojournNeedCard: need._id });
    expect(flagsOf(need)).not.toHaveProperty("vowId");
    expect(flagsOf(need)).not.toHaveProperty("vowRequested");
    expect(contentOf(need)).toContain('"Clear the reactor of raiders" is on Kira\'s sheet');
    const gm = table.client("gm-1");
    expect(gm.run(() => vowNeedCardId(vow))).toBe(need._id);
    expect(gm.run(() => readNeedVow(pc, need._id))).toEqual({ id: vow.id, name: "Clear the reactor of raiders" });
    expect(gm.run(() => readNeedVow(pc, "another-card"))).toBeNull();
    expect(gm.run(() => needCardIdsOfVow(vow.id))).toEqual([need._id]);
    expect(gm.run(() => needCardIdsOfVow("no-such-vow"))).toEqual([]);
  }, 60_000);

  it("a vow the sheet refuses writes nothing on the card, and the next press writes the vow", async () => {
    const need = await needTakenOn();
    const before = contentOf(need);
    const realCreate = globalThis.Item.create;
    globalThis.Item.create = async () => { throw new Error("the world refused the Item"); };

    await swearOnNeed(need, "Clear the reactor");

    expect(pc.items.contents).toEqual([]);
    expect(contentOf(need)).toBe(before);
    expect(table.cards(f => f.pressRefusedNotice)[0].content).toContain("could not be written on Kira");

    globalThis.Item.create = realCreate;
    await swearOnNeed(need, "Clear the reactor");
    expect(pc.items.contents).toHaveLength(1);
    expect(pc.items.contents[0].flags[MODULE_ID]).toMatchObject({ sojournNeedCard: need._id });
  }, 60_000);

  it("a vow sworn for another need card resolves that card's Sojourn alone", async () => {
    const first = await needTakenOn();
    await swearOnNeed(first, "Clear the reactor of raiders");
    const second = await needTakenOn();
    expect(second._id).not.toBe(first._id);
    await swearOnNeed(second, "Hold the east gate");
    expect(pc.items.contents.map(i => i.flags[MODULE_ID].sojournNeedCard)).toEqual([first._id, second._id]);

    await swearIt(vowCards().at(-1)._id);

    expect(flagsOf(second)).toMatchObject({ resolved: true });
    expect(flagsOf(first)).toMatchObject({ resolved: false });
    expect(refuges()).toHaveLength(1);
  }, 120_000);
});
