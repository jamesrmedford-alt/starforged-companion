/**
 * STARFORGED COMPANION
 * tests/unit/sufferCard.test.js
 *
 * Non-blocking suffer-choice card. The apply logic (resolveSufferSelection /
 * runSufferResolution) is covered in sufferDialog.test.js; here we pin the
 * card-specific rendering, the multi-select cap, the call summary, and that
 * posting stashes the flags the click handler needs.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  sufferMultiCap,
  renderSufferCard,
  summarizeSufferCalls,
  postSufferChoiceCard,
  applySufferPickFromRelay,
} from "../../src/moves/sufferCard.js";
import { invalidateActorCache } from "../../src/character/actorBridge.js";
import { mapConsequences } from "../../src/moves/resolver.js";

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
    // No index is not option 0, though Number(null) is 0.
    const open = sufferCardMessage({ kind: "enumerated", options: [{ label: "-1 momentum", momentum: -1 }] });
    for (const optionIndex of [null, "", undefined]) {
      await expect(applySufferPickFromRelay({ messageId: open.id, pickKind: "enum", optionIndex }, gm), String(optionIndex))
        .resolves.toEqual({ applied: false, reason: "not-offered" });
    }
    expect(pc._updateHistory).toEqual([]);
  });

  it("warns and applies nothing when the card is gone", async () => {
    await expect(applySufferPickFromRelay({ messageId: "m-gone", pickKind: "any", sufferId: "lose_momentum" }, gm))
      .resolves.toEqual({ applied: false, reason: "no-message" });
  });
});

// ── Withstand Damage: the integrity choices change the vehicle (issue #309 N02) ──

describe("Withstand Damage — its integrity choices change the vehicle (issue #309 N02)", () => {
  // The integrity option went to the PC's generic meter write, which has no
  // integrity and dropped it, and the card said it was applied: the weak-hit
  // trade still cost momentum. "Not battered" read the PC's impacts.
  const gm = { requesterId: "gm-1", requesterIsGM: true };
  let pc, ship;
  const integrity = () => ship.flags[MODULE_ID].ship.integrity;

  beforeEach(() => {
    ChatMessage._reset();
    game.actors._reset();
    pc = makeTestActor({ id: "pc-1", name: "Kira", ownership: { "pl-1": 3 } });
    ship = makeTestActor({ id: "ship-1", name: "Wayfarer", type: "starship", flags: { [MODULE_ID]: {
      entityType: "ship",
      ship: { _id: "ship-rec", name: "Wayfarer", isCommandVehicle: true, integrity: 2, integrityMax: 5, battered: false },
    } } });
    game.actors._set(pc.id, pc);
    game.actors._set(ship.id, ship);
    game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: [ship.id] });
    invalidateActorCache(pc.id);
  });
  afterEach(() => { game.settings._store.delete(`${MODULE_ID}.campaignState`); });

  /** Post the move's card as the pipeline does, then pick option `i` on the canonical GM. */
  async function choose(outcome, i, executorOpts = { vehicleActorId: ship.id }) {
    const prompt = mapConsequences("withstand_damage", outcome, false).sufferPrompt;
    const card = await postSufferChoiceCard({ sufferPrompt: prompt, actor: pc, executorOpts, moveId: "withstand_damage" });
    game.messages = { contents: [card], get: (id) => (id === card.id ? card : null) };
    const res = await applySufferPickFromRelay({ messageId: card.id, pickKind: "enum", optionIndex: String(i) }, gm);
    return { card, res };
  }

  it("strong hit: +1 integrity raises the vehicle's integrity", async () => {
    const { card, res } = await choose("strong_hit", 0);
    expect(res).toEqual({ applied: true });
    expect(integrity()).toBe(3);
    expect(card.flags[MODULE_ID].resolved).toBe(true);
    expect(card.content).toContain("Applied: integrity +1");
  });

  it("weak hit: the trade costs momentum and raises integrity", async () => {
    await choose("weak_hit", 0);
    expect({ momentum: pc.system.momentum.value, integrity: integrity() }).toEqual({ momentum: 1, integrity: 3 });
  });

  it("miss: -1 integrity lowers it", async () => {
    await choose("miss", 0);
    expect(integrity()).toBe(1);
  });

  it("a battered vehicle: its +1 integrity choices are unavailable, and nothing is charged", async () => {
    ship.system.debility.battered = true;
    const strong = await choose("strong_hit", 0);
    expect(strong.card.content).toMatch(/data-option-index="0"[^>]*disabled/);
    expect(strong.res).toEqual({ applied: false, reason: "not-offered" });
    const weak = await choose("weak_hit", 0);
    expect(weak.res).toEqual({ applied: false, reason: "not-offered" });
    expect({ momentum: pc.system.momentum.value, integrity: integrity() }).toEqual({ momentum: 2, integrity: 2 });
  });

  it("the PC's own battered impact is not the vehicle's", async () => {
    pc.system.debility.battered = true;
    await choose("strong_hit", 0);
    expect(integrity()).toBe(3);
  });

  it("a card naming no vehicle (posted before this fix) changes the command vehicle", async () => {
    await choose("strong_hit", 0, {});
    expect(integrity()).toBe(3);
  });

  it("no vehicle at all: +1 integrity is unavailable, and a -1 the card cannot apply says so", async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: [] });
    expect((await choose("strong_hit", 0, {})).res).toEqual({ applied: false, reason: "not-offered" });
    const miss = await choose("miss", 0, {});
    expect(miss.card.content).toContain("Not applied: integrity -1 — no vehicle to change");
    expect(integrity()).toBe(2);
  });
});

// ── Companion Takes a Hit: health changes the companion (issue #309 N03) ─────

describe("Companion Takes a Hit — its health choices change the companion (issue #309 N03)", () => {
  // The miss's "-1 companion health" went to the PC's generic meter write and
  // was dropped; the weak hit's recovery read companion health 0 (never
  // supplied), so it was always unavailable.
  const gm = { requesterId: "gm-1", requesterIsGM: true };
  let pc, glow, drone;

  /** A vendor-shaped Companion asset (category + track). */
  function companion(id, value) {
    const item = {
      id, name: id, type: "asset",
      system: { category: "Companion", track: { enabled: true, name: "Health", value, min: 0, max: 3 } },
      update: async (changes) => {
        if ("system.track.value" in changes) item.system.track.value = changes["system.track.value"];
      },
    };
    return item;
  }

  beforeEach(() => {
    ChatMessage._reset();
    game.actors._reset();
    glow  = companion("glowcat", 2);
    drone = companion("drone", 1);
    pc = makeTestActor({ id: "pc-1", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [glow] } });
    game.actors._set(pc.id, pc);
    invalidateActorCache(pc.id);
  });

  async function choose(outcome, i, executorOpts = { companionItemId: "glowcat" }) {
    const prompt = mapConsequences("companion_takes_a_hit", outcome, false).sufferPrompt;
    const card = await postSufferChoiceCard({ sufferPrompt: prompt, actor: pc, executorOpts, moveId: "companion_takes_a_hit" });
    game.messages = { contents: [card], get: (id) => (id === card.id ? card : null) };
    const res = await applySufferPickFromRelay({ messageId: card.id, pickKind: "enum", optionIndex: String(i) }, gm);
    return { card, res };
  }

  it("weak hit: the recovery is offered while the companion has health, and heals it for a momentum", async () => {
    const { card, res } = await choose("weak_hit", 0);
    expect(res).toEqual({ applied: true });
    expect({ health: glow.system.track.value, momentum: pc.system.momentum.value }).toEqual({ health: 3, momentum: 1 });
    expect(card.content).toContain("Applied:");
  });

  it("weak hit: unavailable — and nothing charged — when the companion is at 0", async () => {
    glow.system.track.value = 0;
    const { card, res } = await choose("weak_hit", 0);
    expect(card.content).toMatch(/data-option-index="0"[^>]*disabled/);
    expect(res).toEqual({ applied: false, reason: "not-offered" });
    expect(pc.system.momentum.value).toBe(2);
  });

  it("miss: -1 companion health lowers the companion's track", async () => {
    await choose("miss", 0);
    expect(glow.system.track.value).toBe(1);
  });

  it("with two companions, the card's own companion is the one changed", async () => {
    pc.items.contents.push(drone);
    await choose("miss", 0, { companionItemId: "drone" });
    expect({ glow: glow.system.track.value, drone: drone.system.track.value }).toEqual({ glow: 2, drone: 0 });
  });

  it("no companion to change: the card says the change was not applied", async () => {
    pc.items.contents.length = 0;
    const { card } = await choose("miss", 0, {});
    expect(card.content).toContain("Not applied: companion health -1 — no companion to change");
  });
});

// ── A pick is claimed before its effects (issue #309 N07) ─────────────────────

describe("a pick is claimed before its effects (issue #309 N07)", () => {
  // The resolved stamp followed the effects, its refusal swallowed: the card
  // stayed live, so the next press charged the same cost again.
  const gm = { requesterId: "gm-1", requesterIsGM: true };
  let pc;

  function card(prompt) {
    const msg = makeTestMessage({
      content: renderSufferCard(prompt, pc, []),
      flags: { [MODULE_ID]: { sufferCard: true, sufferPrompt: prompt, executorOpts: {}, actorId: pc.id, moveId: "face_danger", pickedIndices: [], resolved: false } },
    }, { author: "test-user-gm" });
    game.messages = { contents: [msg], get: (id) => (id === msg.id ? msg : null) };
    return msg;
  }
  /** Refuse `doc.update`'s next call — once. */
  function refuseNextUpdate(doc) {
    const update = doc.update.bind(doc);
    let refuse = true;
    doc.update = async (changes) => {
      if (refuse) { refuse = false; throw new Error("refused by the test"); }
      return update(changes);
    };
  }
  const pick = (msg, payload) => applySufferPickFromRelay({ messageId: msg.id, ...payload }, gm);

  beforeEach(() => {
    ChatMessage._reset();
    game.actors._reset();
    pc = makeTestActor({ id: "pc-1", name: "Kira", ownership: { "pl-1": 3 } });
    game.actors._set(pc.id, pc);
    invalidateActorCache(pc.id);
  });

  it("a refused claim applies nothing; the next press applies the cost once", async () => {
    const msg = card({ kind: "any", amount: 1, count: 1 });
    refuseNextUpdate(msg);
    await expect(pick(msg, { pickKind: "any", sufferId: "lose_momentum" })).resolves.toEqual({ applied: false, reason: "claim-refused" });
    expect(pc.system.momentum.value).toBe(2);
    expect(msg.flags[MODULE_ID].resolved).toBe(false);

    await expect(pick(msg, { pickKind: "any", sufferId: "lose_momentum" })).resolves.toEqual({ applied: true });
    await expect(pick(msg, { pickKind: "any", sufferId: "lose_momentum" })).resolves.toEqual({ applied: false, reason: "already-resolved" });
    expect(pc.system.momentum.value).toBe(1);
    expect(msg.content).toContain("Applied: Lose Momentum (-1)");
  });

  it("a multi-select pick is claimed too: refused, nothing applies and it can be made again", async () => {
    const msg = card({ kind: "enumerated", multi: 2, options: [
      { label: "+2 momentum", momentum: 2 }, { label: "+1 health", health: 1 }, { label: "Press on", noop: true },
    ] });
    refuseNextUpdate(msg);
    await expect(pick(msg, { pickKind: "enum", optionIndex: "0" })).resolves.toEqual({ applied: false, reason: "claim-refused" });
    expect(pc.system.momentum.value).toBe(2);
    expect(msg.flags[MODULE_ID].pickedIndices).toEqual([]);

    await pick(msg, { pickKind: "enum", optionIndex: "0" });
    await expect(pick(msg, { pickKind: "enum", optionIndex: "0" })).resolves.toEqual({ applied: false, reason: "not-offered" });
    expect(pc.system.momentum.value).toBe(4);
  });

  it("a nested suffer move whose follow-up picker cannot be posted re-opens the card", async () => {
    const msg = card({ kind: "enumerated", options: [
      { label: "One suffer move (-2)", kind: "any", amount: 2, count: 1 }, { label: "Press on", noop: true },
    ] });
    const create = ChatMessage.create;
    ChatMessage.create = async () => { throw new Error("refused by the test"); };
    try {
      await expect(pick(msg, { pickKind: "enum", optionIndex: "0" })).resolves.toEqual({ applied: false, reason: "no-follow-up" });
    } finally {
      ChatMessage.create = create;
    }
    expect(msg.flags[MODULE_ID].resolved).toBe(false);
    expect(msg.content).toContain('data-option-index="0"');

    await expect(pick(msg, { pickKind: "enum", optionIndex: "0" })).resolves.toEqual({ applied: true });
    expect(ChatMessage._created.filter(m => m.flags[MODULE_ID]?.sufferCard)).toHaveLength(1);
  });

  it("a write refused after the claim: the card says so, and the GMs' Retry applies it once", async () => {
    const msg = card({ kind: "any", amount: 1, count: 1 });
    refuseNextUpdate(pc);
    await expect(pick(msg, { pickKind: "any", sufferId: "lose_momentum" })).resolves.toEqual({ applied: true });
    expect(pc.system.momentum.value).toBe(2);
    expect(msg.flags[MODULE_ID].resolved).toBe(true);
    expect(msg.content).toContain("Not applied: Lose Momentum (-1) — the world did not save it");

    const failCard = ChatMessage._created.find(m => m.flags[MODULE_ID]?.payoffFailureCard);
    expect(failCard.flags[MODULE_ID]).toMatchObject({
      source: "suffer", actorId: "pc-1",
      steps: [{ step: "suffer", call: { kind: "suffer", sufferId: "lose_momentum", amount: 1 } }],
    });
    expect(failCard.content).toContain("Kira's momentum stands at 2 now");

    const { retryPayoffSteps } = await import("../../src/index.js");
    await expect(retryPayoffSteps(failCard.flags[MODULE_ID])).resolves.toEqual([]);
    expect(pc.system.momentum.value).toBe(1);
  });
});
