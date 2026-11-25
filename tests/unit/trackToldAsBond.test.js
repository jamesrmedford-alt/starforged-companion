/**
 * STARFORGED COMPANION
 * tests/unit/trackToldAsBond.test.js
 *
 * TRACK-TOLD-AS-A-BOND (the long haul's fourth live run, issue #383): with
 * no bond forged, three recaps said "that bond", `@scene` answered "bonded"
 * (a56, a78, a83) and "recorded as dangerous" (a78) — Tamsin's relationship
 * track was full, and no Forge a Bond had been rolled. Overhaul 4, slice 2:
 * one wording for the readers, the narrator and the recap — the situation's
 * (moves/situation.js connectionStanding: "relationship 10 of 10 boxes —
 * full, no bond forged yet", "bonded", "lost — no longer a connection") —
 * and a narration whose beat touches such a connection carries NOT SO
 * [state] in its obligations block. An NPC card no PC holds a bond Item for
 * is a person met, never "a connection" (FOLDER-002).
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { connectionStanding, readMoveSituation } from "../../src/moves/situation.js";
import { obligationsFor, formatObligationsBlock } from "../../src/moves/contracts/obligations.js";
import { buildNarratorSystemPrompt, buildPacedNarrativeUserMessage, buildNarratorUserMessage } from "../../src/narration/narratorPrompt.js";
import { readCharacterSnapshot } from "../../src/character/actorBridge.js";
import { standingLines } from "../../src/record/recapView.js";
import { addConnectionEntity, bondItemFor } from "../helpers/fullStateFixture.js";

const MODULE_ID = "starforged-companion";

let saved;
beforeEach(() => {
  game.actors._reset();
  saved = { journal: game.journal, messages: game.messages };
  game.messages = { contents: [], get: () => null };
});
afterEach(() => {
  game.journal = saved.journal;
  game.messages = saved.messages;
  game.actors._reset();
});

/** Mira, holding Tamsin's bond Item — full, unbonded — and Juro's, partway. */
function mira() {
  const tamsin = addConnectionEntity(null, { name: "Tamsin Vey", role: "quartermaster" });
  const juro = addConnectionEntity(null, { name: "Juro" });
  const ilse = addConnectionEntity(null, { name: "Ilse Marr", role: "a voice over the hatch" });
  const pc = makeTestActor({ id: "pc-mira", name: "Mira Kestrel", type: "character", hasPlayerOwner: true, items: { contents: [
    bondItemFor({ _id: tamsin.internalId, name: "Tamsin Vey", relationshipTicks: 40 }),
    bondItemFor({ _id: juro.internalId, name: "Juro", relationshipTicks: 12 }),
  ] } });
  game.actors._set(pc.id, pc);
  return { pc, tamsin, juro, campaignState: { currentSessionId: "s-1", connectionIds: [tamsin.journalId, juro.journalId, ilse.journalId] } };
}

describe("one wording for a connection's standing", () => {
  it("the situation's words: a full track is no bond", () => {
    expect(connectionStanding({ ticks: 40 })).toBe("relationship 10 of 10 boxes — full, no bond forged yet");
    expect(connectionStanding({ ticks: 12 })).toBe("relationship 3 of 10 boxes");
    expect(connectionStanding({ ticks: 40, completed: true })).toBe("bonded");
    expect(connectionStanding({ ticks: 40, bonded: true })).toBe("bonded");
    expect(connectionStanding({ ticks: 8, lost: true })).toBe("lost — no longer a connection");
    expect(connectionStanding({ progress: 4 })).toBe("relationship 4 of 10 boxes");
  });

  it("the narrator's CHARACTER block says it in those words — never 'progress 10/10' beside a bond", () => {
    const { pc } = mira();
    const prompt = buildNarratorSystemPrompt({ safety: { lines: [], veils: [], privateLines: [] }, worldTruths: {}, connectionIds: [] },
      { narrationTone: "wry", narrationLength: 3, narrationInstructions: "" }, readCharacterSnapshot(pc), "", { mode: "paced_narrative" });
    expect(prompt).toContain("Connections: Tamsin Vey (dangerous, relationship 10 of 10 boxes — full, no bond forged yet); Juro (dangerous, relationship 3 of 10 boxes)");
  });

  it("the recap's WHERE THINGS STAND: each PC's connections in the sheet's words, the other cards as people met", async () => {
    const { campaignState } = mira();
    const lines = await standingLines(campaignState);
    expect(lines).toContain("Tamsin Vey — Mira Kestrel's connection (dangerous), relationship 10 of 10 boxes — full, no bond forged yet.");
    expect(lines).toContain("Juro — Mira Kestrel's connection (dangerous), relationship 3 of 10 boxes.");
    expect(lines).toContain("Ilse Marr — a person met (a voice over the hatch); no one's connection.");
    expect(lines.join("\n")).not.toMatch(/Ilse Marr — a connection/);
  });
});

describe("a beat that touches the connection is told what is not so ([state])", () => {
  it("a paced line naming Tamsin: NOT SO [state] — her connection, not a bond", async () => {
    const { pc } = mira();
    const situation = await readMoveSituation(pc, { campaignState: {} });
    const user = buildPacedNarrativeUserMessage("I sit with Tamsin and talk through the night.", "", 3, null, "Mira Kestrel", { situation });
    expect(user).toContain("- [state] Tamsin Vey is Mira Kestrel's connection, not a bond: their relationship is full and no bond is forged.");
    expect(user).not.toContain("[state] Juro");                 // not touched by the line
  });

  it("a move's narration with Tamsin in the scene's cast carries it too; one with neither named does not", async () => {
    const { pc } = mira();
    const situation = await readMoveSituation(pc, { campaignState: {} });
    const resolution = { moveId: "face_danger", outcome: "strong_hit", loremasterContext: "[MOVE: Face Danger +edge] [OUTCOME: Strong Hit]" };
    expect(buildNarratorUserMessage(resolution, "I hold the hatch.", 3, "Mira Kestrel", "", { situation, cast: ["Tamsin Vey"] }))
      .toContain("- [state] Tamsin Vey is Mira Kestrel's connection, not a bond");
    expect(buildNarratorUserMessage(resolution, "I hold the hatch.", 3, "Mira Kestrel", "", { situation, cast: [] }))
      .not.toContain("[state]");
  });

  it("a lost connection named is no connection; a fighting line with no fight is no fight", async () => {
    const tamsin = addConnectionEntity(null, { name: "Tamsin Vey" });
    const pc = makeTestActor({ id: "pc-mira", name: "Mira Kestrel", type: "character", hasPlayerOwner: true, items: { contents: [
      bondItemFor({ _id: tamsin.internalId, name: "Tamsin Vey", relationshipTicks: 8 }, { lost: true }),
    ] } });
    game.actors._set(pc.id, pc);
    const situation = await readMoveSituation(pc, { campaignState: {} });
    const list = obligationsFor({ mode: "paced", line: "I shout for Tamsin and open fire on the drones.", situation: { ...situation, tracks: { fights: [] } } });
    const block = formatObligationsBlock(list);
    expect(block).toContain("- [state] Tamsin Vey is no longer Mira Kestrel's connection: the bond was severed.");
    expect(block).toContain("- [state] No fight is under way.");
  });
});
