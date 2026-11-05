// STARFORGED COMPANION
// tests/unit/helpRoleClaims.test.js
//
// The help says who may type a command or press a button, as the code does
// (issue #331 X58, X59; the issue #326 W83 rule).
//
// X58 — a player who reads the Chat Commands page should learn which commands
// are the GM's before typing one. Every command whose handler stops a player
// with "… is GM-only" / "… is available to GMs only" is marked so on the
// page — in its row, or in its section's heading when every command in the
// section is the GM's (the Recap, Lore, Pacing, Debug, World Journal and
// Migration sections). The audit's probe read the rows alone: the Pacing and
// World Journal rows it named sit under "(GM only)" headings already, and the
// `!at` / `!sector new` rows under the one heading that was wrong (X59).
//
// X59 — (a) Quick Start's First-Time Setup called the 🛡 Companion Settings
// button "GM only", though every user has it and its About tab is where a
// player enters their own Claude and ElevenLabs keys (issue #209); only the
// OpenRouter field is the GM's. (b) `!sector list` sat under "Location &
// Sector Commands (GM only)" though anyone may run it — the heading is
// dropped, and the section's GM-only rows say so in the row.
//
// Issue #337 Y47 — X59(a)'s claim survived on the First Session page's
// "Add your API keys" step; it is reworded as Quick Start's, and every page
// is now checked for it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAGES } from '../../src/help/helpJournal.js';
import { companionToolbarTools } from '../../src/ui/companionToolbarTools.js';
import { productionSources } from '../helpers/sourceScan.js';

const GM_ONLY = /\bGM(?:-| )only\b|\bGMs only\b|\bonly the GM\b/i;
const page    = (name) => PAGES.find(p => p.name === name)?.text?.content ?? '';
const decode  = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const plain   = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

/** Every Chat Commands row: its command, its effect text, and its section's heading. */
function commandRows() {
  const rows = [];
  for (const section of page('Chat Commands').split('<h3>').slice(1)) {
    const heading = decode(section.slice(0, section.indexOf('</h3>')));
    for (const m of section.matchAll(/<tr><td><code>([^<]*)<\/code><\/td><td>([\s\S]*?)<\/td><\/tr>/g)) {
      rows.push({ command: decode(m[1]), effect: plain(m[2]), heading });
    }
  }
  return rows;
}

/** The commands a handler refuses to a player with a GM-only notice (the command its warning names). */
function gmGatedCommands() {
  const out = new Set();
  const re = /\bwarn\??\.?\(\s*["'`](?:Starforged Companion: )?(![a-z][a-z-]*(?: (?:new|debug|<name>))?)[^"'`]*?(?:GM-only|GMs only)/g;
  for (const { code } of productionSources()) {
    for (const m of code.matchAll(re)) out.add(m[1].replace('<name>', 'Name'));
  }
  return [...out];
}

const rowsFor = (rows, cmd) => rows.filter(r => r.command === cmd || r.command.startsWith(`${cmd} `));

describe('the Chat Commands page marks every GM-only command (issue #331 X58)', () => {
  it('control: the sweep finds the gated commands, and !scene start is marked', () => {
    const gated = gmGatedCommands();
    for (const cmd of ['!at', '!pace', '!roll', '!journal', '!sector new', '!sector Name', '!scene']) expect(gated).toContain(cmd);
    expect(rowsFor(commandRows(), '!scene start')[0].effect).toMatch(GM_ONLY);
  });

  it.each(gmGatedCommands())('%s — each of its rows says GM only, in the row or its heading', (cmd) => {
    const rows = rowsFor(commandRows(), cmd);
    expect(rows.length, `no Chat Commands row for ${cmd}`).toBeGreaterThan(0);
    for (const row of rows) {
      expect(GM_ONLY.test(row.effect) || GM_ONLY.test(row.heading),
        `${row.command} (under "${row.heading}") does not say it is GM-only`).toBe(true);
    }
  });

  it("a section headed (GM only) holds only commands a player is refused", () => {
    const gated = gmGatedCommands();
    const gmSections = commandRows().filter(r => GM_ONLY.test(r.heading) && !GM_ONLY.test(r.effect));
    const strays = gmSections.filter(r => !gated.some(cmd => r.command === cmd || r.command.startsWith(`${cmd} `))
      && !/^!migrate-entities\b/.test(r.command));   // its notice reads "only the GM can run …"
    expect(strays.map(r => r.command)).toEqual([]);
  });
});

describe('the help says who may press 🛡 and type !sector list (issue #331 X59)', () => {
  it("control: the code — 🛡 is every user's; `!sector list` has no GM gate; only the OpenRouter key field is the GM's", () => {
    expect(companionToolbarTools({ isGM: false }).map(t => t.key)).toContain('sfSettings');
    const src = readFileSync('src/index.js', 'utf8');
    const listBranch = src.match(/if \(sub === "list"\) \{[\s\S]*?\n {2}\}/)?.[0] ?? '';
    expect(listBranch).toMatch(/sectorList: true/);
    expect(listBranch).not.toMatch(/isGM/);
    const panel = readFileSync('src/ui/settingsPanel.js', 'utf8');
    expect(panel).toMatch(/\$\{ctx\.isGM \? `\s*<div class="api-key-field">\s*<label class="api-key-label" for="sf-openrouter-key">/);
  });

  it('Quick Start does not call the Companion Settings button GM-only, and says whose the OpenRouter key is', () => {
    const steps = [...page('Quick Start').matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => plain(m[1]));
    const open = steps.find(s => /Open Companion Settings → About/.test(s));
    expect(open).toBeDefined();
    expect(open).not.toMatch(GM_ONLY);
    expect(open).toMatch(/every player/);
    expect(steps.find(s => /OpenRouter API Key/.test(s))).toMatch(GM_ONLY);
  });

  // Issue #337 Y47 — X59(a)'s claim at a second page: the First Session
  // walkthrough's "Add your API keys" step read "Open Companion Settings →
  // About (GM only)", so a player following it to enter the key their
  // Private Channel or audio needs read that the tab was not theirs.
  it("First Session's 'Add your API keys' step says every player enters their own keys, and that the OpenRouter key is the GM's", () => {
    const steps = [...page('First Session').matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => plain(m[1]));
    const step = steps.find(s => /Add your API keys/.test(s));
    expect(step).toBeDefined();
    expect(step).toMatch(/Open Companion Settings → About/);
    expect(step).not.toMatch(GM_ONLY);
    expect(step).toMatch(/every player enters their own keys/);
    expect(step).toMatch(/Claude API key/);
    expect(step).toMatch(/ElevenLabs API key/);
    expect(step).toMatch(/OpenRouter API key[^.]*is the GM's/);
  });

  it('no help page calls the Companion Settings → About tab GM-only', () => {
    const aboutGmOnly = /Companion Settings → About\s*\([^)]*\b(?:GM(?:-| )only|GMs only)\b/i;
    const pages = PAGES.filter(p => p.name !== 'Changelog');   // the Changelog quotes history
    expect(pages.length).toBeGreaterThan(10);
    for (const p of pages) expect(plain(p.text.content), p.name).not.toMatch(aboutGmOnly);
    // control: the shape the two pages had — "(toolbar 🛡 button, GM only)" and "(GM only)".
    expect('Open Companion Settings → About (toolbar 🛡 button, GM only)').toMatch(aboutGmOnly);
    expect('Open Companion Settings → About (GM only). Enter').toMatch(aboutGmOnly);
  });

  it('`!sector list` is under no "(GM only)" heading and says anyone may run it; the section\'s GM-only rows say so', () => {
    const [list] = rowsFor(commandRows(), '!sector list');
    expect(list.heading).toBe('Location & Sector Commands');
    expect(list.effect).not.toMatch(GM_ONLY);
    expect(list.effect).toMatch(/Anyone may invoke/);
    for (const cmd of ['!at Name', '!at', '!sector new', '!sector Name']) {
      expect(commandRows().find(r => r.command === cmd).effect, cmd).toMatch(GM_ONLY);
    }
  });
});
