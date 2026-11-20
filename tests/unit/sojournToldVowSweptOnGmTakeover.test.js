/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/sojournToldVowSweptOnGmTakeover.test.js
 *
 * Issue #364 SOJOURN-NO-SWEEP-ON-GM-TAKEOVER (found while fixing
 * SOJOURN-VOW-SWORN-WHILE-ROUND-RESOLVING).
 *
 * A Sojourn miss answered with a vow is resolved as a strong hit once that
 * vow's Swear an Iron Vow has been told (src/moves/sojournNeed.js). A resolve
 * that cannot be made when the swear is told is made later from what the vow
 * says (`sojournSwearTold`): after a Batch Mode round is told and closed, and
 * at the canonical GM's load. At a table of two GMs, when the canonical GM
 * left, the GM who became canonical did not make it until a round closed or
 * they reloaded — the Sojourn stayed a miss meanwhile.
 *
 * It is now made when a GM leaves, or their page stands down, and this GM is
 * canonical after it — the hooks the Batch Mode driver takes over a departed
 * GM's round on.
 *
 * End to end on a booted two-GM / two-player table
 * (tests/helpers/multiClient.js) through the real cards and relays. Scripted
 * at their boundaries: the pacing decision, the interpretation, the ability
 * scan, entity detection and the dice. The resolve is deferred the way the
 * table defers it when the world refuses the need card's claim; the vow's
 * Item is made by a stand-in `Item.create` that fires the createItem hook.
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

// Sojourn: challenge 7 and 8, action die 1 (+heart 2) — a miss; then the price's d100 = 71.
const MISS = [0.65, 0.75, 0, 0.705];
// Swear an Iron Vow: challenge 1 and 2, action die 6 — a strong hit, nothing to upgrade.
const STRONG = [0, 0.1, 0.9];

const NARRATION_MODEL = "claude-sonnet-5-5";
const REPLY = 'The gates loom.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const NEED     = '[data-action="sf-suffer-pick"][data-option-index="0"]';
const SWEAR    = '[data-action="sf-sojourn-need-swear"]';
const SWEAR_IT = '[data-action="sf-player-vow-swear"]';
const BY_VOW   = "an iron vow was sworn to see the community's need done";

let table, pc, savedItem;
const flagsOf     = (card) => table.world.message(card._id).flags[MODULE_ID];
const contentOf   = (card) => table.world.message(card._id).content;
const sojournCard = () => table.cards(f => f.moveResolution).find(m => m.content.includes('<div class="sf-move-name">Sojourn</div>')) ?? null;
const choice      = () => table.cards(f => f.sufferCard && f.moveId === "sojourn").at(-1) ?? null;
const needCard    = () => table.cards(f => f.sojournNeedCard).at(-1) ?? null;
const vowCards    = () => table.cards(f => f.playerVowCard);
const swearCalls  = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /MOVE: Swear an Iron Vow/i.test(c.userText ?? ""));
const refuges     = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL
  && /Narrate the consequence/.test(c.userText ?? "") && /A miss, resolved as a strong hit/.test(c.userText ?? ""));

async function settled() { await table.settle(); await table.drain(); }
async function click(card, selector, as = "pl-1") {
  await table.client(as).click(card._id, selector);
  await settled();
}
/** Kira's Sojourn missed and was told, "Community needs help" picked, and the vow written from the need card. */
async function vowWrittenForNeed() {
  control.dice.sojourn = MISS;
  await table.client("pl-1").chat("I ask the settlement for shelter.", { speaker: { actor: pc.id } });
  await settled();
  await click(choice(), NEED);
  const need = needCard();
  table.client("pl-1").render(need._id).querySelector(".sf-sojourn-need-vow-name").value = "Clear the reactor of raiders";
  table.client("pl-1").click(need._id, SWEAR);
  await settled(); await settled();
  expect(pc.items.contents, "setup: the vow is on the sheet").toHaveLength(1);
  return need;
}
/**
 * The vow's ⚔ Swear it (roll), told by the canonical GM (gm-1) while the world
 * refuses the write that claims the need card: the vow says its swear is told,
 * and its Sojourn waits. The fault is lifted after.
 */
async function swearToldResolveDeferred(need) {
  const refused = [];
  const off = table.interceptWrites((w) => {
    if (w.kind !== "message.update" || w.id !== need._id || !(`flags.${MODULE_ID}.resolved` in (w.changes ?? {}))) return undefined;
    refused.push(w);
    return new Error("The server refused the card's write (test fault)");
  });
  control.dice.swear_an_iron_vow = STRONG;
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    table.client("pl-1").click(vowCards()[0]._id, SWEAR_IT);
    for (let i = 0; i < 4; i += 1) { await table.settle(); await vi.advanceTimersByTimeAsync(2_100); }
    await table.settle();
  } finally {
    vi.useRealTimers();
    await table.drain();
    off();
  }
  expect(refused.length, "setup: the claim was refused").toBeGreaterThan(0);
  expect(swearCalls(), "setup: the swear is told").toHaveLength(1);
  expect(swearCalls()[0].client, "setup: by the canonical GM").toBe("gm-1");
  expect(pc.items.contents[0].flags[MODULE_ID], "setup: the vow says its swear is told").toMatchObject({ sojournNeedCard: need._id, sojournSwearTold: true });
  expect(flagsOf(need), "setup: its Sojourn waits").toMatchObject({ resolved: false });
  expect(refuges()).toHaveLength(0);
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.dice = {};
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: "stk-s1", currentSessionId: "stk-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "stk-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  // Both GMs hold a key: Gina (gm-1) is canonical, and Gus (gm-2) takes over when she is gone.
  await table.setClaudeKey("gm-1", "sk-ant-test");
  await table.setClaudeKey("gm-2", "sk-ant-test");
  // Momentum 2 beats neither of the Sojourn's dice: its miss is narrated at once.
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [] },
    system: { heart: 2, momentum: { value: 2 }, supply: { value: 3 }, health: { value: 5 }, spirit: { value: 5 } } });
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
  for (const id of ["gm-1", "gm-2"]) table.client(id).answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

describe("a told vow's deferred Sojourn, when the canonical GM is gone (issue #364 SOJOURN-NO-SWEEP-ON-GM-TAKEOVER)", () => {
  it("the canonical GM leaves: the GM who takes over resolves it at once, by the vow — once", async () => {
    const need = await vowWrittenForNeed();
    await swearToldResolveDeferred(need);

    // A player leaving leaves the canonical GM as it was: nothing is resolved.
    await table.leave("pl-2");
    await settled();
    expect(flagsOf(need)).toMatchObject({ resolved: false });
    expect(refuges()).toHaveLength(0);

    await table.leave("gm-1");
    await settled(); await settled();

    expect(flagsOf(need), "the GM who took over resolved the Sojourn").toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain(BY_VOW);
    expect(contentOf(need)).not.toContain("data-action");
    expect(refuges(), "the refuge is narrated once").toHaveLength(1);
    expect(refuges()[0].client, "by the GM who took over").toBe("gm-2");
    expect(refuges()[0].userText).toContain(BY_VOW);
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);

    // Gina comes back (canonical again), then Gus leaves: nothing is resolved a second time.
    await table.reload("gm-1");
    await settled();
    await table.leave("gm-2");
    await settled(); await settled();
    expect(refuges()).toHaveLength(1);
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 120_000);

  it("the canonical GM's page stands down (its connection dropped and came back unseen): the GM who takes over resolves it", async () => {
    const need = await vowWrittenForNeed();
    await swearToldResolveDeferred(need);

    // Gina's page announces it stood down — no userConnected anywhere (issue #347 AB19).
    const relay = await table.client("gm-1").import("../../src/multiplayer/gmRelay.js");
    table.client("gm-1").run(() => game.socket.emit(relay.GM_RELAY_SOCKET, { kind: relay.GM_PAGE_STALE_KIND, userId: "gm-1" }));
    await settled(); await settled();

    expect(flagsOf(need), "the GM who took over resolved the Sojourn").toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain(BY_VOW);
    expect(refuges()).toHaveLength(1);
    expect(refuges()[0].client).toBe("gm-2");
    expect(contentOf(sojournCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 120_000);

  it("the other GM leaving: the canonical GM, still canonical, tries again too — resolved once, by her", async () => {
    const need = await vowWrittenForNeed();
    await swearToldResolveDeferred(need);

    await table.leave("gm-2");
    await settled(); await settled();

    // Gina (canonical) heard a GM leave and tried again: the world takes the claim now, so it is resolved — by her.
    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(refuges()).toHaveLength(1);
    expect(refuges()[0].client).toBe("gm-1");
  }, 120_000);
});
