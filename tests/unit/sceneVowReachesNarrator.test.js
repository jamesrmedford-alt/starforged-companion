/**
 * STARFORGED COMPANION
 * tests/unit/sceneVowReachesNarrator.test.js
 *
 * Issue #353 R3 — the vow is the spine. The narrator was given vow data in
 * three places (CAMPAIGN PREMISE's first vow, CHARACTER STATE's vows, the
 * session's focus) and asked to do something with none of it but the focus;
 * an expedition or a scene challenge could not say which vow it served.
 *
 * Now one line leads the per-beat context — THE VOW THIS SCENE SERVES: a
 * linked track's vow, the session's quest focus, or the only vow in play,
 * with its progress — and one instruction: show what a beat achieves toward
 * it. An expedition or a scene challenge is linked to a vow when the Progress
 * Tracks panel creates it, and an open one (an expedition the move pipeline
 * began) on its row.
 *
 * Composition (rules/reachability.md §3): the vows are Items on the PC's
 * sheet, the tracks are written by the canonical GM's real relay handler
 * (applyProgressTrackEditFromRelay — the panel's Add and 🔗), and the line is
 * read at the real seam (buildNarratorExtras → buildNarratorSystemPrompt).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { buildNarratorExtras } from '../../src/narration/narrator.js';
import { buildNarratorSystemPrompt, formatSceneVowBlock } from '../../src/narration/narratorPrompt.js';
import { applyProgressTrackEditFromRelay, addProgressTrack, listOpenProgressTracks } from '../../src/ui/progressTracks.js';

const MODULE_ID = 'starforged-companion';
const HEADING = '## THE VOW THIS SCENE SERVES';
const INSTRUCTION = 'When a beat achieves something toward this vow, show that in the fiction.';

let journal;
let savedJournal;

/** The Progress Tracks journal, a flag store as progressTracks.js writes it. */
function makeTracksJournal() {
  const flags = {};
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => flags[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { flags[`${mod}.${key}`] = structuredClone(value); },
  };
}

/** A vow Item on a sheet. */
const vowItem = (id, name, { rank = 'dangerous', ticks = 0, completed = false, flags = {} } = {}) => ({
  id, type: 'progress', name, system: { subtype: 'vow', rank, current: ticks, completed }, flags,
});

let kira;

beforeEach(() => {
  journal = makeTracksJournal();
  savedJournal = game.journal;
  game.journal = { ...savedJournal, find: (fn) => (fn(journal) ? journal : null), getName: (n) => (n === journal.name ? journal : null) };
  game.settings._store.set(`${MODULE_ID}.campaignState`, { clocks: [] });
  kira = makeTestActor({
    id: 'pc-kira', name: 'Kira',
    items: { contents: [
      vowItem('bg-kira', 'Avenge the Iron Hollow', { rank: 'epic' }),
      vowItem('v-beacon', 'Find the lost beacon', { rank: 'formidable', ticks: 12, flags: { [MODULE_ID]: { vowId: 'v-beacon' } } }),
      vowItem('v-debt', 'Repay the Iron Covenant', { ticks: 4, flags: { [MODULE_ID]: { vowId: 'v-debt' } } }),
    ] },
  });
  game.actors._setAll([kira]);
});

afterEach(() => {
  game.journal = savedJournal;
  game.actors._reset();
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

async function promptFor(mode, extraOpts = {}) {
  const state  = { activeSectorId: null, sectors: [], ...(game.settings.get(MODULE_ID, 'campaignState') ?? {}) };
  const extras = await buildNarratorExtras(mode, state, {
    playerNarration: 'We push on.',
    relevance:       { resolvedClass: 'interaction', entityIds: [], entityTypes: [] },
    ...extraOpts,
  });
  return { extras, prompt: buildNarratorSystemPrompt(state, {}, null, '', extras) };
}

/** The panel's Add, as the canonical GM applies it. */
const panelAdd = (payload) => applyProgressTrackEditFromRelay({ op: 'add', ...payload }, { requesterIsGM: false });

describe('an expedition or a scene challenge created with a vow serves it (issue #353 R3)', () => {
  it('the panel\'s Add keeps the link — the vow\'s id and name — and the scene\'s line names that vow', async () => {
    const res = await panelAdd({ label: 'Into the Shroud', type: 'expedition', rank: 'dangerous', vowId: 'v-debt' });
    expect(res).toMatchObject({ applied: true });
    expect(listOpenProgressTracks()[0]).toMatchObject({ label: 'Into the Shroud', linkedVowId: 'v-debt', linkedVowName: 'Repay the Iron Covenant' });

    const { extras, prompt } = await promptFor('move_resolution', {
      oracleSeeds: { results: ['Space Sighting: a derelict beacon'], names: [] },
    });
    expect(extras.sceneVow).toMatchObject({ source: 'track', vow: { name: 'Repay the Iron Covenant' } });
    expect(prompt).toContain(
      `${HEADING}\n\n"Repay the Iron Covenant" (dangerous, progress 1/10, sworn by Kira) — the open expedition "Into the Shroud" serves it.`,
    );
    expect(prompt).toContain(INSTRUCTION);
    // At the top of the per-beat context: before the oracle seeds and the tracks.
    const at = prompt.indexOf(HEADING);
    expect(at).toBeGreaterThan(prompt.indexOf('## NARRATOR ROLE AND VOICE'));
    expect(at).toBeLessThan(prompt.indexOf('## ORACLE SEEDS'));
    expect(at).toBeLessThan(prompt.indexOf('## OPEN PROGRESS TRACKS'));
    // [4j] says it too, as an expedition's (a fight's wording stays its own).
    expect(prompt).toContain('- Expedition: Into the Shroud — dangerous, 0/10 progress; serves the vow "Repay the Iron Covenant" — seeing it through is a step toward that vow');
  });

  it('a scene challenge made with a vow keeps it beside its danger clock, and is the scene\'s over an expedition', async () => {
    await panelAdd({ label: 'Into the Shroud', type: 'expedition', rank: 'dangerous', vowId: 'v-debt' });
    await panelAdd({ label: 'The standoff', type: 'scene_challenge', rank: 'formidable', vowId: 'v-beacon' });
    const challenge = listOpenProgressTracks().find(t => t.type === 'scene_challenge');
    expect(challenge).toMatchObject({ linkedVowId: 'v-beacon', linkedVowName: 'Find the lost beacon' });
    expect(challenge.tensionClockId).toBeTruthy();

    const { prompt } = await promptFor('paced_narrative');
    expect(prompt).toContain('"Find the lost beacon" (formidable, progress 3/10, sworn by Kira) — the open scene challenge "The standoff" serves it.');
  });

  it('an expedition the move pipeline began is linked on its row (🔗) and serves the vow from then on', async () => {
    const begun = await addProgressTrack({ label: 'Toward the gap', type: 'expedition', rank: 'dangerous' });
    expect((await promptFor('move_resolution')).extras.sceneVow).toBeNull();   // two quests, no focus, no link

    expect(await applyProgressTrackEditFromRelay({ op: 'linkVow', trackId: begun.id, vowId: 'v-beacon' }, {}))
      .toMatchObject({ applied: true });
    expect((await promptFor('move_resolution')).prompt)
      .toContain('"Find the lost beacon" (formidable, progress 3/10, sworn by Kira) — the open expedition "Toward the gap" serves it.');

    // Unlinked again: no line.
    await applyProgressTrackEditFromRelay({ op: 'linkVow', trackId: begun.id, vowId: '' }, {});
    expect((await promptFor('move_resolution')).prompt).not.toContain(HEADING);
  });

  it('the link follows the vow by its id: renamed on the sheet, the line names it as it is now', async () => {
    await panelAdd({ label: 'Into the Shroud', type: 'expedition', rank: 'dangerous', vowId: 'v-debt' });
    kira.items.contents.find(i => i.id === 'v-debt').name = 'Repay the Covenant in full';
    expect((await promptFor('move_resolution')).prompt).toContain('"Repay the Covenant in full" (dangerous');
  });

  it('a vow fulfilled since the form was drawn is refused — nothing is added — and a fight is not re-linked on its row', async () => {
    kira.items.contents.find(i => i.id === 'v-debt').system.completed = true;
    expect(await panelAdd({ label: 'Into the Shroud', type: 'expedition', rank: 'dangerous', vowId: 'v-debt' }))
      .toEqual({ applied: false, reason: 'no-vow' });
    expect(listOpenProgressTracks()).toEqual([]);

    const fight = await addProgressTrack({ label: 'Corsairs', type: 'combat', rank: 'dangerous', linkedVowName: 'Find the lost beacon' });
    expect(await applyProgressTrackEditFromRelay({ op: 'linkVow', trackId: fight.id, vowId: 'v-beacon' }, {}))
      .toMatchObject({ applied: false, reason: 'invalid' });
    expect(listOpenProgressTracks()[0]).toMatchObject({ linkedVowName: 'Find the lost beacon' });
    expect(listOpenProgressTracks()[0].linkedVowId ?? null).toBeNull();
  });
});

describe('the scene\'s vow without a linked track (issue #353 R3)', () => {
  it('the only quest in play is the scene\'s — a background vow beside it is not a rival', async () => {
    kira.items.contents.find(i => i.id === 'v-debt').system.completed = true;
    const { prompt } = await promptFor('move_resolution');
    expect(prompt).toContain(`${HEADING}\n\n"Find the lost beacon" (formidable, progress 3/10, sworn by Kira) — the only vow in play.`);
  });

  it('is in the beat modes only — never a vignette, the vow or inciting scene, a clock\'s beat or the recap', async () => {
    kira.items.contents.find(i => i.id === 'v-debt').system.completed = true;
    for (const mode of ['move_resolution', 'paced_narrative', 'scene_interrogation', 'oracle_followup']) {
      expect((await promptFor(mode)).prompt, mode).toContain(HEADING);
    }
    for (const mode of ['session_vignette', 'vow_swearing', 'inciting_incident', 'clock_advance', 'campaign_recap']) {
      expect((await promptFor(mode)).prompt, mode).not.toContain(HEADING);
    }
  });

  it('no line when no vow is open', async () => {
    for (const item of kira.items.contents) item.system.completed = true;
    const { extras, prompt } = await promptFor('move_resolution');
    expect(extras.sceneVow).toBeNull();
    expect(prompt).not.toContain(HEADING);
  });
});

describe('formatSceneVowBlock', () => {
  it('names the vow, its rank and progress, who swore it and why; the focus and a shared vow read as such', () => {
    expect(formatSceneVowBlock({ source: 'focus', vow: { name: 'Free Dani', rank: 'extreme', progress: 7, holders: ['Kira', 'Ren', 'Isaac'] } }))
      .toBe(`${HEADING}\n\n"Free Dani" (extreme, progress 7/10, sworn by Kira, Ren and Isaac) — the table chose it as this session's quest focus.\n\n`
        + `${INSTRUCTION} Never mention the vow's track, its progress or a milestone: marking it is the player's.`);
    expect(formatSceneVowBlock(null)).toBe('');
    expect(formatSceneVowBlock({ source: 'only', vow: { name: '  ' } })).toBe('');
  });
});
