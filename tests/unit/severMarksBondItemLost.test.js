/**
 * Issue #330 D10 — `!sever` writes the loss through to the bond Items.
 *
 * `!sever Vex` marked the record lost (`active: false`, a history entry) —
 * the roster (W37) and the end vignette (U61) follow it — but the PC's bond
 * Item, the record's write-through mirror for ticks and rank, was untouched:
 * CHARACTER STATE (`readConnections`) kept listing "Vex (dangerous, 3/10)"
 * as a live bond. Decided (option A with B's reader change): loseConnection
 * marks the bond Items lost with a module flag (not the vendor's
 * `completed`, which the sheet shows as a forged bond), and readConnections
 * and CHARACTER STATE report it as lost.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ConnectionSchema } from "../../src/schemas.js";
import { loseConnection, getConnection } from "../../src/entities/connection.js";
import { createCharacterBondItem, readConnections } from "../../src/character/actorBridge.js";
import { buildNarratorSystemPrompt } from "../../src/narration/narratorPrompt.js";

const MODULE_ID = "starforged-companion";

/** A bond Item the test stub can update, as Foundry's can (dotted paths). */
async function bondItem(actor, data) {
  const item = await createCharacterBondItem(actor, data);
  item.update = async (changes) => {
    for (const [path, val] of Object.entries(changes)) {
      const parts = path.split(".");
      let target = item;
      for (const p of parts.slice(0, -1)) target = (target[p] ??= {});
      target[parts.at(-1)] = val;
    }
    return item;
  };
  return item;
}

function setup() {
  const pc = global.makeTestActor({ id: "pc-kira", type: "character", name: "Kira" });
  const pc2 = global.makeTestActor({ id: "pc-orin", type: "character", name: "Orin" });
  const conn = (id, name) => global.makeTestActor({
    id, type: "character", name,
    flags: { [MODULE_ID]: { entityType: "connection", entityId: `conn-${name.toLowerCase()}`, connection: {
      ...ConnectionSchema, _id: `conn-${name.toLowerCase()}`, name, rank: "dangerous", bonded: true, active: true,
      relationshipTicks: 12, history: [],
    } } },
  });
  const vex = conn("npc-vex", "Vex");
  const sable = conn("npc-sable", "Sable");
  for (const a of [pc, pc2, vex, sable]) global.game.actors._set(a.id, a);
  return { pc, pc2, vex, sable };
}

beforeEach(() => {
  global.game.actors._reset();
  global.game.settings._store.clear();
  global.game.settings._store.set(`${MODULE_ID}.campaignState`, { connectionIds: ["npc-vex", "npc-sable"] });
});

describe("issue #330 D10 — a severed connection is no longer a live bond on the PCs", () => {
  it("after !sever, every PC's bond to Vex reads lost — and Sable's does not", async () => {
    const { pc, pc2, vex } = setup();
    await bondItem(pc,  { name: "Vex",   rank: "dangerous", connectionId: "conn-vex" });
    await bondItem(pc2, { name: "Vex",   rank: "dangerous", connectionId: "conn-vex" });
    await bondItem(pc,  { name: "Sable", rank: "dangerous", connectionId: "conn-sable" });

    await loseConnection(vex.id, "she betrayed the crew at Bleakhold", "sess-1");

    const record = getConnection(vex.id);
    expect(record.active).toBe(false);
    expect(record.history.at(-1)?.entry).toMatch(/Connection lost/);

    for (const actor of [pc, pc2]) {
      const live = readConnections(actor).filter(b => b.name === "Vex" && !b.completed && !b.lost);
      expect(live, actor.name).toHaveLength(0);
    }
    const sable = readConnections(pc).find(b => b.name === "Sable");
    expect(sable).toMatchObject({ lost: false });
  });

  it("the loss is a module flag, never the vendor's completed (a forged bond on the sheet)", async () => {
    const { pc, vex } = setup();
    const item = await bondItem(pc, { name: "Vex", rank: "dangerous", connectionId: "conn-vex" });
    await loseConnection(vex.id, "gone", "sess-1");
    expect(item.flags?.[MODULE_ID]?.lost).toBe(true);
    expect(item.system?.completed ?? false).toBe(false);
  });

  it("CHARACTER STATE lists a severed bond apart, not among the character's connections", () => {
    const prompt = buildNarratorSystemPrompt({ safety: { lines: [], veils: [] } }, {}, {
      name: "Kira",
      connections: [
        { name: "Sable", rank: "dangerous", progress: 3, completed: false, lost: false },
        { name: "Vex",   rank: "dangerous", progress: 3, completed: false, lost: true },
      ],
    });
    const connLine = prompt.split("\n").find(l => l.startsWith("Connections:")) ?? "";
    expect(connLine).toContain("Sable");
    expect(connLine).not.toContain("Vex");
    expect(prompt).toMatch(/Connections lost \(severed — no longer a bond\): Vex/);
  });
});
