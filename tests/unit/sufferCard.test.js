/**
 * STARFORGED COMPANION
 * tests/unit/sufferCard.test.js
 *
 * Non-blocking suffer-choice card. The apply logic (resolveSufferSelection /
 * runSufferResolution) is covered in sufferDialog.test.js; here we pin the
 * card-specific rendering, the multi-select cap, the call summary, and that
 * posting stashes the flags the click handler needs.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  sufferMultiCap,
  renderSufferCard,
  summarizeSufferCalls,
  postSufferChoiceCard,
  applySufferPickFromRelay,
} from "../../src/moves/sufferCard.js";
import { invalidateActorCache } from "../../src/character/actorBridge.js";

const MODULE_ID = "starforged-companion";

// ── sufferMultiCap ────────────────────────────────────────────────────────────

describe("sufferMultiCap", () => {
  it("returns 1 for single-select and B1 'any' prompts", () => {
    expect(sufferMultiCap({ kind: "enumerated", options: [{}, {}] })).toBe(1);
    expect(sufferMultiCap({ kind: "any", amount: 1 })).toBe(1);
  });

  it("returns the numeric multi value", () => {
    expect(sufferMultiCap({ kind: "enumerated", multi: 2, options: [{}, {}, {}] })).toBe(2);
  });

  it("caps multi:true at the option count", () => {
    expect(sufferMultiCap({ kind: "enumerated", multi: true, options: [{}, {}, {}, {}] })).toBe(4);
  });
});

// ── renderSufferCard ──────────────────────────────────────────────────────────

describe("renderSufferCard", () => {
  it("renders the six suffer moves for a B1 'any' prompt", () => {
    const html = renderSufferCard({ kind: "any", amount: 1, count: 1 }, null);
    expect(html).toContain("Make a suffer move (-1)");
    for (const label of ["Endure Harm", "Endure Stress", "Lose Momentum",
      "Sacrifice Resources", "Withstand Damage", "Companion Takes a Hit"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('data-pick-kind="any"');
  });

  it("disables a requires-gated option that is not available", () => {
    const prompt = { kind: "enumerated", options: [
      { label: "+1 health (if not wounded)", health: 1, requires: "!wounded" },
      { label: "+1 momentum", momentum: 1 },
    ]};
    const woundedActor = { system: { debility: { wounded: true } } };
    const html = renderSufferCard(prompt, woundedActor);
    // Option 0 unavailable → disabled + "(unavailable)"; option 1 enabled.
    expect(html).toMatch(/data-option-index="0"[^>]*disabled/);
    expect(html).toContain("(unavailable)");
    expect(html).not.toMatch(/data-option-index="1"[^>]*disabled/);
  });

  it("marks an already-picked option (multi-select) as done and disabled", () => {
    const prompt = { kind: "enumerated", multi: 2, options: [
      { label: "Mark progress", combatProgress: 1 },
      { label: "+2 momentum", momentum: 2 },
      { label: "+1 next move", nextBonus: 1 },
    ]};
    const html = renderSufferCard(prompt, null, [0]);
    expect(html).toContain("Choose 2:");
    expect(html).toMatch(/data-option-index="0"[^>]*disabled/);
    expect(html).toContain("✓ Mark progress");
    expect(html).not.toMatch(/data-option-index="1"[^>]*disabled/);
  });

  it("escapes option labels", () => {
    const html = renderSufferCard({ kind: "enumerated", options: [{ label: "<b>x</b>", momentum: 1 }] }, null);
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

// ── summarizeSufferCalls ──────────────────────────────────────────────────────

describe("summarizeSufferCalls", () => {
  it("summarises meter and suffer calls", () => {
    expect(summarizeSufferCalls([{ kind: "meter", meterKey: "momentum", delta: 2 }]))
      .toBe("Momentum +2");
    expect(summarizeSufferCalls([{ kind: "suffer", sufferId: "lose_momentum", amount: 1 }]))
      .toBe("Lose Momentum (-1)");
    expect(summarizeSufferCalls([])).toBe("no change");
  });

  it("labels meters and impacts through the system localisation (i18n)", () => {
    const saved = game.i18n;
    game.i18n = {
      localize: (key) => ({
        "IRONSWORN.Health":   "Santé",
        "IRONSWORN.Doomed":   "Condamné",
        "IRONSWORN.Wounded":  "Blessé",
      })[key] ?? key,
    };
    try {
      expect(summarizeSufferCalls([
        { kind: "meter", meterKey: "health", delta: -1 },
        { kind: "mark", debility: "doomed" },
        { kind: "clear-impact", debility: "wounded" },
      ])).toBe("Santé -1, marked Condamné, cleared Blessé");
    } finally {
      game.i18n = saved;
    }
  });

  it("keeps a non-meter numeric option key verbatim (no unknown-slug lookup)", () => {
    expect(summarizeSufferCalls([{ kind: "meter", meterKey: "integrity", delta: 1 }]))
      .toBe("integrity +1");
    expect(getCapturedWarns()).toEqual([]);
  });
});

// ── postSufferChoiceCard ──────────────────────────────────────────────────────

describe("postSufferChoiceCard", () => {
  beforeEach(() => { global.ChatMessage._reset(); });

  it("posts a card carrying the prompt, actor, opts, and resolved=false", async () => {
    const prompt = { kind: "any", amount: 1, count: 1 };
    await postSufferChoiceCard({
      sufferPrompt: prompt,
      actor: { id: "actor-1" },
      executorOpts: { isMiss: true },
      moveId: "face_danger",
    });
    expect(ChatMessage._created).toHaveLength(1);
    const flags = ChatMessage._created[0].flags[MODULE_ID];
    expect(flags.sufferCard).toBe(true);
    expect(flags.sufferPrompt).toEqual(prompt);
    expect(flags.actorId).toBe("actor-1");
    expect(flags.executorOpts).toEqual({ isMiss: true });
    expect(flags.moveId).toBe("face_danger");
    expect(flags.resolved).toBe(false);
    expect(flags.pickedIndices).toEqual([]);
  });

  it("no-ops without a prompt", async () => {
    const result = await postSufferChoiceCard({ sufferPrompt: null, actor: { id: "a" } });
    expect(result).toBeNull();
    expect(ChatMessage._created).toHaveLength(0);
  });
});

// ── applySufferPickFromRelay (gmRelay "suffer.pick", issue #302) ─────────────

describe("applySufferPickFromRelay — a pick applies once, on the canonical GM", () => {
  let pc;
  let card;

  function sufferCardMessage(prompt, extra = {}) {
    const msg = {
      id: "m-suffer",
      content: renderSufferCard(prompt, pc, []),
      flags: { [MODULE_ID]: { sufferCard: true, sufferPrompt: prompt, executorOpts: {}, actorId: pc.id, moveId: "face_danger", pickedIndices: [], resolved: false, ...extra } },
      async update(changes) {
        for (const [path, val] of Object.entries(changes)) {
          if (path === "content") { msg.content = val; continue; }
          const parts = path.split(".");
          let t = msg;
          for (let i = 0; i < parts.length - 1; i++) t = (t[parts[i]] ??= {});
          t[parts.at(-1)] = val;
        }
      },
    };
    game.messages = { contents: [msg], get: (id) => (id === msg.id ? msg : null) };
    return msg;
  }

  const gm     = { requesterId: "gm-1", requesterIsGM: true };
  const owner  = { requesterId: "pl-1", requesterIsGM: false, requester: { id: "pl-1" } };
  const other  = { requesterId: "pl-2", requesterIsGM: false, requester: { id: "pl-2" } };

  beforeEach(() => {
    ChatMessage._reset();
    game.actors._reset();
    pc = makeTestActor({ id: "pc-1", name: "Kira", ownership: { "pl-1": 3 } });
    game.actors._set(pc.id, pc);
    invalidateActorCache(pc.id);
    card = sufferCardMessage({ kind: "any", amount: 1, count: 1 });
  });

  it("applies the owner's pick and resolves the card; a second pick applies nothing", async () => {
    await expect(applySufferPickFromRelay({ messageId: card.id, pickKind: "any", sufferId: "lose_momentum" }, owner))
      .resolves.toEqual({ applied: true });
    expect(pc.system.momentum.value).toBe(1);
    expect(card.flags[MODULE_ID].resolved).toBe(true);

    await expect(applySufferPickFromRelay({ messageId: card.id, pickKind: "any", sufferId: "sacrifice_resources" }, gm))
      .resolves.toEqual({ applied: false, reason: "already-resolved" });
    expect(pc.system.supply.value).toBe(3);
  });

  it("refuses a requester who neither is a GM nor owns the PC", async () => {
    await expect(applySufferPickFromRelay({ messageId: card.id, pickKind: "any", sufferId: "lose_momentum" }, other))
      .resolves.toEqual({ applied: false, reason: "not-owner" });
    expect(pc.system.momentum.value).toBe(2);
    expect(card.flags[MODULE_ID].resolved).toBe(false);
  });

  it("refuses a pick the card does not offer — the payload only names a button", async () => {
    for (const payload of [
      { pickKind: "any", sufferId: "drink_the_reactor" },
      { pickKind: "enum", optionIndex: "0" },
      { pickKind: "something" },
    ]) {
      await expect(applySufferPickFromRelay({ messageId: card.id, ...payload }, gm), JSON.stringify(payload))
        .resolves.toEqual({ applied: false, reason: "not-offered" });
    }
    const options = sufferCardMessage({ kind: "enumerated", options: [
      { label: "+1 health (if not wounded)", health: 1, requires: "!wounded" },
      { label: "-1 momentum", momentum: -1 },
    ] }, { pickedIndices: [1] });
    pc.system.debility.wounded = true;
    for (const optionIndex of ["0", "1", "7", "x"]) {   // unavailable, already picked, out of range, not a number
      await expect(applySufferPickFromRelay({ messageId: options.id, pickKind: "enum", optionIndex }, gm), optionIndex)
        .resolves.toEqual({ applied: false, reason: "not-offered" });
    }
    expect(pc._updateHistory).toEqual([]);
  });

  it("warns and applies nothing when the card is gone", async () => {
    await expect(applySufferPickFromRelay({ messageId: "m-gone", pickKind: "any", sufferId: "lose_momentum" }, gm))
      .resolves.toEqual({ applied: false, reason: "no-message" });
  });
});

