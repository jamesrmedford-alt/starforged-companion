/**
 * STARFORGED COMPANION
 * tests/unit/relevanceResolver.test.js
 *
 * Unit tests for src/context/relevanceResolver.js — Phase 1 string matching
 * and the hybrid Phase 2 classification path. The Phase 2 classifier is
 * injected via options so no API mocking is required.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveRelevance,
  buildNameIndex,
  matchNamesInNarration,
  parseClassificationJson,
} from "../../src/context/relevanceResolver.js";


// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function ent(name, journalId, type = "connection", _id = `id-${journalId}`) {
  return { _id, journalId, name, entityType: type };
}

function makeCampaign(overrides = {}) {
  return {
    connectionIds: [],
    settlementIds: [],
    factionIds:    [],
    shipIds:       [],
    planetIds:     [],
    locationIds:   [],
    creatureIds:   [],
    dismissedEntities: [],
    ...overrides,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// buildNameIndex
// ─────────────────────────────────────────────────────────────────────────────

describe("buildNameIndex", () => {
  it("indexes by full name", () => {
    const index = buildNameIndex([ent("Astra Veil", "j1")]);
    expect(index.has("astra veil")).toBe(true);
  });

  it("indexes by first word", () => {
    const index = buildNameIndex([ent("Astra Veil", "j1")]);
    expect(index.has("astra")).toBe(true);
  });

  it("indexes single-word names correctly (full == first == last)", () => {
    const index = buildNameIndex([ent("Sable", "j1")]);
    expect(index.size).toBe(1);
    expect(index.has("sable")).toBe(true);
  });

  it("indexes last word for multi-word names", () => {
    const index = buildNameIndex([ent("The Iron Compact", "j1", "faction")]);
    expect(index.has("compact")).toBe(true);
  });

  it("excludes dismissed entities (case-insensitive)", () => {
    const index = buildNameIndex(
      [ent("Sable", "j1"), ent("Kael", "j2")],
      ["sable"],
    );
    expect(index.has("sable")).toBe(false);
    expect(index.has("kael")).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// matchNamesInNarration
// ─────────────────────────────────────────────────────────────────────────────

describe("matchNamesInNarration", () => {
  it("returns matched entity for an exact-name match in narration", () => {
    const index = buildNameIndex([ent("Astra Veil", "j1")]);
    const result = matchNamesInNarration("I argue with Astra Veil at the bar.", index);
    expect(result.entities).toHaveLength(1);
    expect(result.matchedNames).toContain("Astra Veil");
  });

  it("matches case-insensitively", () => {
    const index = buildNameIndex([ent("Sable", "j1")]);
    const result = matchNamesInNarration("I look at SABLE for guidance.", index);
    expect(result.entities).toHaveLength(1);
  });

  it("returns empty when no name appears in the narration", () => {
    const index = buildNameIndex([ent("Sable", "j1"), ent("Kael", "j2")]);
    const result = matchNamesInNarration("I walk away into the fog.", index);
    expect(result.entities).toHaveLength(0);
    expect(result.matchedNames).toHaveLength(0);
  });

  it("does not match name fragments inside other words", () => {
    const index = buildNameIndex([ent("Iron", "j1", "faction")]);
    // "ironclad" should not match the bare token "iron"
    const result = matchNamesInNarration("The ironclad seals shut.", index);
    expect(result.entities).toHaveLength(0);
  });

  it("deduplicates a single entity matched on multiple tokens", () => {
    const index = buildNameIndex([ent("Astra Veil", "j1")]);
    // narration includes both "Astra" and "Veil"
    const result = matchNamesInNarration("Astra speaks. The Veil falls quiet.", index);
    expect(result.entities).toHaveLength(1);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// resolveRelevance — non-hybrid moves
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveRelevance — non-hybrid moves", () => {
  const collectStub = () => [
    ent("Sable",  "j-sable"),
    ent("Bleakhold", "j-bleak", "settlement"),
  ];

  it("returns matched entity ID when full name appears in narration", async () => {
    const result = await resolveRelevance(
      "I confide in Sable about the cargo.",
      "develop_your_relationship",
      "strong_hit",
      makeCampaign({ connectionIds: ["j-sable"] }),
      { collectEntities: collectStub },
    );
    expect(result.entityIds).toContain("j-sable");
    expect(result.matchedNames).toContain("Sable");
    expect(result.resolvedClass).toBe("interaction");
  });

  it("matches case-insensitively", async () => {
    const result = await resolveRelevance(
      "I plead with SABLE one more time.",
      "develop_your_relationship",
      "weak_hit",
      makeCampaign(),
      { collectEntities: collectStub },
    );
    expect(result.entityIds).toContain("j-sable");
  });

  it("returns empty entity list when no name appears", async () => {
    const result = await resolveRelevance(
      "I drift through the corridor.",
      "develop_your_relationship",
      "weak_hit",
      makeCampaign(),
      { collectEntities: collectStub },
    );
    expect(result.entityIds).toEqual([]);
    expect(result.matchedNames).toEqual([]);
  });

  it("excludes dismissed entity names from matching", async () => {
    const result = await resolveRelevance(
      "I find Sable in the back of the bar.",
      "develop_your_relationship",
      "strong_hit",
      makeCampaign({ dismissedEntities: ["Sable"] }),
      { collectEntities: collectStub },
    );
    expect(result.entityIds).not.toContain("j-sable");
  });

  it("preserves the move's narratorClass for non-hybrid moves", async () => {
    // endure_harm is "embellishment" — class is fixed regardless of matches
    const result = await resolveRelevance(
      "Sable carries me to the medical bay.",
      "endure_harm",
      "miss",
      makeCampaign(),
      { collectEntities: collectStub },
    );
    expect(result.resolvedClass).toBe("embellishment");
    // But the entity still gets surfaced for any downstream display
    expect(result.entityIds).toContain("j-sable");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// resolveRelevance — hybrid moves
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveRelevance — hybrid moves", () => {
  const collectStub = () => [ent("Sable", "j-sable")];

  it("hybrid + name match → interaction (no classification call)", async () => {
    const classify = vi.fn();
    const result = await resolveRelevance(
      "I square off against Sable in the corridor.",
      "face_danger",
      "strong_hit",
      makeCampaign(),
      { collectEntities: collectStub, classifyImplicit: classify },
    );
    expect(result.resolvedClass).toBe("interaction");
    expect(classify).not.toHaveBeenCalled();
  });

  it("hybrid + no name match + hit → classification call fires", async () => {
    const classify = vi.fn().mockResolvedValue({
      impliedEntity: false,
      referenceType: "none",
    });
    await resolveRelevance(
      "I push through the door, weapon raised.",
      "face_danger",
      "strong_hit",
      makeCampaign(),
      { collectEntities: collectStub, classifyImplicit: classify },
    );
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it("hybrid + no name match + miss → embellishment, no classification call", async () => {
    const classify = vi.fn();
    const result = await resolveRelevance(
      "I push through the door but trip over a crate.",
      "face_danger",
      "miss",
      makeCampaign(),
      { collectEntities: collectStub, classifyImplicit: classify },
    );
    expect(result.resolvedClass).toBe("embellishment");
    expect(classify).not.toHaveBeenCalled();
  });

  it("hybrid + classifier returns impliedEntity=true → interaction + needsClarification", async () => {
    const classify = vi.fn().mockResolvedValue({
      impliedEntity: true,
      referenceType: "pronoun",
    });
    const result = await resolveRelevance(
      "I look her in the eye and refuse to back down.",
      "face_danger",
      "strong_hit",
      makeCampaign(),
      { collectEntities: collectStub, classifyImplicit: classify },
    );
    expect(result.resolvedClass).toBe("interaction");
    expect(result.needsClarification).toBe(true);
    expect(result.referenceType).toBe("pronoun");
  });

  it("hybrid + classifier returns impliedEntity=false on a hit → discovery", async () => {
    const classify = vi.fn().mockResolvedValue({
      impliedEntity: false,
      referenceType: "none",
    });
    const result = await resolveRelevance(
      "I draw my blade against the gathered shadows.",
      "face_danger",
      "strong_hit",
      makeCampaign(),
      { collectEntities: collectStub, classifyImplicit: classify },
    );
    expect(result.resolvedClass).toBe("discovery");
    expect(result.needsClarification).toBe(false);
  });

  it("hybrid + classifier throws → resolves to discovery on hit (graceful fallback)", async () => {
    const classify = vi.fn().mockRejectedValue(new Error("network"));
    const result = await resolveRelevance(
      "I face the unknown.",
      "face_danger",
      "strong_hit",
      makeCampaign(),
      { collectEntities: collectStub, classifyImplicit: classify },
    );
    expect(result.resolvedClass).toBe("discovery");
    expect(result.needsClarification).toBe(false);
  });

  it("hybrid + classifier returns malformed object → falls back to non-implied", async () => {
    const classify = vi.fn().mockResolvedValue(null);
    const result = await resolveRelevance(
      "I push through.",
      "face_danger",
      "strong_hit",
      makeCampaign(),
      { collectEntities: collectStub, classifyImplicit: classify },
    );
    expect(result.resolvedClass).toBe("discovery");
    expect(result.needsClarification).toBe(false);
    expect(result.referenceType).toBe("none");
  });

  it("unknown moveId → falls back to embellishment class", async () => {
    const result = await resolveRelevance(
      "Some narration with no entities.",
      "this_move_does_not_exist",
      "strong_hit",
      makeCampaign(),
      { collectEntities: collectStub },
    );
    expect(result.resolvedClass).toBe("embellishment");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// parseClassificationJson — Phase 2 helper
// ─────────────────────────────────────────────────────────────────────────────

describe("parseClassificationJson", () => {
  it("returns the default when text is empty", () => {
    expect(parseClassificationJson("")).toEqual({ impliedEntity: false, referenceType: "none" });
  });

  it("parses a valid JSON object", () => {
    const r = parseClassificationJson('{"impliedEntity": true, "referenceType": "pronoun"}');
    expect(r).toEqual({ impliedEntity: true, referenceType: "pronoun" });
  });

  it("extracts the JSON object when surrounded by prose", () => {
    const r = parseClassificationJson(
      'Sure, here is the answer: {"impliedEntity": false, "referenceType": "none"} thanks.'
    );
    expect(r).toEqual({ impliedEntity: false, referenceType: "none" });
  });

  it("treats truthy non-true impliedEntity as false", () => {
    const r = parseClassificationJson('{"impliedEntity": "yes", "referenceType": "role"}');
    expect(r.impliedEntity).toBe(false);
    expect(r.referenceType).toBe("role");
  });

  it("defaults referenceType to 'none' when missing or non-string", () => {
    const r = parseClassificationJson('{"impliedEntity": true, "referenceType": 99}');
    expect(r.referenceType).toBe("none");
  });

  it("returns the default when JSON is malformed", () => {
    const r = parseClassificationJson('{ this is not json');
    expect(r).toEqual({ impliedEntity: false, referenceType: "none" });
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// resolveRelevance — default collectAllEntities path (no injection)
// Exercises the live entity-getter scan via the test setup's game.journal stub.
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveRelevance — default collectAllEntities path", () => {
  const originalGet = global.game.journal.get;
  afterEach(() => { global.game.journal.get = originalGet; });

  function stubJournal(entries) {
    global.game.journal.get = (id) => {
      const e = entries[id];
      if (!e) return null;
      return { pages: { contents: [{ flags: { "starforged-companion": e } }] } };
    };
  }

  it("scans every configured entity collection in the campaign state", async () => {
    stubJournal({
      "j-conn":  { connection: { _id: "c1", name: "Sable" } },
      "j-set":   { settlement: { _id: "s1", name: "Bleakhold" } },
      "j-fac":   { faction:    { _id: "f1", name: "Pelican Confederacy" } },
      "j-ship":  { ship:       { _id: "sh1", name: "Ironfold" } },
      "j-plan":  { planet:     { _id: "p1", name: "Cinderworld" } },
      "j-loc":   { location:   { _id: "l1", name: "Glasspike Ruin" } },
      "j-creat": { creature:   { _id: "cr1", name: "Forgespawn Alpha" } },
    });
    const campaign = {
      connectionIds: ["j-conn"],
      settlementIds: ["j-set"],
      factionIds:    ["j-fac"],
      shipIds:       ["j-ship"],
      planetIds:     ["j-plan"],
      locationIds:   ["j-loc"],
      creatureIds:   ["j-creat"],
      dismissedEntities: [],
    };
    const result = await resolveRelevance(
      "I dock the Ironfold at Bleakhold and meet Sable.",
      "develop_your_relationship",
      "strong_hit",
      campaign,
    );
    // Three matches expected (Ironfold, Bleakhold, Sable)
    expect(result.matchedNames.sort()).toEqual(["Bleakhold", "Ironfold", "Sable"]);
    expect(result.entityIds).toContain("j-conn");
    expect(result.entityIds).toContain("j-set");
    expect(result.entityIds).toContain("j-ship");
  });

  it("ignores journal IDs that don't resolve to a record", async () => {
    stubJournal({});
    const campaign = {
      connectionIds: ["missing-1", "missing-2"],
      settlementIds: [], factionIds: [], shipIds: [],
      planetIds: [], locationIds: [], creatureIds: [],
    };
    const result = await resolveRelevance(
      "I look around the empty corridor.",
      "develop_your_relationship",
      "strong_hit",
      campaign,
    );
    expect(result.entityIds).toEqual([]);
    expect(result.matchedNames).toEqual([]);
  });

  it("returns empty when campaignState is null", async () => {
    const result = await resolveRelevance(
      "Whatever.", "develop_your_relationship", "miss", null,
    );
    expect(result.entityIds).toEqual([]);
  });
});
