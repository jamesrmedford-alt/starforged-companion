/**
 * STARFORGED COMPANION
 * tests/unit/narratorProgressTracks.test.js
 *
 * TRACKS-UNPORTED (issue #290): the table's open fights, expeditions and scene
 * challenges reach the narrator. The ACTIVE FIGHT block (#241 P1 — a fight's
 * objective, position and the vow it serves) and the PROGRESS TRACKS section
 * lived only in the retired context assembler, whose packet no narration
 * read; deleting it (#271) dropped them for good. No narration saw an open
 * fight.
 *
 * Tracks are written by the real store (addProgressTrack /
 * setCombatTrackPosition / markProgressById / completeProgressTrack) and read
 * at the real seam (buildNarratorExtras → buildNarratorSystemPrompt).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { buildNarratorExtras } from '../../src/narration/narrator.js';
import { buildNarratorSystemPrompt } from '../../src/narration/narratorPrompt.js';
import {
  addProgressTrack,
  setCombatTrackPosition,
  markProgressById,
  completeProgressTrack,
} from '../../src/ui/progressTracks.js';

const PROSE_MODES = [
  'move_resolution',
  'paced_narrative',
  'scene_interrogation',
  'oracle_followup',
  'session_vignette',
  'vow_swearing',
  'inciting_incident',
];

let journal;
let savedJournal;

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal() {
  const flags = {};
  return {
    id:      'tracks-journal',
    name:    'Starforged Progress Tracks',
    getFlag: (mod, key) => flags[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { flags[`${mod}.${key}`] = structuredClone(value); },
  };
}

beforeEach(() => {
  journal = makeTracksJournal();
  savedJournal = game.journal;
  game.journal = {
    ...savedJournal,
    find:    (fn) => (fn(journal) ? journal : null),
    getName: (name) => (name === journal.name ? journal : null),
  };
});

afterEach(() => {
  game.journal = savedJournal;
});

async function promptFor(mode) {
  const state  = { activeSectorId: null, sectors: [] };
  const extras = await buildNarratorExtras(mode, state, {
    playerNarration: 'I hold the line.',
    relevance:       { resolvedClass: 'interaction', entityIds: [], entityTypes: [] },
  });
  return buildNarratorSystemPrompt(state, {}, null, '', extras);
}

describe('open progress tracks reach the narrator (TRACKS-UNPORTED)', () => {
  it('a fight carries its rank, progress, objective, position and the vow it serves', async () => {
    const fight = await addProgressTrack({
      label:         'Corsair boarding party',
      type:          'combat',
      rank:          'dangerous',
      objective:     'hold the airlock',
      linkedVowName: 'Avenge my sister',
    });
    await markProgressById(fight.id);
    await setCombatTrackPosition(fight.id, 'bad_spot');

    const prompt = await promptFor('paced_narrative');

    expect(prompt).toContain('## OPEN PROGRESS TRACKS');
    expect(prompt).toContain(
      '- Fight: Corsair boarding party — dangerous, 2/10 progress; objective: hold the airlock; ' +
      'position: in a bad spot; serves the vow "Avenge my sister" — winning it is a milestone on that vow',
    );
  });

  it('lists expeditions and scene challenges; leaves out finished tracks and journal vows', async () => {
    await addProgressTrack({ label: 'Through the Shroud', type: 'expedition', rank: 'formidable' });
    await addProgressTrack({ label: 'Restart the reactor', type: 'scene_challenge', rank: 'dangerous' });
    const won = await addProgressTrack({ label: 'Dockside brawl', type: 'combat', rank: 'troublesome' });
    await completeProgressTrack(won.id);
    await addProgressTrack({ label: 'A journal vow', type: 'vow', rank: 'epic' });

    const prompt = await promptFor('paced_narrative');

    expect(prompt).toContain('- Expedition: Through the Shroud — formidable, 0/10 progress');
    expect(prompt).toContain('- Scene challenge: Restart the reactor — dangerous, 0/10 progress');
    expect(prompt).not.toContain('Dockside brawl');
    expect(prompt).not.toContain('A journal vow');
  });

  it('every prose mode carries the block; the campaign recap does not', async () => {
    await addProgressTrack({ label: 'Corsair boarding party', type: 'combat', rank: 'dangerous' });
    for (const mode of PROSE_MODES) {
      expect(await promptFor(mode), mode).toContain('## OPEN PROGRESS TRACKS');
    }
    expect(await promptFor('campaign_recap')).not.toContain('## OPEN PROGRESS TRACKS');
  });

  it('is absent when no track is open, and lists six at most', async () => {
    expect(await promptFor('paced_narrative')).not.toContain('## OPEN PROGRESS TRACKS');

    for (let i = 1; i <= 8; i += 1) {
      await addProgressTrack({ label: `Leg ${i}`, type: 'expedition', rank: 'dangerous' });
    }
    const prompt = await promptFor('paced_narrative');
    expect(prompt).toContain('Leg 6');
    expect(prompt).not.toContain('Leg 7');
  });

  it('with no Progress Tracks journal there are no tracks, and none is created', async () => {
    game.journal = { ...savedJournal, find: () => null, getName: () => null };
    const create = vi.spyOn(JournalEntry, 'create');

    expect(await promptFor('paced_narrative')).not.toContain('## OPEN PROGRESS TRACKS');
    expect(create).not.toHaveBeenCalled();
    create.mockRestore();
  });
});
