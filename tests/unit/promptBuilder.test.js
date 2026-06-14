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
import { buildPrompt, buildRegenerationPrompt } from "../../src/art/promptBuilder.js";

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
