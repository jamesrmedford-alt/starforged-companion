/**
 * STARFORGED COMPANION
 * tests/unit/worldSnapshot.test.js
 *
 * Issue #357 — the narrator's world snapshot: its renderer, the one table of
 * events that take a new one, and the store's decision at a narrator call.
 *
 * A prompt-cache read needs the cached text byte-identical to an earlier
 * request's. So the snapshot is rendered from units in a fixed order with no
 * clock in it, stored, and sent as stored; a new one is taken only when the
 * table (snapshotEvents.js SNAPSHOT_EVENTS) says so. These hold:
 *   - the renderer gives the same text for the same records in any order,
 *     and no record's text can split the block;
 *   - the manifest tells what changed since and what is gone;
 *   - every event a trigger site reports is a row, every row has a reporter,
 *     and a row set to "no" takes no snapshot;
 *   - the store takes a snapshot for a reported event, a record gone, the
 *     changes grown large and an expired cache — and for nothing else; only
 *     the canonical GM takes one, and a player's client has none.
 *
 * The request the narrator is sent is in worldSnapshotRequest.test.js.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { productionSources } from '../helpers/sourceScan.js';
import { renderWorldSnapshot, renderUnitSections, diffWorldUnits } from '../../src/narration/worldSnapshot.js';
import {
  SNAPSHOT_EVENTS, reportSnapshotEvent, pendingSnapshotEvents, clearSnapshotEvents, snapshotCauses,
  _resetSnapshotEventsForTests,
} from '../../src/narration/snapshotEvents.js';
import {
  resolveWorldSnapshot, noteWorldSnapshotSent, CHANGES_MAX_TOKENS, CHANGES_MAX_SHARE, _resetWorldSnapshotStoreForTests,
} from '../../src/narration/worldSnapshotStore.js';
import { SNAPSHOT_BLOCK_HEADING, splitNarratorSystemPrompt, buildNarratorSystemPrompt } from '../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';

const UNITS = [
  { key: 'sector:sec-2', section: 'sectors', text: '#### The Rift (id sec-2)\nRegion: Expanse' },
  { key: 'sector:sec-1', section: 'sectors', text: '#### Devil\'s Maw (id sec-1)\nRegion: Outlands' },
  { key: 'entity:b', section: 'entities', text: '#### BLEAKHOLD — Settlement (id b)\n\nESTABLISHED FACTS (prefer consistency):\n  Authority: Lawless' },
  { key: 'entity:a', section: 'entities', text: '#### VULDAR ARCHER — Connection (id a)\n\nESTABLISHED FACTS (prefer consistency):\n  Role: Broker' },
  { key: 'threat:p9', section: 'threats', text: '- Drift Raiders (active; id p9): Raiding the corridor.' },
  { key: 'lore:p2', section: 'lore', text: '- The beacons: They answer only Covenant hails.' },
  { key: 'lore:p1', section: 'lore', text: '- The blockade: It closes at each shift change.' },
  { key: 'memory:session:s-2', section: 'memory', order: '000002', text: '- Session 2: The crew paid Vex.' },
  { key: 'memory:session:s-1', section: 'memory', order: '000001', text: '- Session 1: The beacon was found.' },
  { key: 'plan:sk-1', section: 'plans', text: '#### Threat — the escort (id sk-1)\nTruth: It is a Keeper drone.' },
];

const shuffled = (list, seed) => {
  const out = [...list];
  let s = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

beforeEach(() => {
  vi.restoreAllMocks();
  game.settings._store.clear();
  global.game.user = { id: 'gm-1', isGM: true };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  _resetSnapshotEventsForTests();
  _resetWorldSnapshotStoreForTests();
});

describe('issue #357 — the snapshot renderer', () => {
  it('gives the same text and manifest for the same records in any input order', () => {
    const first = renderWorldSnapshot(UNITS, { activeSector: 'Devil\'s Maw' });
    for (const seed of [1, 7, 42, 1999]) {
      const again = renderWorldSnapshot(shuffled(UNITS, seed), { activeSector: 'Devil\'s Maw' });
      expect(again.text).toBe(first.text);
      expect(again.manifest).toEqual(first.manifest);
    }
  });

  it('opens on its heading, lists sections in a fixed order and units by their stable key', () => {
    const { text, manifest, tokens } = renderWorldSnapshot(UNITS);
    expect(text.startsWith(`${SNAPSHOT_BLOCK_HEADING}\n\n`)).toBe(true);
    const order = ['### SECTORS', '### RECORDED PEOPLE, PLACES AND SHIPS', '### THREATS', '### ESTABLISHED LORE', '### EARLIER SESSIONS', '### HIDDEN PLANS — FOR THE NARRATOR ONLY'];
    const at = order.map(h => text.indexOf(h));
    expect(at.every(i => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // Within a section, by key: sec-1 before sec-2, entity a before b, lore p1 before p2.
    expect(text.indexOf('Devil\'s Maw (id sec-1)')).toBeLessThan(text.indexOf('The Rift (id sec-2)'));
    expect(text.indexOf('VULDAR ARCHER')).toBeLessThan(text.indexOf('BLEAKHOLD'));
    expect(text.indexOf('The blockade')).toBeLessThan(text.indexOf('The beacons'));
    // Earlier sessions run oldest first.
    expect(text.indexOf('Session 1:')).toBeLessThan(text.indexOf('Session 2:'));
    // Hidden plans keep a section of their own, last.
    expect(text.indexOf('### HIDDEN PLANS')).toBeGreaterThan(text.indexOf('Session 2:'));
    expect(manifest.map(([key]) => key)).toEqual([...UNITS.map(u => u.key)].sort());
    expect(tokens).toBe(Math.ceil(text.length / 4));
  });

  it('renders no clock: the same units a day apart are the same text', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-14T10:00:00Z'));
      const first = renderWorldSnapshot(UNITS).text;
      vi.setSystemTime(new Date('2026-11-15T22:30:00Z'));
      expect(renderWorldSnapshot(UNITS).text).toBe(first);
      expect(first).not.toMatch(/\b20\d\d-\d\d-\d\d\b|\d\d:\d\d/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is one section of the prompt whatever a record says: it splits into the snapshot block alone', () => {
    const { text } = renderWorldSnapshot(UNITS);
    expect(text.split('\n').filter(l => /^## /.test(l))).toEqual([SNAPSHOT_BLOCK_HEADING]);
    expect(text.split('\n').some(l => /^-{3,}\s*$/.test(l))).toBe(false);
    const prompt = buildNarratorSystemPrompt({}, {}, null, '', { mode: 'paced_narrative', worldSnapshot: { text, changesText: '' } });
    const blocks = splitNarratorSystemPrompt(prompt);
    expect(blocks.map(b => [b.cached, b.snapshot === true])).toEqual([[true, false], [true, true], [true, false], [false, false]]);
    expect(blocks[1].text).toBe(text);
    expect(blocks.map(b => b.text).join('\n\n---\n\n')).toBe(prompt);
  });

  it('with nothing recorded it still says so, under its heading', () => {
    const { text, manifest } = renderWorldSnapshot([]);
    expect(text.startsWith(`${SNAPSHOT_BLOCK_HEADING}\n\n`)).toBe(true);
    expect(text).toContain('Nothing is recorded yet.');
    expect(manifest).toEqual([]);
  });
});

describe('issue #357 — what changed since a snapshot', () => {
  const { manifest } = renderWorldSnapshot(UNITS);

  it('nothing, for the same units in any order', () => {
    expect(diffWorldUnits(manifest, shuffled(UNITS, 3))).toEqual({ changed: [], removed: [] });
  });

  it('a new record and a changed one, each in full; a record gone, by its key', () => {
    const now = [
      ...UNITS.filter(u => u.key !== 'lore:p2').map(u => (u.key === 'threat:p9'
        ? { ...u, text: '- Drift Raiders (immediate; id p9): They have taken the corridor.' } : u)),
      { key: 'entity:c', section: 'entities', text: '#### THE ESCORT — Ship (id c)' },
    ];
    const diff = diffWorldUnits(manifest, now);
    expect(diff.changed.map(u => u.key)).toEqual(['entity:c', 'threat:p9']);
    expect(diff.removed).toEqual(['lore:p2']);
    // The changes read as the snapshot's own sections do, without the standing lines.
    expect(renderUnitSections(diff.changed)).toBe(
      '### RECORDED PEOPLE, PLACES AND SHIPS\n\n#### THE ESCORT — Ship (id c)\n\n' +
      '### THREATS\n\n- Drift Raiders (immediate; id p9): They have taken the corridor.',
    );
  });
});

describe('issue #357 — the one table of events', () => {
  const sources = productionSources();
  const reports = sources.flatMap(s => [...s.code.matchAll(/reportSnapshotEvent\(\s*(['"])([\w-]+)\1/g)].map(m => ({ file: s.file, id: m[2] })));
  const rows = new Map(SNAPSHOT_EVENTS.map(r => [r.id, r]));

  it('each row has an id of its own, a description and a yes or a no', () => {
    expect(rows.size).toBe(SNAPSHOT_EVENTS.length);
    for (const row of SNAPSHOT_EVENTS) {
      expect(row.id).toMatch(/^[a-z][a-z_]+$/);
      expect(typeof row.description === 'string' && row.description.length > 10, row.id).toBe(true);
      expect(typeof row.snapshot, row.id).toBe('boolean');
    }
  });

  it('every event id a trigger site reports is a row of the table', () => {
    expect(reports.length).toBeGreaterThan(15);
    for (const { file, id } of reports) expect(rows.has(id), `${file} reports "${id}"`).toBe(true);
  });

  it('every row has a reporter: a trigger site, or the store\'s own check at a narrator call', () => {
    const reported = new Set(reports.map(r => r.id));
    // What the store finds at a call goes through the table too (snapshotCauses).
    const store = sources.find(s => s.file === 'src/narration/worldSnapshotStore.js').code;
    for (const m of store.matchAll(/found\.push\('([\w-]+)'\)/g)) reported.add(m[1]);
    // A dynamic report: an oracle follow-up's event by its kind, a reveal's by what it showed.
    const dynamic = sources.map(s => s.code).join('\n');
    for (const row of SNAPSHOT_EVENTS) {
      if (!reported.has(row.id)) expect(dynamic, `no site reports "${row.id}"`).toMatch(new RegExp(`['"]${row.id}['"]`));
    }
    const unreported = SNAPSHOT_EVENTS.map(r => r.id).filter(id => !reported.has(id));
    // The only rows reported through a lookup or a choice, not a literal first argument.
    expect(unreported.sort()).toEqual(['oracle_table_rolled', 'oracle_yes_no', 'plan_progressed', 'price_paid']);
  });

  it('no trigger site decides for itself: only the table module reads a row\'s yes or no', () => {
    const deciders = sources.filter(s => /SNAPSHOT_EVENTS\b/.test(s.code)).map(s => s.file);
    expect(deciders).toEqual(['src/narration/snapshotEvents.js']);
  });

  it('what was decided does not count is a row set to no', () => {
    for (const id of ['oracle_seed_envisioned', 'oracle_yes_no', 'price_paid', 'sector_switched']) {
      expect(rows.get(id)?.snapshot, id).toBe(false);
    }
    for (const id of ['session_begin', 'scene_started', 'scene_ended', 'plan_made', 'plan_decided', 'plan_revealed', 'plan_resolved',
      'discovery_rolled', 'new_enemy_revealed', 'sector_created', 'sector_details_written', 'entity_recorded', 'threat_recorded',
      'xcard_played', 'fact_retracted', 'plan_edited', 'plan_retired', 'record_removed', 'changes_large', 'cache_expired']) {
      expect(rows.get(id)?.snapshot, id).toBe(true);
    }
  });

  it('a row set to no marks nothing; a row set to yes marks once, however often it is reported', async () => {
    expect(reportSnapshotEvent('oracle_yes_no')).toBe(false);
    expect(reportSnapshotEvent('sector_switched')).toBe(false);
    expect(pendingSnapshotEvents()).toEqual([]);

    expect(reportSnapshotEvent('plan_made')).toBe(true);
    expect(reportSnapshotEvent('plan_made')).toBe(true);
    expect(reportSnapshotEvent('entity_recorded')).toBe(true);
    await Promise.resolve();
    expect(pendingSnapshotEvents().map(e => e.id).sort()).toEqual(['entity_recorded', 'plan_made']);
    // The marks are in the world's setting, for whichever GM narrates next.
    expect(game.settings.get(MODULE_ID, 'worldSnapshotEvents').events.map(e => e.id).sort()).toEqual(['entity_recorded', 'plan_made']);
  });

  it('an id that is no row is refused, with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(reportSnapshotEvent('made_up_event')).toBe(false);
    expect(snapshotCauses(['made_up_event', 'plan_made', 'oracle_yes_no', 'plan_made'])).toEqual(['plan_made']);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(pendingSnapshotEvents()).toEqual([]);
  });

  it('a player\'s client marks nothing, and nothing is marked with the snapshot switched off', () => {
    global.game.user = { id: 'pl-1', isGM: false };
    expect(reportSnapshotEvent('plan_made')).toBe(false);
    global.game.user = { id: 'gm-1', isGM: true };
    game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
    expect(reportSnapshotEvent('plan_made')).toBe(false);
    expect(pendingSnapshotEvents()).toEqual([]);
  });

  it('a snapshot answers the marks it read; the same event reported after that is a new mark', async () => {
    reportSnapshotEvent('plan_made');
    reportSnapshotEvent('scene_started');
    await Promise.resolve();
    const read = pendingSnapshotEvents();
    const cleared = clearSnapshotEvents(read);
    // Reported while the clearing write is still out: not the mark just answered.
    expect(reportSnapshotEvent('plan_made', { now: Date.now() + 5 })).toBe(true);
    await cleared;
    await Promise.resolve();
    expect(pendingSnapshotEvents().map(e => e.id)).toEqual(['plan_made']);
    expect(pendingSnapshotEvents()[0].at).toBeGreaterThan(read.find(e => e.id === 'plan_made').at);
  });
});

describe('issue #357 — the store: when a narrator call takes a new snapshot', () => {
  const sector = (id, name, extra = {}) => ({ id, name, region: 'outlands', regionLabel: 'Outlands', mapData: { settlements: [], passages: [], discoveries: [] }, ...extra });
  const state = (over = {}) => ({ currentSessionId: 'sess-1', sessionNumber: 3, sectors: [sector('sec-1', 'Devil\'s Maw')], activeSectorId: 'sec-1', ...over });
  const T0 = Date.parse('2026-11-14T18:00:00Z');
  const HOUR = 60 * 60 * 1000;
  const resolve = (cs, opts = {}) => resolveWorldSnapshot(cs, { now: T0, ...opts });

  it('the first call of a session takes one; the next sends the same text and takes none', async () => {
    const first = await resolve(state());
    expect(first).toMatchObject({ fresh: true, causes: ['no_snapshot'], changesText: '' });
    expect(first.text).toContain('#### Devil\'s Maw (id sec-1)');
    expect(first.text).toContain('The active sector when this snapshot was taken: Devil\'s Maw.');
    const second = await resolve(state(), { now: T0 + 60_000 });
    expect(second).toMatchObject({ fresh: false, causes: [], changesText: '' });
    expect(second.text).toBe(first.text);
  });

  it('a change rides beside the snapshot, which is sent as it was', async () => {
    const first = await resolve(state({ loreRecap: 'The Forge is cut off.' }));
    const second = await resolve(state({ loreRecap: 'The Forge is cut off, and its gates are dead.' }), { now: T0 + 60_000 });
    expect(second.fresh).toBe(false);
    expect(second.text).toBe(first.text);
    expect(second.changesText).toBe('### ESTABLISHED LORE\n\n- The world, as the table recapped it: The Forge is cut off, and its gates are dead.');
  });

  it('a reported event takes one — once: the call after it takes none', async () => {
    await resolve(state());
    reportSnapshotEvent('scene_started');
    reportSnapshotEvent('plan_made');
    const next = await resolve(state(), { now: T0 + 60_000 });
    expect(next.fresh).toBe(true);
    expect(next.causes).toEqual(['scene_started', 'plan_made']);
    expect(pendingSnapshotEvents()).toEqual([]);
    expect((await resolve(state(), { now: T0 + 120_000 })).fresh).toBe(false);
  });

  it('a record the snapshot holds that is gone takes one: the snapshot never keeps asserting it', async () => {
    const cs = state({ sectors: [sector('sec-1', 'Devil\'s Maw'), sector('sec-2', 'The Rift')] });
    expect((await resolve(cs)).text).toContain('The Rift');
    const next = await resolve(state(), { now: T0 + 60_000 });
    expect(next).toMatchObject({ fresh: true, causes: ['record_removed'] });
    expect(next.text).not.toContain('The Rift');
  });

  it('changes grown past a quarter of the snapshot, or past the token cap, take one', async () => {
    const first = await resolve(state({ loreRecap: 'x'.repeat(4000) }));
    // Under both: sent beside the snapshot.
    const small = await resolve(state({ loreRecap: 'x'.repeat(4000), sectors: [sector('sec-1', 'Devil\'s Maw', { trouble: 'Blockade' })] }), { now: T0 + 1000 });
    expect(small.fresh).toBe(false);
    expect(small.changesText.length / 4).toBeLessThan(first.text.length / 4 * CHANGES_MAX_SHARE);
    // Over a quarter of the snapshot.
    const large = await resolve(state({ loreRecap: 'y'.repeat(4000) }), { now: T0 + 2000 });
    expect(large).toMatchObject({ fresh: true, causes: ['changes_large'] });
    // Over the cap, in a snapshot large enough that it is under a quarter.
    _resetWorldSnapshotStoreForTests();
    const many = (n, word) => Array.from({ length: n }, (_, i) => sector(`sec-${i}`, `${word} ${i}`, { stubs: { sector: 'z'.repeat(1000) } }));
    await resolve(state({ sectors: many(60, 'Reach'), activeSectorId: 'sec-0' }));
    const edited = many(60, 'Reach').map((s, i) => (i < 9 ? { ...s, trouble: 'Blockade' } : s));
    const capped = await resolve(state({ sectors: edited, activeSectorId: 'sec-0' }), { now: T0 + 3000 });
    expect(capped.causes).toEqual(['changes_large']);
    expect(CHANGES_MAX_TOKENS).toBe(2000);
  });

  it('no narrator call for an hour: the cache has expired anyway, so that call takes a fresh one', async () => {
    await resolve(state());
    expect((await resolve(state(), { now: T0 + HOUR - 1000 })).fresh).toBe(false);
    const late = await resolve(state(), { now: T0 + HOUR });
    expect(late).toMatchObject({ fresh: true, causes: ['cache_expired'] });
  });

  it('every read restarts the hour: a request sent, or a narrator card posted, inside it keeps the snapshot', async () => {
    await resolve(state());
    noteWorldSnapshotSent(T0 + 50 * 60_000);
    expect((await resolve(state(), { now: T0 + 100 * 60_000 })).fresh).toBe(false);
    _resetWorldSnapshotStoreForTests();
    await resolve(state());
    // After a reload this client remembers no request: the session's newest narrator card stands in.
    expect((await resolve(state(), { now: T0 + 100 * 60_000, lastNarrationAt: T0 + 50 * 60_000 })).fresh).toBe(false);
    expect((await resolve(state(), { now: T0 + 4 * HOUR, lastNarrationAt: T0 + 50 * 60_000 })).causes).toEqual(['cache_expired']);
  });

  it('a new session has no snapshot of its own yet', async () => {
    await resolve(state());
    const next = await resolve(state({ currentSessionId: 'sess-2', sessionNumber: 4 }), { now: T0 + 60_000 });
    expect(next).toMatchObject({ fresh: true, causes: ['no_snapshot'] });
  });

  it('only the canonical GM takes one: another GM sends the one held, or none when a new one is due', async () => {
    await resolve(state());
    // A second GM, not canonical.
    global.game.user = { id: 'gm-2', isGM: true };
    global.game.users = [{ id: 'gm-1', isGM: true, active: true }, { id: 'gm-2', isGM: true, active: true }];
    expect((await resolve(state(), { now: T0 + 60_000 }))?.fresh).toBe(false);
    reportSnapshotEvent('xcard_played');
    expect(await resolve(state(), { now: T0 + 120_000 })).toBeNull();
  });

  it('a player\'s client, a world with the switch off and a state with no session have none', async () => {
    global.game.user = { id: 'pl-1', isGM: false };
    expect(await resolve(state())).toBeNull();
    global.game.user = { id: 'gm-1', isGM: true };
    expect(await resolve(state({ currentSessionId: null }))).toBeNull();
    game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
    expect(await resolve(state())).toBeNull();
  });
});
