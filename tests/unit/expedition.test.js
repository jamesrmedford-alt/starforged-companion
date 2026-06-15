/**
 * STARFORGED COMPANION
 * tests/unit/expedition.test.js
 *
 * Exploration lifecycle (audit 3.18) — the move→track wiring that turns
 * Undertake an Expedition (and Explore a Waypoint) into actual progress on the
 * shared expedition track. Pure orchestration over injected deps, so no Foundry.
 */

import { describe, it, expect, vi } from "vitest";
import {
  normalizeExpeditionRank,
  selectExpeditionTrack,
  applyExpeditionProgress,
  legacyRewardTicks,
  finishExpedition,
  LEGACY_REWARD,
  EXPEDITION_RANKS,
  DEFAULT_EXPEDITION_RANK,
} from "../../src/moves/expedition.js";

const exp = (over = {}) => ({ id: "t1", label: "The Vault of Tears", type: "expedition", rank: "dangerous", ticks: 0, completed: false, ...over });

describe("normalizeExpeditionRank", () => {
  it("passes through valid ranks (case-insensitive)", () => {
    for (const r of EXPEDITION_RANKS) expect(normalizeExpeditionRank(r.toUpperCase())).toBe(r);
  });
  it("falls back to the default for missing/garbage", () => {
    expect(normalizeExpeditionRank(null)).toBe(DEFAULT_EXPEDITION_RANK);
    expect(normalizeExpeditionRank("colossal")).toBe(DEFAULT_EXPEDITION_RANK);
    expect(normalizeExpeditionRank("")).toBe("dangerous");
  });
});

describe("selectExpeditionTrack", () => {
  it("matches an open expedition by normalised label (ignoring leading 'the')", () => {
    const t = selectExpeditionTrack([exp({ id: "a", label: "The Vault of Tears" })], "vault of tears");
    expect(t?.id).toBe("a");
  });
  it("matches by substring either direction", () => {
    const t = selectExpeditionTrack([exp({ id: "b", label: "Crossing to Bleakhold" })], "Bleakhold");
    expect(t?.id).toBe("b");
  });
  it("falls back to the single open expedition when no label match", () => {
    const t = selectExpeditionTrack([exp({ id: "c", label: "Somewhere Else" })], "Unrelated Place");
    expect(t?.id).toBe("c");
  });
  it("returns null when multiple open expeditions and no label match (ambiguous)", () => {
    const t = selectExpeditionTrack([exp({ id: "a", label: "Alpha" }), exp({ id: "b", label: "Beta" })], "Gamma");
    expect(t).toBeNull();
  });
  it("ignores completed expeditions", () => {
    const t = selectExpeditionTrack([exp({ id: "done", label: "Vault", completed: true })], "Vault");
    expect(t).toBeNull();
  });
  it("ignores non-expedition track types", () => {
    const t = selectExpeditionTrack([{ id: "v", label: "Vault", type: "vow", completed: false }], "Vault");
    expect(t).toBeNull();
  });
  it("returns null for an empty track list", () => {
    expect(selectExpeditionTrack([], "anything")).toBeNull();
    expect(selectExpeditionTrack(null, "anything")).toBeNull();
  });
});

describe("applyExpeditionProgress", () => {
  function deps(tracks) {
    const created = [];
    const marked  = [];
    return {
      created, marked,
      listTracks:   vi.fn(async () => tracks),
      createTrack:  vi.fn(async (data) => { const t = { id: "new", ticks: 0, completed: false, ...data }; created.push(t); return t; }),
      markProgress: vi.fn(async (id) => { marked.push(id); const t = tracks.find(x => x.id === id) ?? created.find(x => x.id === id); if (t) t.ticks += 8; return t; }),
    };
  }

  it("marks an existing matched expedition (no create)", async () => {
    const d = deps([exp({ id: "a", label: "The Vault of Tears" })]);
    const res = await applyExpeditionProgress({ moveTarget: "Vault of Tears", expeditionRank: null }, d);
    expect(res.created).toBe(false);
    expect(res.track.id).toBe("a");
    expect(d.createTrack).not.toHaveBeenCalled();
    expect(d.marked).toEqual(["a"]);
  });

  it("creates a new expedition at the inferred rank when none matches", async () => {
    const d = deps([]);
    const res = await applyExpeditionProgress({ moveTarget: "Tartarus Depths", expeditionRank: "formidable" }, d);
    expect(res.created).toBe(true);
    expect(d.createTrack).toHaveBeenCalledWith({ label: "Tartarus Depths", type: "expedition", rank: "formidable" });
    expect(d.marked).toEqual(["new"]);   // newly created track was marked
  });

  it("creates at the default rank when the inferred rank is garbage", async () => {
    const d = deps([]);
    await applyExpeditionProgress({ moveTarget: "Nowhere", expeditionRank: "ginormous" }, d);
    expect(d.createTrack).toHaveBeenCalledWith({ label: "Nowhere", type: "expedition", rank: "dangerous" });
  });

  it("labels an unnamed expedition generically", async () => {
    const d = deps([]);
    await applyExpeditionProgress({ moveTarget: null, expeditionRank: null }, d);
    expect(d.createTrack).toHaveBeenCalledWith({ label: "Expedition", type: "expedition", rank: "dangerous" });
  });

  it("returns null when deps are incomplete (defensive)", async () => {
    expect(await applyExpeditionProgress({ moveTarget: "x" }, {})).toBeNull();
  });
});

describe("legacyRewardTicks", () => {
  it("pays the play-kit reward per rank (1 tick → 3 boxes)", () => {
    expect(legacyRewardTicks("troublesome")).toBe(1);
    expect(legacyRewardTicks("dangerous")).toBe(2);
    expect(legacyRewardTicks("formidable")).toBe(4);
    expect(legacyRewardTicks("extreme")).toBe(8);
    expect(legacyRewardTicks("epic")).toBe(12);
    expect(LEGACY_REWARD.epic).toBe(12);
  });
  it("pays one rank lower on a weak hit, and nothing below troublesome", () => {
    expect(legacyRewardTicks("dangerous", 1)).toBe(1);   // → troublesome
    expect(legacyRewardTicks("epic", 1)).toBe(8);        // → extreme
    expect(legacyRewardTicks("troublesome", 1)).toBe(0); // none
  });
});

describe("finishExpedition", () => {
  function deps(tracks) {
    const completed = [];
    return {
      completed,
      listTracks:    vi.fn(async () => tracks),
      completeTrack: vi.fn(async (id) => { const t = tracks.find(x => x.id === id); if (t) { t.completed = true; completed.push(id); } return t; }),
    };
  }

  it("completes the matched expedition and reports its rank's legacy reward", async () => {
    const d = deps([exp({ id: "a", label: "The Vault of Tears", rank: "formidable" })]);
    const res = await finishExpedition({ moveTarget: "Vault of Tears", ranksDown: 0 }, d);
    expect(res.track.id).toBe("a");
    expect(res.legacyTicks).toBe(4);     // formidable
    expect(d.completed).toEqual(["a"]);
  });

  it("pays one rank lower on a weak finish (ranksDown:1)", async () => {
    const d = deps([exp({ id: "a", label: "Crossing", rank: "dangerous" })]);
    const res = await finishExpedition({ moveTarget: null, ranksDown: 1 }, d);
    expect(res.legacyTicks).toBe(1);     // dangerous → troublesome
  });

  it("returns null when there is no open expedition to finish", async () => {
    const d = deps([exp({ id: "done", completed: true })]);
    expect(await finishExpedition({ moveTarget: null }, d)).toBeNull();
    expect(d.completeTrack).not.toHaveBeenCalled();
  });
});
