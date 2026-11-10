/**
 * UI-7 README-STALE-CLAIMS (twelfth audit, ui area; DOC-DRIFT).
 *
 * README.md is the first thing a new table reads; three of its statements
 * are claims a reader acts on that the code (and the in-game help, already
 * corrected) contradict:
 *  (a) README.md:300 "Private Lines — personal limits visible only to you and
 *      the GM". A player's lines are relayed to the canonical GM and stored in
 *      the world-scoped campaignState (applyPrivateLinesSync,
 *      src/ui/settingsPanel.js:832-854), which every client receives — the
 *      boundary the help's Safety page and the panel's note give ("stored in
 *      the world's shared data, which another player could read from their
 *      browser's developer console"; settingsPanel.js:1120). F16
 *      PRIVATE-LINES-WORDING and PRIVATE-LINES-PANEL-COPY corrected the help,
 *      the panel and lang/en.json; the README kept the overclaim — on a safety
 *      tool, the claim that decides what a player is willing to write there.
 *  (b) README.md:286 "The budget is defined in src/schemas.js
 *      (ContextPacketSchema.tokenBudget)" — no ContextPacketSchema exists
 *      anywhere in src/ (the context packet was retired, FACTION-PACKET-DEAD).
 *  (c) README.md:50-51 "Progress tracks — vows, expeditions, combats,
 *      connections, and legacy tracks. Stored in a dedicated journal,
 *      displayed in a sidebar panel." The panel and its journal hold fights,
 *      expeditions and scene challenges (PANEL_TRACK_TYPES,
 *      src/ui/progressTracks.js:71-75); vows and legacies are on the sheet,
 *      connections on their cards — the drift Z72 corrected in
 *      file-structure.md.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { StubElement } from '../../helpers/cardDom.js';
import { PAGES } from '../../../src/help/helpJournal.js';

const ROOT = path.resolve(__dirname, '../../..');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const MODULE_ID = 'starforged-companion';

describe('UI-7 (a): the README\'s Private Lines privacy claim', () => {
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

  it('another player\'s client holds Pat\'s Private Line — so the README should not call it "visible only to you and the GM"', async () => {
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

    // Quinn's browser receives it with the world's campaignState.
    const onQuinn = table.client('pl-2').getSetting('campaignState')?.safety?.privateLines ?? [];
    expect(onQuinn.flatMap(e => e.lines)).toContain('Nothing involving my character\'s family.');

    expect(README).not.toMatch(/Private Lines\*\*\s*—\s*personal limits visible only to you and the GM/);
  }, 60_000);
});

describe('UI-7 (b, c): the README\'s developer and feature claims', () => {
  it('(b) the README\'s "ContextPacketSchema.tokenBudget" should exist in src/schemas.js', () => {
    expect(README).toMatch(/ContextPacketSchema\.tokenBudget/);    // control: the claim is there
    const schemas = fs.readFileSync(path.join(ROOT, 'src/schemas.js'), 'utf8');
    expect(schemas).toMatch(/ContextPacketSchema/);
  });

  it('(c) every track type the README places in the Progress Tracks journal and panel should be one the panel shows', async () => {
    const para = (/\*\*Progress tracks\*\*[\s\S]*?\n\n/.exec(README)?.[0] ?? '').replace(/\s+/g, ' ');
    expect(para).toMatch(/vows, expeditions, combats, connections, and legacy tracks\. Stored in a dedicated journal, displayed in a sidebar panel/);   // control
    const src = fs.readFileSync(path.join(ROOT, 'src/ui/progressTracks.js'), 'utf8');
    const panelTypes = /const PANEL_TRACK_TYPES = \{([\s\S]*?)\};/.exec(src)[1];
    const shown = { vows: /\bvow\b/.test(panelTypes), connections: /\bconnection\b/.test(panelTypes), legacy: /\blegacy\b/.test(panelTypes) };
    expect(shown).toEqual({ vows: true, connections: true, legacy: true });
  });
});
