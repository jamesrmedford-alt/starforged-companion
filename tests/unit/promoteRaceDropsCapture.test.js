/**
 * STARFORGED COMPANION
 * tests/unit/promoteRaceDropsCapture.test.js
 *
 * Issue #337 Y35 (PROMOTE-RACE-DROPS-CAPTURE) — a sheet-notes Promote keeps a
 * detail the narrator's capture adds meanwhile.
 *
 * applyEntityEditFromRelay read the record, then for an NPC card or a ship
 * (their notes are the sheet's Notes tab, issue #329 X12) awaited the
 * `system.notes` update before writing the whole record it had built from
 * the pre-await read: a tier detail the canonical GM's capture appended
 * during that await was overwritten. It now re-reads the record after the
 * Notes write (rules/reachability.md §9 — no snapshot written back across an
 * await).
 */

/* global makeTestActor */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

const MODULE_ID = "starforged-companion";

let applyEntityEditFromRelay;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  ({ applyEntityEditFromRelay } = await import("../../src/ui/entityPanel.js"));
});

const vexRecord = () => ({
  _id: "rec-vex", name: "Vex", canonicalLocked: false,
  generativeTier: [
    { detail: "Has a scar over one eye", pinned: false },
    { detail: "Owes the Syndicate", pinned: false },
  ],
});

let npc;

beforeEach(() => {
  game.actors._reset();
  npc = makeTestActor({
    id: "npc-vex", type: "character", name: "Vex",
    system: { notes: "<p>A smuggler.</p>" },
    flags: { [MODULE_ID]: { entityType: "connection", connection: vexRecord() } },
  });
  game.actors._set(npc.id, npc);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { connectionIds: ["npc-vex"] });
});

afterEach(() => {
  game.actors._reset();
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

const record = () => npc.getFlag(MODULE_ID, "connection");
const CAPTURED = { detail: "Hums old mining songs", pinned: false, sessionNum: 2 };

/** The detection pass lands a new detail on the record while `update` is in flight. */
function captureDuringNotesUpdate() {
  const realUpdate = npc.update;
  npc.update = async (changes) => {
    await npc.setFlag(MODULE_ID, "connection", { ...record(), generativeTier: [...record().generativeTier, CAPTURED] });
    return realUpdate(changes);
  };
}

describe("issue #337 Y35 — a sheet-notes promote keeps a detail the capture adds meanwhile", () => {
  it("control: promote appends the detail to the Notes tab and marks it promoted", async () => {
    const res = await applyEntityEditFromRelay({ op: "promote", entityId: "npc-vex", detail: "Owes the Syndicate" });
    expect(res).toEqual({ applied: true });
    expect(npc.system.notes).toContain("<p>Owes the Syndicate</p>");
    expect(record().generativeTier.find(e => e.detail === "Owes the Syndicate").promoted).toBe(true);
  });

  it("a detail the narrator's capture adds during the notes write survives the promote", async () => {
    captureDuringNotesUpdate();
    const res = await applyEntityEditFromRelay({ op: "promote", entityId: "npc-vex", detail: "Owes the Syndicate" });
    expect(res).toEqual({ applied: true });
    expect(npc.system.notes).toContain("<p>Owes the Syndicate</p>");
    // Three entries — the captured one kept, the promoted one marked.
    expect(record().generativeTier.map(e => e.detail)).toEqual(["Has a scar over one eye", "Owes the Syndicate", "Hums old mining songs"]);
    expect(record().generativeTier.find(e => e.detail === "Owes the Syndicate").promoted).toBe(true);
  });

  it("control: a pin reads and writes with no await between, so nothing can land in between", async () => {
    const res = await applyEntityEditFromRelay({ op: "pin", entityId: "npc-vex", detail: "Owes the Syndicate" });
    expect(res).toEqual({ applied: true });
    expect(record().generativeTier.find(e => e.detail === "Owes the Syndicate").pinned).toBe(true);
    expect(record().generativeTier).toHaveLength(2);
  });
});
