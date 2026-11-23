/**
 * STARFORGED COMPANION
 * tests/unit/narratorDirectivesIssue377.test.js
 *
 * Issue #377 items 2–5 — what the narrator is told, as the long haul's first
 * live run (explorations/long-haul-live-20261123) and the memory charter's
 * run 4 (explorations/memory-live-20261123-0436) showed it misread.
 *
 *   2. NARRATION-WRITES-ITS-SHAPE-DIRECTIVE — "Shape: Open on someone other
 *      than the acting character…" came back as prose: "Open on the hatch,
 *      not you." (a57), "Open on Tamsin, not the hatch." (a79).
 *   3. OFFERED-MOVE-NARRATED-AS-DONE — "I'm setting a course for Bleakhold
 *      Station" was narrated as the course taken while the same reply
 *      offered Set a Course; "I treat my wounds with the ship's medkit" healed
 *      her with no roll (a56, a57).
 *   4. NARRATOR-ADDS-TO-THE-PREMISE — the opening was told "(No absent
 *      crewmates registered — invent generic absurd crew.)" and given the
 *      character's stats as her traits ("because Wits 3 is a lot of thinking
 *      to do on bland food").
 *   5. GALLEY-VIGNETTE-REPEATS / CLOSING-SCENE-REPEATS — nothing told a
 *      bookend what the earlier ones had shown.
 */

import { describe, it, expect } from 'vitest';

import { BEAT_SHAPES } from '../../src/narration/proseVariety.js';
import {
  formatBeatProseBlock, buildPacedNarrativeUserMessage, BEAT_SHAPE_LABEL,
} from '../../src/narration/narratorPrompt.js';
import { buildGalleyVignetteUserMessage } from '../../src/session/galleyVignette.js';
import { buildEndSessionVignetteUserMessage } from '../../src/session/endSessionVignette.js';
import { earlierVignettes } from '../../src/session/vignetteHistory.js';

const MODULE_ID = 'starforged-companion';

describe('item 2 — the beat\'s shape is an instruction, never a line of prose', () => {
  it('no hint is a director\'s "Open on…"', () => {
    for (const s of BEAT_SHAPES) expect(s.hint, s.id).not.toMatch(/^\s*Open on\b/i);
  });

  it('the line says it is the narrator\'s, and not to write it', () => {
    const other = BEAT_SHAPES.find(s => s.id === 'other');
    const block = formatBeatProseBlock({ beatShape: other });
    expect(block).toContain(`${BEAT_SHAPE_LABEL} ${other.hint}`);
    expect(block).toMatch(/instruction to you — never write it, quote it or describe it in the narration/);
    expect(block).not.toMatch(/Shape:/);
  });
});

describe('item 3 — an offered move has not been made', () => {
  it('the SUGGESTED MOVE block says nothing it would decide has happened', () => {
    const msg = buildPacedNarrativeUserMessage(
      "I'm setting a course for Bleakhold Station", '', 3, 'Set a Course', 'Mira Kestrel');
    expect(msg).toMatch(/## SUGGESTED MOVE[\s\S]*It has not been made, and nothing it\s+would decide has happened/);
    expect(msg).toMatch(/a course laid in is not yet flown, a wound bared is not yet treated/);
    expect(msg).toMatch(/The prose never performs the move/);
  });

  it('with no move offered, nothing on a sheet changes in narration', () => {
    const msg = buildPacedNarrativeUserMessage("I treat my wounds with the ship's medkit", '', 3, null, 'Mira Kestrel');
    expect(msg).not.toContain('## SUGGESTED MOVE');
    expect(msg).toMatch(/Nor does anything on a character's sheet change — no wound is\s+treated or healed/);
    expect(msg).toMatch(/the\s+move that decides it is still to be made/);
  });
});

const actor = (name, bio = '') => ({
  id: `a-${name}`, name, type: 'character',
  system: { biography: bio, stats: { edge: 2, heart: 2, iron: 1, shadow: 1, wits: 3 } },
});

describe('item 4 — a solo character is alone with the ship, and no stat is sent', () => {
  it('no crew registered: none is invented, and the example jokes are gone', () => {
    const msg = buildGalleyVignetteUserMessage({ active: [{ actor: actor('Mira Kestrel') }], absent: [] }, {}, { earlier: [] });
    expect(msg).not.toMatch(/invent generic absurd crew/);
    expect(msg).not.toMatch(/Absent crewmates/);
    expect(msg).toMatch(/Nobody else is aboard[\s\S]*Do not invent one, present or absent/);
    expect(msg).toMatch(/the character, the only person aboard, is/);
    expect(msg).not.toMatch(/laundry|escape pod/);
  });

  it('no stat line, and a rule against stating one', () => {
    const msg = buildGalleyVignetteUserMessage({ active: [{ actor: actor('Mira Kestrel') }], absent: [] }, {}, { earlier: [] });
    expect(msg).not.toMatch(/Stats:|wits 3/i);
    expect(msg).toMatch(/never state a game stat/);
  });

  it('control: crewmates registered elsewhere aboard are still bantered about', () => {
    const msg = buildGalleyVignetteUserMessage(
      { active: [{ actor: actor('Kira') }], absent: [{ actor: actor('Ren', 'Fixes things with tape') }] }, {}, { earlier: [] });
    expect(msg).toMatch(/Absent crewmates \(referenced in banter, not present\):\n- Ren/);
    expect(msg).not.toMatch(/Nobody else is aboard/);
  });
});

describe('item 5 — a bookend is shown the earlier ones of its kind, as already used', () => {
  const card = (kind, text, extra = {}) => ({
    flags: { [MODULE_ID]: { sessionVignetteCard: true, vignetteKind: kind, narrationText: text, ...extra } },
  });

  it('earlierVignettes reads the chat\'s bookends of a kind, newest three, oldest first', () => {
    const messages = [
      card('galley_begin', 'The kettle that has outlasted three owners clicks.'),
      card('npc_end', 'Tamsin closes her ledger stall.', { vignetteNpc: 'Tamsin Vey' }),
      card('galley_begin', 'Lentils again, and the burnt pan.'),
      card('galley_begin', 'Removed by the X-Card.', { xCarded: true }),
      card('galley_begin', 'The recycler sings flat.'),
      card('galley_begin', 'The <npc name="Ship">ship</npc> sulks.'),
    ];
    expect(earlierVignettes(['galley_begin'], { messages }).map(e => e.text)).toEqual([
      'Lentils again, and the burnt pan.', 'The recycler sings flat.', 'The ship sulks.',
    ]);
    expect(earlierVignettes(['npc_end'], { messages })).toEqual([{ text: 'Tamsin closes her ledger stall.', title: 'Tamsin Vey' }]);
  });

  it('the opening lists them, and asks for something different', () => {
    const msg = buildGalleyVignetteUserMessage({ active: [{ actor: actor('Mira Kestrel') }], absent: [] }, {}, {
      earlier: [{ text: 'The kettle that has outlasted three owners clicks.', title: null }],
    });
    expect(msg).toMatch(/EARLIER OPENINGS — already used, oldest first\. This one must be different from each/);
    expect(msg).toContain('- The kettle that has outlasted three owners clicks.');
  });

  it('the closing lists them, with who each featured', () => {
    const msg = buildEndSessionVignetteUserMessage({ kind: 'bonded_connection', name: 'Tamsin Okoro', hint: '' }, {}, {
      earlier: [{ text: 'Tamsin closes her ledger stall, eating standing up.', title: 'Tamsin Vey' }],
    });
    expect(msg).toMatch(/EARLIER CLOSINGS — already used[\s\S]*not the same place, task, food or objects/);
    expect(msg).toContain('- (Tamsin Vey) Tamsin closes her ledger stall, eating standing up.');
  });

  it('control: the first of its kind lists nothing', () => {
    const msg = buildGalleyVignetteUserMessage({ active: [{ actor: actor('Mira Kestrel') }], absent: [] }, {}, { earlier: [] });
    expect(msg).not.toMatch(/EARLIER OPENINGS/);
  });
});
