import { describe, it, expect } from "vitest";
import { renderEntityBody as renderConnectionBody } from "../../src/entities/connection.js";
import { renderEntityBody as renderFactionBody } from "../../src/entities/faction.js";
import { renderEntityBody as renderCreatureBody } from "../../src/entities/creature.js";

// F19 / theme T3: entity JournalEntryPages were created flag-only, so the page
// rendered blank. The create paths now set text.content from renderEntityBody().
// These pin the body renderers (the bodies are wired into createXxx()).

describe("entity page body renderers (F19 / T3)", () => {
  it("connection body carries the description and is non-empty", () => {
    const html = renderConnectionBody({
      name: "Vance",
      role: "Crew member",
      rank: "dangerous",
      description: "Observant; notices discrepancies in cargo manifests.",
    });
    expect(html).toContain("Observant; notices discrepancies in cargo manifests.");
    expect(html).toContain("Crew member");
    expect(html).not.toBe("");
  });

  it("faction body carries the description", () => {
    const html = renderFactionBody({
      name: "Syndicate",
      type: "guild",
      description: "A smuggling cartel moving wartime munitions.",
    });
    expect(html).toContain("wartime munitions");
  });

  it("creature body carries the description", () => {
    const html = renderCreatureBody({
      name: "Forgespawn",
      rank: "formidable",
      description: "A writhing mass of repurposed hull plating.",
    });
    expect(html).toContain("repurposed hull plating");
  });

  it("escapes HTML in entity descriptions", () => {
    const html = renderConnectionBody({ name: "X", description: "a <script> & b" });
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).not.toContain("<script>");
  });

  it("returns empty string for an entity with no descriptive fields", () => {
    expect(renderConnectionBody({ name: "Bare" })).toBe("");
    expect(renderFactionBody({})).toBe("");
    expect(renderCreatureBody(null)).toBe("");
  });

  it("connection body surfaces the rolled Goal (F3)", () => {
    // Goal is rolled by the sector wizard / Make a Connection and passed
    // to createConnection, but before F3 it had no schema home and never
    // appeared on the journal-page body.
    const html = renderConnectionBody({
      name: "Amelia Stark",
      role: "Scholar",
      goal: "Collect a debt",
      description: "Bookish, terse, intense eye contact.",
    });
    expect(html).toContain("<strong>Goal:</strong> Collect a debt");
    expect(html).toContain("Scholar");
    expect(html).toContain("Bookish, terse, intense eye contact.");
  });

  it("connection body omits Goal when it is missing/empty", () => {
    const html = renderConnectionBody({ name: "X", role: "Scout" });
    expect(html).toContain("Scout");
    expect(html).not.toContain("<strong>Goal:</strong>");
  });
});
