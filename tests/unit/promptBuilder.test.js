/**
 * STARFORGED COMPANION
 * tests/unit/promptBuilder.test.js
 *
 * Image-prompt assembly. Focus: NPC portraits must carry the established
 * gender derived from the rolled pronouns (finding I) so generated art does
 * not diverge from the card. The portrait source description already leads
 * with the descriptor; buildEntityContext reinforces it at the end of the
 * prompt where image models weight it heavily.
 */

import { describe, it, expect } from "vitest";
import { buildPrompt, buildRegenerationPrompt, buildNeutralPortraitPrompt } from "../../src/art/promptBuilder.js";

describe("buildPrompt — connection gender reinforcement (finding I)", () => {
  it("includes 'a woman' for she/her pronouns", () => {
    const { prompt } = buildPrompt("connection", "weathered face, sharp eyes", {
      pronouns: "she/her",
      role:     "smuggler",
    });
    expect(prompt).toContain("a woman");
    expect(prompt).toContain("role: smuggler");
  });

  it("includes 'a man' for he/him pronouns", () => {
    const { prompt } = buildPrompt("connection", "scarred jaw", { pronouns: "he/him" });
    expect(prompt).toContain("a man");
  });

  it("includes 'a person' for they/them pronouns (no forced androgyny elsewhere)", () => {
    const { prompt } = buildPrompt("connection", "lean silhouette", { pronouns: "they/them" });
    expect(prompt).toContain("a person");
  });

  it("reinforces gender even when no other connection fields are set", () => {
    const { prompt } = buildPrompt("connection", "x", { pronouns: "she/her" });
    expect(prompt).toContain("a woman");
  });

  it("adds no gender term when the connection has no pronouns", () => {
    const { prompt } = buildPrompt("connection", "neutral descriptive prose", { role: "fixer" });
    expect(prompt).not.toMatch(/\ba (woman|man|person)\b/);
    expect(prompt).toContain("role: fixer");
  });

  it("carries the reinforcement through the regeneration prompt", () => {
    const { prompt } = buildRegenerationPrompt("connection", "x", { pronouns: "he/him" });
    expect(prompt).toContain("a man");
    expect(prompt).toMatch(/Alternative composition/);
  });

  it("does not inject a gender term for non-connection entity types", () => {
    const { prompt } = buildPrompt("settlement", "domed colony", { pronouns: "she/her", population: "Few" });
    expect(prompt).not.toContain("a woman");
  });
});

describe("sanitiseForPolicy — captivity / raider / violence vocabulary (finding #3)", () => {
  const trigger =
    "a captive woman, recently kidnapped by raiders, blood on her face, shackled and beaten";

  it("strips the moderation-triggering words from the built prompt", () => {
    const { prompt } = buildPrompt("connection", trigger, { pronouns: "she/her" });
    for (const word of ["captive", "kidnapped", "raiders", "blood", "shackled", "beaten"]) {
      expect(prompt.toLowerCase()).not.toContain(word);
    }
    // still produces a usable portrait prompt with the established gender
    expect(prompt).toContain("a woman");
    expect(prompt).toContain("character portrait");
  });

  it("redirects raider/pirate language to neutral framing", () => {
    const { prompt } = buildPrompt("connection", "a hardened pirate marauder", {});
    expect(prompt.toLowerCase()).not.toContain("pirate");
    expect(prompt.toLowerCase()).not.toContain("marauder");
    expect(prompt).toContain("rough-edged spacer");
  });
});

describe("buildNeutralPortraitPrompt — moderation-retry fallback (finding #3)", () => {
  it("drops the scene description entirely, keeping only style + card fields", () => {
    const sceneProse = "kidnapped and bleeding in a raider hold";
    const { prompt } = buildNeutralPortraitPrompt("connection", {
      pronouns: "she/her", role: "diplomat",
    });
    expect(prompt).not.toContain("raider");
    expect(prompt).not.toContain("bleeding");
    expect(prompt).not.toContain("hold");
    // card-derived detail survives
    expect(prompt).toContain("a woman");
    expect(prompt).toContain("role: diplomat");
    expect(prompt).toContain("character portrait");
    // sanity: the scene prose genuinely isn't in there
    expect(prompt).not.toContain(sceneProse);
  });

  it("uses landscape size for ships and planets, square otherwise", () => {
    expect(buildNeutralPortraitPrompt("ship", {}).size).toBe("1792x1024");
    expect(buildNeutralPortraitPrompt("connection", {}).size).toBe("1024x1024");
  });

  it("builds a connection from pronouns, role, first look, and name only", () => {
    const { prompt } = buildNeutralPortraitPrompt("connection", {
      pronouns: "she/her",
      role:     "Criminal",
      firstLook: ["Scruffy"],
      name:     "Karthik Freeman",
      // dropped fields — must NOT leak into the minimal fallback prompt
      goal:        "Collect a debt",
      disposition: "Suspicious",
    });
    expect(prompt).toContain("a woman");
    expect(prompt).toContain("role: Criminal");
    expect(prompt).toContain("first look: Scruffy");
    expect(prompt).toContain("named Karthik Freeman");
    expect(prompt).not.toContain("Collect a debt");
    expect(prompt).not.toContain("Suspicious");
  });

  it("sanitises a flagged first look in the neutral fallback", () => {
    const { prompt } = buildNeutralPortraitPrompt("connection", {
      pronouns: "he/him",
      role:     "Mercenary",
      firstLook: ["wounded and bleeding"],
      name:     "Dane",
    });
    expect(prompt).not.toContain("wounded");
    expect(prompt).not.toContain("bleeding");
    expect(prompt).toContain("bearing the marks of hardship");
  });
});
