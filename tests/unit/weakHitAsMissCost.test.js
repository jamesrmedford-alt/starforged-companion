/**
 * STARFORGED COMPANION
 * tests/unit/weakHitAsMissCost.test.js
 *
 * HOVERBIKE-WEAK-AS-MISS-UNAPPLIED (found while fixing VALUE-ADD-INTEGRITY).
 * The Hoverbike's afterburner: "you may add +integrity and take +2 momentum on
 * a strong hit. If you do, count a weak hit as a miss." VALUE-ADD-INTEGRITY
 * offered the add as its number, pre-checked like every add — but nothing
 * applied the cost, so the add was a free +3. Now an add whose ability makes
 * taking it count a weak hit as a miss says so on the confirm dialog, and,
 * taken, the roll's weak hit resolves as a miss — the card saying why — as
 * Take Decisive Action's bad-spot downgrade is applied (resolveMove). A burn
 * that would land on a weak hit is no improvement, so it is neither offered
 * nor applied.
 *
 * On a booted GM / player table: the REAL scanner (its Haiku pass answered
 * from the table), the REAL confirm dialog's Accept, the pipeline, the card
 * and the Burn button.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], ptp: [12], uncheck: false, rows: [] }));
// The REAL confirm dialog, accepted as the player would: rendered, the boxes as
// the dialog pre-checks them (or unchecked), Accept pressed.
vi.mock("../../src/ui/settingsPanel.js", async (original) => {
  const real = await original();
  return { ...real, confirmInterpretation: vi.fn(async (interp) => {
    const shown  = real.MoveConfirmDialog.prompt(interp);
    const dialog = real.MoveConfirmDialog.pending;
    dialog.element = await dialog._renderHTML(await dialog._prepareContext({}), {});
    control.rows.push(...dialog.element.querySelectorAll(".sf-applicable-ability-row"));
    if (control.uncheck) for (const cb of dialog.element.querySelectorAll(".sf-applicable-ability-cb")) cb.checked = false;
    await real.MoveConfirmDialog.DEFAULT_OPTIONS.actions.accept.call(dialog);
    return shown;
  }) };
});
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// Pay the Price 12, "You face a tough choice": no suffer route.
vi.mock("../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { StubElement } from "../helpers/cardDom.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const link = (name) => `@Compendium[foundry-ironsworn.starforgedmoves.x]{${name}}`;
const HOVERBIKE = [
  `<p>Your unarmed hoverbike provides speedy planetside ground transport. When you ${link("Undertake an Expedition")} (+edge), take +1 momentum on a hit.</p>`,
  "<p>When you fire the bike's afterburner and make a move to perform a risky maneuver, you may add +integrity and take +2 momentum on a strong hit. If you do, count a weak hit as a miss.</p>",
];
const SHUTTLE = `<p>When you ${link("Face Danger")} or ${link("React Under Fire")} to navigate through hazardous skies, avoid obstacles, or evade an attack, add +1 and take +1 momentum on a hit.</p>`;

const isClassifier  = (call) => /pacing pre-classifier/.test(call.system ?? "");
const isInterpreter = (call) => /You are the move interpreter/.test(call.system ?? "");
const isScanner     = (call) => /scanning a Starforged player character's asset abilities/.test(call.userText ?? "");
const isNarration   = (call) => /SIDECAR|NARRATOR ROLE/.test(call.system ?? "");
// The scanner's Haiku pass: every ability it is shown applies.
const everyAbility  = (call) => JSON.stringify({ matches: [...String(call.userText).matchAll(/key="([^"]+)"/g)]
  .map(m => ({ key: m[1], summary: "afterburner", statReplacement: null })) });

// Edge 2, the bike's +3: challenge 5 and 9.
const WEAK_WITH_ADD   = [0.45, 0.85, 0.4];    // die 3 → 3+2+3 = 8: a weak hit
const STRONG_WITH_ADD = [0.45, 0.85, 0.99];   // die 6 → 11: a strong hit
const WEAK_WITHOUT    = [0.45, 0.85, 0.99];   // die 6 → 8 unadded: a weak hit

let table, pc;
const player    = () => table.client("pl-1");
const moveCard  = () => table.cards(f => f.moveResolution).at(-1);
const lastMove  = () => table.cards(f => f.narratorCard && f.resolutionId).at(-1)?.flags[MODULE_ID];
const effect    = (card) => card?.content.match(/<div class="sf-move-effect">([\s\S]*?)<\/div>/)?.[1] ?? "";

function vehicleAsset(name, abilities, track) {
  return { id: `asset-${name.toLowerCase()}`, name, type: "asset",
    system: { category: "Support Vehicle", track, abilities: abilities.map(description => ({ enabled: true, description })) } };
}

async function maneuver(dice, { momentum = 2, asset = vehicleAsset("Hoverbike", HOVERBIKE, { enabled: true, name: "Integrity", value: 3, max: 3, min: 0 }) } = {}) {
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { edge: 2, momentum: { value: momentum } }, items: { contents: [asset] } });
  control.dice = dice;
  await player().chat("I punch the afterburner and thread the canyon walls.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return moveCard();
}

beforeAll(async () => {
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => { table?.teardown(); delete globalThis.document; });
beforeEach(async () => {
  Object.assign(control, { ptp: [12], uncheck: false, rows: [] });
  await table.reset({ world: { settings: {
    // The price is paid and the result narrated at once, and an upgrade
    // undoes them — the flow these tests are about. (Asking first is the
    // default since issue #354 P2-10: heldResultBeforePrice.test.js.)
    holdResultForUpgrade: false,
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "wm-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "wm-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  scriptClaude(table, { fallback: (call) => (isNarration(call)
    ? 'The canyon walls blur past.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'
    : isScanner(call) ? everyAbility(call) : "{}") })
    .when(isClassifier, JSON.stringify({ decision: "MOVE", suggestedMove: null, category: "exploration", confidence: 0.9, reasoning: "test" }), { times: 9 })
    .when(isInterpreter, JSON.stringify({ moveId: "face_danger", statUsed: "edge", rationale: "test", confidence: "high" }), { times: 9 });
});

describe("taking the Hoverbike's +integrity counts a weak hit as a miss (HOVERBIKE-WEAK-AS-MISS-UNAPPLIED)", () => {
  it("the confirm dialog shows the add's cost on its row", async () => {
    await maneuver(STRONG_WITH_ADD);
    const row = control.rows.find(r => r.querySelector(".sf-applicable-ability-cb")?.dataset.key === "asset-hoverbike:1");
    expect(row.textContent).toMatch(/\+3 \(integrity\)/);
    expect(row.textContent).toMatch(/a weak hit counts as a miss/);
  }, 30_000);

  it("taken, a weak hit resolves as a miss, the card says why, and the price is paid", async () => {
    const card = await maneuver(WEAK_WITH_ADD);
    expect(lastMove()).toMatchObject({ moveId: "face_danger", outcome: "miss" });
    expect(card.content).toMatch(/Miss/);
    expect(effect(card)).toMatch(/^Weak hit counted as a miss — the Hoverbike's add was taken\./);
    expect(table.cards(f => f.payThePriceCard)).toHaveLength(1);
  }, 30_000);

  it("a burn that would land on a weak hit is not offered", async () => {
    const card = await maneuver(WEAK_WITH_ADD, { momentum: 7 });      // 7 vs 5, 9: a weak hit — still a miss
    expect(lastMove()).toMatchObject({ outcome: "miss" });
    expect(card.content).not.toMatch(/sf-burn-momentum/);
  }, 30_000);

  it("a burn to a strong hit is, and a card pressed after the momentum fell does not burn to a weak hit", async () => {
    const card = await maneuver(WEAK_WITH_ADD, { momentum: 10 });
    expect(card.content).toMatch(/Burn Momentum \(10 → Strong Hit\)/);
    pc.system.momentum.value = 7;                                      // a sheet edit before the press
    await player().click(card._id, '[data-action="sf-burn-momentum"]');
    await table.settle(); await table.drain();
    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed ?? false).toBe(false);
    expect(lastMove()).toMatchObject({ outcome: "miss" });
  }, 30_000);

  it("control: a strong hit with the add stays a strong hit", async () => {
    const card = await maneuver(STRONG_WITH_ADD);
    expect(lastMove()).toMatchObject({ outcome: "strong_hit" });
    expect(effect(card)).not.toMatch(/counted as a miss/);
  }, 30_000);

  it("control: unchecked, the add is not taken and a weak hit stays a weak hit", async () => {
    control.uncheck = true;
    const card = await maneuver(WEAK_WITHOUT);
    expect(lastMove()).toMatchObject({ outcome: "weak_hit" });
    expect(effect(card)).not.toMatch(/counted as a miss/);
  }, 30_000);

  it("control: an add with no such cost (the Shuttle's +1) leaves a weak hit a weak hit", async () => {
    // die 3 → 3+2+1 = 6: a weak hit against 5 and 9.
    const card = await maneuver(WEAK_WITH_ADD, { asset: vehicleAsset("Shuttle", [SHUTTLE], { enabled: true, name: "Integrity", value: 4, max: 4, min: 0 }) });
    expect(lastMove()).toMatchObject({ outcome: "weak_hit" });
    expect(effect(card)).not.toMatch(/counted as a miss/);
  }, 30_000);
});
