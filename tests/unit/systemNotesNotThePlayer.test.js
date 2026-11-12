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

import { applyMeterChanges, registerSystemNoteAttribution } from '../../src/character/actorBridge.js';

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
