/**
 * STARFORGED COMPANION
 * tests/unit/entityExtractor.test.js
 *
 * Unit tests for the combined detection pass and the routing rule that
 * suppresses redundant World Journal entries when an entity record already
 * exists.
 *
 * Mocking strategy (per docs/implementation-ordering.md Phase 4):
 *   - WJ write functions (recordLoreDiscovery, recordThreat, ...) are
 *     mocked via vi.spyOn so we can assert routing without hitting real
 *     journal storage.
 *   - The Haiku API call is injected via options.callDetectionAPI /
 *     options.callTierAPI — no fetch mocking required.
 *   - Entity record reads (getFaction, getConnection, ...) hit the
 *     in-memory journal stub installed by tests/helpers/fullStateFixture.js.
 *
 * The routing-suppression test ("faction with entity record →
 * recordFactionIntelligence NOT called") is the critical cross-dependency
 * assertion called out in the Phase 4 spec.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  runCombinedDetectionPass,
  buildCombinedDetectionPrompt,
  parseDetectionResponse,
  routeEntityDrafts,
  routeWorldJournalResults,
  entityExistsForName,
  appendGenerativeTierUpdates,
  appendDetailToTier,
  applyStateTransition,
  parseTierUpdateResponse,
} from "../../src/entities/entityExtractor.js";
import * as wj from "../../src/world/worldJournal.js";
import {
  buildFullCampaignState,
  installJournalMock,
  addConnectionEntity,
} from "../helpers/fullStateFixture.js";
import { MOVES } from "../../src/schemas.js";

const MODULE_ID = "starforged-companion";


// ─────────────────────────────────────────────────────────────────────────────
// WJ function spies — installed per-test
// ─────────────────────────────────────────────────────────────────────────────

let spies;

beforeEach(() => {
  spies = {
    recordLoreDiscovery:        vi.spyOn(wj, "recordLoreDiscovery").mockResolvedValue(undefined),
    recordThreat:               vi.spyOn(wj, "recordThreat").mockResolvedValue(undefined),
    recordFactionIntelligence:  vi.spyOn(wj, "recordFactionIntelligence").mockResolvedValue(undefined),
    recordLocation:             vi.spyOn(wj, "recordLocation").mockResolvedValue(undefined),
    promoteLoreToConfirmed:     vi.spyOn(wj, "promoteLoreToConfirmed").mockResolvedValue(undefined),
    applyStateTransition:       vi.spyOn(wj, "applyStateTransition").mockResolvedValue(undefined),
    getConfirmedLore:           vi.spyOn(wj, "getConfirmedLore").mockReturnValue([]),
    getNarratorAssertedLore:    vi.spyOn(wj, "getNarratorAssertedLore").mockReturnValue([]),
    getActiveThreats:           vi.spyOn(wj, "getActiveThreats").mockReturnValue([]),
    getFactionLandscape:        vi.spyOn(wj, "getFactionLandscape").mockReturnValue([]),
  };
  global.ChatMessage._reset?.();
});

afterEach(() => {
  vi.restoreAllMocks();
});


// ─────────────────────────────────────────────────────────────────────────────
// parseDetectionResponse — entity section
// ─────────────────────────────────────────────────────────────────────────────

describe("parseDetectionResponse — entity section", () => {
  it("parses valid entity JSON", () => {
    const raw = JSON.stringify({
      entities: [
        { type: "connection", name: "Kael", description: "Battle-scarred captain.", confidence: "high" },
      ],
      worldJournal: {},
    });
    const result = parseDetectionResponse(raw, { dismissedEntities: [] });
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].name).toBe("Kael");
  });

  it("returns empty arrays for empty entities", () => {
    const result = parseDetectionResponse(JSON.stringify({ entities: [] }), {});
    expect(result.entities).toEqual([]);
  });

  it("filters low-confidence results", () => {
    const raw = JSON.stringify({
      entities: [
        { type: "connection", name: "Sure",   confidence: "high"   },
        { type: "connection", name: "Maybe",  confidence: "medium" },
        { type: "connection", name: "Vague",  confidence: "low"    },
      ],
    });
    const names = parseDetectionResponse(raw, {}).entities.map(e => e.name);
    expect(names).toEqual(["Sure", "Maybe"]);
  });

  it("does not return names that match an established entity record", () => {
    const fixture = buildFullCampaignState();
    const raw = JSON.stringify({
      entities: [
        { type: "faction",    name: "The Covenant", confidence: "high" },
        { type: "connection", name: "Kael",         confidence: "high" },
      ],
    });
    const result = parseDetectionResponse(raw, fixture.campaignState);
    expect(result.entities.map(e => e.name)).toEqual(["Kael"]);
    fixture.restore();
  });

  it("does not return names in dismissedEntities (case-insensitive)", () => {
    const raw = JSON.stringify({
      entities: [
        { type: "connection", name: "Sable",  confidence: "high" },
        { type: "connection", name: "kael",   confidence: "high" },
      ],
    });
    const result = parseDetectionResponse(raw, { dismissedEntities: ["SABLE"] });
    expect(result.entities.map(e => e.name)).toEqual(["kael"]);
  });

  it("handles malformed JSON gracefully", () => {
    const result = parseDetectionResponse("not json at all", {});
    expect(result.entities).toEqual([]);
    expect(result.worldJournal.lore).toEqual([]);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// parseDetectionResponse — WJ section
// ─────────────────────────────────────────────────────────────────────────────

describe("parseDetectionResponse — WJ section", () => {
  it("extracts lore entries correctly", () => {
    const raw = JSON.stringify({
      entities: [],
      worldJournal: {
        lore: [{ title: "Iron panel route", category: "ascendancy", text: "x", narratorAsserted: true, confirmed: false }],
      },
    });
    const result = parseDetectionResponse(raw, {});
    expect(result.worldJournal.lore).toHaveLength(1);
    expect(result.worldJournal.lore[0].title).toBe("Iron panel route");
  });

  it("extracts threats correctly", () => {
    const raw = JSON.stringify({
      entities: [],
      worldJournal: {
        threats: [{ name: "AI fragment", type: "creature", severity: "active", summary: "pursuing" }],
      },
    });
    const result = parseDetectionResponse(raw, {});
    expect(result.worldJournal.threats).toHaveLength(1);
    expect(result.worldJournal.threats[0].severity).toBe("active");
  });

  it("extracts factionUpdates with isNew flag", () => {
    const raw = JSON.stringify({
      entities: [],
      worldJournal: {
        factionUpdates: [{ name: "Compact", attitude: "neutral", summary: "first contact", isNew: true }],
      },
    });
    const result = parseDetectionResponse(raw, {});
    expect(result.worldJournal.factionUpdates[0].isNew).toBe(true);
  });

  it("extracts stateTransitions correctly", () => {
    const raw = JSON.stringify({
      entities: [],
      worldJournal: {
        stateTransitions: [{ entryType: "threat", name: "AI fragment", change: "resolved", newValue: "" }],
      },
    });
    const result = parseDetectionResponse(raw, {});
    expect(result.worldJournal.stateTransitions[0].change).toBe("resolved");
  });

  it("handles missing worldJournal section gracefully", () => {
    const raw = JSON.stringify({ entities: [] });
    const result = parseDetectionResponse(raw, {});
    expect(result.worldJournal.lore).toEqual([]);
    expect(result.worldJournal.threats).toEqual([]);
    expect(result.worldJournal.stateTransitions).toEqual([]);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// entityExistsForName
// ─────────────────────────────────────────────────────────────────────────────

describe("entityExistsForName", () => {
  it("returns true when faction name matches an entity record", () => {
    const fixture = buildFullCampaignState();
    expect(entityExistsForName("The Covenant", "faction", fixture.campaignState)).toBe(true);
    fixture.restore();
  });

  it("returns false when name is not found", () => {
    const fixture = buildFullCampaignState();
    expect(entityExistsForName("Phantom Corp", "faction", fixture.campaignState)).toBe(false);
    fixture.restore();
  });

  it("matches case-insensitively", () => {
    const fixture = buildFullCampaignState();
    expect(entityExistsForName("the covenant", "faction", fixture.campaignState)).toBe(true);
    expect(entityExistsForName("THE COVENANT", "faction", fixture.campaignState)).toBe(true);
    fixture.restore();
  });

  it("respects entity type — covenant faction is NOT a connection", () => {
    const fixture = buildFullCampaignState();
    expect(entityExistsForName("The Covenant", "connection", fixture.campaignState)).toBe(false);
    fixture.restore();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// routeWorldJournalResults — the routing-suppression cross-dependency test
// ─────────────────────────────────────────────────────────────────────────────

describe("routeWorldJournalResults", () => {
  it("routes lore to recordLoreDiscovery regardless of entity records", async () => {
    const fixture = buildFullCampaignState();
    await routeWorldJournalResults({
      lore: [{ title: "Iron panel route", text: "x", narratorAsserted: true, confirmed: false }],
    }, fixture.campaignState);
    expect(spies.recordLoreDiscovery).toHaveBeenCalledTimes(1);
    expect(spies.recordLoreDiscovery).toHaveBeenCalledWith(
      "Iron panel route",
      expect.objectContaining({ narratorAsserted: true }),
      fixture.campaignState,
    );
    fixture.restore();
  });

  it("routes threats to recordThreat regardless of entity records", async () => {
    const fixture = buildFullCampaignState();
    await routeWorldJournalResults({
      threats: [{ name: "AI fragment", severity: "active", summary: "pursuing" }],
    }, fixture.campaignState);
    expect(spies.recordThreat).toHaveBeenCalledWith(
      "AI fragment",
      expect.objectContaining({ severity: "active" }),
      fixture.campaignState,
    );
    fixture.restore();
  });

  it("routes faction to WJ when no entity record exists", async () => {
    const fixture = buildFullCampaignState();
    await routeWorldJournalResults({
      factionUpdates: [{ name: "The Iron Compact", attitude: "neutral", summary: "watching" }],
    }, fixture.campaignState);
    expect(spies.recordFactionIntelligence).toHaveBeenCalledTimes(1);
    expect(spies.recordFactionIntelligence).toHaveBeenCalledWith(
      "The Iron Compact",
      expect.any(Object),
      fixture.campaignState,
    );
    fixture.restore();
  });

  it("suppresses faction WJ entry when an entity record exists (CRITICAL)", async () => {
    const fixture = buildFullCampaignState();
    // "The Covenant" has an entity record in the fixture.
    await routeWorldJournalResults({
      factionUpdates: [{ name: "The Covenant", attitude: "antagonistic", summary: "burned the relay" }],
    }, fixture.campaignState);
    expect(spies.recordFactionIntelligence).not.toHaveBeenCalled();
    fixture.restore();
  });

  it("routes location to WJ when no entity record exists", async () => {
    const fixture = buildFullCampaignState();
    await routeWorldJournalResults({
      locationUpdates: [{ name: "Bleakhold", type: "settlement", summary: "rim port" }],
    }, fixture.campaignState);
    expect(spies.recordLocation).toHaveBeenCalledTimes(1);
    fixture.restore();
  });

  it("suppresses location WJ entry when an entity record exists", async () => {
    const fixture = buildFullCampaignState();
    // "Kovash Derelict" has a location entity record in the fixture.
    await routeWorldJournalResults({
      locationUpdates: [{ name: "Kovash Derelict", type: "derelict", summary: "second visit" }],
    }, fixture.campaignState);
    expect(spies.recordLocation).not.toHaveBeenCalled();
    fixture.restore();
  });

  it("delegates state transitions through applyStateTransition", async () => {
    const fixture = buildFullCampaignState();
    await routeWorldJournalResults({
      stateTransitions: [{ entryType: "threat", name: "AI fragment", change: "resolved" }],
    }, fixture.campaignState);
    expect(spies.applyStateTransition).toHaveBeenCalledTimes(1);
    expect(spies.applyStateTransition).toHaveBeenCalledWith(
      expect.objectContaining({ change: "resolved" }),
      fixture.campaignState,
    );
    fixture.restore();
  });

  it("returns early when wj is null", async () => {
    await routeWorldJournalResults(null, {});
    expect(spies.recordLoreDiscovery).not.toHaveBeenCalled();
  });

  it("'lore confirmed' transition delegates to promoteLoreToConfirmed", async () => {
    const fixture = buildFullCampaignState();
    await applyStateTransition(
      { entryType: "lore", name: "Soft fact", change: "confirmed" },
      fixture.campaignState,
    );
    expect(spies.promoteLoreToConfirmed).toHaveBeenCalledWith("Soft fact", fixture.campaignState);
    expect(spies.applyStateTransition).not.toHaveBeenCalled();
    fixture.restore();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// routeEntityDrafts — auto-create connection vs. queued draft card
// ─────────────────────────────────────────────────────────────────────────────

describe("routeEntityDrafts", () => {
  it("posts a GM-only draft entity card when no auto-create option is set", async () => {
    const fixture = buildFullCampaignState();
    global.ChatMessage._reset?.();
    const result = await routeEntityDrafts([
      { type: "faction", name: "Brand New Faction", description: "introduced this turn", confidence: "high" },
    ], fixture.campaignState);
    expect(result.created).toEqual([]);
    expect(result.queued).toHaveLength(1);
    const cards = global.ChatMessage._created;
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0].flags?.[MODULE_ID]?.draftEntityCard).toBe(true);
    fixture.restore();
  });

  it("auto-creates a connection when autoCreateConnection: true", async () => {
    const fixture = buildFullCampaignState();
    const result = await routeEntityDrafts([
      { type: "connection", name: "Kael", description: "lean and battle-scarred", confidence: "high" },
    ], fixture.campaignState, { autoCreateConnection: true });
    expect(result.created).toHaveLength(1);
    expect(result.created[0].record.name).toBe("Kael");
    fixture.restore();
  });

  it("does not auto-create when the connection name already exists", async () => {
    const fixture = buildFullCampaignState();
    // "Sable" is already an established connection in the fixture
    const result = await routeEntityDrafts([
      { type: "connection", name: "Sable", confidence: "high" },
    ], fixture.campaignState, { autoCreateConnection: true });
    expect(result.created).toEqual([]);
    expect(result.queued).toEqual([]);
    fixture.restore();
  });

  it("skips entities of unknown type", async () => {
    const fixture = buildFullCampaignState();
    const result = await routeEntityDrafts([
      { type: "phantom", name: "Anything" },
    ], fixture.campaignState);
    expect(result.queued).toEqual([]);
    fixture.restore();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// runCombinedDetectionPass — end-to-end with injected API
// ─────────────────────────────────────────────────────────────────────────────

describe("runCombinedDetectionPass", () => {
  it("calls the injected detection API and returns parsed result", async () => {
    const fixture = buildFullCampaignState();
    const mockResponse = JSON.stringify({
      entities: [{ type: "connection", name: "Kael", confidence: "high" }],
      worldJournal: {
        lore: [{ title: "x", text: "y" }],
        threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [],
      },
    });
    const callDetectionAPI = vi.fn().mockResolvedValue(mockResponse);
    const result = await runCombinedDetectionPass(
      "narration", "make_a_connection", "strong_hit", fixture.campaignState,
      { callDetectionAPI },
    );
    expect(callDetectionAPI).toHaveBeenCalledTimes(1);
    expect(result.entities[0].name).toBe("Kael");
    expect(result.worldJournal.lore).toHaveLength(1);
    fixture.restore();
  });

  it("returns the empty detection shape on API failure", async () => {
    const fixture = buildFullCampaignState();
    const callDetectionAPI = vi.fn().mockRejectedValue(new Error("network"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await runCombinedDetectionPass(
      "narration", "gather_information", "strong_hit", fixture.campaignState,
      { callDetectionAPI },
    );
    expect(result.entities).toEqual([]);
    expect(result.worldJournal.lore).toEqual([]);
    warnSpy.mockRestore();
    fixture.restore();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// buildCombinedDetectionPrompt — sanity that all the right pieces appear
// ─────────────────────────────────────────────────────────────────────────────

describe("buildCombinedDetectionPrompt", () => {
  it("includes established entity names from campaign state", () => {
    const fixture = buildFullCampaignState();
    const prompt = buildCombinedDetectionPrompt(
      "narration text", "face_danger", "weak_hit", fixture.campaignState,
    );
    expect(prompt).toContain("The Covenant");
    expect(prompt).toContain("Sable");
    expect(prompt).toContain("Kovash Derelict");
    fixture.restore();
  });

  it("includes dismissed names in the prompt", () => {
    const prompt = buildCombinedDetectionPrompt(
      "n", "face_danger", "weak_hit",
      { dismissedEntities: ["Phantom"], connectionIds: [], settlementIds: [] },
    );
    expect(prompt).toContain("Phantom");
  });

  it("includes the JSON schema for the combined response", () => {
    const prompt = buildCombinedDetectionPrompt("n", "face_danger", "miss", {});
    expect(prompt).toContain('"entities"');
    expect(prompt).toContain('"worldJournal"');
    expect(prompt).toContain("stateTransitions");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// appendGenerativeTierUpdates / appendDetailToTier
// ─────────────────────────────────────────────────────────────────────────────

describe("appendDetailToTier", () => {
  it("appends a new detail to entity generativeTier", async () => {
    const installed = installJournalMock();
    const ref = (() => {
      const r = addConnectionEntity(installed.journals, { name: "Kael" });
      return { ...r, type: "connection", record: {
        ...installed.journals.values().next().value.pages.contents[0].flags[MODULE_ID].connection,
      } };
    })();

    const ok = await appendDetailToTier(ref, "Speaks in clipped sentences.", "ses-1", 1);
    expect(ok).toBe(true);
    installed.restore();
  });

  it("does not append a duplicate detail (deduplication check)", async () => {
    const installed = installJournalMock();
    const r = addConnectionEntity(installed.journals, { name: "Kael" });
    const journal = [...installed.journals.values()][0];
    const data = journal.pages.contents[0].flags[MODULE_ID].connection;
    data.generativeTier = [
      { sessionNum: 1, detail: "Speaks in clipped sentences.", source: "narrator_extraction" },
    ];

    const ref = { ...r, type: "connection", record: data };
    const ok = await appendDetailToTier(ref, "Speaks in clipped sentences.", "ses-2", 2);
    expect(ok).toBe(false);
    installed.restore();
  });

  it("preserves pinned entries when new ones are appended", async () => {
    const installed = installJournalMock();
    const r = addConnectionEntity(installed.journals, { name: "Kael" });
    const journal = [...installed.journals.values()][0];
    const data = journal.pages.contents[0].flags[MODULE_ID].connection;
    data.generativeTier = [
      { sessionNum: 1, detail: "Pinned forever.", pinned: true, source: "narrator_extraction" },
    ];
    const ref = { ...r, type: "connection", record: data };

    await appendDetailToTier(ref, "Brand new detail.", "ses-3", 3);
    const updated = ref.record.generativeTier;
    expect(updated.find(e => e.pinned && e.detail === "Pinned forever.")).toBeTruthy();
    expect(updated.find(e => e.detail === "Brand new detail.")).toBeTruthy();
    installed.restore();
  });
});

describe("appendGenerativeTierUpdates", () => {
  it("calls the injected tier API with a prompt referencing the entity records", async () => {
    const installed = installJournalMock();
    const ref = addConnectionEntity(installed.journals, { name: "Kael", role: "navigator" });

    let receivedPrompt = null;
    const callTierAPI = vi.fn().mockImplementation(async (prompt) => {
      receivedPrompt = prompt;
      return JSON.stringify({ updates: [{ entityId: ref.journalId, detail: "Has a steady hand." }] });
    });

    const applied = await appendGenerativeTierUpdates(
      "Kael steadies the wheel.",
      [{ journalId: ref.journalId, type: "connection" }],
      "ses-1", 1,
      { callTierAPI },
    );
    expect(callTierAPI).toHaveBeenCalled();
    expect(receivedPrompt).toContain("Kael");
    expect(applied).toHaveLength(1);
    expect(applied[0].detail).toBe("Has a steady hand.");
    installed.restore();
  });

  it("returns [] when no entityRefs are provided", async () => {
    const result = await appendGenerativeTierUpdates("n", [], "s", 1);
    expect(result).toEqual([]);
  });
});

describe("parseTierUpdateResponse", () => {
  it("parses the updates array", () => {
    const r = parseTierUpdateResponse(JSON.stringify({
      updates: [{ entityId: "j1", detail: "x" }],
    }));
    expect(r.updates).toHaveLength(1);
  });

  it("returns { updates: [] } on malformed input", () => {
    expect(parseTierUpdateResponse("not json").updates).toEqual([]);
    expect(parseTierUpdateResponse("").updates).toEqual([]);
    expect(parseTierUpdateResponse("{}").updates).toEqual([]);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Oracle seeding (already in resolver — sanity check at the schema level)
// ─────────────────────────────────────────────────────────────────────────────

describe("MOVES — narratorClass for oracle-seeded moves", () => {
  it("make_a_connection is discovery class (eligible for oracle seeds + auto-create)", () => {
    expect(MOVES.make_a_connection.narratorClass).toBe("discovery");
  });

  it("gather_information is discovery class (no oracle seeding configured)", () => {
    expect(MOVES.gather_information.narratorClass).toBe("discovery");
  });
});
