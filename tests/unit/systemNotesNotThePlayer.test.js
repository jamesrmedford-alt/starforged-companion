/**
 * STARFORGED COMPANION
 * tests/unit/systemNotesNotThePlayer.test.js
 *
 * Issue #348 PT14 — message speaker attribution.
 *
 * "+1 momentum (now 5)" showed as from Isaac Sutton. It is the ironsworn
 * system's change log ("log-changes": its preUpdateActor hook posts
 * `<em>+1 momentum (now 5)</em>` as an emote spoken by the Actor), posted on
 * the client that made the change — for a change the module made (a move's
 * momentum, a session focus), the canonical GM's — and it read as the player
 * speaking. Now a change-log line posted while the module's actor bridge is
 * writing that Actor is said by no Actor (the writing client's user), the
 * PC's name leading the line. A player's own sheet edit, and the module's own
 * cards, are left as they are.
 *
 * And a player's own line posted again by a paced card's Roll — the forced
 * move — spoke as the presser when no PC rolled it: a GM's press put a
 * PC-less player's words under the GM's name. It keeps the speaker the line
 * was typed under.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

import { applyMeterChanges, registerSystemNoteAttribution, withoutSystemNotes } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';
const EMOTE = 3;

/** A ChatMessage about to be created, as preCreateChatMessage receives it. */
function pendingMessage(data) {
  const message = {
    data: JSON.parse(JSON.stringify(data)),
    updateSource(changes) {
      for (const [k, v] of Object.entries(changes)) {
        message.data[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? { ...(message.data[k] ?? {}), ...v } : v;
      }
    },
  };
  return message;
}

/** The ironsworn system's change log, as its preUpdateActor hook posts it (sendToChat). */
function systemChangeLog(actor, line) {
  const data = { content: `<em>${line}</em>`, style: EMOTE, speaker: { actor: actor.id } };
  const message = pendingMessage(data);
  Hooks.call('preCreateChatMessage', message, data, {}, game.user.id);
  return message.data;
}

describe('PT14 — the system\'s change log for a module write is not the PC speaking', () => {
  let isaac;
  let logged;

  beforeAll(() => registerSystemNoteAttribution());

  beforeEach(() => {
    game.actors._reset();
    isaac = makeTestActor({ id: 'pc-isaac', name: 'Isaac Sutton' });
    game.actors._set('pc-isaac', isaac);
    logged = [];
    // The system logs the change while the update is in flight, on this client.
    const raw = isaac.update;
    isaac.update = async (changes, options) => {
      if (changes['system.momentum.value'] !== undefined) {
        logged.push(systemChangeLog(isaac, `+1 momentum (now ${changes['system.momentum.value']})`));
      }
      return raw(changes, options);
    };
  });
  afterEach(() => game.actors._reset());

  it('a momentum the module grants is logged as a note — no PC speaker, the PC named in the line', async () => {
    await applyMeterChanges(isaac, { momentum: 1 });

    expect(logged).toHaveLength(1);
    // It was spoken by Isaac — the player's line, to the table.
    expect(logged[0].speaker.actor).toBeNull();
    expect(logged[0].content).toMatch(/^<em>Isaac Sutton: \+1 momentum \(now \d+\)<\/em>$/);
    expect(logged[0].style).not.toBe(EMOTE);
    // …and is never read as a player's line: the move pipeline skips it
    // (it is not an emote any more — CI's first-session playthrough rolled it).
    expect(logged[0].flags?.[MODULE_ID]?.systemNote).toBe(true);
    const { isPlayerNarration } = await import('../../src/index.js');
    expect(isPlayerNarration({ ...logged[0], whisper: [], rolls: [] })).toBe(false);
  });

  it('control: the same line from a sheet edit (no module write in flight) keeps the PC speaker', () => {
    const data = systemChangeLog(isaac, '+1 momentum (now 6)');
    expect(data.speaker.actor).toBe('pc-isaac');
    expect(data.content).toBe('<em>+1 momentum (now 6)</em>');
  });

  it('control: the module\'s own card spoken by a PC, posted during a write, is left alone', async () => {
    let card = null;
    const raw = isaac.update;
    isaac.update = async (changes, options) => {
      const data = { content: '<em>A card</em>', style: EMOTE, speaker: { actor: 'pc-isaac' }, flags: { [MODULE_ID]: { someCard: true } } };
      const message = pendingMessage(data);
      Hooks.call('preCreateChatMessage', message, data, {}, game.user.id);
      card = message.data;
      return raw(changes, options);
    };
    await applyMeterChanges(isaac, { health: -1 });
    expect(card.speaker.actor).toBe('pc-isaac');
  });
});

/**
 * Whether a ChatMessage's create goes ahead: Foundry cancels it when a
 * preCreateChatMessage handler returns false (the unit Hooks stub's call()
 * drops return values, so the handlers are run here).
 */
function createGoesAhead(message, data) {
  const handlers = Hooks._handlers.get('preCreateChatMessage') ?? [];
  return !handlers.map(fn => fn(message, data, {}, game.user.id)).includes(false);
}

// Issue #354 P2-13: one −1 integrity made three cards — Pay the Price, the
// system's "ISV Savela: Starship -1 Integrity (now 4)" and the module's own
// "Withstand Damage (-1) ISV Savela: 5 → 4". A change the module reports on a
// card of its own is not also posted as the system's note.
describe('issue #354 P2-13 — a change the module shows on its own card is shown once', () => {
  let isaac;
  let posted;      // every system change log, with whether its create went ahead

  beforeAll(() => registerSystemNoteAttribution());

  beforeEach(() => {
    game.actors._reset();
    isaac = makeTestActor({ id: 'pc-isaac', name: 'Isaac Sutton' });
    game.actors._set('pc-isaac', isaac);
    posted = [];
    const raw = isaac.update;
    isaac.update = async (changes, options) => {
      const field = Object.keys(changes).find(k => /^system\.(momentum|health|spirit|supply)\.value$/.test(k));
      if (field) {
        const data = { content: `<em>${field.split('.')[1]} (now ${changes[field]})</em>`, style: EMOTE, speaker: { actor: isaac.id } };
        const message = pendingMessage(data);
        posted.push({ went: createGoesAhead(message, data), data: message.data });
      }
      return raw(changes, options);
    };
  });
  afterEach(() => game.actors._reset());

  it('inside withoutSystemNotes the system\'s note is not created; the write still lands', async () => {
    const before = isaac.system.momentum.value;
    await withoutSystemNotes(() => applyMeterChanges(isaac, { momentum: -1 }));
    expect(isaac.system.momentum.value).toBe(before - 1);
    expect(posted).toEqual([expect.objectContaining({ went: false })]);
  });

  it('outside it the note is posted as before, re-spoken as a note — and the quiet ends with the write, even when it throws', async () => {
    await expect(withoutSystemNotes(async () => { throw new Error('refused'); })).rejects.toThrow('refused');
    await applyMeterChanges(isaac, { momentum: 1 });
    expect(posted).toHaveLength(1);
    expect(posted[0].went).toBe(true);
    expect(posted[0].data.flags?.[MODULE_ID]?.systemNote).toBe(true);
  });

  it('a player\'s own sheet edit made during a quiet write keeps its note (no module write is in flight for it)', async () => {
    const kira = makeTestActor({ id: 'pc-kira', name: 'Kira' });
    game.actors._set('pc-kira', kira);
    let went = null;
    await withoutSystemNotes(async () => {
      const data = { content: '<em>+1 health (now 4)</em>', style: EMOTE, speaker: { actor: 'pc-kira' } };
      went = createGoesAhead(pendingMessage(data), data);
    });
    expect(went).toBe(true);
  });

  it('each suffer move\'s loss is quiet: Lose Momentum, Endure Harm, Endure Stress, Sacrifice Resources', async () => {
    const { loseMomentum, endureHarm, endureStress, sacrificeResources } = await import('../../src/moves/sufferExecutor.js');
    await loseMomentum(isaac, 1);
    await endureHarm(isaac, 1);
    await endureStress(isaac, 1);
    await sacrificeResources(isaac, 1);
    expect(posted.map(p => p.went)).toEqual([false, false, false, false]);
    // …and each still posted its own card, saying the change.
    const cards = ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.sufferCard).map(m => m.flags[MODULE_ID].suffer);
    expect(cards).toEqual(['lose_momentum', 'endure_harm', 'endure_stress', 'sacrifice_resources']);
  });
});

describe('PT14 — a paced card\'s Roll keeps the speaker its line was typed under', () => {
  let table;
  let MID;

  beforeAll(async () => {
    const harness = await import('../helpers/multiClient.js');
    MID = harness.MODULE_ID;
    table = await harness.simulateTable({ users: [harness.USERS.GM, harness.USERS.P1, harness.USERS.P2] });
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    const { CampaignStateSchema } = await import('../../src/schemas.js');
    await table.reset({ world: { settings: { campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [],
    } } } });
  });

  it('the GM pressing Roll on a PC-less player\'s paced card posts the line as that player, not as the GM', async () => {
    const LINE = "We're in.";
    // Pat's line; Pat owns no PC at this table of several (it narrates with none — #342 Z50).
    const typed = await table.client('pl-1').chat(LINE, { speaker: { alias: 'Pat' } });
    await table.settle();
    // The narrator's paced card answering it, naming no PC.
    const card = await table.client('gm-1').run(() => ChatMessage.create({
      content: '<div class="sf-narration-card sf-narration-card--paced"></div>',
      flags: { [MID]: { narratorCard: true, pacedNarrative: true, narrationText: 'The hatch gives.', playerText: LINE, actorId: null, suggestedMove: 'face_danger', sessionId: 'sess-1' } },
    }));
    await table.settle();
    expect(typed, 'the line was posted (setup)').toBeTruthy();

    const { applyPacedRoll } = await table.client('gm-1').import('../../src/moves/cardActions.js');
    const out = await table.client('gm-1').run(() => applyPacedRoll({ messageId: card.id, actorId: null }, { requesterId: 'gm-1', requesterIsGM: true, local: true }));
    await table.settle();

    expect(out).toMatchObject({ posted: true });
    const [post] = table.cards(f => f.forcedMoveId === 'face_danger');
    // It spoke as the GM who pressed — "We're in" under "Gina".
    expect(post.speaker?.alias).toBe('Pat');
    expect(post.content).toBe(LINE);
  }, 30_000);
});
