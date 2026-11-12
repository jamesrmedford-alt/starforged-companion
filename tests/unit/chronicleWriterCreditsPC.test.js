/**
 * STARFORGED COMPANION
 * tests/unit/chronicleWriterCreditsPC.test.js
 *
 * CHRONICLE-FIRST-PC. The automatic Chronicle writer (chronicleWriter.js)
 * wrote every entry to the first PC (`resolveActorId`: characterIds[0], else
 * the first player Actor) — Ren's Face Danger, Ash's paced line and every
 * Batch Mode round went into Kira's chronicle. Issue #301 B03 resolves each
 * Chronicle by actor id and issue #321 U23 opens the viewer's own, but the
 * writer still picked the first PC; since issue #345 AA07 a pinned entry
 * reaches its PC's CHARACTER block, so the misfiled beats reached the wrong
 * character's narration too.
 *
 * Now the narration names its PC (credit the roller — CLAUDE.md): a move's
 * roller and a paced line's speaker (`actorId`), and for a round the acting
 * character the scribe names among the round's characters (`characters`).
 * The first PC is only the fallback for a narration that names none.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/character/chronicle.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requestChronicleEdit: vi.fn(async () => ({ ok: true, relayed: false, result: { applied: true } })),
}));

import { apiPost } from '../../src/api-proxy.js';
import { requestChronicleEdit } from '../../src/character/chronicle.js';
import { writeChronicleEntry } from '../../src/character/chronicleWriter.js';

const MODULE_ID = 'starforged-companion';
const STATE = { currentSessionId: 'session-1', sessionNumber: 1, characterIds: [] };

const reply = (parsed) => ({ content: [{ type: 'text', text: JSON.stringify(parsed) }] });
const writtenTo = () => requestChronicleEdit.mock.calls.map(c => c[0]);

beforeEach(() => {
  apiPost.mockReset();
  requestChronicleEdit.mockClear();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, true);
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.user.isGM = true;
  game.actors._reset();
  for (const [id, name] of [['pc-kira', 'Kira'], ['pc-ren', 'Ren'], ['pc-ash', 'Ash']]) {
    game.actors._set(id, makeTestActor({ id, name }));
  }
});

afterEach(() => {
  game.actors._reset();
});

describe('CHRONICLE-FIRST-PC — the automatic entry goes to the narration\'s own PC', () => {
  it("Ren's move narration is written to Ren's chronicle, not the first PC's", async () => {
    apiPost.mockResolvedValue(reply({ type: 'scar', salience: 'significant', text: 'Ren took a blade across the ribs.' }));
    await writeChronicleEntry({ narrationText: 'The blade bites.', campaignState: STATE, moveId: 'face_danger', outcome: 'miss', kind: 'move', actorId: 'pc-ren' });
    expect(writtenTo()).toEqual(['pc-ren']);
  });

  it("Ash's paced line is written to Ash's chronicle", async () => {
    apiPost.mockResolvedValue(reply({ type: 'moment', salience: 'significant', text: 'Ash kept the promise.' }));
    await writeChronicleEntry({ narrationText: 'Ash nods.', campaignState: STATE, kind: 'paced', actorId: 'pc-ash' });
    expect(writtenTo()).toEqual(['pc-ash']);
  });

  it('a round\'s beat goes to the acting character the scribe names', async () => {
    apiPost.mockResolvedValue(reply({ type: 'relationship', salience: 'significant', text: 'Ren and the smuggler struck a deal.', character: 'Ren' }));
    await writeChronicleEntry({
      narrationText: 'Kira covers the door while Ren talks the smuggler down.', campaignState: STATE, kind: 'round',
      characters: [{ actorId: 'pc-kira', name: 'Kira' }, { actorId: 'pc-ren', name: 'Ren' }],
    });
    expect(writtenTo()).toEqual(['pc-ren']);
    // The scribe is told whose beat it may be.
    const prompt = apiPost.mock.calls[0][2].messages[0].content;
    expect(prompt).toContain('Characters: Kira, Ren');
  });

  it('a round whose scribe names no listed character goes to the round\'s first acting character', async () => {
    apiPost.mockResolvedValue(reply({ type: 'moment', salience: 'significant', text: 'The crew held.' }));
    await writeChronicleEntry({
      narrationText: 'They hold the line.', campaignState: STATE, kind: 'round',
      characters: [{ actorId: 'pc-ash', name: 'Ash' }, { actorId: 'pc-ren', name: 'Ren' }],
    });
    expect(writtenTo()).toEqual(['pc-ash']);
  });

  it('control: a narration that names no PC still falls back to the first PC', async () => {
    apiPost.mockResolvedValue(reply({ type: 'moment', salience: 'significant', text: 'Night falls on the station.' }));
    await writeChronicleEntry({ narrationText: 'Night falls.', campaignState: STATE, kind: 'paced', actorId: null });
    expect(writtenTo()).toEqual(['pc-kira']);
  });

  it('an actor id that is not a player character (an NPC card) is not credited', async () => {
    game.actors._set('npc-vex', makeTestActor({ id: 'npc-vex', name: 'Vex', flags: { [MODULE_ID]: { entityType: 'connection' } } }));
    apiPost.mockResolvedValue(reply({ type: 'moment', salience: 'significant', text: 'Vex smiled.' }));
    await writeChronicleEntry({ narrationText: 'Vex smiles.', campaignState: STATE, kind: 'paced', actorId: 'npc-vex' });
    expect(writtenTo()).toEqual(['pc-kira']);
  });
});

describe('CHRONICLE-FIRST-PC — the narrator passes its PC to the writer', () => {
  it('every scheduleChronicleEntry call in the narrator names its PC or the round\'s characters', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../src/narration/narrator.js', import.meta.url), 'utf8');
    const calls = [...src.matchAll(/scheduleChronicleEntry\(\{([\s\S]*?)\}\);/g)].map(m => m[1]);
    expect(calls.length).toBeGreaterThanOrEqual(5);
    for (const body of calls) expect(body).toMatch(/actorId:|characters:/);
  });
});
