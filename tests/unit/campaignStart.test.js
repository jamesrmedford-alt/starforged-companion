/**
 * STARFORGED COMPANION
 * tests/unit/campaignStart.test.js
 *
 * ✦ Campaign Start orchestrator (src/session/campaignStart.js): GM gate,
 * confirm/cancel, each phase's success / failure / degraded reporting, the
 * summary card, and the ensure-once hotbar Macro. The five phase
 * implementations are mocked — they have their own suites.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/session/quickstart.js", () => ({
  runPlaytestQuickstart: vi.fn(),
}));
vi.mock("../../src/entities/finalize.js", () => ({
  finalizeEntity: vi.fn(),
}));
vi.mock("../../src/entities/shipEnvision.js", () => ({
  envisionShip:       vi.fn(),
  renderEnvisionHtml: vi.fn(() => "<p>envisioned</p>"),
  appendNotesSection: vi.fn(async () => {}),
}));
vi.mock("../../src/session/incitingIncident.js", () => ({
  runIncitingIncident: vi.fn(),
}));

import { runCampaignStart, ensureCampaignStartMacro } from "../../src/session/campaignStart.js";
import { runPlaytestQuickstart } from "../../src/session/quickstart.js";
import { finalizeEntity } from "../../src/entities/finalize.js";
import { envisionShip, appendNotesSection } from "../../src/entities/shipEnvision.js";
import { runIncitingIncident } from "../../src/session/incitingIncident.js";

const MODULE_ID = "starforged-companion";

const ship = {
  id: "ship-1", name: "Wayward Star", type: "starship",
  flags: { [MODULE_ID]: { ship: { isCommandVehicle: true } } },
};
const npc = { id: "npc-1", name: "Mara Voss", type: "character" };

function state() { return game.settings.get(MODULE_ID, "campaignState"); }
function summaryCard() {
  return ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.campaignStartCard);
}
function phase(result, name) { return result.phases.find(p => p.phase === name); }

let confirmSpy;
beforeEach(async () => {
  ChatMessage._reset();
  vi.clearAllMocks();
  game.actors._setAll([ship, npc]);
  await game.settings.set(MODULE_ID, "campaignState", {
    shipIds: ["ship-1"], connectionIds: ["npc-1"], sessionActive: false,
  });

  runPlaytestQuickstart.mockResolvedValue({ phases: [{ phase: "World Truths", ok: true, detail: "" }] });
  envisionShip.mockResolvedValue({ facet: "all", rolls: [], prose: "A battered hauler.", identity: {} });
  finalizeEntity.mockResolvedValue({ ok: true, reason: "seeded" });
  runIncitingIncident.mockResolvedValue({ spark: { action: "Seize", theme: "Power" }, text: "It begins." });

  confirmSpy = vi.fn(async () => true);
  foundry.applications.api.DialogV2 = { confirm: confirmSpy };
  globalThis.Hooks.callAll ??= (...args) => globalThis.Hooks.call(...args);
});

afterEach(() => {
  game.actors._reset();
  delete foundry.applications.api.DialogV2;
});

describe("runCampaignStart — gate and confirm", () => {
  it("is GM-only: a player gets a warning and nothing runs", async () => {
    const restore = globalThis.asPlayer();
    const warn = vi.spyOn(ui.notifications, "warn");
    try {
      expect(await runCampaignStart({ skipConfirm: true })).toBeNull();
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/GM-only/));
      expect(runPlaytestQuickstart).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("cancelling the confirm dialog runs nothing", async () => {
    confirmSpy.mockResolvedValue(false);
    expect(await runCampaignStart()).toBeNull();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(runPlaytestQuickstart).not.toHaveBeenCalled();
    expect(ChatMessage._created).toHaveLength(0);
  });

  it("a confirm dialog that throws is treated as cancel — and warns", async () => {
    confirmSpy.mockRejectedValue(new Error("dialog closed"));
    expect(await runCampaignStart()).toBeNull();
    expect(runPlaytestQuickstart).not.toHaveBeenCalled();
    expect(globalThis.getCapturedWarns().join("\n")).toMatch(/confirm dialog failed/);
  });

  it("skipConfirm bypasses the dialog", async () => {
    await runCampaignStart({ skipConfirm: true });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(runPlaytestQuickstart).toHaveBeenCalledWith({ skipConfirm: true });
  });
});

describe("runCampaignStart — happy path", () => {
  it("runs all five phases in order and reports each as ok", async () => {
    const result = await runCampaignStart();
    expect(result.phases.map(p => p.phase)).toEqual([
      "Quickstart", "Ship envision", "Connection — Mara Voss", "Begin Session", "Inciting Incident",
    ]);
    expect(result.phases.every(p => p.ok && !p.degraded)).toBe(true);

    expect(envisionShip).toHaveBeenCalledWith(ship, { facet: "all" });
    expect(appendNotesSection).toHaveBeenCalledWith(ship, "Envisioned details", "<p>envisioned</p>");
    expect(finalizeEntity).toHaveBeenCalledWith("connection", "npc-1", expect.any(Object));
    expect(state().sessionActive).toBe(true);
    expect(runIncitingIncident).toHaveBeenCalledTimes(1);

    const envCard = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.shipEnvisionCard);
    expect(envCard.flags[MODULE_ID]).toMatchObject({ actorId: "ship-1", facet: "all" });
    expect(ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.sessionLifecycleCard)).toBe(true);
  });

  it("posts the summary card last with one ✅ row per phase", async () => {
    await runCampaignStart();
    const card = summaryCard();
    expect(ChatMessage._created.at(-1)).toBe(card);
    expect(card.content).toContain("Campaign Start — complete");
    expect((card.content.match(/✅/g) ?? []).length).toBe(5);
    expect(card.content).not.toMatch(/❌|⚠️/);
  });

  it("fires sessionStateChanged when the session begins", async () => {
    const seen = [];
    Hooks.on(`${MODULE_ID}.sessionStateChanged`, (p) => seen.push(p));
    await runCampaignStart();
    expect(seen).toContainEqual({ active: true });
  });

  it("falls back to the lone ship when none is flagged as the command vehicle", async () => {
    const plain = { id: "ship-2", name: "Plain", type: "starship", flags: {} };
    game.actors._setAll([plain]);
    await game.settings.set(MODULE_ID, "campaignState", { shipIds: ["ship-2"], connectionIds: [] });
    const result = await runCampaignStart();
    expect(envisionShip).toHaveBeenCalledWith(plain, { facet: "all" });
    expect(phase(result, "Ship envision").ok).toBe(true);
  });

  it("reports 'none generated' when the sector made no connections", async () => {
    await game.settings.set(MODULE_ID, "campaignState", { shipIds: ["ship-1"], connectionIds: [] });
    const result = await runCampaignStart();
    expect(phase(result, "Connections")).toMatchObject({ ok: true, detail: expect.stringMatching(/none generated/) });
    expect(finalizeEntity).not.toHaveBeenCalled();
  });
});

describe("runCampaignStart — failures are reported, never abort", () => {
  it("quickstart throwing is reported and later phases still run", async () => {
    runPlaytestQuickstart.mockRejectedValue(new Error("sector boom"));
    globalThis.expectConsoleError(/quickstart failed/);
    const result = await runCampaignStart();
    expect(phase(result, "Quickstart")).toMatchObject({ ok: false, detail: "sector boom" });
    expect(runIncitingIncident).toHaveBeenCalled();
    expect(summaryCard().content).toContain("❌");
  });

  it("quickstart returning null is a failure", async () => {
    runPlaytestQuickstart.mockResolvedValue(null);
    expectConsoleError(/quickstart failed/);
    const result = await runCampaignStart();
    expect(phase(result, "Quickstart")).toMatchObject({ ok: false, detail: "quickstart returned null" });
  });

  it("quickstart sub-phase failures mark the phase failed with a count", async () => {
    runPlaytestQuickstart.mockResolvedValue({ phases: [
      { phase: "World Truths", ok: true }, { phase: "Sector", ok: false }, { phase: "PCs", ok: false },
    ] });
    const result = await runCampaignStart();
    expect(phase(result, "Quickstart")).toMatchObject({ ok: false, detail: expect.stringMatching(/^2 phase\(s\) failed/) });
  });

  it("no command vehicle → envision phase fails, the rest continue", async () => {
    await game.settings.set(MODULE_ID, "campaignState", { shipIds: [], connectionIds: [] });
    expectConsoleError(/ship envision failed/);
    const result = await runCampaignStart();
    expect(phase(result, "Ship envision")).toMatchObject({ ok: false, detail: expect.stringMatching(/no command vehicle/) });
    expect(envisionShip).not.toHaveBeenCalled();
    expect(phase(result, "Begin Session").ok).toBe(true);
  });

  it("envision throwing is reported", async () => {
    envisionShip.mockRejectedValue(new Error("oracle missing"));
    expectConsoleError(/ship envision failed/);
    const result = await runCampaignStart();
    expect(phase(result, "Ship envision")).toMatchObject({ ok: false, detail: "oracle missing" });
  });

  it("envision without narrator prose is reported as degraded (⚠️), not clean", async () => {
    envisionShip.mockResolvedValue({ facet: "all", rolls: [], prose: null, identity: {} });
    const result = await runCampaignStart();
    expect(phase(result, "Ship envision")).toMatchObject({ ok: true, degraded: true });
    expect(summaryCard().content).toContain("⚠️");
  });

  it("a ship-notes append failure warns but the envision phase still succeeds", async () => {
    appendNotesSection.mockRejectedValueOnce(new Error("locked"));
    const result = await runCampaignStart();
    expect(phase(result, "Ship envision").ok).toBe(true);
    expect(globalThis.getCapturedWarns().join("\n")).toMatch(/ship notes append failed/);
  });

  it("per-connection finalize results are reported individually", async () => {
    const npc2 = { id: "npc-2", name: "Juno", type: "character" };
    game.actors._setAll([ship, npc, npc2]);
    await game.settings.set(MODULE_ID, "campaignState", { shipIds: ["ship-1"], connectionIds: ["npc-1", "npc-2", "ghost"] });
    finalizeEntity
      .mockResolvedValueOnce({ ok: true, reason: "seeded" })
      .mockRejectedValueOnce(new Error("portrait 500"))
      .mockResolvedValueOnce({ ok: false, reason: "not-found" });
    const result = await runCampaignStart();
    expect(phase(result, "Connection — Mara Voss")).toMatchObject({ ok: true, detail: "seeded" });
    expect(phase(result, "Connection — Juno")).toMatchObject({ ok: false, detail: "portrait 500" });
    expect(phase(result, "Connection — ghost")).toMatchObject({ ok: false, detail: "not-found" });
  });

  it("a begin-session persist failure is reported", async () => {
    const realSet = game.settings.set;
    game.settings.set = vi.fn(async () => { throw new Error("no permission"); });
    expectConsoleError(/begin session failed/);
    try {
      const result = await runCampaignStart();
      expect(phase(result, "Begin Session")).toMatchObject({ ok: false, detail: "no permission" });
      expect(runIncitingIncident).toHaveBeenCalled();
    } finally {
      game.settings.set = realSet;
    }
  });

  it("an already-active session is reported as such", async () => {
    await game.settings.set(MODULE_ID, "campaignState", { shipIds: ["ship-1"], connectionIds: [], sessionActive: true });
    const result = await runCampaignStart();
    expect(phase(result, "Begin Session")).toMatchObject({ ok: true, detail: "session was already active" });
  });

  it("an inciting incident with no narrator prose is degraded, not 'opening scene posted'", async () => {
    runIncitingIncident.mockResolvedValue({ spark: { action: "Seize", theme: "Power" }, text: null });
    const result = await runCampaignStart();
    const p = phase(result, "Inciting Incident");
    expect(p).toMatchObject({ ok: true, degraded: true });
    expect(p.detail).toMatch(/spark card only/);
  });

  it("an inciting incident that throws is reported", async () => {
    runIncitingIncident.mockRejectedValue(new Error("narrator down"));
    expectConsoleError(/inciting incident failed/);
    const result = await runCampaignStart();
    expect(phase(result, "Inciting Incident")).toMatchObject({ ok: false, detail: "narrator down" });
  });

  it("a summary-card failure warns and still returns the phases", async () => {
    const realCreate = ChatMessage.create;
    ChatMessage.create = vi.fn(async (data) => {
      if (data.flags?.[MODULE_ID]?.campaignStartCard) throw new Error("chat down");
      return data;
    });
    try {
      const result = await runCampaignStart();
      expect(result.phases).toHaveLength(5);
      expect(globalThis.getCapturedWarns().join("\n")).toMatch(/summary card failed/);
    } finally {
      ChatMessage.create = realCreate;
    }
  });

  it("escapes phase details in the summary card", async () => {
    runPlaytestQuickstart.mockRejectedValue(new Error("<script>x</script>"));
    expectConsoleError(/quickstart failed/);
    await runCampaignStart();
    expect(summaryCard().content).toContain("&lt;script&gt;");
    expect(summaryCard().content).not.toContain("<script>");
  });
});

describe("ensureCampaignStartMacro", () => {
  let created;
  beforeEach(() => {
    created = [];
    game.macros = { contents: created };
    globalThis.Macro = {
      create: vi.fn(async (data) => { const m = { ...data, id: `m${created.length}` }; created.push(m); return m; }),
    };
  });
  afterEach(() => {
    delete game.macros;
    delete globalThis.Macro;
  });

  it("creates the hotbar macro once, wired to the module API", async () => {
    const m = await ensureCampaignStartMacro();
    expect(Macro.create).toHaveBeenCalledTimes(1);
    expect(m.command).toContain(`game.modules.get("${MODULE_ID}")?.api?.runCampaignStart?.()`);
    expect(m.flags[MODULE_ID].campaignStartMacro).toBe(true);
  });

  it("is idempotent — returns the existing flagged macro", async () => {
    const first  = await ensureCampaignStartMacro();
    const second = await ensureCampaignStartMacro();
    expect(second).toBe(first);
    expect(Macro.create).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a player", async () => {
    const restore = globalThis.asPlayer();
    try {
      expect(await ensureCampaignStartMacro()).toBeNull();
      expect(Macro.create).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("warns and returns null when Macro.create fails", async () => {
    Macro.create.mockRejectedValueOnce(new Error("denied"));
    expect(await ensureCampaignStartMacro()).toBeNull();
    expect(globalThis.getCapturedWarns().join("\n")).toMatch(/macro creation failed/);
  });
});
