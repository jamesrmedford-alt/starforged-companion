/**
 * STARFORGED COMPANION
 * tests/unit/vignettePronouns.test.js
 *
 * Pronoun propagation into session vignettes (finding R and its begin-session
 * sibling). The session_vignette narrator mode injects no entity cards, so the
 * NPC/PC pronouns must travel in the user-message hint or they are lost and the
 * narrator misgenders the character.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// End-session vignette — NPC connection pronouns (finding R)
// ---------------------------------------------------------------------------

vi.mock("../../src/entities/connection.js", () => ({
  listConnections: vi.fn(),
}));
vi.mock("../../src/world/worldJournal.js", () => ({
  getActiveThreats: vi.fn(() => []),
}));

import { listConnections } from "../../src/entities/connection.js";
import { selectEndSessionNPC } from "../../src/session/endSessionVignette.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("selectEndSessionNPC — connection hint carries pronouns (finding R)", () => {
  it("includes the bonded connection's pronouns in the hint", () => {
    listConnections.mockReturnValue([
      { name: "Nova Petrov", bonded: true, pronouns: "she/her", role: "broker", motivation: "leverage" },
    ]);
    const npc = selectEndSessionNPC({});
    expect(npc.name).toBe("Nova Petrov");
    expect(npc.hint).toContain("Pronouns: she/her");
    expect(npc.hint).toContain("Role: broker");
  });

  it("leads the hint with pronouns so they survive truncation", () => {
    const longDesc = "x".repeat(400);
    listConnections.mockReturnValue([
      { name: "Vex", bonded: true, pronouns: "they/them", description: longDesc },
    ]);
    const npc = selectEndSessionNPC({});
    expect(npc.hint.startsWith("Pronouns: they/them")).toBe(true);
    expect(npc.hint.length).toBeLessThanOrEqual(220);
  });

  it("omits the pronouns label when the connection has none", () => {
    listConnections.mockReturnValue([
      { name: "Old Hand", bonded: true, role: "mechanic" },
    ]);
    const npc = selectEndSessionNPC({});
    expect(npc.hint).not.toContain("Pronouns:");
    expect(npc.hint).toContain("Role: mechanic");
  });

  it("propagates pronouns for a rank>=dangerous non-bonded connection too", () => {
    listConnections.mockReturnValue([
      { name: "Kade", bonded: false, active: true, rank: "formidable", pronouns: "he/him", role: "enforcer" },
    ]);
    const npc = selectEndSessionNPC({});
    expect(npc.name).toBe("Kade");
    expect(npc.hint).toContain("Pronouns: he/him");
  });
});

// ---------------------------------------------------------------------------
// Begin-session galley vignette — absent PC pronouns
// ---------------------------------------------------------------------------

vi.mock("../../src/character/actorBridge.js", () => ({
  readCharacterSnapshot: vi.fn(),
}));

import { readCharacterSnapshot } from "../../src/character/actorBridge.js";
import { buildGalleyVignetteUserMessage } from "../../src/session/galleyVignette.js";

describe("buildGalleyVignetteUserMessage — pronouns for active and absent PCs", () => {
  it("includes pronouns for absent crewmates referenced in the banter", () => {
    readCharacterSnapshot.mockImplementation((actor) => ({
      name:      actor.name,
      callsign:  null,
      pronouns:  actor.name === "Mave" ? "she/her" : "he/him",
      biography: "a hook",
      stats:     null,
    }));

    const msg = buildGalleyVignetteUserMessage(
      { active: [{ actor: { name: "Kylar" } }], absent: [{ actor: { name: "Mave" } }] },
      {},
    );

    // Active PC keeps its pronouns (pre-existing behaviour) ...
    expect(msg).toContain("Kylar");
    expect(msg).toContain("[he/him]");
    // ... and the absent PC now carries pronouns too.
    expect(msg).toMatch(/Mave[^\n]*\[she\/her\]/);
  });

  it("omits the pronoun bracket for an absent PC with no pronouns", () => {
    readCharacterSnapshot.mockImplementation((actor) => ({
      name:      actor.name,
      callsign:  null,
      pronouns:  null,
      biography: "",
      stats:     null,
    }));

    const msg = buildGalleyVignetteUserMessage(
      { active: [], absent: [{ actor: { name: "Ghost" } }] },
      {},
    );
    expect(msg).toContain("Ghost");
    expect(msg).not.toContain("[");
  });
});
