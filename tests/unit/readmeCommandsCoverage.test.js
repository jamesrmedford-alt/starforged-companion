/**
 * Issue #337 Y46 README-COMMANDS-DRIFT — README's "Chat commands" tables
 * cover every routed command and mark every GM-gated one.
 *
 * README's tables ("Several commands are GM-only as noted") had no row for
 * eight routed commands — `!incite`, `!reveal-site`, `!clear-site`,
 * `!sever`, `!stations`, `!shipmap`, `!ship envision`, `!ship history` — nor
 * for `!x clear`, `!truth list` or `!oracle <table-id>`; the GM-gated clock
 * mutations carried no "(GM)" while every other GM-only row did; and `!bond`
 * read `!bond <rank>` where the handler and the help take
 * `!bond [rank] [name]`. helpRoleClaims.test.js checks the help's tables;
 * nothing compared README with CHAT_COMMAND_ROUTES. This does.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { productionSources } from '../helpers/sourceScan.js';

const readme   = readFileSync('README.md', 'utf8');
const indexSrc = readFileSync('src/index.js', 'utf8');

/** The README's command rows: `| \`cmd\` | effect |` inside "## Chat commands". */
function readmeRows() {
  const section = readme.split('## Chat commands')[1].split('\n## ')[0];
  const rows = [];
  for (const line of section.split('\n')) {
    if (!/^\|\s*`/.test(line)) continue;
    // Cells split on unescaped pipes; `\|` inside a cell is a literal pipe.
    const PIPE = '__ESCAPED_PIPE__';
    const cells = line.split('\\|').join(PIPE).split('|').map(c => c.split(PIPE).join('|').trim());
    if (cells.length < 4) continue;
    rows.push({ cmd: cells[1].replace(/`/g, '').trim(), effect: cells[2] });
  }
  return rows;
}

/** A row's command forms: `a` / `b` cells split, and a word alternation (`advance|fill`) expanded. */
function forms(cmd) {
  return cmd.split(' / ').flatMap((part) => {
    const words = part.trim().split(/\s+/);
    const i = words.findIndex(w => /^[a-z-]+(\|[a-z-]+)+$/.test(w));
    if (i < 0) return [part.trim()];
    return words[i].split('|').map(alt => [...words.slice(0, i), alt, ...words.slice(i + 1)].join(' '));
  });
}

/** The README rows that document `command` (the command itself, or it with arguments). */
const rowsFor = (command) => rows.filter(r => forms(r.cmd).some(f => f === command || f.startsWith(`${command} `)));

/** The chat-command routes, from the source text (no module import needed). */
function routeNames() {
  const block = indexSrc.split('export const CHAT_COMMAND_ROUTES = [')[1].split('\n];')[0];
  return [...block.matchAll(/\{\s*name:\s*"([^"]+)"/g)].map(m => m[1]);
}

/** The commands a handler refuses to a player with a notice naming the command (helpRoleClaims' sweep). */
function sweptGmCommands() {
  const out = new Set();
  const re = /\bwarn\??\.?\(\s*["'`](?:Starforged Companion: )?(![a-z][a-z-]*(?: (?:new|debug|<name>))?)[^"'`]*?(?:GM-only|GMs only)/g;
  for (const { code } of productionSources()) {
    for (const m of code.matchAll(re)) out.add(m[1]);
  }
  return [...out];
}

/** Gates whose notice does not name the command, each found in the code as written. */
const OTHER_GATES = [
  ...['new', 'advance', 'fill', 'reset', 'remove'].map(verb => ({
    command: `!clock ${verb}`, file: 'src/clocks/clocks.js', gate: `gmGate("!clock ${verb}")`,
  })),
  { command: '!reveal-site',      file: 'src/index.js',            gate: 'Revealing a site is available to GMs only.' },
  { command: '!clear-site',       file: 'src/index.js',            gate: 'Clearing a site is available to GMs only.' },
  { command: '!x clear',          file: 'src/context/safety.js',   gate: 'Only a GM can clear the X-Card and resume narration.' },
  { command: '!migrate-entities', file: 'src/entities/migrator.js', gate: 'only the GM can run !migrate-entities.' },
];

const GM_MARK = /\(GM\)|GM-only|GM only/;
const rows = readmeRows();
const rowText = rows.map(r => r.cmd).join('\n');

describe("README's Chat commands tables match the routes and their gates (issue #337 Y46)", () => {
  it('control: the README rows parse, the routes parse, and the listed commands are found', () => {
    expect(rows.length).toBeGreaterThan(25);
    const names = routeNames();
    expect(names).toContain('!incite');
    expect(names).toContain('!stations');
    for (const cmd of ['!x', '!flag', '!fate', '!break', '!begin-session', '!end-session', '!roll', '!repair', '!sector new', '!at <name>', '!truths', '!lore', '!recap', '!pace hot|quiet|clear|status', '!narrator debug', '!scene start', '!clock list']) {
      expect(rowText, cmd).toMatch(new RegExp(cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });

  it('every routed command has a README row', () => {
    const commands = routeNames().flatMap(name => name.replace(/\s*\(GM-only\)$/, '').split(' / ').map(s => s.trim()));
    expect(commands).toEqual(expect.arrayContaining(['!incite', '!sever', '!ship envision', '!truth', '!state']));   // sanity
    expect(commands.filter(cmd => rowsFor(cmd).length === 0)).toEqual([]);
  });

  it("the sub-commands the help documents have rows: !x clear, !truth list, !oracle <table-id>", () => {
    for (const cmd of ['!x clear', '!truth list', '!oracle <table-id>']) {
      expect(rowsFor(cmd).length, cmd).toBeGreaterThan(0);
    }
  });

  it('control: each gate of another shape is in the code as written', () => {
    for (const { file, gate } of OTHER_GATES) expect(readFileSync(file, 'utf8'), gate).toContain(gate);
    expect(sweptGmCommands()).toEqual(expect.arrayContaining(['!at', '!sever', '!shipmap', '!sector <name>', '!scene']));
  });

  it.each([...sweptGmCommands(), ...OTHER_GATES.map(g => g.command)])('%s — each of its README rows says (GM)', (cmd) => {
    const found = rowsFor(cmd);
    expect(found.length, `no README row for ${cmd}`).toBeGreaterThan(0);
    for (const row of found) expect(row.effect, `${row.cmd}`).toMatch(GM_MARK);
  });

  it('control: the commands anyone may run are not marked (GM)', () => {
    for (const cmd of ['!sector list', '!clock list', '!incite', '!stations']) {
      expect(rowsFor(cmd).length, cmd).toBeGreaterThan(0);
      for (const row of rowsFor(cmd)) expect(row.effect, cmd).not.toMatch(GM_MARK);
    }
    expect(rows.find(r => r.cmd === '!x').effect).not.toMatch(GM_MARK);
  });

  it("the !bond row gives the handler's syntax", () => {
    const bondSrc = readFileSync('src/moves/bondCommand.js', 'utf8');
    expect(bondSrc).toMatch(/Usage: <code>!bond \[rank\] \[name\]<\/code>/);   // control: the handler's usage card
    expect(rowsFor('!bond').map(r => r.cmd)).toEqual(['!bond [rank] [name]']);
  });
});
