/**
 * STARFORGED COMPANION
 * tests/unit/sectorSettlementCardGaps.test.js
 *
 * SECTOR-CARD-GAPS:
 *   1. The narrator's settlement card (formatEntityCard) showed a settlement's
 *      location, population, authority, first look … but not its projects or
 *      its trouble — rolled by the sector generator and stored on the record.
 *   2. The settlement sheet's rolled-details line (composeSettlementDescription)
 *      was written only beside a narrator stub: with stubs off, no key, or a
 *      failed stub call, the sheet showed nothing the wizard rolled.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));

import { formatEntityCard } from "../../src/narration/narratorPrompt.js";
import { applyStubsToSettlementEntities } from "../../src/sectors/sectorGenerator.js";
import * as settlement from "../../src/entities/settlement.js";

const MODULE_ID = "starforged-companion";

describe("the narrator's settlement card shows the settlement's projects and trouble", () => {
  it("lists Projects and Trouble beside Population and Authority", () => {
    const card = formatEntityCard({
      name: "Bleakhold", population: "Hundreds", authority: "Corrupt",
      projects: ["Mining", "Trade"], trouble: "Dangerous fauna",
    }, "settlement");
    expect(card).toContain("Population: Hundreds");
    expect(card).toContain("Projects: Mining, Trade");
    expect(card).toContain("Trouble: Dangerous fauna");
  });

  it("control: a settlement with no projects and no trouble shows neither line", () => {
    const card = formatEntityCard({ name: "Rockhome", population: "Dozens", projects: [], trouble: "" }, "settlement");
    expect(card).not.toContain("Projects:");
    expect(card).not.toContain("Trouble:");
  });
});

describe("the settlement sheet's rolled-details line without a narrator stub", () => {
  afterEach(() => vi.restoreAllMocks());

  const rolled = (id) => ({ id, flags: { [MODULE_ID]: { settlement: {
    location: "Orbital", population: "Thousands", authority: "Ironclad", projects: ["Defense"], trouble: "Raiders",
  } } } });

  it("is written for a settlement with no stub (narrator stubs off)", async () => {
    const spy = vi.spyOn(settlement, "updateSettlement").mockResolvedValue({});
    await applyStubsToSettlementEntities({ gen1: rolled("actor-1") }, { sector: null, settlements: {} });
    expect(spy).toHaveBeenCalledTimes(1);
    const { description } = spy.mock.calls[0][1];
    expect(description).toContain("<strong>Population:</strong> Thousands");
    expect(description).toContain("<strong>Projects:</strong> Defense");
    expect(description).toContain("<strong>Trouble:</strong> Raiders");
  });

  it("is written when the stubs payload is missing altogether", async () => {
    const spy = vi.spyOn(settlement, "updateSettlement").mockResolvedValue({});
    await applyStubsToSettlementEntities({ gen1: rolled("actor-1") }, undefined);
    expect(spy).toHaveBeenCalledWith("actor-1", expect.objectContaining({
      description: expect.stringContaining("<strong>Authority:</strong> Ironclad"),
    }));
  });

  it("control: with a stub the prose leads and the details follow", async () => {
    const spy = vi.spyOn(settlement, "updateSettlement").mockResolvedValue({});
    await applyStubsToSettlementEntities({ gen1: rolled("actor-1") }, { settlements: { gen1: "A ring of lights." } });
    const { description } = spy.mock.calls[0][1];
    expect(description).toMatch(/^<p>A ring of lights\.<\/p><hr><p>.*Thousands/);
  });
});
