/**
 * PROBE — UI-05 PROMOTE-RACE-DROPS-CAPTURE (tenth audit, area ui; RACE —
 * family 2, a whole-record write built before an await; the X12 change put
 * an `await document.update(...)` between the record read and its write)
 *
 * What the user does: a player (or the GM) presses ⤴ Promote on a narrator-
 * added detail of an NPC card in the Entities panel while the narrator's
 * detection pass — the capture that runs after each narration on the
 * canonical GM — is appending a new detail to the same NPC's record.
 *
 * What happens: `applyEntityEditFromRelay` (src/ui/entityPanel.js:1285-1337)
 * reads the record (`data`), then for an NPC card or a ship — the types whose
 * notes are the sheet's Notes tab (issue #329 X12) — awaits
 * `document.update({ "system.notes": … })` and only then writes the whole
 * record it built from the pre-await `data` (`writeEntityFlag(typeKey,
 * document, { ...next })`). A capture's write that lands during that await
 * is overwritten: the new detail the narrator just established is gone from
 * the record and never reaches the narrator's entity card. The function's
 * own contract says "Each edit reads the record and writes it with no await
 * in between" — true for lock / pin / remove and for a journal-hosted
 * promote, no longer for the sheet-notes promote.
 *
 * What should happen: the record is re-read after the notes write (or the
 * notes and the flag are written in one update), so a concurrent change to
 * the tier survives — as every other op keeps the read-write gap closed.
 *
 * Controls: the promote appends the detail to the sheet's Notes and marks it
 * promoted; a pin (no await between read and write) cannot lose a capture.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/ui/promoteRaceDropsCapture.probe.js
 */

/* global makeTestActor */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";

const MODULE_ID = "starforged-companion";

let applyEntityEditFromRelay;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  ({ applyEntityEditFromRelay } = await import("../../../src/ui/entityPanel.js"));
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

describe("UI-05 a sheet-notes promote keeps a detail the capture adds meanwhile", () => {
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
    // Expected: three entries — the captured one kept. Today: the write built before the await drops it.
    expect(record().generativeTier.map(e => e.detail)).toContain("Hums old mining songs");
    expect.soft(record().generativeTier.find(e => e.detail === "Owes the Syndicate").promoted).toBe(true);
  });

  it("control: a pin reads and writes with no await between, so nothing can land in between", async () => {
    const res = await applyEntityEditFromRelay({ op: "pin", entityId: "npc-vex", detail: "Owes the Syndicate" });
    expect(res).toEqual({ applied: true });
    expect(record().generativeTier.find(e => e.detail === "Owes the Syndicate").pinned).toBe(true);
    expect(record().generativeTier).toHaveLength(2);
  });
});
