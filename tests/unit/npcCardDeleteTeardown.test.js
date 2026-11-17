/**
 * STARFORGED COMPANION
 * tests/unit/npcCardDeleteTeardown.test.js
 *
 * Issue #362 D10 (DETECTED-PERSON-DROPPED-SILENTLY; the coverage appendix's
 * ENT D5), the maintainer's answer A, part (3): "a deleteActor handler runs
 * the X-Card's connection teardown".
 *
 * Deleting an NPC card in the Actors sidebar cleaned up nothing — no
 * deleteActor handler existed outside the Entities panel's re-render: the id
 * stayed in `connectionIds` (readers skip it), the PCs' bond Items stayed
 * (CHARACTER STATE and the classifier's "speaker's connections" kept listing
 * the NPC), scene-ledger facts stayed keyed to the dead id, and its hidden
 * plan and "Art:" portraits stayed. The X-Card's retraction of a narration's
 * NPC does all of it (connection.retractNarrationConnections). A GM's delete
 * now runs the same teardown, on the canonical GM; a player's marks on a bond
 * Item are kept as a lost bond, not erased; and the X-Card's own delete is not
 * torn down twice.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as connection from '../../src/entities/connection.js';
import * as secrets from '../../src/world/secrets.js';
import * as storage from '../../src/art/storage.js';
import { subjectKey } from '../../src/factContinuity/ledgers.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE = 'starforged-companion';
const VEX = { kind: 'entity', entityId: 'npc-vex' };

/** A bond Item keyed to the connection record, with `current` progress ticks. */
function bondItem(actor, { current = 0, completed = false } = {}) {
  const item = {
    id: `bond-${actor.id}`, name: 'Vex', type: 'progress', parent: actor,
    system: { subtype: 'bond', current, completed },
    flags: { [MODULE]: { connectionId: 'rec-vex' } },
  };
  item.update = async (changes) => {
    for (const [path, value] of Object.entries(changes)) {
      const parts = path.split('.');
      let target = item;
      for (const p of parts.slice(0, -1)) target = (target[p] ??= {});
      target[parts.at(-1)] = value;
    }
    return item;
  };
  item.delete = async () => {
    const at = actor.items.contents.indexOf(item);
    if (at >= 0) actor.items.contents.splice(at, 1);
  };
  actor.items.contents.push(item);
  return item;
}

let kira, ren, vex, plans;

// The hook as index.js registers it at ready (a missing registrar registers nothing: the assertions below fail).
beforeAll(() => { connection.registerConnectionDeleteHook?.(); });

beforeEach(() => {
  global.game.actors._reset();
  global.game.user = { isGM: true, id: 'gm-1' };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  global.game.settings._store.clear();
  global.game.settings._store.set(`${MODULE}.campaignState`, {
    ...CampaignStateSchema, connectionIds: ['npc-vex', 'npc-dace'], currentSceneId: 'sc-1',
    sceneTruths: [{ id: 't1', subject: VEX, fact: 'owes the crew a favour', narrationId: 'nar-0' }],
    sceneState: { sceneId: 'sc-1', bySubject: { [subjectKey(VEX)]: [{ attribute: 'mood', value: 'wary' }] } },
  });
  kira = global.makeTestActor({ id: 'pc-kira', type: 'character', name: 'Kira' });
  ren  = global.makeTestActor({ id: 'pc-ren', type: 'character', name: 'Ren' });
  vex  = global.makeTestActor({ id: 'npc-vex', type: 'character', name: 'Vex',
    flags: { [MODULE]: { entityType: 'connection', connection: { _id: 'rec-vex', name: 'Vex', active: true, portraitId: 'art-vex' } } } });
  for (const a of [kira, ren, vex]) global.game.actors._set(a.id, a);
  bondItem(kira);                    // never marked
  bondItem(ren, { current: 8 });     // Ren developed the relationship
  plans = [{ id: 'plan-vex', kind: 'npcAgenda', status: 'active', subject: { type: 'entity', id: 'npc-vex', name: 'Vex' } },
           { id: 'plan-other', kind: 'threat', status: 'active', subject: { type: 'name', id: null, name: 'Raiders' } }];
  vi.spyOn(secrets, 'listSkeletons').mockImplementation(() => plans);
  vi.spyOn(secrets, 'retireSkeleton').mockResolvedValue({});
  vi.spyOn(storage, 'deleteEntityArtAssets').mockResolvedValue(1);
});
afterEach(() => vi.restoreAllMocks());

/** The GM deletes the card in the Actors sidebar: Foundry removes it, then fires deleteActor on each client. */
async function gmDeletes(actor, options = {}) {
  global.game.actors._setAll(global.game.actors.contents.filter(a => a !== actor));
  Hooks.call('deleteActor', actor, options, 'gm-1');
  // The teardown runs off the hook (Foundry does not await a handler): wait for its last step.
  await vi.waitFor(() => expect(secrets.retireSkeleton).toHaveBeenCalled(), { timeout: 500 }).catch(() => {});
  await new Promise(r => setTimeout(r, 0));
}
const stored = () => global.game.settings.get(MODULE, 'campaignState');
const bonds = (actor) => actor.items.contents.filter(i => i.system?.subtype === 'bond');

describe("issue #362 D10 (3) — a GM's delete of an NPC card runs the connection teardown", () => {
  it('its id leaves connectionIds, and its scene facts are handed back to its name', async () => {
    await gmDeletes(vex);
    const cs = stored();
    expect(cs.connectionIds).toEqual(['npc-dace']);
    expect(cs.sceneTruths[0].subject).toEqual({ kind: 'text', text: 'Vex' });
    expect(Object.keys(cs.sceneState.bySubject)).toEqual([subjectKey({ kind: 'text', text: 'Vex' })]);
  });

  it("the PCs' bond Items go — a bond a player marked is kept as lost, not erased", async () => {
    await gmDeletes(vex);
    expect({ kira: bonds(kira).length, ren: bonds(ren).map(i => [i.system.current, i.flags[MODULE].lost === true]) })
      .toEqual({ kira: 0, ren: [[8, true]] });
  });

  it('its hidden plan is retired and its portraits deleted', async () => {
    await gmDeletes(vex);
    expect(secrets.retireSkeleton.mock.calls.map(c => c[0])).toEqual(['plan-vex']);
    expect(storage.deleteEntityArtAssets).toHaveBeenCalledWith('connection', 'rec-vex', { portraitId: 'art-vex' });
  });

  it('control: another GM\'s client and a player\'s do nothing — the canonical GM runs it once', async () => {
    global.game.users = [{ id: 'gm-1', isGM: true, active: true }, { id: 'gm-2', isGM: true, active: true }];
    global.game.user = { isGM: true, id: 'gm-2' };
    global.game.actors._setAll(global.game.actors.contents.filter(a => a !== vex));
    Hooks.call('deleteActor', vex, {}, 'gm-1');
    await new Promise(r => setTimeout(r, 0));
    expect({ ids: stored().connectionIds, kira: bonds(kira).length, plans: secrets.retireSkeleton.mock.calls.length })
      .toEqual({ ids: ['npc-vex', 'npc-dace'], kira: 1, plans: 0 });
  });

  it('control: a deleted actor that is no NPC card is left alone', async () => {
    global.game.actors._setAll(global.game.actors.contents.filter(a => a !== kira));
    Hooks.call('deleteActor', kira, {}, 'gm-1');
    await new Promise(r => setTimeout(r, 0));
    expect({ ids: stored().connectionIds, plans: secrets.retireSkeleton.mock.calls.length })
      .toEqual({ ids: ['npc-vex', 'npc-dace'], plans: 0 });
  });

  it("the X-Card's own delete of a narration's NPC is torn down by the X-Card alone, not twice", async () => {
    // An NPC the removed narration made, nobody has used yet: the X-Card deletes it.
    const made = global.makeTestActor({ id: 'npc-ilsa', type: 'character', name: 'Ilsa',
      flags: { [MODULE]: { entityType: 'connection', connection: { _id: 'rec-ilsa', name: 'Ilsa', active: true, createdFromNarrationId: 'nar-9' } } } });
    global.game.actors._set(made.id, made);
    global.game.settings._store.set(`${MODULE}.campaignState`, { ...stored(), connectionIds: ['npc-vex', 'npc-dace', 'npc-ilsa'] });
    let deleteOptions = null;
    made.delete = async (options) => {
      deleteOptions = options;
      global.game.actors._setAll(global.game.actors.contents.filter(a => a !== made));
      Hooks.call('deleteActor', made, options ?? {}, 'gm-1');   // Foundry fires the hook with the delete's options
    };

    const out = await connection.retractNarrationConnections(['nar-9']);
    await new Promise(r => setTimeout(r, 0));
    expect(out.deleted).toEqual(['Ilsa']);
    expect(deleteOptions?.[MODULE]?.connectionTornDown, 'the delete says its teardown is done').toBe(true);
    expect(storage.deleteEntityArtAssets.mock.calls.filter(c => c[1] === 'rec-ilsa'), 'portraits deleted once').toHaveLength(1);
    expect(stored().connectionIds).toEqual(['npc-vex', 'npc-dace']);
  });
});
