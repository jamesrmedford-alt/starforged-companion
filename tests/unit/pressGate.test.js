/**
 * STARFORGED COMPANION
 * tests/unit/pressGate.test.js
 *
 * Overhaul 4, "moves as contracts" — the moves a button makes (design §6.2):
 * a won fight's ⚑ / 🤝, a "Which vow?" pick, a vow or a bond rolled on the
 * system's sheet, `!bond`. Each asks the gate (contracts/pressGate.js
 * gatePress → gate.js checkMove at the roll stage) before its effect; a
 * refusal changes nothing and is told — on a press to the presser and the GMs
 * (gmRelay refusePress "cannot", carrying the refusal's one line), for a roll
 * on the sheet or a typed command to the GMs (and its author). A GM's press
 * is the GM's word over a soft precondition, never a hard one (D2).
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const refused = [];
vi.mock("../../src/multiplayer/gmRelay.js", async (importOriginal) => ({
  ...(await importOriginal()),
  refusePress: vi.fn((ctx, reason, actor, extra) => { refused.push({ reason, name: actor?.name ?? null, ...extra }); }),
}));

import { gatePress } from "../../src/moves/contracts/pressGate.js";

const MODULE_ID = "starforged-companion";

const bond = (id, name, connectionId, { ticks = 8, completed = false } = {}) => ({
  id, name, type: "progress", system: { subtype: "bond", rank: 2, progress: ticks, completed },
  flags: { [MODULE_ID]: { connectionId } },
});

let saved;
beforeEach(() => {
  refused.length = 0;
  game.actors._reset();
  saved = { messages: game.messages, users: game.users };
  game.messages = { contents: [], get: () => null };
  game.users = Object.assign([{ id: "gm-1", isGM: true }, { id: "pl-1", isGM: false }], { get: () => null });
  globalThis.ChatMessage = { create: vi.fn(async (data) => data) };
});
afterEach(() => { game.messages = saved.messages; game.users = saved.users; });

function mira(items = []) {
  const pc = makeTestActor({ id: "pc-mira", name: "Mira Kestrel", type: "character", hasPlayerOwner: true, items: { contents: items } });
  game.actors._set(pc.id, pc);
  return pc;
}

describe("a button's move asks the gate before its effect", () => {
  it("a won fight's 🤝 with someone who is no connection of the roller's: refused, the presser told why", async () => {
    mira([bond("b1", "Juro", "rec-juro")]);
    const gate = await gatePress("develop_your_relationship", { actorId: "pc-mira", reading: { target: "Sable" }, ctx: { requesterIsGM: false } });
    expect(gate).toMatchObject({ ok: false, refusal: { code: "their-connection", hard: true } });
    expect(refused).toEqual([expect.objectContaining({ reason: "cannot", note: "No Develop Your Relationship — Sable is not Mira Kestrel's connection." })]);
  });

  it("the roller's own connection: made", async () => {
    mira([bond("b1", "Juro", "rec-juro")]);
    expect(await gatePress("develop_your_relationship", { actorId: "pc-mira", reading: { target: "Juro" }, ctx: { requesterIsGM: false } }))
      .toMatchObject({ ok: true });
    expect(refused).toEqual([]);
  });

  it("a soft refusal (a full relationship track): a player's press is refused, a GM's press is the GM's word", async () => {
    mira([bond("b1", "Juro", "rec-juro", { ticks: 40 })]);
    expect(await gatePress("develop_your_relationship", { actorId: "pc-mira", reading: { target: "Juro" }, ctx: { requesterIsGM: false } }))
      .toMatchObject({ ok: false, refusal: { code: "room-on-relationship", hard: false } });
    expect(await gatePress("develop_your_relationship", { actorId: "pc-mira", reading: { target: "Juro" }, ctx: { requesterIsGM: true } }))
      .toMatchObject({ ok: true, note: expect.stringMatching(/^rolled at the GM's word: /) });
  });

  it("a hard refusal is never the GM's to pass", async () => {
    mira([]);
    expect(await gatePress("develop_your_relationship", { actorId: "pc-mira", reading: { target: "Sable" }, ctx: { requesterIsGM: true } }))
      .toMatchObject({ ok: false, refusal: { hard: true } });
  });

  it("a roll on the system's sheet (a forge of a bond already forged): no payoff, the GMs told — no presser to refuse", async () => {
    mira([bond("b1", "Juro", "rec-juro", { ticks: 40, completed: true })]);
    const gate = await gatePress("forge_a_bond", { actorId: "pc-mira", reading: { target: "Juro" }, sheetRoll: true });
    expect(gate).toMatchObject({ ok: false, refusal: { code: "not-bonded" } });
    expect(refused).toEqual([]);
    const [notice] = ChatMessage.create.mock.calls.map(c => c[0]);
    expect(notice.content).toMatch(/<strong>No payoff<\/strong><p>No Forge a Bond — Juro is already bonded — there is no bond to forge\. The roll on the sheet stands/);
    expect(notice.whisper).toEqual(["gm-1"]);
    expect(notice.flags[MODULE_ID].cannotMake).toMatchObject({ moveId: "forge_a_bond", code: "not-bonded", hard: true });
  });

  it("a typed `!bond` (no press): its author and the GMs are told", async () => {
    mira([]);
    await gatePress("develop_your_relationship", { actorId: "pc-mira", reading: { target: "Sable" }, alsoTell: ["pl-1"] });
    const [notice] = ChatMessage.create.mock.calls.map(c => c[0]);
    expect(notice.content).toMatch(/<strong>Not rolled<\/strong>.*Nothing was rolled\./);
    expect(notice.whisper.sort()).toEqual(["gm-1", "pl-1"]);
  });
});
