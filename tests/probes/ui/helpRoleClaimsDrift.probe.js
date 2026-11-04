/**
 * PROBE — UI-04 HELP-ROLE-CLAIMS-DRIFT (DOC-DRIFT)
 * (src/help/helpJournal.js — the "Quick Start" page's First-Time Setup step 1
 *  and the "Chat Commands" page's "Location & Sector Commands (GM only)"
 *  heading; src/ui/companionToolbarTools.js:33 and src/index.js:6292–6342)
 *
 * What the user does: a player follows the help. Quick Start step 1 says
 * "Open Companion Settings → About (toolbar 🛡 button, GM only)" — so a
 * player who needs to enter their own Claude key (for the Private Channel)
 * or ElevenLabs key (for audio) reads that the button is not theirs. The
 * Chat Commands page lists `!sector list` under the heading "Location &
 * Sector Commands (GM only)" — so a player who wants to see the sectors reads
 * that they may not.
 *
 * What happens in the code: the 🛡 Companion Settings tool is shown to every
 * user (companionToolbarTools: `visible: true`; the About tab renders the
 * Claude and ElevenLabs key fields for players — issue #209), which is why
 * issue #326 W83 (b) corrected the Toolbar Buttons page to "Everyone" — the
 * Quick Start page kept the old claim. `!sector list` has no GM gate
 * (handleSectorCommand gates only `new` and the switch; its own usage line
 * marks those two "(GM)" and `list` not), and the README lists `!sector list`
 * without a GM mark.
 *
 * What should happen: the help says what the code does about who may do
 * what (the W83 rule): Quick Start does not call the 🛡 button GM-only, and
 * `!sector list` is not under a GM-only heading (or the heading says which
 * rows are GM-only, as the Fact Continuity table does since W83 (c)).
 *
 * Controls: the code — the tool is visible to a non-GM; the list branch has
 * no isGM check; the Toolbar Buttons page already says Everyone.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/ui/helpRoleClaimsDrift.probe.js
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAGES } from '../../../src/help/helpJournal.js';
import { companionToolbarTools } from '../../../src/ui/companionToolbarTools.js';

const page  = (name) => PAGES.find(p => p.name === name)?.text?.content ?? '';
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ');

describe('UI-04 the help says who may press 🛡 and type !sector list', () => {
  it('control: the code — 🛡 is every user\'s; `!sector list` has no GM gate; the Toolbar page says Everyone', () => {
    expect(companionToolbarTools({ isGM: false }).map(t => t.key)).toContain('sfSettings');
    const src = readFileSync('src/index.js', 'utf8');
    const listBranch = src.match(/if \(sub === "list"\) \{[\s\S]*?\n  \}/)?.[0] ?? '';
    expect(listBranch).toMatch(/sectorList: true/);
    expect(listBranch).not.toMatch(/isGM/);
    expect(plain(page('Toolbar Buttons')).match(/Companion Settings\s+(GM|Everyone)/)?.[1]).toBe('Everyone');
  });

  it('Quick Start does not call the Companion Settings button GM-only', () => {
    const step = plain(page('Quick Start')).match(/Open Companion Settings → About([^.]*)/)?.[1] ?? '';
    // FAILS today: "(toolbar 🛡 button, GM only)".
    expect(step).not.toMatch(/GM only/);
  });

  it('`!sector list` is not listed under a "(GM only)" heading', () => {
    const commands = plain(page('Chat Commands'));
    const section = commands.split('Location & Sector Commands')[1]?.split('Encounter Commands')[0] ?? '';
    expect(section).toMatch(/!sector list/);                 // the row is in this section
    // FAILS today: the section heading reads "Location & Sector Commands (GM only)".
    expect(commands).not.toMatch(/Location & Sector Commands \(GM only\)/);
  });
});
