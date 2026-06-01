// tests/unit/shipEnvision.test.js
// Coverage for src/entities/shipEnvision.js — Envision / History on-demand
// surfaces for ships. Boundaries are mocked: apiPost (narrator call) and
// rollOracle (oracle bundles). The Actor + ship state come from makeTestActor.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async () => ({
    content: [{ type: 'text', text: 'Stub narrator prose.' }],
  })),
}));

vi.mock('../../src/oracles/roller.js', async (importOriginal) => {
  const orig = await importOriginal();
  return {
    ...orig,
    rollOracle: vi.fn((id) => ({ tableId: id, result: `result_${id}` })),
  };
});

import { apiPost } from '../../src/api-proxy.js';
import { rollOracle } from '../../src/oracles/roller.js';
import {
  buildEnvisionPrompt,
  buildHistoryPrompt,
  normaliseFacet,
  rollEnvisionBundle,
  rollHistoryBundle,
  envisionShip,
  composeShipHistory,
  renderEnvisionHtml,
  renderHistoryHtml,
  appendNotesSection,
  isShipEnvisionCommand,
  isShipHistoryCommand,
  parseShipEnvisionCommand,
  parseShipHistoryCommand,
  handleShipEnvisionCommand,
  handleShipHistoryCommand,
} from '../../src/entities/shipEnvision.js';
import { _resetFolderCache } from '../../src/entities/folder.js';

const MODULE_ID = 'starforged-companion';

function makeShipActor({ name = 'Ironfold', shipFlag = {}, notes = '' } = {}) {
  const actor = global.makeTestActor({
    type: 'starship',
    name,
    system: { notes },
    flags: {
      [MODULE_ID]: {
        ship: {
          _id: 'ship-1',
          name,
          type: 'Stalker-class hunter',
          firstLook: 'Bristling with armament',
          mission: 'Bring justice to a fugitive',
          ...shipFlag,
        },
        entityType: 'ship',
        entityId: shipFlag._id ?? 'ship-1',
      },
    },
  });
  global.game.actors._set(actor.id, actor);
  return actor;
}

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset();
  _resetFolderCache();
  global.game.settings._store.clear();
  global.game.settings.set(MODULE_ID, 'claudeApiKey', 'sk-ant-test');
  global.game.settings.set(MODULE_ID, 'narrationModel', 'claude-sonnet-4-5-20250929');
  global.game.settings.set(MODULE_ID, 'narrationTone', 'wry');
  apiPost.mockClear();
  rollOracle.mockClear();
  ChatMessage._reset?.();
  global.game.user.isGM = true;
});


// ─────────────────────────────────────────────────────────────────────────────
// Pure logic
// ─────────────────────────────────────────────────────────────────────────────

describe('normaliseFacet', () => {
  it('accepts each documented facet', () => {
    for (const f of ['captain', 'crew', 'agenda', 'contact', 'all']) {
      expect(normaliseFacet(f)).toBe(f);
    }
  });

  it('is case-insensitive', () => {
    expect(normaliseFacet('Captain')).toBe('captain');
    expect(normaliseFacet('CONTACT')).toBe('contact');
  });

  it('falls back to "all" for unknown values', () => {
    expect(normaliseFacet('hull')).toBe('all');
    expect(normaliseFacet('')).toBe('all');
    expect(normaliseFacet(undefined)).toBe('all');
    expect(normaliseFacet(null)).toBe('all');
  });
});

describe('rollEnvisionBundle', () => {
  it('rolls captain facet tables (role, goal, first look, given name)', () => {
    const rolls = rollEnvisionBundle('captain', (id) => ({ result: `R_${id}` }));
    expect(rolls).toHaveLength(4);
    expect(rolls.map(r => r.tableId)).toEqual([
      'character_role', 'character_goal', 'character_first_look', 'given_name',
    ]);
    expect(rolls.every(r => r.result.startsWith('R_'))).toBe(true);
    expect(rolls.every(r => r.facet === 'captain')).toBe(true);
  });

  it('rolls crew as a single Action + Theme pair', () => {
    const rolls = rollEnvisionBundle('crew', (id) => ({ result: `R_${id}` }));
    expect(rolls.map(r => r.tableId)).toEqual(['action', 'theme']);
  });

  it('rolls agenda as a single Action + Theme pair', () => {
    const rolls = rollEnvisionBundle('agenda', (id) => ({ result: `R_${id}` }));
    expect(rolls.map(r => r.tableId)).toEqual(['action', 'theme']);
    expect(rolls.every(r => r.facet === 'agenda')).toBe(true);
  });

  it('rolls contact via starship_contact', () => {
    const rolls = rollEnvisionBundle('contact', (id) => ({ result: `R_${id}` }));
    expect(rolls.map(r => r.tableId)).toEqual(['starship_contact']);
  });

  it('"all" rolls every facet (captain 4 + crew 2 + agenda 2 + contact 1 = 9)', () => {
    const rolls = rollEnvisionBundle('all', (id) => ({ result: `R_${id}` }));
    expect(rolls).toHaveLength(9);
    const facets = new Set(rolls.map(r => r.facet));
    expect(facets).toEqual(new Set(['captain', 'crew', 'agenda', 'contact']));
  });

  it('drops empty / "—" results to "" so the prompt skips them', () => {
    const rolls = rollEnvisionBundle('crew', () => ({ result: '—' }));
    expect(rolls.every(r => r.result === '')).toBe(true);
  });

  it('swallows thrown roll errors as ""', () => {
    const rolls = rollEnvisionBundle('crew', () => { throw new Error('roll failed'); });
    expect(rolls.every(r => r.result === '')).toBe(true);
  });
});

describe('rollHistoryBundle', () => {
  it('rolls Action + Theme N times plus one Story Clue', () => {
    const calls = [];
    const hist = rollHistoryBundle(3, (id) => {
      calls.push(id);
      return { result: `R_${id}_${calls.length}` };
    });
    expect(hist.beats).toHaveLength(3);
    expect(calls).toEqual(['action', 'theme', 'action', 'theme', 'action', 'theme', 'story_clue']);
    expect(hist.clue).toMatch(/^R_story_clue/);
  });

  it('clamps beats to 1..6', () => {
    expect(rollHistoryBundle(0,   () => ({ result: 'x' })).beats).toHaveLength(1);
    expect(rollHistoryBundle(-3,  () => ({ result: 'x' })).beats).toHaveLength(1);
    expect(rollHistoryBundle(99,  () => ({ result: 'x' })).beats).toHaveLength(6);
  });

  it('defaults to 3 beats when given non-numeric input', () => {
    expect(rollHistoryBundle(NaN,   () => ({ result: 'x' })).beats).toHaveLength(3);
    expect(rollHistoryBundle('huh', () => ({ result: 'x' })).beats).toHaveLength(3);
  });

  it('blanks empty / dash results', () => {
    const hist = rollHistoryBundle(2, () => ({ result: '—' }));
    expect(hist.beats.every(b => b.action === '' && b.theme === '')).toBe(true);
    expect(hist.clue).toBe('');
  });
});

describe('buildEnvisionPrompt', () => {
  it('grounds the user message in identity + rolls', () => {
    const { system, user } = buildEnvisionPrompt({
      facet: 'captain',
      tone: 'wry',
      identity: { name: 'Ironfold', type: 'Stalker', firstLook: 'Bristling' },
      rolls: [{ label: 'Captain — Role', result: 'Trader' }],
    });
    expect(system).toMatch(/Ironsworn: Starforged/);
    expect(system).toMatch(/Tone: wry/);
    expect(system).toMatch(/envision more detail about captain/);
    expect(user).toMatch(/Ship name: Ironfold/);
    expect(user).toMatch(/Type: Stalker/);
    expect(user).toMatch(/Captain — Role: Trader/);
  });

  it('uses "the ship" wording when facet is "all"', () => {
    const { system } = buildEnvisionPrompt({ facet: 'all', identity: {}, rolls: [] });
    expect(system).toMatch(/envision more detail about the ship/);
  });

  it('handles the no-rolls case without blowing up', () => {
    const { user } = buildEnvisionPrompt({ facet: 'crew', identity: {}, rolls: [] });
    expect(user).toMatch(/No oracle seeds rolled/);
  });

  it('drops empty roll results so the prompt stays clean', () => {
    const { user } = buildEnvisionPrompt({
      facet: 'crew', identity: {},
      rolls: [{ label: 'Crew — Action', result: '' }, { label: 'Crew — Theme', result: 'Devote' }],
    });
    expect(user).not.toMatch(/Crew — Action/);
    expect(user).toMatch(/Crew — Theme: Devote/);
  });
});

describe('buildHistoryPrompt', () => {
  it('renders beats as numbered seeds in the user message', () => {
    const { system, user } = buildHistoryPrompt({
      tone: 'wry',
      identity: { name: 'Ironfold', type: 'Hunter' },
      history: {
        beats: [{ action: 'Reclaim', theme: 'a Burden' }, { action: 'Lose', theme: 'a Refuge' }],
        clue: 'A scarred plate beside the airlock',
      },
    });
    expect(system).toMatch(/short backstory for their starship/);
    expect(user).toMatch(/Ship name: Ironfold/);
    expect(user).toMatch(/Beat 1: Reclaim a Burden/);
    expect(user).toMatch(/Beat 2: Lose a Refuge/);
    expect(user).toMatch(/Story Clue.*A scarred plate/);
  });

  it('omits empty beat lines and missing clue', () => {
    const { user } = buildHistoryPrompt({
      identity: { name: 'X' },
      history: { beats: [{ action: '', theme: '' }, { action: 'Defend', theme: 'a Hope' }], clue: '' },
    });
    expect(user).not.toMatch(/Beat 1:/);
    expect(user).toMatch(/Beat 2: Defend a Hope/);
    expect(user).not.toMatch(/Story Clue/);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// envisionShip — narrator integration
// ─────────────────────────────────────────────────────────────────────────────

describe('envisionShip', () => {
  it('rolls the configured facet bundle and returns identity + rolls + prose', async () => {
    const actor = makeShipActor();
    const out = await envisionShip(actor, { facet: 'captain' });

    expect(out.facet).toBe('captain');
    expect(out.identity.name).toBe('Ironfold');
    expect(out.identity.type).toBe('Stalker-class hunter');
    expect(out.rolls).toHaveLength(4);
    expect(out.prose).toBe('Stub narrator prose.');
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it('returns null prose when no Claude key is set (no crash)', async () => {
    global.game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
    const actor = makeShipActor();
    const out = await envisionShip(actor, { facet: 'captain' });
    expect(out.prose).toBe(null);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('passes identity through to the prompt builder (ship name, type, first look, mission)', async () => {
    const actor = makeShipActor();
    await envisionShip(actor, { facet: 'all' });
    const body = apiPost.mock.calls[0][2];
    const userMsg = body.messages[0].content;
    expect(userMsg).toMatch(/Ship name: Ironfold/);
    expect(userMsg).toMatch(/Type: Stalker-class hunter/);
    expect(userMsg).toMatch(/Mission: Bring justice to a fugitive/);
  });

  it('swallows narrator-call failures and returns prose: null', async () => {
    apiPost.mockRejectedValueOnce(new Error('429 rate limit'));
    expectConsoleError?.(/.*/) ?? null;   // narrator failure doesn't log to console.error here
    const actor = makeShipActor();
    const out = await envisionShip(actor, { facet: 'crew' });
    expect(out.prose).toBe(null);
    expect(out.rolls.length).toBeGreaterThan(0);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// composeShipHistory
// ─────────────────────────────────────────────────────────────────────────────

describe('composeShipHistory', () => {
  it('rolls beats + clue and asks the narrator for prose', async () => {
    const actor = makeShipActor();
    const out = await composeShipHistory(actor, { beats: 2 });
    expect(out.history.beats).toHaveLength(2);
    expect(out.history.clue).toBeTruthy();
    expect(out.prose).toBe('Stub narrator prose.');
  });

  it('returns null prose when no Claude key (no crash; rolls still made)', async () => {
    global.game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
    const actor = makeShipActor();
    const out = await composeShipHistory(actor, { beats: 1 });
    expect(out.prose).toBe(null);
    expect(out.history.beats).toHaveLength(1);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// renderEnvisionHtml / renderHistoryHtml
// ─────────────────────────────────────────────────────────────────────────────

describe('renderEnvisionHtml', () => {
  it('wraps prose paragraphs in <p>…</p> and appends a facts line', () => {
    const html = renderEnvisionHtml({
      prose: 'First para.\n\nSecond para.',
      rolls: [
        { label: 'Captain — Role', result: 'Trader' },
        { label: 'Crew — Action',  result: 'Bargain' },
      ],
    });
    expect(html).toContain('<p>First para.</p>');
    expect(html).toContain('<p>Second para.</p>');
    expect(html).toMatch(/Captain — Role: Trader/);
    expect(html).toMatch(/Crew — Action: Bargain/);
  });

  it('falls back to just the fact line when prose is null', () => {
    const html = renderEnvisionHtml({
      prose: null,
      rolls: [{ label: 'Captain — Role', result: 'Trader' }],
    });
    expect(html).not.toContain('<p>First');
    expect(html).toMatch(/Captain — Role: Trader/);
  });

  it('skips empty results in the fact line', () => {
    const html = renderEnvisionHtml({
      prose: null,
      rolls: [{ label: 'X', result: '' }, { label: 'Y', result: 'value' }],
    });
    expect(html).not.toMatch(/X:/);
    expect(html).toMatch(/Y: value/);
  });

  it('escapes HTML in roll results to prevent injection', () => {
    const html = renderEnvisionHtml({
      prose: null,
      rolls: [{ label: 'Crew', result: '<script>x</script>' }],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('renderHistoryHtml', () => {
  it('renders beats + clue as a fact line', () => {
    const html = renderHistoryHtml({
      prose: 'A backstory.',
      history: {
        beats: [{ action: 'Reclaim', theme: 'a Burden' }],
        clue: 'A scarred plate',
      },
    });
    expect(html).toContain('<p>A backstory.</p>');
    expect(html).toMatch(/Beat 1: Reclaim a Burden/);
    expect(html).toMatch(/Story Clue: A scarred plate/);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// appendNotesSection
// ─────────────────────────────────────────────────────────────────────────────

describe('appendNotesSection', () => {
  it('appends a dated <h4> section to existing notes (preserves prior content)', async () => {
    const actor = makeShipActor({ notes: '<p>Existing intro.</p>' });
    await appendNotesSection(actor, 'Envisioned all facets', '<p>New para.</p>');

    expect(actor.system.notes).toMatch(/Existing intro/);
    expect(actor.system.notes).toMatch(/<h4>✦ Envisioned all facets/);
    expect(actor.system.notes).toMatch(/<p>New para\.<\/p>/);
  });

  it('writes the section even when notes are empty', async () => {
    const actor = makeShipActor({ notes: '' });
    await appendNotesSection(actor, 'History', '<p>Once upon.</p>');
    expect(actor.system.notes).toMatch(/<h4>✦ History/);
    expect(actor.system.notes).toMatch(/<p>Once upon\.<\/p>/);
  });

  it('idempotent re-runs append a new dated subsection rather than collapsing', async () => {
    const actor = makeShipActor({ notes: '' });
    await appendNotesSection(actor, 'History', '<p>A.</p>');
    await appendNotesSection(actor, 'History', '<p>B.</p>');
    const matches = actor.system.notes.match(/<h4>✦ History/g) ?? [];
    expect(matches.length).toBe(2);
    expect(actor.system.notes).toMatch(/<p>A\.<\/p>/);
    expect(actor.system.notes).toMatch(/<p>B\.<\/p>/);
  });

  it('returns null when heading or body is empty (no write)', async () => {
    const actor = makeShipActor({ notes: 'unchanged' });
    expect(await appendNotesSection(actor, '', '<p>body</p>')).toBe(null);
    expect(await appendNotesSection(actor, 'h', '')).toBe(null);
    expect(actor.system.notes).toBe('unchanged');
  });

  it('refuses to write on a non-starship actor', async () => {
    const actor = global.makeTestActor({ type: 'character', name: 'PC' });
    expect(await appendNotesSection(actor, 'History', '<p>x</p>')).toBe(null);
  });

  it('escapes HTML in the heading', async () => {
    const actor = makeShipActor({ notes: '' });
    await appendNotesSection(actor, '<script>x</script>', '<p>body</p>');
    expect(actor.system.notes).not.toContain('<script>');
    expect(actor.system.notes).toContain('&lt;script&gt;');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Command predicates + parser
// ─────────────────────────────────────────────────────────────────────────────

describe('isShipEnvisionCommand / isShipHistoryCommand', () => {
  it('matches !ship envision (any casing, with or without args)', () => {
    expect(isShipEnvisionCommand({ content: '!ship envision' })).toBe(true);
    expect(isShipEnvisionCommand({ content: '!SHIP ENVISION Ironfold' })).toBe(true);
    expect(isShipEnvisionCommand({ content: '!ship envision Ironfold captain' })).toBe(true);
  });

  it('rejects look-alikes', () => {
    expect(isShipEnvisionCommand({ content: '!shipenvision' })).toBe(false);
    expect(isShipEnvisionCommand({ content: '!ship envisioning' })).toBe(false);
    expect(isShipEnvisionCommand({ content: '!ship history' })).toBe(false);
    expect(isShipEnvisionCommand({ content: 'ship envision' })).toBe(false);
  });

  it('rejects our own outbound cards (flag set) so the handler does not loop', () => {
    const msg = { content: '!ship envision', flags: { [MODULE_ID]: { shipEnvisionCard: true } } };
    expect(isShipEnvisionCommand(msg)).toBe(false);
  });

  it('matches !ship history', () => {
    expect(isShipHistoryCommand({ content: '!ship history' })).toBe(true);
    expect(isShipHistoryCommand({ content: '!ship history Ironfold' })).toBe(true);
    expect(isShipHistoryCommand({ content: '!ship history Ironfold 4' })).toBe(true);
    expect(isShipHistoryCommand({ content: '!ship envision' })).toBe(false);
  });
});

describe('parseShipEnvisionCommand', () => {
  it('resolves the command vehicle when no target is provided', () => {
    const actor = makeShipActor({ name: 'Ironfold', shipFlag: { _id: 'cv-1', isCommandVehicle: true } });
    const state = { shipIds: [actor.id] };
    const out = parseShipEnvisionCommand('!ship envision', state);
    expect(out.actor?.id).toBe(actor.id);
    expect(out.facet).toBe('all');
    expect(out.error).toBeUndefined();
  });

  it('resolves the lone tracked ship when no target', () => {
    const actor = makeShipActor({ name: 'Drifter', shipFlag: { _id: 's-2' } });
    const state = { shipIds: [actor.id] };
    const out = parseShipEnvisionCommand('!ship envision', state);
    expect(out.actor?.id).toBe(actor.id);
  });

  it('resolves a ship by exact actor name (case-insensitive)', () => {
    const a = makeShipActor({ name: 'Ironfold',   shipFlag: { _id: 'a' } });
    const b = makeShipActor({ name: 'Other Ship', shipFlag: { _id: 'b' } });
    const state = { shipIds: [a.id, b.id] };
    const out = parseShipEnvisionCommand('!ship envision ironfold', state);
    expect(out.actor?.id).toBe(a.id);
  });

  it('parses a trailing facet token after a multi-word name', () => {
    const a = makeShipActor({ name: 'The Drift', shipFlag: { _id: 'a' } });
    const state = { shipIds: [a.id] };
    const out = parseShipEnvisionCommand('!ship envision The Drift captain', state);
    expect(out.actor?.id).toBe(a.id);
    expect(out.facet).toBe('captain');
  });

  it('treats a single arg matching a facet name as facet (no target text)', () => {
    const a = makeShipActor({ name: 'Solo', shipFlag: { _id: 'a', isCommandVehicle: true } });
    const state = { shipIds: [a.id] };
    const out = parseShipEnvisionCommand('!ship envision contact', state);
    expect(out.actor?.id).toBe(a.id);
    expect(out.facet).toBe('contact');
  });

  it('returns an error when the name does not match any tracked ship', () => {
    const a = makeShipActor({ name: 'Ironfold', shipFlag: { _id: 'a' } });
    const state = { shipIds: [a.id] };
    const out = parseShipEnvisionCommand('!ship envision Nonesuch', state);
    expect(out.actor).toBeNull();
    expect(out.error).toMatch(/No ship matches/);
  });

  it('returns an error when there is no ship at all', () => {
    const out = parseShipEnvisionCommand('!ship envision', { shipIds: [] });
    expect(out.actor).toBeNull();
    expect(out.error).toMatch(/No ship/);
  });
});

describe('parseShipHistoryCommand', () => {
  it('defaults to 3 beats and resolves the lone ship', () => {
    const a = makeShipActor({ name: 'Solo', shipFlag: { _id: 'a' } });
    const state = { shipIds: [a.id] };
    const out = parseShipHistoryCommand('!ship history', state);
    expect(out.actor?.id).toBe(a.id);
    expect(out.beats).toBe(3);
  });

  it('parses a trailing beat-count integer', () => {
    const a = makeShipActor({ name: 'Solo', shipFlag: { _id: 'a' } });
    const state = { shipIds: [a.id] };
    const out = parseShipHistoryCommand('!ship history Solo 5', state);
    expect(out.actor?.id).toBe(a.id);
    expect(out.beats).toBe(5);
  });

  it('treats a single numeric arg as beats (no target)', () => {
    const a = makeShipActor({ name: 'Solo', shipFlag: { _id: 'a' } });
    const state = { shipIds: [a.id] };
    const out = parseShipHistoryCommand('!ship history 2', state);
    expect(out.actor?.id).toBe(a.id);
    expect(out.beats).toBe(2);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Command handlers — chat-card shape + notes write
// ─────────────────────────────────────────────────────────────────────────────

describe('handleShipEnvisionCommand', () => {
  it('posts a card flagged shipEnvisionCard:true and writes the section to notes', async () => {
    const actor = makeShipActor({ name: 'Ironfold', shipFlag: { _id: 'a', isCommandVehicle: true } });
    await global.game.settings.set(MODULE_ID, 'campaignState', { shipIds: [actor.id] });

    await handleShipEnvisionCommand({ content: '!ship envision' });

    expect(ChatMessage._created).toHaveLength(1);
    const card = ChatMessage._created[0];
    expect(card.flags?.[MODULE_ID]?.shipEnvisionCard).toBe(true);
    expect(card.content).toMatch(/✦ Envision — Ironfold/);
    expect(actor.system.notes).toMatch(/<h4>✦ Envisioned all facets/);
  });

  it('posts a usage card when resolution fails (no notes write)', async () => {
    await global.game.settings.set(MODULE_ID, 'campaignState', { shipIds: [] });

    await handleShipEnvisionCommand({ content: '!ship envision Nonesuch' });

    expect(ChatMessage._created).toHaveLength(1);
    const card = ChatMessage._created[0];
    expect(card.content).toMatch(/Usage:/);
  });

  it('skips the notes write for non-GM clients but still posts the card', async () => {
    global.game.user.isGM = false;
    const actor = makeShipActor({ name: 'Ironfold', shipFlag: { _id: 'a', isCommandVehicle: true } });
    await global.game.settings.set(MODULE_ID, 'campaignState', { shipIds: [actor.id] });

    await handleShipEnvisionCommand({ content: '!ship envision' });

    expect(ChatMessage._created).toHaveLength(1);
    expect(actor.system.notes).toBe('');
  });
});

describe('handleShipHistoryCommand', () => {
  it('posts a history card and appends to notes', async () => {
    const actor = makeShipActor({ name: 'Ironfold', shipFlag: { _id: 'a', isCommandVehicle: true } });
    await global.game.settings.set(MODULE_ID, 'campaignState', { shipIds: [actor.id] });

    await handleShipHistoryCommand({ content: '!ship history' });

    expect(ChatMessage._created).toHaveLength(1);
    const card = ChatMessage._created[0];
    expect(card.flags?.[MODULE_ID]?.shipHistoryCard).toBe(true);
    expect(card.content).toMatch(/📜 History — Ironfold/);
    expect(actor.system.notes).toMatch(/<h4>✦ History/);
  });
});
