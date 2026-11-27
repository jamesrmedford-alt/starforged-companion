/**
 * STARFORGED COMPANION
 * tests/unit/rerouteToldForATypedLine.test.js
 *
 * Issue #397, Code fix 2. In the eighth live round the player typed "I Strike
 * at the cutter, firing from the berth." in a bad spot, and the table rolled
 * Clash with no word why (r8 transcript L567, L571). The move card's line
 * "↪ Strike becomes Clash: the character is in a bad spot." printed only when
 * the move pipeline's own gate made the swap; a typed line is swapped earlier
 * — by the reader's position remap, by the router's gate, or by the reader
 * model's own pick — and reached the pipeline already a Clash.
 *
 * On a booted GM / player table, the typed line goes through the real reader
 * and router; only the model's reply is stubbed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [] }));
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
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const LINE = "I Strike at the cutter, firing from the berth.";
const isLineReader = (call) => /^You are the line reader\b/.test(call?.system ?? "");
const reading = (over) => JSON.stringify({
  move: null, asked: false, risk: "high", category: "combat", confidence: "high", reason: "an attack on the cutter", target: "the cutter",
  sceneChallenge: null, stat: "iron", healSituation: null, expeditionRank: null, combatRank: null,
  stakes: { hit: "Your shot finds the cutter's flank.", miss: "Her guns find you first.", missSuffer: { move: "endure_harm", amount: 1 } },
  mischiefApplied: false, plainMove: null, ...over,
});

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}
const fight = (position) => ({
  id: "fight-1", label: "the raider cutter", type: "combat", rank: "dangerous", ticks: 8, completed: false,
  combatState: position, positions: { "pc-mira": position },
});

let table;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

async function seat(position) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "rr-s1", sessionNumber: 1,
      currentSceneId: "rr-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  table.addActor({ id: "pc-mira", name: "Mira Kestrel", ownership: { "pl-1": 3 } });
  table.journal._set(makeTracksJournal([fight(position)]));
  control.dice = [0.15, 0.25, 0.99];   // challenge 2 and 3, action 6: a strong hit
}

/** Mira types the line; the reader's reply names `move`. Its move card. */
async function typed(move) {
  scriptClaude(table, { fallback: () => 'Steel rings.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' })
    .when(isLineReader, reading({ move }));
  await table.client("pl-1").chat(LINE, { speaker: { actor: "pc-mira" } });
  for (let i = 0; i < 3; i += 1) { await table.settle(); await table.drain(); }
  return table.world.messages().filter(m => m.flags?.[MODULE_ID]?.moveResolution || /sf-move-card|sf-move-effect/.test(m.content ?? ""));
}

describe("a typed line made as another move says why on its card", () => {
  beforeEach(() => vi.clearAllMocks());

  it("in a bad spot, a reply that names Strike: the card says it became Clash, and why", async () => {
    await seat("bad_spot");
    await typed("strike");
    const card = table.world.messages().find(m => /Clash/.test(m.content ?? "") && /sf-move/.test(m.content ?? ""));
    expect(card, "a Clash was rolled").toBeTruthy();
    expect(card.content).toContain("↪ Strike becomes Clash: the character is in a bad spot.");
  }, 60_000);

  it("in a bad spot, a reply that names Clash for a line that names Strike: the same line", async () => {
    await seat("bad_spot");
    await typed("clash");
    const card = table.world.messages().find(m => /Clash/.test(m.content ?? "") && /sf-move/.test(m.content ?? ""));
    expect(card, "a Clash was rolled").toBeTruthy();
    expect(card.content).toContain("↪ Strike becomes Clash: the character is in a bad spot.");
  }, 60_000);

  it("in control, a Strike is a Strike: no line", async () => {
    await seat("in_control");
    await typed("strike");
    const card = table.world.messages().find(m => /Strike/.test(m.content ?? "") && /sf-move/.test(m.content ?? ""));
    expect(card, "a Strike was rolled").toBeTruthy();
    expect(table.world.messages().some(m => /↪/.test(m.content ?? ""))).toBe(false);
  }, 60_000);
});
