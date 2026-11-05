/**
 * PROBE — UI-03 README-COMMANDS-DRIFT (tenth audit, area ui; DOC-DRIFT —
 * README.md's "Chat commands" tables vs CHAT_COMMAND_ROUTES and the handlers'
 * GM gates; the help journal has the rows, README does not)
 *
 * What the user does: a GM or player reads the GitHub README's "Chat
 * commands" section ("Several commands are GM-only as noted") to learn what
 * can be typed and by whom.
 *
 * What happens: eleven routed commands have no row — `!incite`,
 * `!reveal-site`, `!clear-site`, `!sever`, `!stations`, `!shipmap`,
 * `!ship envision`, `!ship history`, `!x clear`, `!truth list` and
 * `!oracle <table-id>` (the custom and built-in table roll) — so a player
 * never learns `!incite` or `!stations` exist from it; and the five clock
 * mutations (`!clock new / advance / fill / reset / remove`, each refused to
 * a player by clocks.js `gmGate`) carry no "(GM)" while every other GM-only
 * row in the same tables does, so a player reads the clock rows as theirs.
 * `!bond` is listed as `!bond <rank>` where the handler and the help take
 * `!bond [rank] [name]`. No test compares README with the routes (the help's
 * tables are checked by helpRoleClaims.test.js; README by nothing).
 *
 * What should happen: every route has a README row and every GM-gated row
 * says "(GM)", as the help journal's table does (issue #331 X58/X59).
 *
 * Controls: the routes README does list are found; `!at` / `!sector new` are
 * marked (GM) and `!sector list` is not; `!clock` is gated in the code.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/ui/readmeCommandsDrift.probe.js
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const readme = readFileSync("README.md", "utf8");
const indexSrc = readFileSync("src/index.js", "utf8");
const clocksSrc = readFileSync("src/clocks/clocks.js", "utf8");

/** The README's command rows: `| \`cmd\` | effect |` inside "## Chat commands". */
function readmeRows() {
  const section = readme.split("## Chat commands")[1].split("\n## ")[0];
  const rows = [];
  for (const line of section.split("\n")) {
    if (!/^\|\s*`/.test(line)) continue;
    // Cells split on unescaped pipes; `\|` inside a cell is a literal pipe.
    const PIPE = "__ESCAPED_PIPE__";
    const cells = line.split("\\|").join(PIPE).split("|").map(c => c.split(PIPE).join("|").trim());
    if (cells.length < 4) continue;
    rows.push({ cmd: cells[1].replace(/`/g, "").trim(), effect: cells[2] });
  }
  return rows;
}

/** The chat-command routes, from the source text (no module import needed). */
function routeNames() {
  const block = indexSrc.split("export const CHAT_COMMAND_ROUTES = [")[1].split("\n];")[0];
  return [...block.matchAll(/\{\s*name:\s*"([^"]+)"/g)].map(m => m[1]);
}

const rows = readmeRows();
const rowText = rows.map(r => r.cmd).join("\n");

describe("UI-03 README's Chat commands tables match the routes and their gates", () => {
  it("control: the README rows parse, the routes parse, and the listed commands are found", () => {
    expect(rows.length).toBeGreaterThan(25);
    const names = routeNames();
    expect(names).toContain("!incite");
    expect(names).toContain("!stations");
    for (const cmd of ["!x", "!flag", "!fate", "!break", "!begin-session", "!end-session", "!roll", "!repair", "!sector new", "!at <name>", "!truths", "!lore", "!recap", "!pace hot|quiet|clear|status", "!narrator debug", "!scene start", "!clock list"]) {
      expect(rowText, cmd).toMatch(new RegExp(cmd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("every routed command has a README row", () => {
    const expectedInReadme = {
      "!incite":        /^!incite\b/m,
      "!reveal-site":   /^!reveal-site\b/m,
      "!clear-site":    /^!clear-site\b/m,
      "!sever":         /^!sever\b/m,
      "!stations":      /^!stations\b/m,
      "!shipmap":       /^!shipmap\b/m,
      "!ship envision": /^!ship envision\b/m,
      "!ship history":  /^!ship history\b/m,
    };
    const names = routeNames();
    const missing = Object.entries(expectedInReadme)
      .filter(([name]) => names.includes(name))
      .filter(([, re]) => !re.test(rowText))
      .map(([name]) => name);
    // Expected: []. Today: the eight routed commands README never mentions.
    expect(missing).toEqual([]);
    // The sub-commands the help documents and README lacks.
    expect.soft(rowText).toMatch(/!x clear/);
    expect.soft(rowText).toMatch(/!truth list/);
    expect.soft(rowText).toMatch(/!oracle <table-id>|!oracle <id>/);
  });

  it("the clock mutations say (GM), as the other GM-only rows do", () => {
    for (const verb of ["new", "advance", "fill", "reset", "remove"]) {
      expect(clocksSrc).toMatch(new RegExp(`gmGate\\("!clock ${verb}"\\)`));   // control: each is gated
    }
    const atRow = rows.find(r => r.cmd.startsWith("!at"));
    expect(atRow.effect).toMatch(/\(GM\)/);                                      // control: README marks !at
    expect(rows.find(r => r.cmd === "!sector list").effect).not.toMatch(/\(GM\)/); // control: and not !sector list
    const clockRows = rows.filter(r => /^!clock (new|advance)/.test(r.cmd));
    expect(clockRows.length).toBe(2);
    // Expected: both rows marked. Today: "Create a clock" / "Advance, fill, reset, or remove a clock".
    expect(clockRows.map(r => /\(GM\)|GM-only|GM only/.test(r.effect))).toEqual([true, true]);
  });

  it("the !bond row gives the handler's syntax", () => {
    const bondSrc = readFileSync("src/moves/bondCommand.js", "utf8");
    expect(bondSrc).toMatch(/Usage: <code>!bond \[rank\] \[name\]<\/code>/);   // control: the handler's usage card
    const bond = rows.find(r => r.cmd.startsWith("!bond"));
    expect(bond.cmd).toMatch(/!bond \[rank\] \[name\]/);   // today: "!bond <rank>"
  });
});
