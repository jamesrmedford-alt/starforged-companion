/* global makeTestActor */
/**
 * STARFORGED COMPANION
 * tests/unit/bondItemDeleteNoteNotThePlayer.test.js
 *
 * Issue #362 AC76 BOND-DELETE-NOTE-AS-PC (an incomplete fix of issue #348
 * PT14 / issue #354 P2-16) — the X-Card removes a narration that created a
 * connection (connection.retractNarrationConnections); the bond Item the
 * module put on each PC's sheet goes with it (actorBridge
 * deleteUnmarkedBondItems). The ironsworn system's change log (vendor
 * chat-alert.ts, its preDeleteItem hook) posts "Deleted <name>" for an owned
 * Item deleted on this client, as an emote spoken by the Item's Actor — the
 * PC: "Kira: Deleted Vex Tannis", the removed NPC named again in Kira's voice
 * right after the X-Card. The delete was the one actor write in the bridge
 * neither moduleUpdate nor moduleWriteOn marked. It now passes `suppressLog`
 * (which the system's preDeleteItem reads from the delete's options, so the
 * note is not posted) and is marked as the module's write (a note posted all
 * the same is the system's, not the PC's).
 *
 * The system's hook is simulated as tests/unit/systemNotesNotThePlayer.test.js
 * simulates its preUpdateActor / preCreateItem: while the document write is in
 * flight, the message it would create is run through the registered
 * preCreateChatMessage handlers.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import {
  createCharacterBondItem, deleteUnmarkedBondItems, registerSystemNoteAttribution,
} from '../../src/character/actorBridge.js';

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

/** The system's change log for `actor`, posted now: what the table sees, or null when its create is cancelled. */
function systemChangeLog(actor, line) {
  const data = { content: `<em>${line}</em>`, style: EMOTE, speaker: { actor: actor.id } };
  const message = pendingMessage(data);
  const handlers = Hooks._handlers.get('preCreateChatMessage') ?? [];
  const cancelled = handlers.map(fn => fn(message, data, {}, game.user.id)).includes(false);
  return cancelled ? null : message.data;
}

describe('issue #362 AC76 — the system\'s "Deleted …" note for a bond Item the module removes is not the PC speaking', () => {
  let kira;
  let logged;
  let deleteOptions;
  let savedCreate;

  beforeAll(() => registerSystemNoteAttribution());

  beforeEach(() => {
    game.actors._reset();
    kira = makeTestActor({ id: 'pc-kira', name: 'Kira' });
    game.actors._set('pc-kira', kira);
    logged = [];
    deleteOptions = [];
    // The system logs an owned Item's creation and deletion while the write is
    // in flight, on this client (vendor chat-alert.ts preCreateItem / preDeleteItem).
    savedCreate = global.Item.create;
    global.Item.create = async (data, options = {}) => {
      const parent = options.parent;
      logged.push({ what: 'added', note: systemChangeLog(parent, `Added ${data.name}`) });
      const item = await savedCreate(data, options);
      item.parent = parent;
      if (!parent.items.contents.includes(item)) parent.items.contents.push(item);
      item.delete = async (opts = {}) => {
        deleteOptions.push(opts);
        // As preDeleteItem does — the option read, the note posted otherwise.
        logged.push({ what: 'deleted', note: opts?.suppressLog ? 'not posted' : systemChangeLog(parent, `Deleted ${item.name}`) });
        const at = parent.items.contents.indexOf(item);
        if (at >= 0) parent.items.contents.splice(at, 1);
      };
      return item;
    };
  });
  afterEach(() => { global.Item.create = savedCreate; game.actors._reset(); });

  it('control: the "Added …" note of the bond Item\'s creation is re-spoken as the system\'s (P2-16)', async () => {
    await createCharacterBondItem(kira, { name: 'Vex Tannis', rank: 'dangerous', connectionId: 'conn-vex' });
    const added = logged.find(l => l.what === 'added')?.note;
    expect(added, 'the note was posted').toBeTruthy();
    expect(added.speaker.actor).toBeNull();
    expect(added.flags?.[MODULE_ID]?.systemNote).toBe(true);
    expect(added.content).toBe('<em>Kira: Added Vex Tannis</em>');
  });

  it('the X-Card\'s removal asks the system not to post its "Deleted …" note', async () => {
    await createCharacterBondItem(kira, { name: 'Vex Tannis', rank: 'dangerous', connectionId: 'conn-vex' });

    const out = await deleteUnmarkedBondItems({ connectionId: 'conn-vex' });
    expect(out, 'the bond Item was deleted (setup)').toEqual({ marked: false, deleted: 1 });
    expect(deleteOptions).toEqual([expect.objectContaining({ suppressLog: true })]);
    expect(logged.find(l => l.what === 'deleted')?.note).toBe('not posted');
  });

  it('…and a note posted all the same is not Kira speaking either', async () => {
    await createCharacterBondItem(kira, { name: 'Vex Tannis', rank: 'dangerous', connectionId: 'conn-vex' });
    // A system that posts whatever the options say (the probe's model of the hook).
    const item = kira.items.contents.find(i => i.name === 'Vex Tannis');
    item.delete = async () => {
      logged.push({ what: 'deleted', note: systemChangeLog(kira, `Deleted ${item.name}`) });
      kira.items.contents.splice(kira.items.contents.indexOf(item), 1);
    };

    await deleteUnmarkedBondItems({ connectionId: 'conn-vex' });
    const deleted = logged.find(l => l.what === 'deleted');
    expect(deleted, 'the system logged the delete (setup)').toBeTruthy();
    expect(deleted.note?.speaker?.actor ?? null).toBeNull();
    expect(deleted.note?.flags?.[MODULE_ID]?.systemNote).toBe(true);
  });
});
