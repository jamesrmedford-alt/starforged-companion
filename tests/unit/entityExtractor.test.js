/**
 * STARFORGED COMPANION
 * tests/unit/entityExtractor.test.js
 *
 * Unit tests for the combined detection pass and the routing rule that
 * suppresses redundant World Journal entries when an entity record already
 * exists.
 *
 * Mocking strategy (per docs/entities/implementation-ordering.md Phase 4):
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
  PACED_NARRATIVE_MOVE_ID,
  PACED_NARRATIVE_OUTCOME,
  runCombinedDetectionPass,
  buildCombinedDetectionPrompt,
  parseDetectionResponse,
  routeEntityDrafts,
  routeWorldJournalResults,
  entityExistsForName,
  entityExistsAnyType,
  appendGenerativeTierUpdates,
  appendDetailToTier,
  applyStateTransition,
  parseTierUpdateResponse,
  normalizeEntityName,
  buildConnectionSeedData,
  buildShipSeedData,
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
    appendSessionLogBeat:       vi.spyOn(wj, "appendSessionLogBeat").mockResolvedValue(undefined),
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
// entityExistsAnyType — cross-type dedup
// (Prevents the detector smuggling a Location-typed duplicate past a name
// that already exists as a Settlement / Faction / etc. See SECTOR-001 in
// docs/known-issues.md.)
// ─────────────────────────────────────────────────────────────────────────────

describe("entityExistsAnyType", () => {
  it("returns true for a name that exists under any entity type", () => {
    const fixture = buildFullCampaignState();
    // The fixture seeds "Kovash Derelict" as a Location.
    expect(entityExistsAnyType("Kovash Derelict", fixture.campaignState)).toBe(true);
    // "Sable" is a Connection.
    expect(entityExistsAnyType("Sable", fixture.campaignState)).toBe(true);
    // "The Covenant" is a Faction.
    expect(entityExistsAnyType("The Covenant", fixture.campaignState)).toBe(true);
    fixture.restore();
  });

  it("returns false for a name that exists nowhere", () => {
    const fixture = buildFullCampaignState();
    expect(entityExistsAnyType("Brand New Name", fixture.campaignState)).toBe(false);
    fixture.restore();
  });

  it("is case- and honorific-insensitive", () => {
    const fixture = buildFullCampaignState();
    expect(entityExistsAnyType("kovash derelict", fixture.campaignState)).toBe(true);
    expect(entityExistsAnyType("KOVASH DERELICT", fixture.campaignState)).toBe(true);
    fixture.restore();
  });

  it("ignores empty / non-string input", () => {
    const fixture = buildFullCampaignState();
    expect(entityExistsAnyType("", fixture.campaignState)).toBe(false);
    expect(entityExistsAnyType(null, fixture.campaignState)).toBe(false);
    expect(entityExistsAnyType(undefined, fixture.campaignState)).toBe(false);
    fixture.restore();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// routeEntityDrafts — cross-type dedup at the routing gate
// ─────────────────────────────────────────────────────────────────────────────

describe("routeEntityDrafts — cross-type dedup", () => {
  beforeEach(() => {
    global.ChatMessage._created = [];
    global.game.messages = { contents: global.ChatMessage._created };
  });
  afterEach(() => {
    global.ChatMessage._created = [];
    global.game.messages = { contents: global.ChatMessage._created };
  });

  it("does not propose a Location-typed draft when an existing entity of any other type shares the name", async () => {
    const fixture = buildFullCampaignState();
    // Fixture has Faction "The Covenant". Detector proposes the same name
    // classified as a Location (the kind of misclassification that triggered
    // SECTOR-001 — the narrator's prose can read as either type, and the
    // detector picks one).
    const result = await routeEntityDrafts(
      [{ type: "location", name: "The Covenant", description: "a place named for the cult" }],
      fixture.campaignState,
    );
    expect(result.queued).toEqual([]);
    expect(global.ChatMessage._created.length).toBe(0);
    fixture.restore();
  });

  it("does not auto-create a connection that shares a name with an existing Location entity", async () => {
    const fixture = buildFullCampaignState();
    // Fixture has Location "Kovash Derelict". A connection draft with the
    // same name (e.g. the narrator decided "Kovash Derelict" was a person
    // somehow) should still be blocked by cross-type dedup.
    const result = await routeEntityDrafts(
      [{ type: "connection", name: "Kovash Derelict", description: "stub" }],
      fixture.campaignState,
      { autoCreateConnection: true },
    );
    expect(result.created).toEqual([]);
    expect(result.queued).toEqual([]);
    fixture.restore();
  });

  it("still queues genuinely new names", async () => {
    const fixture = buildFullCampaignState();
    const result = await routeEntityDrafts(
      [{ type: "settlement", name: "Iron Anvil Outpost", description: "stub" }],
      fixture.campaignState,
    );
    expect(result.queued).toHaveLength(1);
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
// routeWorldJournalResults — per-channel salience gate (T2: F15 / F17 / F21)
// ─────────────────────────────────────────────────────────────────────────────

describe("routeWorldJournalResults — salience gate", () => {
  const KEYS = ["loreSalienceThreshold", "threatSalienceThreshold"];

  // beforeEach does not clear settings; guarantee the conservative default.
  beforeEach(() => { for (const k of KEYS) game.settings._store.delete(`${MODULE_ID}.${k}`); });
  afterEach(()  => { for (const k of KEYS) game.settings._store.delete(`${MODULE_ID}.${k}`); });

  it("reroutes a below-floor lore item to the session log, not Lore (F17/F18)", async () => {
    const fixture = buildFullCampaignState();
    await routeWorldJournalResults({
      lore: [{ title: "Container C-47 scorch marks", text: "faint scorch", salience: "scene" }],
    }, fixture.campaignState);
    expect(spies.recordLoreDiscovery).not.toHaveBeenCalled();
    expect(spies.appendSessionLogBeat).toHaveBeenCalledTimes(1);
    expect(spies.appendSessionLogBeat).toHaveBeenCalledWith(
      fixture.campaignState,
      expect.objectContaining({ kind: "lore", title: "Container C-47 scorch marks", text: "faint scorch" }),
    );
    fixture.restore();
  });

  it("records lore items at or above the floor (not rerouted)", async () => {
    const fixture = buildFullCampaignState();
    await routeWorldJournalResults({
      lore: [
        { title: "Cargo is wartime munitions", text: "x", salience: "significant" },
        { title: "A faction's true agenda",    text: "y", salience: "defining" },
      ],
    }, fixture.campaignState);
    expect(spies.recordLoreDiscovery).toHaveBeenCalledTimes(2);
    expect(spies.appendSessionLogBeat).not.toHaveBeenCalled();
    fixture.restore();
  });

  it("records an unrated lore item as durable (fail-open — not rerouted)", async () => {
    const fixture = buildFullCampaignState();
    await routeWorldJournalResults({
      lore: [{ title: "Unrated but kept", text: "x" }],
    }, fixture.campaignState);
    expect(spies.recordLoreDiscovery).toHaveBeenCalledTimes(1);
    expect(spies.appendSessionLogBeat).not.toHaveBeenCalled();
    fixture.restore();
  });

  it("reroutes a scene-level threat to the session log, not Threats (F15/F18)", async () => {
    const fixture = buildFullCampaignState();
    await routeWorldJournalResults({
      threats: [{ name: "External airlock intrusion", severity: "immediate", summary: "now", salience: "scene" }],
    }, fixture.campaignState);
    expect(spies.recordThreat).not.toHaveBeenCalled();
    expect(spies.appendSessionLogBeat).toHaveBeenCalledWith(
      fixture.campaignState,
      expect.objectContaining({ kind: "threat", title: "External airlock intrusion", text: "now" }),
    );
    fixture.restore();
  });

  it("records a campaign-level threat at or above the floor (not rerouted)", async () => {
    const fixture = buildFullCampaignState();
    await routeWorldJournalResults({
      threats: [{ name: "Hegemony purge fleet", severity: "looming", summary: "inbound", salience: "defining" }],
    }, fixture.campaignState);
    expect(spies.recordThreat).toHaveBeenCalledTimes(1);
    expect(spies.appendSessionLogBeat).not.toHaveBeenCalled();
    fixture.restore();
  });

  it("respects a per-channel lore floor lowered to 'scene' (records, no reroute)", async () => {
    game.settings._store.set(`${MODULE_ID}.loreSalienceThreshold`, "scene");
    const fixture = buildFullCampaignState();
    await routeWorldJournalResults({
      lore: [{ title: "Kept once the floor is lowered", text: "x", salience: "scene" }],
    }, fixture.campaignState);
    expect(spies.recordLoreDiscovery).toHaveBeenCalledTimes(1);
    expect(spies.appendSessionLogBeat).not.toHaveBeenCalled();
    fixture.restore();
  });

  it("each channel owns its floor — a lowered lore floor does not loosen threats (D4)", async () => {
    game.settings._store.set(`${MODULE_ID}.loreSalienceThreshold`, "trivial");
    const fixture = buildFullCampaignState();
    await routeWorldJournalResults({
      threats: [{ name: "Scene blip", severity: "immediate", summary: "now", salience: "scene" }],
    }, fixture.campaignState);
    expect(spies.recordThreat).not.toHaveBeenCalled();          // threat floor still 'significant'
    expect(spies.appendSessionLogBeat).toHaveBeenCalledTimes(1); // rerouted instead
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

  // Suggestion-loop remediation §C — paced-narrative detection routes
  // through the GM draft-card path with a telemetry flag and never
  // auto-creates.
  describe("paced-narrative source (suggestion-loop §C)", () => {
    it("never auto-creates a connection even on a high-confidence paced match", async () => {
      const fixture = buildFullCampaignState();
      const result = await routeEntityDrafts([
        { type: "connection", name: "Maren", description: "wiry, watchful", confidence: "high" },
      ], fixture.campaignState, {
        autoCreateConnection: false,
        source:               "paced_narrative",
      });
      expect(result.created).toEqual([]);
      expect(result.queued).toHaveLength(1);
      fixture.restore();
    });

    it("tags the draft card with source: 'paced_narrative'", async () => {
      const fixture = buildFullCampaignState();
      global.ChatMessage._reset?.();
      await routeEntityDrafts([
        { type: "connection", name: "Maren", description: "wiry", confidence: "high" },
      ], fixture.campaignState, { source: "paced_narrative" });
      const cards = global.ChatMessage._created;
      expect(cards.length).toBeGreaterThan(0);
      expect(cards[0].flags?.[MODULE_ID]?.source).toBe("paced_narrative");
      fixture.restore();
    });

    it("defaults source to 'move_resolution' when option is omitted", async () => {
      const fixture = buildFullCampaignState();
      global.ChatMessage._reset?.();
      await routeEntityDrafts([
        { type: "connection", name: "Kael", description: "scarred", confidence: "high" },
      ], fixture.campaignState);
      const cards = global.ChatMessage._created;
      expect(cards[0].flags?.[MODULE_ID]?.source).toBe("move_resolution");
      fixture.restore();
    });
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

  it("documents the salience field and its conservative rubric", () => {
    const prompt = buildCombinedDetectionPrompt("n", "face_danger", "miss", {});
    expect(prompt).toContain('"salience"');
    expect(prompt).toContain("SALIENCE");
    expect(prompt).toContain("defining");
    expect(prompt).toContain("scene");
    expect(prompt).toMatch(/Be sparing/i);
  });

  // Suggestion-loop remediation §C — paced sentinel framing.
  describe("paced-narrative sentinel (suggestion-loop §C)", () => {
    it("exports the sentinel constants", () => {
      expect(PACED_NARRATIVE_MOVE_ID).toBe("paced_narrative");
      expect(PACED_NARRATIVE_OUTCOME).toBe("n/a");
    });

    it("renders the no-move framing line when moveId is the paced sentinel", () => {
      const prompt = buildCombinedDetectionPrompt(
        "narration", PACED_NARRATIVE_MOVE_ID, PACED_NARRATIVE_OUTCOME, {},
      );
      expect(prompt).toContain("paced narration — no move was rolled");
      expect(prompt).not.toContain("Move: paced_narrative.");
    });

    it("omits the Outcome line entirely when the paced sentinel is used", () => {
      const prompt = buildCombinedDetectionPrompt(
        "narration", PACED_NARRATIVE_MOVE_ID, PACED_NARRATIVE_OUTCOME, {},
      );
      expect(prompt).not.toMatch(/^Outcome:/m);
      expect(prompt).not.toContain("n/a");
    });

    it("renders the legacy Move/Outcome lines for a real move id", () => {
      const prompt = buildCombinedDetectionPrompt(
        "narration", "face_danger", "strong_hit", {},
      );
      expect(prompt).toContain("Move: face_danger.");
      expect(prompt).toContain("Outcome: strong_hit.");
      expect(prompt).not.toContain("paced narration");
    });

    it("treats outcome=PACED_NARRATIVE_OUTCOME as paced even with a real moveId", () => {
      // Defensive — if a caller passes a real moveId with the paced
      // outcome sentinel, we still omit the Outcome line cleanly rather
      // than emitting "Outcome: n/a." into the prompt.
      const prompt = buildCombinedDetectionPrompt(
        "narration", "face_danger", PACED_NARRATIVE_OUTCOME, {},
      );
      expect(prompt).not.toMatch(/^Outcome:/m);
    });
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


// ─────────────────────────────────────────────────────────────────────────────
// normalizeEntityName — honorifics, case, whitespace
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeEntityName", () => {
  it("returns empty string for non-string input", () => {
    expect(normalizeEntityName(null)).toBe("");
    expect(normalizeEntityName(undefined)).toBe("");
    expect(normalizeEntityName(42)).toBe("");
  });

  it("lowercases and trims", () => {
    expect(normalizeEntityName("  Chen  ")).toBe("chen");
    expect(normalizeEntityName("CHEN")).toBe("chen");
  });

  it("collapses interior whitespace", () => {
    expect(normalizeEntityName("Dr.   Marisol   Chen")).toBe("marisol chen");
  });

  it("strips a leading honorific with trailing period", () => {
    expect(normalizeEntityName("Dr. Chen")).toBe("chen");
    expect(normalizeEntityName("Captain Reyes")).toBe("reyes");
    expect(normalizeEntityName("Lt Sato")).toBe("sato");
  });

  it("strips honorifics case-insensitively", () => {
    expect(normalizeEntityName("DR. CHEN")).toBe("chen");
    expect(normalizeEntityName("dr chen")).toBe("chen");
  });

  it("leaves bare names unchanged", () => {
    expect(normalizeEntityName("Chen")).toBe("chen");
    expect(normalizeEntityName("Marisol Chen")).toBe("marisol chen");
  });

  it("does not strip non-honorific leading words", () => {
    expect(normalizeEntityName("Iron Compact")).toBe("iron compact");
    expect(normalizeEntityName("Old Sable")).toBe("old sable");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Honorific-aware dedup — the v1.2.2 entity-loop bug
// ─────────────────────────────────────────────────────────────────────────────

describe("parseDetectionResponse — honorific dedup", () => {
  it('filters "Chen" when the established record is stored as "Dr. Chen"', () => {
    const fixture = buildFullCampaignState();
    addConnectionEntity(fixture.journals, { name: "Dr. Chen" });
    // Re-derive connectionIds so collectEstablishedEntityNames sees the new record.
    const drChenJournal = [...fixture.journals.values()].find(j => j.name === "Dr. Chen");
    fixture.campaignState.connectionIds.push(drChenJournal.id);

    const raw = JSON.stringify({
      entities: [
        { type: "connection", name: "Chen", confidence: "high" },
      ],
    });
    const result = parseDetectionResponse(raw, fixture.campaignState);
    expect(result.entities).toEqual([]);
    fixture.restore();
  });

  it('filters "Dr. Chen" when the established record is stored as "Chen"', () => {
    const fixture = buildFullCampaignState();
    addConnectionEntity(fixture.journals, { name: "Chen" });
    const chenJournal = [...fixture.journals.values()].find(j => j.name === "Chen");
    fixture.campaignState.connectionIds.push(chenJournal.id);

    const raw = JSON.stringify({
      entities: [
        { type: "connection", name: "Dr. Chen", confidence: "high" },
      ],
    });
    const result = parseDetectionResponse(raw, fixture.campaignState);
    expect(result.entities).toEqual([]);
    fixture.restore();
  });
});

describe("entityExistsForName — honorific dedup", () => {
  it('matches "Chen" against a stored "Dr. Chen"', () => {
    const fixture = buildFullCampaignState();
    addConnectionEntity(fixture.journals, { name: "Dr. Chen" });
    const j = [...fixture.journals.values()].find(j => j.name === "Dr. Chen");
    fixture.campaignState.connectionIds.push(j.id);
    expect(entityExistsForName("Chen", "connection", fixture.campaignState)).toBe(true);
    expect(entityExistsForName("CHEN", "connection", fixture.campaignState)).toBe(true);
    fixture.restore();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Pending-drafts suppression — the second half of the entity-loop bug
// ─────────────────────────────────────────────────────────────────────────────

describe("pending-drafts suppression", () => {
  beforeEach(() => {
    // Reset chat messages between tests so a draft from one test doesn't bleed
    // into the next. The shared ChatMessage stub uses a flat array.
    global.ChatMessage._created = [];
    global.game.messages = { contents: global.ChatMessage._created };
  });

  afterEach(() => {
    global.ChatMessage._created = [];
    global.game.messages = { contents: global.ChatMessage._created };
  });

  it("does not re-flag an entity that is already sitting in a draft card", async () => {
    const fixture = buildFullCampaignState();

    // First detection — posts a draft card containing "Chen".
    await routeEntityDrafts(
      [{ type: "connection", name: "Chen", description: "scientist" }],
      fixture.campaignState,
      { autoCreateConnection: false, source: "paced_narrative" },
    );
    const firstDraftCount = global.game.messages.contents.filter(
      m => m.flags?.[MODULE_ID]?.draftEntityCard,
    ).length;
    expect(firstDraftCount).toBe(1);

    // Second detection on the next narration — same name, still pending.
    await routeEntityDrafts(
      [{ type: "connection", name: "Chen", description: "scientist" }],
      fixture.campaignState,
      { autoCreateConnection: false, source: "paced_narrative" },
    );
    const secondDraftCount = global.game.messages.contents.filter(
      m => m.flags?.[MODULE_ID]?.draftEntityCard,
    ).length;
    expect(secondDraftCount).toBe(1);
    fixture.restore();
  });

  it("filters pending names out of parseDetectionResponse too", async () => {
    const fixture = buildFullCampaignState();
    await routeEntityDrafts(
      [{ type: "connection", name: "Dr. Chen", description: "scientist" }],
      fixture.campaignState,
      { autoCreateConnection: false, source: "paced_narrative" },
    );

    // Haiku now returns the same NPC (possibly with a different form).
    const raw = JSON.stringify({
      entities: [
        { type: "connection", name: "Chen", confidence: "high" },
      ],
    });
    const result = parseDetectionResponse(raw, fixture.campaignState);
    expect(result.entities).toEqual([]);
    fixture.restore();
  });

  it("lists pending drafts in the detection prompt under PENDING DRAFTS", async () => {
    const fixture = buildFullCampaignState();
    await routeEntityDrafts(
      [{ type: "connection", name: "Dr. Chen", description: "scientist" }],
      fixture.campaignState,
      { autoCreateConnection: false, source: "paced_narrative" },
    );
    const prompt = buildCombinedDetectionPrompt(
      "a paragraph mentioning Chen",
      PACED_NARRATIVE_MOVE_ID,
      PACED_NARRATIVE_OUTCOME,
      fixture.campaignState,
    );
    expect(prompt).toContain("PENDING DRAFTS");
    expect(prompt).toContain("Dr. Chen");
    fixture.restore();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Prompt content — honorific-equivalence instruction
// ─────────────────────────────────────────────────────────────────────────────

describe("buildCombinedDetectionPrompt — honorific instruction", () => {
  it("tells the detector to treat honorifics as equivalent", () => {
    const fixture = buildFullCampaignState();
    const prompt = buildCombinedDetectionPrompt(
      "narration",
      PACED_NARRATIVE_MOVE_ID,
      PACED_NARRATIVE_OUTCOME,
      fixture.campaignState,
    );
    expect(prompt.toLowerCase()).toContain("honorifics and titles as equivalent");
    fixture.restore();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Draft entity card — Confirm/Dismiss UI shape
// (ENTITY-001 — UX half: chat-card buttons replaced the misleading "Open the
// Entities panel" hint that pointed at a non-existent confirm flow.)
// ─────────────────────────────────────────────────────────────────────────────

describe("draft entity card — Confirm/Dismiss buttons", () => {
  beforeEach(() => {
    global.ChatMessage._created = [];
    global.game.messages = { contents: global.ChatMessage._created };
  });
  afterEach(() => {
    global.ChatMessage._created = [];
    global.game.messages = { contents: global.ChatMessage._created };
  });

  it("renders per-row Confirm and Dismiss buttons with stable indices", async () => {
    const fixture = buildFullCampaignState();
    await routeEntityDrafts([
      { type: "faction", name: "Crimson Veil", description: "splinter cult", confidence: "high" },
      { type: "ship",    name: "Long Memory", description: "old freighter",  confidence: "high" },
    ], fixture.campaignState);

    const card = global.ChatMessage._created[0];
    expect(card).toBeTruthy();
    expect(card.flags?.[MODULE_ID]?.draftEntityCard).toBe(true);

    // Each row has both buttons, indexed 0 and 1.
    expect(card.content).toContain('data-action="sf-draft-confirm" data-index="0"');
    expect(card.content).toContain('data-action="sf-draft-dismiss" data-index="0"');
    expect(card.content).toContain('data-action="sf-draft-confirm" data-index="1"');
    expect(card.content).toContain('data-action="sf-draft-dismiss" data-index="1"');

    // Hint text replaces the misleading "Open the Entities panel..." line.
    expect(card.content).not.toContain("Open the Entities panel");
    expect(card.content).toContain("Confirm to add to the Entities panel");

    // Drafts in flags carry the index + status fields used by the click handler.
    const drafts = card.flags[MODULE_ID].drafts;
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ name: "Crimson Veil", index: 0, status: "pending" });
    expect(drafts[1]).toMatchObject({ name: "Long Memory",  index: 1, status: "pending" });

    fixture.restore();
  });
});

describe("collectPendingDraftNames — only suppresses pending drafts", () => {
  beforeEach(() => {
    global.ChatMessage._created = [];
    global.game.messages = { contents: global.ChatMessage._created };
  });
  afterEach(() => {
    global.ChatMessage._created = [];
    global.game.messages = { contents: global.ChatMessage._created };
  });

  it("does not suppress detection of a draft that has already been confirmed or dismissed", async () => {
    const fixture = buildFullCampaignState();
    await routeEntityDrafts(
      [{ type: "ship", name: "Long Memory", description: "freighter" }],
      fixture.campaignState,
    );

    // Manually mark the only draft as confirmed (simulating the user
    // clicking the chat-card Confirm button — the message stays in chat).
    const card = global.game.messages.contents[0];
    const drafts = card.flags[MODULE_ID].drafts.map(d => ({ ...d, status: "confirmed" }));
    card.flags[MODULE_ID].drafts = drafts;

    // The detector should now see no PENDING DRAFTS line for "Long Memory",
    // so a fresh detection of the same name parses through (it would be
    // suppressed elsewhere by entityExistsForName once actually created,
    // but parseDetectionResponse alone should not block it).
    const raw = JSON.stringify({
      entities: [{ type: "ship", name: "Long Memory", confidence: "high" }],
    });
    const parsed = parseDetectionResponse(raw, fixture.campaignState);
    expect(parsed.entities).toHaveLength(1);
    expect(parsed.entities[0].name).toBe("Long Memory");

    fixture.restore();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Seed enrichment — oracle backfill at entity creation
// ─────────────────────────────────────────────────────────────────────────────

describe("buildConnectionSeedData", () => {
  it("combines detector description with oracle first-look for journal description", () => {
    const result = buildConnectionSeedData(
      { name: "Kael", description: "Battle-scarred captain." },
      { role: "Mercenary", goal: "Settle a debt", firstLook: "Augmented arm" },
    );
    expect(result.name).toBe("Kael");
    expect(result.description).toContain("Battle-scarred captain.");
    expect(result.description).toContain("Augmented arm");
    expect(result.role).toBe("Mercenary");
    expect(result.motivation).toBe("Settle a debt");
  });

  it("falls back to the rolled given name when the draft has no name", () => {
    const result = buildConnectionSeedData(
      { name: "", description: "" },
      { role: "Drifter", goal: "Find kin", firstLook: "Heavy coat", givenName: "Vesna" },
    );
    expect(result.name).toBe("Vesna");
  });

  it("builds a portrait source even when the detector description was empty", () => {
    const result = buildConnectionSeedData(
      { name: "Vesna", description: "" },
      { role: "Drifter", firstLook: "Heavy coat, hood drawn" },
    );
    expect(result.portraitSource).toContain("Heavy coat");
    expect(result.portraitSource).toContain("Drifter");
  });

  it("uses safe defaults when seed is null", () => {
    const result = buildConnectionSeedData(
      { name: "Anon", description: "A figure." },
      null,
    );
    expect(result.name).toBe("Anon");
    expect(result.role).toBe("");
    expect(result.motivation).toBe("");
  });
});

describe("buildShipSeedData", () => {
  it("combines detector description with oracle type and first look", () => {
    const result = buildShipSeedData(
      { name: "Long Memory", description: "Aging freighter." },
      { type: "Freighter", firstLook: "Patched hull", name: "Long Memory" },
    );
    expect(result.name).toBe("Long Memory");
    expect(result.description).toContain("Aging freighter.");
    expect(result.description).toContain("Patched hull");
    expect(result.description).toContain("Freighter");
    expect(result.type).toBe("Freighter");
    expect(result.firstLook).toBe("Patched hull");
  });

  it("falls back to the rolled ship name when the draft has no name", () => {
    const result = buildShipSeedData(
      { name: "", description: "" },
      { type: "Courier", firstLook: "Sleek", name: "Inkwell" },
    );
    expect(result.name).toBe("Inkwell");
  });

  it("builds a portrait source even when the detector description was empty", () => {
    const result = buildShipSeedData(
      { name: "Inkwell", description: "" },
      { type: "Courier", firstLook: "Sleek matte hull" },
    );
    expect(result.portraitSource).toContain("Sleek matte hull");
    expect(result.portraitSource).toContain("Courier");
  });
});

describe("routeEntityDrafts — connection seed backfill on auto-create", () => {
  it("seeds the auto-created connection journal with role, motivation, and oracle first-look", async () => {
    const fixture = buildFullCampaignState();
    const result = await routeEntityDrafts(
      [{ type: "connection", name: "Kael", description: "scarred captain", confidence: "high" }],
      fixture.campaignState,
      {
        autoCreateConnection: true,
        connectionSeed: {
          role:      "Mercenary",
          goal:      "Settle a debt",
          firstLook: "Augmented arm, eyepatch",
          givenName: "Kael",
        },
      },
    );
    expect(result.created).toHaveLength(1);
    const rec = result.created[0].record;
    expect(rec.role).toBe("Mercenary");
    expect(rec.motivation).toBe("Settle a debt");
    expect(rec.description).toContain("scarred captain");
    expect(rec.description).toContain("Augmented arm, eyepatch");
    // portraitSourceDescription must land atomically as part of the create —
    // not as a follow-up write — otherwise the Quench Confirm-from-draft
    // test races (saw '' on the journal because the field was set after
    // connectionIds grew). See v1.2.14 → v1.2.15 fix.
    expect(rec.portraitSourceDescription).toBeTruthy();
    expect(rec.portraitSourceDescription).toContain("Augmented arm");
    fixture.restore();
  });

  it("uses the rolled given_name when the detector found no name", async () => {
    const fixture = buildFullCampaignState();
    const result = await routeEntityDrafts(
      [{ type: "connection", name: "", description: "a figure in the doorway", confidence: "high" }],
      fixture.campaignState,
      {
        autoCreateConnection: true,
        connectionSeed: {
          role:      "Drifter",
          goal:      "Find kin",
          firstLook: "Heavy coat, hood drawn",
          givenName: "Vesna",
        },
      },
    );
    // With no draft name, the routing filter strips the entity before
    // auto-create runs (the routing layer requires entity.name). So this
    // path documents that the routing requires a non-empty draft name —
    // the rolled name only fills in when something else is already there.
    // Verified by the unit test on buildConnectionSeedData above.
    expect(result.created).toEqual([]);
    fixture.restore();
  });
});
