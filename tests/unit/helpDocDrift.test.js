/**
 * STARFORGED COMPANION
 * tests/unit/helpDocDrift.test.js
 *
 * The help journal says what the code does about who may do what, and why
 * nothing happened (issue #326 W83). Six claims had drifted from the code;
 * each test pairs a control (what the code does) with the help's claim:
 *
 *  a. Troubleshooting → "No move card after typing narration" said GM
 *     messages are excluded — isPlayerNarration has no GM exclusion (solo play
 *     is the GM typing) — and did not list the commonest cause, no session
 *     begun (the session-active gate).
 *  b. Toolbar Buttons said Companion Settings is GM-only — every user sees it
 *     (players' keys, Private Lines and audio switches live there).
 *  c. Chat Commands headed the fact-continuity table "(GM only)" — `!truth` /
 *     `!state` run for players, relayed to the GM; only `!scene` is GM-only.
 *  d. The run-on exception list omitted `!incite`, which runs on the GM's
 *     client like the others.
 *  e. Only `!clock new` was marked GM-only — advance / fill / reset / remove
 *     are too.
 *  f. Entities & Portraits said each entity is its own Journal Entry — five
 *     of the seven types are Actors.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { PAGES } from "../../src/help/helpJournal.js";
import { companionToolbarTools } from "../../src/ui/companionToolbarTools.js";

const page = (name) => PAGES.find(p => p.name === name)?.text?.content ?? "";
const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");

let index;
beforeAll(async () => { index = await import("../../src/index.js"); }, 60_000);

describe("the help journal against the code (issue #326 W83)", () => {
  it("a. Troubleshooting: GM narration is not excluded; a session not begun is named", () => {
    const { isPlayerNarration } = index;
    const gmLine = { content: "I brace against the hull and push through the breach.", whisper: [], rolls: [], flags: {}, author: { isGM: true } };
    expect(isPlayerNarration(gmLine)).toBe(true);                        // control: the code runs it
    const src = readFileSync("src/index.js", "utf8");
    expect(src).toMatch(/if \(!isSessionActive\(cs\)\) return;/);         // control: the session gate
    const entry = plain(page("Troubleshooting")).match(/No move card after typing narration(.*?)(?=Safety settings not applying)/)?.[1] ?? "";
    expect(entry).not.toMatch(/GM messages are excluded/);
    expect(entry).toMatch(/Begin Session/);
    expect(entry).toMatch(/!begin-session/);
    expect(entry).toMatch(/a GM is connected/);
  });

  it("b. Toolbar Buttons: Companion Settings is shown to everyone", () => {
    expect(companionToolbarTools({ isGM: false }).map(t => t.key)).toContain("sfSettings");   // control
    const row = plain(page("Toolbar Buttons")).match(/Companion Settings\s+(GM|Everyone)/)?.[1];
    expect(row).toBe("Everyone");
  });

  it("c. Chat Commands: !truth / !state are not GM-only; !scene is", () => {
    const src = readFileSync("src/factContinuity/chatCommands.js", "utf8");
    expect(src).toMatch(/await requestGmAction\("factContinuity\.command"/);   // control: relayed for anyone
    expect(readFileSync("src/index.js", "utf8")).toMatch(/!scene is GM-only/);   // control: !scene refuses a player
    const commands = plain(page("Chat Commands"));
    expect(commands).not.toMatch(/Fact Continuity Commands \(GM only\)/);
    expect(commands).toMatch(/Fact Continuity Commands/);
    expect(commands).toMatch(/!scene start GM-only\./);
    expect(commands).toMatch(/!scene end GM-only\./);
    expect(commands).toMatch(/anyone may use !truth and !state/);
  });

  it("d. Chat Commands: the run-on exception list names every command that runs on the GM's client", () => {
    const { CHAT_COMMAND_ROUTES } = index;
    const onGm = CHAT_COMMAND_ROUTES.filter(r => r.runOn === "claude").map(r => r.name);
    expect(onGm).toContain("!incite");                                     // control
    const intro = plain(page("Chat Commands")).match(/except (.*?) which run on the GM/)?.[1] ?? "";
    for (const name of onGm) expect(intro).toContain(name);
  });

  it("e. Chat Commands: !clock advance / fill / reset / remove say they are GM-only", () => {
    const src = readFileSync("src/clocks/clocks.js", "utf8");
    for (const verb of ["new", "advance", "fill", "reset", "remove"]) {
      expect(src).toMatch(new RegExp(`gmGate\\("!clock ${verb}"\\)`));      // control: each is gated
    }
    expect(src).not.toMatch(/gmGate\("!clock list"\)/);                    // control: list is anyone's
    const clocks = plain(page("Chat Commands")).split("Clocks Command Effect")[1]?.split("Vehicle Repair")[0] ?? "";
    const row = (verb) => clocks.split(`!clock ${verb}`)[1]?.split("!clock")[0] ?? "";
    const rows = ["new", "advance", "fill", "reset", "remove"].map(row);
    expect(rows.every(r => r.length > 0)).toBe(true);                      // every row found
    expect(rows.map(r => /GM-only/.test(r))).toEqual([true, true, true, true, true]);
    expect(row("list")).toMatch(/Anyone may invoke/);
  });

  it("f. Entities & Portraits: entities are Actors or Journal Entries by type", async () => {
    const storage = plain(page("Entities & Portraits")).split("Storage")[1] ?? "";
    expect(storage).not.toMatch(/Each entity is stored in its own Foundry Journal Entry/);
    expect(storage).toMatch(/Connections, ships, settlements, planets and locations are Foundry Actors/);
    expect(storage).toMatch(/factions and creatures are Journal Entries/);
    // control: the registry's host collections are what the copy says
    const registry = readFileSync("src/entities/registry.js", "utf8");
    for (const type of ["connection", "ship", "settlement", "planet", "location"]) {
      expect(registry).toMatch(new RegExp(`\\b${type}:\\s+'actor'`));
    }
    for (const type of ["faction", "creature"]) {
      expect(registry).toMatch(new RegExp(`\\b${type}:\\s+'journal'`));
    }
  });
});
