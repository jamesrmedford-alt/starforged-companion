/**
 * STARFORGED COMPANION
 * tests/unit/schemas.test.js
 *
 * Unit tests for the schema foundations introduced for the narrator
 * entity-discovery feature: narratorClass on moves, canonicalLocked +
 * generativeTier on entity schemas, new fields on CampaignStateSchema,
 * LocationSchema and CreatureSchema, and the raised context budget.
 */

import { describe, it, expect } from "vitest";
import {
  MOVES,
  NARRATOR_CLASSES,
  ConnectionSchema,
  CampaignStateSchema,
  ContextPacketSchema,
} from "../../src/schemas.js";
import { ShipSchema }       from "../../src/entities/ship.js";
import { SettlementSchema } from "../../src/entities/settlement.js";
import { FactionSchema }    from "../../src/entities/faction.js";
import { PlanetSchema }     from "../../src/entities/planet.js";
import { LocationSchema }   from "../../src/entities/location.js";
import { CreatureSchema }   from "../../src/entities/creature.js";


// ─────────────────────────────────────────────────────────────────────────────
// MOVES — narratorClass
// ─────────────────────────────────────────────────────────────────────────────

describe("MOVES narratorClass", () => {
  const moveIds = Object.keys(MOVES);

  it("all moves have a narratorClass field", () => {
    for (const id of moveIds) {
      expect(MOVES[id], `move ${id}`).toHaveProperty("narratorClass");
      expect(typeof MOVES[id].narratorClass, `move ${id}`).toBe("string");
    }
  });

  it("narratorClass values are only discovery | interaction | embellishment | hybrid", () => {
    const valid = new Set(NARRATOR_CLASSES);
    expect(valid.size).toBe(4);
    for (const id of moveIds) {
      expect(valid.has(MOVES[id].narratorClass), `move ${id}`).toBe(true);
    }
  });

  it("make_a_connection is discovery", () => {
    expect(MOVES.make_a_connection.narratorClass).toBe("discovery");
  });

  it("enter_the_fray is interaction", () => {
    expect(MOVES.enter_the_fray.narratorClass).toBe("interaction");
  });

  it("endure_harm is embellishment", () => {
    expect(MOVES.endure_harm.narratorClass).toBe("embellishment");
  });

  it("face_danger is hybrid", () => {
    expect(MOVES.face_danger.narratorClass).toBe("hybrid");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Entity schema extensions — canonicalLocked + generativeTier
// ─────────────────────────────────────────────────────────────────────────────

describe("Entity schema extensions", () => {
  it("ConnectionSchema has canonicalLocked field defaulting to false", () => {
    expect(ConnectionSchema).toHaveProperty("canonicalLocked");
    expect(ConnectionSchema.canonicalLocked).toBe(false);
  });

  it("ConnectionSchema has generativeTier array defaulting to []", () => {
    expect(ConnectionSchema).toHaveProperty("generativeTier");
    expect(Array.isArray(ConnectionSchema.generativeTier)).toBe(true);
    expect(ConnectionSchema.generativeTier).toHaveLength(0);
  });

  it.each([
    ["ShipSchema",       ShipSchema],
    ["SettlementSchema", SettlementSchema],
    ["FactionSchema",    FactionSchema],
    ["PlanetSchema",     PlanetSchema],
  ])("%s has canonicalLocked: false and generativeTier: []", (_name, schema) => {
    expect(schema.canonicalLocked).toBe(false);
    expect(Array.isArray(schema.generativeTier)).toBe(true);
    expect(schema.generativeTier).toHaveLength(0);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// LocationSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("LocationSchema", () => {
  const required = [
    "_id", "name", "active",
    "type", "region", "status",
    "firstLook", "feature", "peril", "opportunity",
    "description", "history", "notes",
    "portraitId", "portraitSourceDescription",
    "sceneRelevant", "narratorNotes",
    "sectorId", "settlementId",
    "canonicalLocked", "generativeTier",
    "createdAt", "updatedAt",
  ];

  it("has all required fields", () => {
    for (const key of required) {
      expect(LocationSchema, `field ${key}`).toHaveProperty(key);
    }
  });

  it("canonicalLocked defaults to false and generativeTier to []", () => {
    expect(LocationSchema.canonicalLocked).toBe(false);
    expect(LocationSchema.generativeTier).toEqual([]);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// CreatureSchema
// ─────────────────────────────────────────────────────────────────────────────

describe("CreatureSchema", () => {
  const required = [
    "_id", "name", "active",
    "environment", "scale", "form",
    "firstLook", "aspect", "behavior", "encounter",
    "rank", "attackPattern",
    "description", "notes",
    "portraitId", "portraitSourceDescription",
    "sceneRelevant", "narratorNotes",
    "canonicalLocked", "generativeTier",
    "createdAt", "updatedAt",
  ];

  it("has all required fields", () => {
    for (const key of required) {
      expect(CreatureSchema, `field ${key}`).toHaveProperty(key);
    }
  });

  it("firstLook and aspect default to []", () => {
    expect(CreatureSchema.firstLook).toEqual([]);
    expect(CreatureSchema.aspect).toEqual([]);
  });

  it("canonicalLocked defaults to false and generativeTier to []", () => {
    expect(CreatureSchema.canonicalLocked).toBe(false);
    expect(CreatureSchema.generativeTier).toEqual([]);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// CampaignStateSchema additions
// ─────────────────────────────────────────────────────────────────────────────

describe("CampaignStateSchema entity-discovery additions", () => {
  it("has locationIds array defaulting to []", () => {
    expect(CampaignStateSchema).toHaveProperty("locationIds");
    expect(CampaignStateSchema.locationIds).toEqual([]);
  });

  it("has creatureIds array defaulting to []", () => {
    expect(CampaignStateSchema).toHaveProperty("creatureIds");
    expect(CampaignStateSchema.creatureIds).toEqual([]);
  });

  it("has currentLocationId defaulting to null", () => {
    expect(CampaignStateSchema).toHaveProperty("currentLocationId");
    expect(CampaignStateSchema.currentLocationId).toBeNull();
  });

  it("has currentLocationType defaulting to null", () => {
    expect(CampaignStateSchema).toHaveProperty("currentLocationType");
    expect(CampaignStateSchema.currentLocationType).toBeNull();
  });

  it("has dismissedEntities array defaulting to []", () => {
    expect(CampaignStateSchema).toHaveProperty("dismissedEntities");
    expect(CampaignStateSchema.dismissedEntities).toEqual([]);
  });

  it("has pendingClarification defaulting to null", () => {
    expect(CampaignStateSchema).toHaveProperty("pendingClarification");
    expect(CampaignStateSchema.pendingClarification).toBeNull();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Token budget
// ─────────────────────────────────────────────────────────────────────────────

describe("ContextPacketSchema.tokenBudget", () => {
  it("is 1200", () => {
    expect(ContextPacketSchema.tokenBudget).toBe(1200);
  });
});
