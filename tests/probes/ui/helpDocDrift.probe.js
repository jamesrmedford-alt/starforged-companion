/**
 * Probe UI-06 — HELP-DOC-DRIFT (DOC-DRIFT, grouped)
 *
 * The in-game help journal (src/help/helpJournal.js PAGES — also the GitHub
 * Pages site) says things about who may do what, and why nothing happened,
 * that the code no longer does. Each `it` pairs a control (what the code does,
 * passing) with the help's claim (failing):
 *
 *  a. Troubleshooting → "No move card after typing narration": "you are not
 *     logged in as the GM (GM messages are excluded)". isPlayerNarration has no
 *     GM exclusion (solo play is the GM typing), and the most common cause —
 *     no session begun (the session-active gate, index.js:771) — is not listed.
 *  b. Toolbar Buttons → "Companion Settings | GM": the toolbar shows it to every
 *     user (companionToolbarTools.js:33, pinned by companionToolbar.test.js —
 *     players' keys, Private Lines and audio switches live there).
 *  c. Chat Commands → "Fact Continuity Commands (GM only)": `!truth` / `!state`
 *     run for players, relayed to the GM (factContinuity/chatCommands.js:107),
 *     as the Fact Continuity page's permission table says.
 *  d. Chat Commands intro: "every command runs once, on the client of the
 *     person who typed it — except @scene, !recap, !ship envision and !ship
 *     history, which run on the GM's client". `!incite` is RUN_ON.CLAUDE too.
 *  e. Chat Commands → Clocks: only `!clock new` is marked GM-only; advance,
 *     fill, reset and remove are GM-only as well (clocks.js gmGate) — a
 *     player's `!clock advance` is refused with a warning.
 *  f. Entities & Portraits → Storage: "Each entity is stored in its own Foundry
 *     Journal Entry. Do not manually edit these journals — use the Entity Panel
 *     instead." Five of the seven types are Actors (registry.js HOST_COLLECTION),
 *     and the panel cannot edit a record's fields.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { PAGES } from "../../../src/help/helpJournal.js";
import { companionToolbarTools } from "../../../src/ui/companionToolbarTools.js";

const page = (name) => PAGES.find(p => p.name === name)?.text?.content ?? "";
const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");

let index;
beforeAll(async () => { index = await import("../../../src/index.js"); }, 60_000);

describe("UI-06 the help journal against the code", () => {
  it("a. Troubleshooting: GM narration is not excluded from the move pipeline", async () => {
    const { isPlayerNarration } = index;
    const gmLine = { content: "I brace against the hull and push through the breach.", whisper: [], rolls: [], flags: {}, author: { isGM: true } };
    expect(isPlayerNarration(gmLine)).toBe(true);                        // control: the code runs it
    const entry = plain(page("Troubleshooting")).match(/No move card after typing narration(.*?)(?=Safety settings not applying)/)?.[1] ?? "";
    expect({ claimsGmExcluded: /GM messages are excluded/.test(entry) }).toEqual({ claimsGmExcluded: false });   // FAILS today
    expect({ namesSessionGate: /Begin (a )?Session/i.test(entry) }).toEqual({ namesSessionGate: true });   // FAILS today
  });

  it("b. Toolbar Buttons: Companion Settings is shown to everyone", () => {
    expect(companionToolbarTools({ isGM: false }).map(t => t.key)).toContain("sfSettings");   // control
    const row = plain(page("Toolbar Buttons")).match(/Companion Settings\s+(GM|Everyone)/)?.[1];
    expect(row).toBe("Everyone");                                         // FAILS today: "GM"
  });

  it("c. Chat Commands: !truth / !state are not GM-only", async () => {
    const src = (await import("node:fs")).readFileSync("src/factContinuity/chatCommands.js", "utf8");
    expect(src).toMatch(/await requestGmAction\("factContinuity\.command"/);   // control: relayed for anyone
    expect({ headingSaysGmOnly: /Fact Continuity Commands \(GM only\)/.test(plain(page("Chat Commands"))) })
      .toEqual({ headingSaysGmOnly: false });   // FAILS today
  });

  it("d. Chat Commands: the run-on exception list names every command that runs on the GM's client", async () => {
    const { CHAT_COMMAND_ROUTES } = index;
    const onGm = CHAT_COMMAND_ROUTES.filter(r => r.runOn === "claude").map(r => r.name);
    expect(onGm).toContain("!incite");                                     // control
    const intro = plain(page("Chat Commands")).match(/except (.*?) which run on the GM/)?.[1] ?? "";
    expect({ listsIncite: intro.includes("!incite") }).toEqual({ listsIncite: true });   // FAILS today
  });

  it("e. Chat Commands: !clock advance / fill / reset / remove say they are GM-only", async () => {
    const src = (await import("node:fs")).readFileSync("src/clocks/clocks.js", "utf8");
    for (const verb of ["advance", "fill", "reset", "remove"]) {
      expect(src).toMatch(new RegExp(`gmGate\\("!clock ${verb}"\\)`));      // control: each is gated
    }
    const clocks = plain(page("Chat Commands")).split("Clocks Command Effect")[1]?.split("Vehicle Repair")[0] ?? "";
    const row = (verb) => clocks.split(`!clock ${verb}`)[1]?.split("!clock")[0] ?? "";
    expect(row("new")).toMatch(/GM-only/);                                 // control: the row parser reads `new`'s mark
    const rows = ["advance", "fill", "reset", "remove"].map(row);
    expect(rows.every(r => r.length > 0)).toBe(true);                      // control: every row found
    expect(rows.map(r => /\bGM\b/.test(r))).toEqual([true, true, true, true]);   // FAILS today
  });

  it("f. Entities & Portraits: entities are not all journal entries", () => {
    const storage = plain(page("Entities & Portraits")).split("Storage")[1] ?? "";
    expect({ saysAllJournals: /Each entity is stored in its own Foundry Journal Entry/.test(storage) })
      .toEqual({ saysAllJournals: false });   // FAILS today
  });
});
