/**
 * Issue #331 X62 — a Fulfill Your Vow or Forge a Bond missed on the sheet
 * offers 🔁 Recommit, as the move pipeline's miss does (issue #330 D1).
 *
 * Only the pipeline posted the offer. The sheet roll's consequence hook acted
 * on hits only (`shouldPayFulfilledVow` and `shouldForgeBond` both require a
 * strong or weak hit), so after a sheet miss the player recommitted by hand:
 * the boxes cleared and the rank raised on every copy of the vow, or on the
 * connection's record and its bond Items. The canonical GM's hook now posts
 * the same offer — for the roller's vow Item, or for the connection
 * `findSheetBondConnection` resolves. A bond made by hand resolves to none,
 * so it gets no offer.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, vow, vowCopy, bondItem, handBond;
const flags  = (id) => table.world.message(id).flags[MODULE_ID];
const offers = (flag) => table.cards(f => f[flag]);
const sheet  = (actorId) => table.actors.get(actorId);

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
    rolls:   [{ formula: "{d10,d10}", total: 0 }],    // the vendor attaches its Roll: no move pipeline
  }));
  await table.settle(); await table.drain();
}

/** Press `selector` on `card` as Kira's player, with the recommit's d10s scripted. */
async function recommit(card, selector, dice) {
  const rng = vi.spyOn(Math, "random");
  for (const v of dice) rng.mockReturnValueOnce(v);
  try {
    await table.client("pl-1").click(card._id, selector);
    await table.settle(); await table.drain();
  } finally { rng.mockRestore(); }
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
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "sm-s1", sessionNumber: 1,
      currentSceneId: "sm-scene", sceneTruths: [], clocks: [], connectionIds: ["npc-sable"] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  vow      = progressItem("vow-kira", "Find Chen", "vow", 12, { [MODULE_ID]: { vowId: "vow-shared" } });
  vowCopy  = progressItem("vow-orin", "Find Chen", "vow", 12, { [MODULE_ID]: { vowId: "vow-shared" } });
  bondItem = progressItem("bond-sable", "Sable", "bond", 8, { [MODULE_ID]: { connectionId: "conn-sable" } });
  handBond = progressItem("bond-mentor", "Old Mentor", "bond", 8);
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, hasPlayerOwner: true,
    system: { momentum: { value: 0 } }, items: { contents: [vow, bondItem, handBond] } });
  table.addActor({ id: "pc-orin", name: "Orin", ownership: {}, system: {}, items: { contents: [vowCopy] } });
  table.addActor({ id: "npc-sable", name: "Sable", type: "character", flags: { [MODULE_ID]: {
    entityType: "connection", connection: {
      _id: "conn-sable", name: "Sable", rank: "dangerous", relationshipTicks: 8, bonded: false, active: true, history: [],
    } } } });
  scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe("issue #331 X62 — a Fulfill Your Vow missed on the sheet offers 🔁 Recommit to the Vow", () => {
  it("the miss posts the offer for the roller's vow; a press recommits every copy once", async () => {
    await rollOnSheet("Find Chen", { value: 3, dice: [5, 7] });   // 3 boxes against 5 and 7 — a miss
    const [offer] = offers("vowRecommitOfferCard");
    expect(offer).toBeTruthy();
    expect(offers("vowRecommitOfferCard")).toHaveLength(1);       // one emitter: the canonical GM
    expect(flags(offer._id)).toMatchObject({ vowName: "Find Chen", itemId: "vow-kira", actorId: "pc-kira" });

    await recommit(offer, '[data-action="sf-vow-recommit"]', [0.15, 0.55]);   // d10s 2 and 6 → lowest 2
    expect(vow.system).toMatchObject({ current: 4, rank: "formidable" });
    expect(vowCopy.system).toMatchObject({ current: 4, rank: "formidable" });
    expect(flags(offer._id).recommitted).toBe(true);
  }, 30_000);

  it("control: a hit on the sheet posts no offer", async () => {
    await rollOnSheet("Find Chen", { value: 3, dice: [1, 2] });   // a strong hit
    expect(offers("vowRecommitOfferCard")).toHaveLength(0);
  }, 30_000);
});

describe("issue #331 X62 — a Forge a Bond missed on the sheet offers 🔁 Recommit to the Bond", () => {
  it("the miss posts the offer for the connection its Item names; a press mirrors the record to the bond Item", async () => {
    await rollOnSheet("Sable", { value: 2, dice: [5, 7] });
    const [offer] = offers("bondRecommitOfferCard");
    expect(offer).toBeTruthy();
    expect(flags(offer._id)).toMatchObject({ hostId: "npc-sable", actorId: "pc-kira" });

    await recommit(offer, '[data-action="sf-bond-recommit"]', [0.05, 0.75]);   // 1 and 8 → lowest 1
    expect(sheet("npc-sable").flags[MODULE_ID].connection).toMatchObject({ relationshipTicks: 4, rank: "formidable", bonded: false });
    expect(bondItem.system).toMatchObject({ current: 4, rank: "formidable" });
  }, 30_000);

  it("a bond made by hand on the sheet — no module connection — gets no offer", async () => {
    await rollOnSheet("Old Mentor", { value: 2, dice: [5, 7] });
    expect(offers("bondRecommitOfferCard")).toHaveLength(0);
  }, 30_000);

  it("a connection already bonded gets no offer", async () => {
    sheet("npc-sable").flags[MODULE_ID].connection.bonded = true;
    await rollOnSheet("Sable", { value: 2, dice: [5, 7] });
    expect(offers("bondRecommitOfferCard")).toHaveLength(0);
  }, 30_000);
});
