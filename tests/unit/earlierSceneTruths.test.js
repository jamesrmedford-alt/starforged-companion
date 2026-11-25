/**
 * STARFORGED COMPANION
 * tests/unit/earlierSceneTruths.test.js
 *
 * TRUTH-OF-AN-EARLIER-SCENE-UNCORRECTABLE — the pieces, off a record of the
 * shape store.js keeps (the composition, through the real pipeline, is
 * truthOfAnEarlierSceneCorrected.test.js):
 *
 *   - earlierScenes.js earlierSceneTruths: the session's earlier scenes'
 *     truths that bind and stand, scene by scene, labelled by the scene — no
 *     colour, nothing struck or removed, none of the active scene's, none of
 *     another session's — each in its recorded words and in today's names;
 *   - findEarlierSceneTruth: by id, or a prefix no other truth shares;
 *   - read.js correctNames: a scene's cause, its first and last frames, its
 *     place and the ship's line in the names the table uses now;
 *   - the correction dialog: the earlier scenes' truths in its scope, each
 *     with a Strike that keeps it with the session's strikes.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { earlierSceneTruths, findEarlierSceneTruth } from '../../src/factContinuity/earlierScenes.js';
import { readRecord } from '../../src/record/read.js';
import { openCorrectionDialog } from '../../src/factContinuity/correctionDialog.js';
import { recordedEvent, recordSourceOf, seedSessionRecord } from '../helpers/sessionRecordSeed.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { parseHTML, setListenerResultSink } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const SESSION = 'sess-2';
const OLD = 'is named the Ashen Wake';

/** An event of the session, in a scene. */
const at = (scene, k, opts = {}) => ({ ...recordedEvent(SESSION, k, opts), scene });
const truthSet = (scene, truth, subject, fact, { by = 'player', basis = by, nar = null } = {}) =>
  at(scene, 'truth.set', { ref: { truth, ...(nar ? { nar } : {}) }, d: { subject, fact, by, basis } });

function playedSession() {
  return [
    at(null, 'session.begun', { d: { number: 2, table: {} } }),
    at('sc-1', 'scene.started', { d: { sceneId: 'sc-1', reason: 'scene_command', cause: 'gm', what: 'the GM began a new scene', place: { id: 'loc-bh', type: 'settlement', name: 'Bleakhold Station' }, ship: null } }),
    at('sc-1', 'frame', { d: { location: 'Bleakhold Station', present: [] } }),
    truthSet('sc-1', 'tr-aaaa1111', { kind: 'text', text: 'raider cutter' }, OLD),
    truthSet('sc-1', 'tr-aaaa2222', { kind: 'scene' }, 'the lights flicker', { by: 'narrator', basis: 'narrator' }),
    truthSet('sc-1', 'tr-bbbb3333', { kind: 'text', text: 'Tamsin' }, 'keeps the manifest', { by: 'gm' }),
    at('sc-1', 'scene.ended', { d: { sceneId: 'sc-1', turn: true } }),
    at('sc-2', 'scene.started', { d: { sceneId: 'sc-2', reason: 'turn', cause: 'time', what: 'time has passed: "I watch the Ashen Wake until the next morning."',
      place: { id: 'loc-wk', type: 'location', name: 'the Ashen Wake wreck' }, ship: 'the Kobayashi IV, near the Ashen Wake wreck' } }),
    at('sc-2', 'frame', { d: { location: 'beside the Ashen Wake wreck', present: ['Tamsin'] } }),
    truthSet('sc-2', 'tr-cccc4444', { kind: 'text', text: 'the hatch' }, 'is sealed'),
    truthSet('sc-2', 'tr-cccc4499', { kind: 'text', text: 'the hatch' }, 'is welded shut', { by: 'gm' }),
    truthSet('sc-2', 'tr-dddd5555', { kind: 'text', text: 'the hatch' }, 'is rusted'),
    at('sc-2', 'truth.struck', { ref: { truth: 'tr-dddd5555' }, d: { by: 'gm' } }),
    at('sc-2', 'narration', { ref: { nar: 'nar-x' }, d: { mode: 'paced' }, text: 'A told thing.' }),
    truthSet('sc-2', 'tr-eeee6666', { kind: 'text', text: 'the hatch' }, 'hides a body', { nar: 'nar-x' }),
    at('sc-2', 'narration.removed', { d: { narrationIds: ['nar-x'], by: 'xcard' } }),
    at('sc-2', 'frame', { d: { location: 'the Ashen Wake wreck, its cargo bay', present: ['Tamsin'] } }),
    at('sc-2', 'scene.ended', { d: { sceneId: 'sc-2', turn: true } }),
    at('sc-3', 'scene.started', { d: { sceneId: 'sc-3', reason: 'turn', cause: 'place', what: 'the characters are at Hollow Spire' } }),
    truthSet('sc-3', 'tr-ffff7777', { kind: 'scene' }, 'the dock is quiet'),
    at(null, 'name.changed', { d: { from: 'Ashen Wake', to: 'Cinder Wren', how: 'corrected', about: 'raider cutter' } }),
  ];
}

/** The session's source, with a page of the last session beside it. */
function sourceWithLastSession() {
  const source = recordSourceOf(SESSION, playedSession(), { number: 2 });
  const old = { ...recordedEvent('sess-1', 'truth.set', { ref: { truth: 'tr-gggg8888' }, d: { subject: { kind: 'text', text: 'the old hauler' }, fact: 'is named the Grey Gull', by: 'gm', basis: 'gm' } }), scene: 'sc-old' };
  source.pages.unshift({ pageId: 'page-sess-1', sessionId: 'sess-1', number: 1, name: 'Session 1', createdAt: 0, story: '',
    record: { v: 1, sessionId: 'sess-1', createdAt: 0, seq: old.seq, events: { [old.id]: old }, views: {} } });
  return source;
}

const CS = { currentSessionId: SESSION, currentSceneId: 'sc-3', sceneTruths: [{ id: 'tr-ffff7777', subject: { kind: 'scene' }, fact: 'the dock is quiet', retracted: false }] };

describe('the session\'s earlier scenes\' truths, from its record', () => {
  it('scene by scene, labelled by why each began and where — what binds and stands alone, in its recorded words and in today\'s names', () => {
    const groups = earlierSceneTruths(CS, { source: sourceWithLastSession() });
    expect(groups.map(g => [g.sceneId, g.n, g.label])).toEqual([
      ['sc-1', 1, 'Scene 1 — the GM began a new scene (Bleakhold Station)'],
      ['sc-2', 2, 'Scene 2 — time has passed: "I watch the Cinder Wren until the next morning." (beside the Cinder Wren wreck)'],
    ]);
    expect(groups[0].truths.map(t => t.id), 'the narration\'s colour left with its scene').toEqual(['tr-aaaa1111', 'tr-bbbb3333']);
    expect(groups[0].truths[0]).toMatchObject({
      fact: OLD, subject: { kind: 'text', text: 'raider cutter' },               // as recorded: what its scene's end filed
      shown: { fact: 'is named the Cinder Wren' },                                // as the table names it now
      asserter: 'player', basis: 'player', sceneId: 'sc-1', sessionId: SESSION,
      sceneWhere: 'Bleakhold Station', scenePlace: { id: 'loc-bh', type: 'settlement' },
    });
    expect(groups[0].truths[1]).toMatchObject({ asserter: 'gm', fact: 'keeps the manifest' });
    // Struck, removed by the X-Card, the active scene's, the last session's: none.
    expect(groups[1].truths.map(t => t.id)).toEqual(['tr-cccc4444', 'tr-cccc4499']);
    expect(JSON.stringify(groups)).not.toMatch(/tr-dddd|tr-eeee|tr-ffff|tr-gggg/);
  });

  it('control: with no session, or none of its scenes ended, there is nothing earlier', () => {
    expect(earlierSceneTruths({ currentSceneId: 'sc-3' }, { source: sourceWithLastSession() })).toEqual([]);
    const opening = recordSourceOf(SESSION, playedSession().slice(0, 3), { number: 2 });
    expect(earlierSceneTruths({ ...CS, currentSceneId: 'sc-1' }, { source: opening })).toEqual([]);
  });

  it('one is found by its id, or a prefix of 4+ characters no other truth of the session — or the active scene\'s ledger — shares', () => {
    const source = sourceWithLastSession();
    expect(findEarlierSceneTruth(CS, 'tr-cccc4444', { source })?.truth).toMatchObject({ id: 'tr-cccc4444' });
    expect(findEarlierSceneTruth(CS, 'tr-cccc444', { source })?.truth).toMatchObject({ id: 'tr-cccc4444' });
    expect(findEarlierSceneTruth(CS, 'tr-cccc', { source }), 'two of its truths share it').toEqual({ ambiguous: true });
    expect(findEarlierSceneTruth(CS, 'tr-a', { source })?.truth, 'the colour truth beside it is none of them').toMatchObject({ id: 'tr-aaaa1111' });
    expect(findEarlierSceneTruth({ ...CS, sceneTruths: [...CS.sceneTruths, { id: 'tr-aaaa9999', fact: 'x' }] }, 'tr-a', { source }), 'nor the active scene\'s ledger')
      .toEqual({ ambiguous: true });
    expect(findEarlierSceneTruth(CS, 'tr-', { source }), 'too short').toBeNull();
    expect(findEarlierSceneTruth(CS, 'tr-ffff7777', { source }), 'the active scene\'s: the ledger\'s to strike').toBeNull();
    expect(findEarlierSceneTruth(CS, 'tr-gggg8888', { source }), 'the last session\'s').toBeNull();
    expect(findEarlierSceneTruth(CS, 'tr-dddd5555', { source }), 'struck already').toBeNull();
  });
});

describe('read.js writes each scene in today\'s names — its cause too', () => {
  it('the cause, the first and last frames, the place and the ship\'s line', () => {
    const scene = readRecord({ session: SESSION }, recordSourceOf(SESSION, playedSession(), { number: 2 })).sessions[0].scenes[1];
    expect(scene.what).toBe('time has passed: "I watch the Cinder Wren until the next morning."');   // was: the Ashen Wake
    expect(scene.where.location).toBe('beside the Cinder Wren wreck');
    expect(scene.last.location).toBe('the Cinder Wren wreck, its cargo bay');
    expect(scene.place).toEqual({ id: 'loc-wk', type: 'location', name: 'the Cinder Wren wreck' });
    expect(scene.ship).toBe('the Kobayashi IV, near the Cinder Wren wreck');
  });

  it('control: with no name changed, each is as recorded', () => {
    const events = playedSession().filter(e => e.k !== 'name.changed');
    const scene = readRecord({ session: SESSION }, recordSourceOf(SESSION, events, { number: 2 })).sessions[0].scenes[1];
    expect(scene.what).toContain('Ashen Wake');
    expect(scene.last.location).toBe('the Ashen Wake wreck, its cargo bay');
  });
});

// ── the correction dialog ───────────────────────────────────────────────────

class DialogV2Double extends EventTarget {
  static last = null;
  constructor(options) { super(); this.options = options; this.element = null; DialogV2Double.last = this; }
  async render() {
    this.element = parseHTML(`<form class="dialog-form"><div class="window-content">${this.options.content}</div></form>`).firstElementChild;
    this.dispatchEvent(new Event('render'));
    return this;
  }
  static async prompt() { return ''; }
}

describe('the correction dialog lists the earlier scenes\' truths, and strikes one', () => {
  const KEY = `${MODULE_ID}.campaignState`;
  let pending;
  beforeEach(async () => {
    installJournalMock();
    await seedSessionRecord(SESSION, playedSession(), { number: 2 });
    pending = [];
    setListenerResultSink((p) => pending.push(p));
    global.foundry.applications.api.DialogV2 = DialogV2Double;
    game.settings._store.set(KEY, { ...CS, sceneState: { bySubject: {}, sceneId: 'sc-3' } });
  });
  afterEach(() => {
    setListenerResultSink(null);
    delete global.foundry.applications.api.DialogV2;
    game.settings._store.delete(KEY);
  });

  it('under "Earlier this session", by scene, each with a Strike — which keeps the strike with the session\'s', async () => {
    await openCorrectionDialog({ flags: { [MODULE_ID]: { matchedEntityIds: [] } } });
    const root = DialogV2Double.last.element;
    expect(root.textContent).toContain('Earlier this session');
    expect(root.textContent).toContain('Scene 1 — the GM began a new scene (Bleakhold Station)');
    expect(root.textContent).toContain('is named the Cinder Wren');                       // in today's names
    const strike = root.querySelector('[data-action="strike-earlier-truth"][data-truth-id="tr-cccc4444"]');
    expect(strike).toBeTruthy();
    strike.click();
    await Promise.all(pending);
    const kept = game.settings.get(MODULE_ID, 'campaignState').sessionRetractions;
    expect(kept).toMatchObject({ sessionId: SESSION });
    expect(kept.facts).toEqual([expect.objectContaining({ truthId: 'tr-cccc4444', label: 'the hatch', fact: 'is sealed', sceneId: 'sc-2', retractedBy: 'gm' })]);
  });

  it('control: a player sees a GM\'s earlier truth locked, with no Strike', async () => {
    const restore = asPlayer();
    try {
      await openCorrectionDialog({ flags: { [MODULE_ID]: { matchedEntityIds: [] } } });
    } finally { restore(); }
    const root = DialogV2Double.last.element;
    const row = (id) => [...root.querySelectorAll('.sf-correct-row--earlier')].find(r => r.textContent.includes(id.slice(0, 8)));
    expect(row('tr-bbbb3333')?.querySelector('.sf-correct-lock'), 'the GM\'s: locked').toBeTruthy();
    expect(root.querySelector('[data-action="strike-earlier-truth"][data-truth-id="tr-bbbb3333"]')).toBeNull();
    expect(root.querySelector('[data-action="strike-earlier-truth"][data-truth-id="tr-aaaa1111"]'), 'the player\'s own: a Strike').toBeTruthy();
  });
});
