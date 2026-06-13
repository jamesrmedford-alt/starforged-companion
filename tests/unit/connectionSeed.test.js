/**
 * FOLDER-002 — NPC card population. seedConnectionActor rolls the Character
 * oracles into the Characteristics field (system.biography), composes Notes
 * (system.notes), and marks the card seeded. With no Claude/OpenRouter keys the
 * narrator prose falls back to an oracle bullet list and no portrait is fetched,
 * so these run fully offline and deterministically when fields are pre-rolled.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  seedConnectionActor,
  connectionNeedsSeed,
  pickConnectionPronouns,
  pronounsToPortraitDescriptor,
} from "../../src/entities/connection.js";

const MODULE = "starforged-companion";

function npcCard(overrides = {}) {
  return global.makeTestActor({
    id: "npc-1", type: "character", name: "Maren Vix",
    flags: { [MODULE]: { entityType: "connection", entityId: "c1", connection: {
      _id: "c1", name: "Maren Vix",
      role: "Smuggler", goal: "Pay off an old debt",
      firstLook: ["Augmetic eye, restless hands"], disposition: "Wary",
      ...overrides,
    }}},
  });
}

beforeEach(() => {
  global.game.actors._reset();
});

describe("connectionNeedsSeed", () => {
  it("is true for an unseeded connection card", () => {
    expect(connectionNeedsSeed(npcCard())).toBe(true);
  });
  it("is false once the card is seeded", () => {
    expect(connectionNeedsSeed(npcCard({ seeded: true }))).toBe(false);
  });
  it("is false for a player character (no connection flag)", () => {
    expect(connectionNeedsSeed(global.makeTestActor({ type: "character", name: "PC" }))).toBe(false);
  });
  it("is false for a non-character actor", () => {
    expect(connectionNeedsSeed(global.makeTestActor({ type: "starship", name: "Ship" }))).toBe(false);
  });
});

describe("seedConnectionActor", () => {
  it("writes oracle results to Characteristics (biography) and an intro to Notes", async () => {
    const actor = npcCard();
    const result = await seedConnectionActor(actor, {});

    expect(result.seeded).toBe(true);
    // Characteristics field carries the rolled oracle facts.
    expect(actor.system.biography).toMatch(/Smuggler/);
    expect(actor.system.biography).toMatch(/Pay off an old debt/);
    expect(actor.system.biography).toMatch(/Augmetic eye/);
    expect(actor.system.biography).toMatch(/Wary/);
    // Notes tab is populated (fallback bullets when no Claude key).
    expect(actor.system.notes.length).toBeGreaterThan(0);
    // The card is marked seeded on the flag.
    expect(actor.flags[MODULE].connection.seeded).toBe(true);
  });

  it("writes Characteristics as PLAIN TEXT — no HTML tags (v1.7.11 finding B)", async () => {
    // The Starforged sheet renders system.biography in a plain <textarea>;
    // HTML there shows as literal markup. (Notes is a rich-text field — HTML ok.)
    const actor = npcCard();
    await seedConnectionActor(actor, {});
    expect(actor.system.biography).not.toMatch(/<[a-z/]/i);
    expect(actor.system.biography).toMatch(/First look:/);
  });

  it("establishes pronouns once, on the record and system.pronouns (v1.7.11 finding E)", async () => {
    const actor = npcCard();
    const result = await seedConnectionActor(actor, {});
    expect(["she/her", "he/him", "they/them"]).toContain(result.pronouns);
    expect(actor.system.pronouns).toBe(result.pronouns);
    expect(actor.flags[MODULE].connection.pronouns).toBe(result.pronouns);
    // Surfaced in the plain-text Characteristics too.
    expect(actor.system.biography).toMatch(/Pronouns:/);
  });

  it("preserves pronouns already set on the record", async () => {
    const actor = npcCard({ pronouns: "they/them" });
    const result = await seedConnectionActor(actor, {});
    expect(result.pronouns).toBe("they/them");
  });

  it("leads the portrait source with a gender descriptor matching pronouns", async () => {
    const actor = npcCard({ pronouns: "she/her" });
    const result = await seedConnectionActor(actor, {});
    expect(result.portraitSourceDescription.startsWith("a woman")).toBe(true);
  });

  it("is idempotent — a seeded card is returned unchanged", async () => {
    const actor = npcCard();
    await seedConnectionActor(actor, {});
    const biographyAfterFirst = actor.system.biography;

    const second = await seedConnectionActor(actor, {});
    expect(second.seeded).toBe(true);
    expect(actor.system.biography).toBe(biographyAfterFirst);
    expect(connectionNeedsSeed(actor)).toBe(false);
  });

  it("returns null for a non-connection actor", async () => {
    const pc = global.makeTestActor({ type: "character", name: "PC" });
    expect(await seedConnectionActor(pc, {})).toBe(null);
  });
});

describe("pickConnectionPronouns / pronounsToPortraitDescriptor (finding E)", () => {
  it("picks a known pronoun set; rng selects deterministically", () => {
    expect(pickConnectionPronouns(() => 0)).toBe("she/her");
    expect(pickConnectionPronouns(() => 0.5)).toBe("he/him");
    expect(pickConnectionPronouns(() => 0.99)).toBe("they/them");
  });

  it("maps pronouns to a portrait descriptor", () => {
    expect(pronounsToPortraitDescriptor("she/her")).toBe("a woman");
    expect(pronounsToPortraitDescriptor("he/him")).toBe("a man");
    expect(pronounsToPortraitDescriptor("they/them")).toBe("a person");
    expect(pronounsToPortraitDescriptor("")).toBe("a person");
  });
});
