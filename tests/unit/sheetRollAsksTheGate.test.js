/**
 * STARFORGED COMPANION
 * tests/unit/sheetRollAsksTheGate.test.js
 *
 * Overhaul 4, "moves as contracts" (design §6.2): a vow's or a bond's
 * progress roll made on the system's own sheet has happened — the module's
 * payoff for it (index.js registerNativeFulfilConsequenceHook →
 * payNativeProgressRoll) asks the move gate first. A Forge a Bond on a bond
 * the sheet holds forged already, a Fulfill Your Vow with no open vow, pays
 * nothing, and the GMs are whispered why (it was a debug line). On the
 * multi-client harness: the canonical GM pays, once.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, vow, bondItem;
const notices = () => table.cards(f => f.cannotMake);
const sheet   = (actorId) => table.actors.get(actorId);

/** The vendor's progress-roll card: JSON HTML-escaped inside a single-quoted attribute. */
function nativeProgressCard({ source, value, dice }) {
  const roll = { preRollOptions: { progress: { source, value }, actorId: "pc-kira" }, rawChallengeDiceValues: dice };
  const json = JSON.stringify(roll).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  return `<article class='ironsworn-roll' data-ironswornroll='${json}'><h3>Progress Roll: ${source}</h3></article>`;
}

/** Kira's player rolls `source` on the sheet. */
async function rollOnSheet(source, { value, dice }) {
  await table.client("pl-1").run(() => globalThis.ChatMessage.create({
    content: nativeProgressCard({ source, value, dice }),
    speaker: { actor: "pc-kira", alias: "Kira" },
    rolls:   [{ formula: "{d10,d10}", total: 0 }],
  }));
  await table.settle(); await table.drain();
}

function progressItem(id, name, subtype, current, itemFlags = {}) {
  const item = {
    id, type: "progress", name, flags: itemFlags,
    system: { subtype, rank: "dangerous", current, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        const parts = k.split("."); let t = item;
        for (const p of parts.slice(0, -1)) t = (t[p] ??= {});
        t[parts.at(-1)] = v;
      }
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "sg-s1", sessionNumber: 1,
      currentSceneId: "sg-scene", sceneTruths: [], clocks: [], connectionIds: ["npc-sable"] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  vow      = progressItem("vow-kira", "Find Chen", "vow", 32, { [MODULE_ID]: { vowId: "vow-kira" } });
  bondItem = progressItem("bond-sable", "Sable", "bond", 32, { [MODULE_ID]: { connectionId: "conn-sable" } });
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, hasPlayerOwner: true,
    system: { momentum: { value: 0 } }, items: { contents: [vow, bondItem] } });
  table.addActor({ id: "npc-sable", name: "Sable", type: "character", flags: { [MODULE_ID]: {
    entityType: "connection", connection: {
      _id: "conn-sable", name: "Sable", rank: "dangerous", relationshipTicks: 32, bonded: false, active: true, history: [],
    } } } });
  scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe("a progress roll on the sheet: its payoff asks the move gate", () => {
  it("control: a Forge a Bond hit on a bond not yet forged forges it", async () => {
    await rollOnSheet("Sable", { value: 8, dice: [1, 2] });
    expect(sheet("npc-sable").flags[MODULE_ID].connection.bonded).toBe(true);
    expect(notices()).toEqual([]);
  }, 30_000);

  it("a Forge a Bond on a bond the sheet holds forged already: no payoff, the GMs told why", async () => {
    bondItem.system.completed = true;
    await rollOnSheet("Sable", { value: 8, dice: [1, 2] });
    expect(sheet("npc-sable").flags[MODULE_ID].connection.bonded).toBe(false);
    expect(notices()).toHaveLength(1);
    const [notice] = notices();
    expect(notice.flags[MODULE_ID].cannotMake).toMatchObject({ moveId: "forge_a_bond", code: "not-bonded", hard: true });
    expect(notice.content).toContain("No payoff");
    expect(notice.whisper).toEqual(["gm-1"]);
  }, 30_000);

  it("a Fulfill Your Vow with no open vow anywhere: no payoff, the GMs told why", async () => {
    vow.system.completed = true;
    await rollOnSheet("Find Chen", { value: 8, dice: [1, 2] });
    const told = notices();
    expect(told).toHaveLength(1);
    expect(told[0].flags[MODULE_ID].cannotMake).toMatchObject({ moveId: "fulfill_your_vow", code: "open-vow" });
    expect(vow.flags[MODULE_ID].fulfilPaid).toBeUndefined();
  }, 30_000);
});
