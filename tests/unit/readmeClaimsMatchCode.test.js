/**
 * STARFORGED COMPANION
 * tests/unit/readmeClaimsMatchCode.test.js
 *
 * Issue #345 AA70 (README-STALE-CLAIMS) — three README statements a reader
 * acts on, contradicted by the code (and by the in-game help, already right):
 *  (a) "Private Lines — personal limits visible only to you and the GM". A
 *      player's lines are relayed to the canonical GM and stored in the
 *      world-scoped campaignState every client receives — the boundary the
 *      help's Safety page and the panel's note give ("stored in the world's
 *      shared data, which another player could read from their browser's
 *      developer console"; decisions.md "Private Lines in shared narration").
 *      F16 and PRIVATE-LINES-PANEL-COPY corrected the help and the panel; the
 *      README kept the overclaim, on a safety tool.
 *  (b) "The budget is defined in src/schemas.js
 *      (ContextPacketSchema.tokenBudget)" — the context packet, its 1,200-token
 *      budget and the schema were deleted with the assembler (issue #271: the
 *      whole-prompt budget is obsolete); the "Context packet size" section
 *      around it described that packet.
 *  (c) "Progress tracks — vows, expeditions, combats, connections, and legacy
 *      tracks. Stored in a dedicated journal, displayed in a sidebar panel."
 *      The panel and its journal hold fights, expeditions and scene
 *      challenges (PANEL_TRACK_TYPES); vows and legacies are on the sheet,
 *      a connection's track on its card (Z72 corrected file-structure.md).
 *
 * Adapted from the probe: its (b) and (c) asserted the README's claims true
 * of the code (the schema should exist; the panel should show vows,
 * connections and legacies); the fix is the README, so they assert the README
 * says what the code does. (a)'s setup — a Private Line reaching another
 * player's client through the real panel — and the help control are kept.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { StubElement } from '../helpers/cardDom.js';
import { PAGES } from '../../src/help/helpJournal.js';

const ROOT = path.resolve(__dirname, '../..');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');

/** The README bullet / paragraph that starts with `**<title>**`. */
const readmeBlock = (title) => flat(new RegExp(`\\*\\*${title}\\*\\*[\\s\\S]*?(?=\\n\\n|\\n- \\*\\*)`).exec(README)?.[0] ?? '');

/** A setting's registered default, read from its registration in the settings panel source. */
function registeredDefault(name) {
  const block = new RegExp(`name:\\s*'${name}',[\\s\\S]*?default:\\s*([^,\\n]+),`).exec(source('src/ui/settingsPanel.js'));
  return block ? Number(block[1]) : null;
}

describe('issue #345 AA70 (a) — the README\'s Private Lines privacy claim', () => {
  let table;
  let savedDocument;
  beforeAll(async () => {
    savedDocument = globalThis.document;
    globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
    table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
  }, 60_000);
  afterAll(() => { table?.teardown(); globalThis.document = savedDocument; });

  it('control: the help states the real boundary (shared world data a console can read)', () => {
    const safety = PAGES.find(p => p.name === 'Safety System').text.content;
    expect(safety).toMatch(/stored in the world.{0,10}s shared data/);
  });

  it('another player\'s client holds Pat\'s Private Line — and the README says so, not "visible only to you and the GM"', async () => {
    // Pat adds a Private Line on the Companion Settings panel's Safety tab.
    const c = table.client('pl-1');
    const { SettingsPanelApp } = await c.import('../../src/ui/settingsPanel.js');
    await c.run(async () => {
      const panel = Object.assign(new SettingsPanelApp(), { render() {} });
      panel.element = await panel._renderHTML(await panel._prepareContext({}), {});
      panel.element.querySelector('[name="newPrivateLine"]').value = 'Nothing involving my character\'s family.';
      await SettingsPanelApp.DEFAULT_OPTIONS.actions.addPrivateLine.call(panel, {}, {});
    });
    await table.settle();

    // Quinn's browser receives it with the world's campaignState (setup).
    const onQuinn = table.client('pl-2').getSetting('campaignState')?.safety?.privateLines ?? [];
    expect(onQuinn.flatMap(e => e.lines)).toContain('Nothing involving my character\'s family.');

    const bullet = readmeBlock('Private Lines');
    expect(bullet).not.toMatch(/visible only to you and the GM/);
    expect(bullet).toMatch(/stored in the world's shared data, which another player could read from their browser's developer console/);
    expect(bullet).toMatch(/The GM can see them/);
  }, 60_000);
});

describe('issue #345 AA70 (b, c) — the README\'s developer and feature claims', () => {
  it('(b) the README cites no context packet — the schema, its budget and the packet are gone from src/', () => {
    expect(source('src/schemas.js')).not.toMatch(/ContextPacketSchema/);   // control: the code side
    expect(README).not.toMatch(/ContextPacketSchema|tokenBudget|context packet/i);
  });

  it('(b) its prompt-size section names the caps that exist, at their registered defaults', () => {
    const section = flat(README.split('### Narrator prompt size')[1]?.split('\n## ')[0]?.split('\n### ')[0] ?? '');
    expect(section, 'the section exists').not.toBe('');
    expect(section).toMatch(/no fixed budget for the whole prompt/);
    expect(registeredDefault('Max Ledger Tokens')).toBe(400);
    expect(section).toMatch(/\*Max ledger tokens\* \(default 400\)/);
    expect(registeredDefault('Narrator Context Cards')).toBe(20);
    expect(section).toMatch(/\*Context cards\* \(default 20\)/);
    // The usage page it points to is the one the narrator writes.
    expect(source('src/pacing/telemetry.js')).toMatch(/const pageName = "Narrator Usage"/);
    expect(section).toMatch(/"Narrator Usage" page/);
  });

  it('(c) the Progress tracks paragraph puts in the panel exactly the track types the panel shows', () => {
    const panelTypes = /const PANEL_TRACK_TYPES = \{([\s\S]*?)\};/.exec(source('src/ui/progressTracks.js'))[1];
    const keys = [...panelTypes.matchAll(/^\s*(\w+):/gm)].map(m => m[1]);
    expect(keys, 'the panel\'s track types (control)').toEqual(['combat', 'expedition', 'scene_challenge']);

    const para = readmeBlock('Progress tracks');
    expect(para).toMatch(/fights, expeditions, and scene challenges .*in the Progress Tracks panel, stored in a dedicated journal/);
    expect(para).toMatch(/Vows and legacy tracks live on each character's sheet, and a connection's relationship track on its card/);
    expect(para).not.toMatch(/vows, expeditions, combats, connections, and legacy tracks/);
  });
});
