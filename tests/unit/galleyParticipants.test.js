/**
 * STARFORGED COMPANION
 * tests/unit/galleyParticipants.test.js
 *
 * Finding B — the begin-session galley vignette dropped any player character
 * that no connected user had selected as their `User.character`, so a second PC
 * vanished from the opening scene entirely. collectGalleyParticipants now
 * enumerates the canonical PC roster (getPlayerActors) and only uses the user
 * list to decide present-vs-absent.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/character/actorBridge.js", () => ({
  getPlayerActors:       vi.fn(),
  readCharacterSnapshot: vi.fn(),
}));

import { getPlayerActors } from "../../src/character/actorBridge.js";
import { collectGalleyParticipants } from "../../src/session/galleyVignette.js";

const KYLAR = { id: "a-kylar", name: "Kylar Nazari" };
const MAVE  = { id: "a-mave",  name: "Mave Takara" };

function setUsers(users) {
  global.game = global.game ?? {};
  global.game.users = { contents: users };
}

beforeEach(() => { vi.clearAllMocks(); });

describe("collectGalleyParticipants (finding B)", () => {
  it("includes a PC that no connected user is assigned to (was dropped before)", () => {
    getPlayerActors.mockReturnValue([KYLAR, MAVE]);
    setUsers([{ active: true, character: { id: "a-kylar" } }]);   // Mave unassigned

    const { active, absent } = collectGalleyParticipants();
    expect(active.map(p => p.actor.id)).toEqual(["a-kylar"]);
    expect(absent.map(p => p.actor.id)).toEqual(["a-mave"]);
  });

  it("splits PCs by their assigned user's active state", () => {
    getPlayerActors.mockReturnValue([KYLAR, MAVE]);
    setUsers([
      { active: true,  character: { id: "a-kylar" } },
      { active: false, character: { id: "a-mave" } },
    ]);
    const { active, absent } = collectGalleyParticipants();
    expect(active.map(p => p.actor.id)).toEqual(["a-kylar"]);
    expect(absent.map(p => p.actor.id)).toEqual(["a-mave"]);
  });

  it("marks both PCs present when both users are connected", () => {
    getPlayerActors.mockReturnValue([KYLAR, MAVE]);
    setUsers([
      { active: true, character: { id: "a-kylar" } },
      { active: true, character: { id: "a-mave" } },
    ]);
    const { active, absent } = collectGalleyParticipants();
    expect(active.map(p => p.actor.id).sort()).toEqual(["a-kylar", "a-mave"]);
    expect(absent).toHaveLength(0);
  });

  it("falls back to user.character enumeration when the PC roster is empty", () => {
    getPlayerActors.mockReturnValue([]);
    const ghost = { id: "a-ghost", name: "Ghost" };
    setUsers([{ active: true, character: ghost }]);
    const { active } = collectGalleyParticipants();
    expect(active.map(p => p.actor.id)).toEqual(["a-ghost"]);
  });

  it("tolerates getPlayerActors throwing (returns empty roster, no throw)", () => {
    getPlayerActors.mockImplementation(() => { throw new Error("no actors"); });
    setUsers([]);
    expect(() => collectGalleyParticipants()).not.toThrow();
  });
});
