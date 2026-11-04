/**
 * PROBE — SWEEP-03 COMBAT-BADGE-PLAYER-SILENT and SWEEP-04 HELP-GM-ONLY-UNMARKED
 * (sweep auditor, family 4: a player-invokable path whose write is GM-gated,
 * rules/reachability.md §8)
 *
 * SWEEP-03 — What the user does: a player, in a Starforged-managed combat,
 * clicks the position (or range) badge the module injects on every client's
 * combat tracker (src/moves/combatTracker.js:236-310 — the badges render for
 * players too; the badge is a <button> titled "Click to toggle combat position").
 * What happens: the click handler returns on `if (!game.user.isGM) return;`
 * (src/moves/combatTracker.js:279 and :298) — nothing is written, nothing is
 * said, the badge stays as it was. The same toggle in the Progress Tracks panel
 * is relayed to the canonical GM for a player (issue #321 U19 / #326 W56,
 * src/ui/progressTracks.js:709 → "progressTrack.edit" op "position").
 * What should happen: the click is relayed (requestGmAction) or, if the badge
 * is GM-only by design, the player is told (ui.notifications.warn) — never a
 * silent no-op (decisions.md → "No silent failures").
 *
 * SWEEP-04 — What the user does: a player reads the help journal's Chat
 * Commands table and types `!at Bleakhold`, `!pace hot`, `!roll`,
 * `!journal lore "…"` or `!sector new`.
 * What happens: each handler warns "… is GM-only (writes campaign state)" and
 * returns (src/index.js:6201, :3582, :6106, :3438, :6323), but the help rows
 * for those commands (src/help/helpJournal.js, "Chat Commands" page) say
 * nothing about GM-only — unlike `!scene`, `!reveal-site`, `!sever`,
 * `!clock new`, `!oracle-add`, `!shipmap`, which the table marks.
 * What should happen: the help marks every GM-only command as such
 * (CLAUDE.md → help file is the single source of truth; DOC-DRIFT).
 *
 * Controls: a GM's badge click writes the position (SWEEP-03); the `!scene start`
 * row is marked GM-only and the `!clock list` row (anyone) is not (SWEEP-04).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sweep/playerPathGmGated.probe.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StubElement, parseHTML } from "../../helpers/cardDom.js";

vi.mock("../../../src/ui/progressTracks.js", () => ({
  setCombatTrackPosition: vi.fn(async () => ({})),
}));
vi.mock("../../../src/character/actorBridge.js", () => ({
  setCombatPosition: vi.fn(async () => {}),
  isPlayerCharacterActor: (actor) => actor?.type === "character" && !actor?.flags?.["starforged-companion"]?.entityType,
}));
vi.mock("../../../src/multiplayer/gmRelay.js", async (importOriginal) => ({
  ...(await importOriginal()),
  requestGmAction: vi.fn(async () => ({ ok: true, relayed: true })),
}));

import { registerCombatTrackerHooks } from "../../../src/moves/combatTracker.js";
import { setCombatPosition } from "../../../src/character/actorBridge.js";
import { requestGmAction } from "../../../src/multiplayer/gmRelay.js";
import { PAGES } from "../../../src/help/helpJournal.js";

const MODULE_ID = "starforged-companion";
const flush  = () => new Promise(r => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };

let savedHTMLElement, savedDocument, savedCombats, savedCombat, savedIsGM, warnSpy;
beforeEach(() => {
  savedHTMLElement = globalThis.HTMLElement;
  savedDocument    = globalThis.document;
  savedCombats     = game.combats;
  savedCombat      = game.combat;
  savedIsGM        = game.user.isGM;
  globalThis.HTMLElement = StubElement;
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  Hooks._handlers.delete("renderCombatTracker");
  setCombatPosition.mockClear();
  requestGmAction.mockClear();
  warnSpy = vi.spyOn(ui.notifications, "warn");
});
afterEach(() => {
  globalThis.HTMLElement = savedHTMLElement;
  globalThis.document    = savedDocument;
  game.combats           = savedCombats;
  game.combat            = savedCombat;
  game.user.isGM         = savedIsGM;
  warnSpy.mockRestore();
});

/** A Starforged combat for track "trk-1" with one combatant, rendered in the tracker (combatPositionStores.test.js). */
function renderTracker({ position = "none", actor = { id: "pc1", name: "Kira", type: "character" } } = {}) {
  const cFlags = { [MODULE_ID]: { position, range: "close" } };
  const combatant = {
    id: "cmb1", actorId: actor?.id ?? null, actor,
    getFlag: (m, k) => cFlags[m]?.[k],
    setFlag: vi.fn(async (m, k, v) => { cFlags[m][k] = v; }),
  };
  const combat = {
    id: "combat1",
    getFlag: (m, k) => (m === MODULE_ID && k === "trackId" ? "trk-1" : undefined),
    combatants: [combatant],
  };
  game.combats = { find: (fn) => [combat].find(fn) ?? null };
  game.combat  = combat;
  Hooks._handlers.delete("renderCombatTracker");
  registerCombatTrackerHooks();
  const root = parseHTML(`<ol><li data-combatant-id="cmb1"><div class="combatant-controls"></div></li></ol>`);
  Hooks.call("renderCombatTracker", { viewed: combat }, root);
  return { posBadge: root.querySelector(".sf-pos-badge"), rangeBadge: root.querySelector(".sf-range-badge"), combatant };
}

describe("PROBE SWEEP-03 COMBAT-BADGE-PLAYER-SILENT", () => {
  it("a player's click on the combat tracker's position badge is relayed to the GM or refused aloud — never a silent no-op", async () => {
    game.user.isGM = false;
    const { posBadge, combatant } = renderTracker();
    expect(posBadge).toBeTruthy();               // the badge renders for players
    posBadge.click();
    await settle();

    // Expected: relayed (the Progress Tracks panel's shape) or a warning. Today: neither.
    const relayed = requestGmAction.mock.calls.length;
    const warned  = warnSpy.mock.calls.length;
    expect.soft(relayed + warned, "neither a relay nor a notice followed the player's click").toBeGreaterThan(0);
    // A player cannot update the combatant locally — the write must not be attempted here.
    expect.soft(combatant.setFlag).not.toHaveBeenCalled();
  });

  it("a player's click on the range badge is relayed or refused aloud — never a silent no-op", async () => {
    game.user.isGM = false;
    const { rangeBadge } = renderTracker();
    expect(rangeBadge).toBeTruthy();
    rangeBadge.click();
    await settle();
    expect.soft(requestGmAction.mock.calls.length + warnSpy.mock.calls.length, "neither a relay nor a notice followed the player's click").toBeGreaterThan(0);
  });

  it("control: a GM's click on the position badge writes the position", async () => {
    game.user.isGM = true;
    const { posBadge, combatant } = renderTracker();
    posBadge.click();
    await settle();
    expect(combatant.setFlag).toHaveBeenCalledWith(MODULE_ID, "position", "inControl");
    expect(setCombatPosition).toHaveBeenCalledWith(combatant.actor, "inControl");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const chatCommandsPage = () => PAGES.find(p => /<h2>Chat Commands<\/h2>/.test(p?.text?.content ?? ""));
const stripTags = (html) => String(html).replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
/** The plain text of the table row whose command cell starts with `cmd`. */
function rowText(cmd) {
  const content = chatCommandsPage()?.text?.content ?? "";
  const row = content.split("</tr>").find(r => r.includes(`<code>${cmd}`));
  return row == null ? null : stripTags(row);
}
const GM_ONLY = /\bGM(?:-| )only\b|\bGMs only\b|\bonly the GM\b/i;

describe("PROBE SWEEP-04 HELP-GM-ONLY-UNMARKED", () => {
  it("control: the help marks !scene start GM-only, and !clock list for anyone", () => {
    expect(rowText("!scene start")).toMatch(GM_ONLY);
    expect(rowText("!clock list")).not.toMatch(GM_ONLY);
    expect(rowText("!clock list")).toMatch(/Anyone may invoke/);
  });

  it.each([
    ["!at Name",        "src/index.js:6201 — '!at is GM-only (writes campaign state).'"],
    ["!pace hot",       "src/index.js:3582 — '!pace is GM-only (writes campaign state).'"],
    ["!roll",           "src/index.js:6106 — '!roll is GM-only (writes campaign state).'"],
    ["!journal faction","src/index.js:3438 — '!journal is GM-only (writes campaign state).'"],
    ["!sector new",     "src/index.js:6323 — '!sector new is available to GMs only.'"],
  ])("the help's row for %s says it is GM-only, as its handler does (%s)", (cmd) => {
    const text = rowText(cmd);
    expect(text, `no help row for ${cmd}`).not.toBeNull();
    // Expected: the row names the restriction. Today: nothing — a player learns it from the warning.
    expect(text).toMatch(GM_ONLY);
  });
});
