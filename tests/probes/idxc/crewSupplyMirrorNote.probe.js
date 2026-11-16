/**
 * PROBE — IDXC-03 · CREW-SUPPLY-MIRROR-NOTE-SPOKEN-BY-ALLY
 *
 * Scenario: two player characters, Kira and Dax, share one supply track
 * (multiplayer/sharedSupply.js). The module takes 1 supply from Kira —
 * Sacrifice Resources (-1), a Pay the Price route. The canonical GM's sync
 * then writes Dax's sheet to the crew's supply.
 *
 * The ironsworn system logs every sheet change to chat ("log-changes", on by
 * default; vendor/foundry-ironsworn/src/module/features/chat-alert.ts): its
 * preUpdateActor hook, on the client that makes the update, posts
 * `<em>-1 supply (now 2)</em>` as an EMOTE SPOKEN BY THE ACTOR.
 *
 * Correct (decisions.md → PT14: "When the module itself changes a character,
 * the ironsworn system's chat change note for that change is shown as a note,
 * not as the character speaking"; P2-13: a change the module shows on its own
 * card is not also posted as the system's note): the module's change to Dax's
 * sheet is not posted as a line Dax says — re-spoken as a note, or not posted.
 *
 * Today: the mirror writes Dax with a bare `actor.update(...)`, not through
 * actorBridge's marked write (moduleUpdate), so the preCreateChatMessage hook
 * index.js registers at load (actorBridge.registerSystemNoteAttribution) sees
 * no module write in flight for Dax and leaves the note as Dax speaking:
 * "Dax  -1 supply (now 2)" — beside the module's own Sacrifice Resources card.
 *
 * Set up as tests/unit/systemNotesNotThePlayer.test.js sets PT14 up: the
 * system's change log is emulated at its boundary (posted through the real
 * preCreateChatMessage handlers while the update is in flight), and Foundry's
 * preUpdateActor / updateActor dispatch around each sheet write. The suffer
 * executor, the bridge, the shared-supply hook and the attribution hook are
 * the module's own.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

import { applyMeterChanges, registerSystemNoteAttribution } from '../../../src/character/actorBridge.js';
import { registerSharedSupplyHook, _resetSharedSupplyForTests } from '../../../src/multiplayer/sharedSupply.js';
import { sacrificeResources } from '../../../src/moves/sufferExecutor.js';

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

let posted;        // every system change log: whose sheet, whether its create went ahead, and as what
let pendingSyncs;  // the updateActor handlers' work

/** vendor chat-alert.ts: preUpdateActor → ACTOR_TYPE_HANDLERS.character (the meters) → sendToChat. */
function ironswornLogChanges(actor, diff, options) {
  if (options?.suppressLog) return;
  for (const resource of ['momentum', 'health', 'spirit', 'supply']) {
    const newValue = diff?.system?.[resource]?.value;
    if (newValue === undefined) continue;
    const oldValue = actor.system[resource].value;
    const data = {
      content: `<em>${newValue > oldValue ? '+' : ''}${newValue - oldValue} ${resource} (now ${newValue})</em>`,
      style:   EMOTE,
      speaker: { actor: actor.id },
    };
    const message = pendingMessage(data);
    // Foundry cancels the create when a preCreateChatMessage handler returns false.
    const went = !(Hooks._handlers.get('preCreateChatMessage') ?? []).map(fn => fn(message, data, {}, game.user.id)).includes(false);
    posted.push({ sheet: actor.id, went, data: message.data });
    return;
  }
}

/** { "system.supply.value": 2 } → { system: { supply: { value: 2 } } }, as Foundry hands a hook the change. */
function expand(changes) {
  const out = {};
  for (const [path, value] of Object.entries(changes ?? {})) {
    const parts = path.split('.');
    let at = out;
    for (const p of parts.slice(0, -1)) at = (at[p] ??= {});
    at[parts.at(-1)] = value;
  }
  return out;
}

/** A PC whose sheet writes are dispatched as Foundry dispatches them on the updating (GM) client. */
function livePc(id, name) {
  const actor = makeTestActor({ id, name, system: { supply: { value: 3 } } });
  game.actors._set(id, actor);
  const raw = actor.update;
  actor.update = async (changes, options = {}) => {
    const diff = expand(changes);
    for (const fn of Hooks._handlers.get('preUpdateActor') ?? []) fn(actor, diff, options, game.user.id);
    ironswornLogChanges(actor, diff, options);          // the system's own preUpdateActor hook
    const out = await raw(changes, options);
    for (const fn of Hooks._handlers.get('updateActor') ?? []) pendingSyncs.push(fn(actor, diff, options, game.user.id));
    return out;
  };
  return actor;
}

async function settled() {
  while (pendingSyncs.length) await pendingSyncs.shift();
}

describe('IDXC-03 — the system\'s change note for the crew-supply mirror', () => {
  let kira, dax;

  beforeAll(() => {
    registerSystemNoteAttribution();   // index.js, at load
    registerSharedSupplyHook();        // index.js, at ready
  });
  beforeEach(() => {
    game.actors._reset();
    _resetSharedSupplyForTests();      // this GM has run no pass; no crew supply is stored
    game.settings._store?.delete?.(`${MODULE_ID}.campaignState`);
    posted = [];
    pendingSyncs = [];
    kira = livePc('pc-kira', 'Kira');
    dax  = livePc('pc-dax', 'Dax');
  });
  afterEach(() => game.actors._reset());

  it('control: a module write through the bridge is logged as a note, not as the PC speaking (PT14)', async () => {
    await applyMeterChanges(kira, { momentum: 1 });
    await settled();

    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ sheet: 'pc-kira', went: true });
    expect(posted[0].data.speaker.actor).toBeNull();
    expect(posted[0].data.content).toBe('<em>Kira: +1 momentum (now 3)</em>');
    expect(posted[0].data.flags?.[MODULE_ID]?.systemNote).toBe(true);
  });

  it('control: Sacrifice Resources says the roller\'s own loss once, on its card — the system\'s note for it is not posted (P2-13)', async () => {
    await sacrificeResources(kira, 1);
    await settled();

    expect(kira.system.supply.value).toBe(2);
    expect(posted.filter(p => p.sheet === 'pc-kira')).toEqual([expect.objectContaining({ went: false })]);
    expect(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.suffer === 'sacrifice_resources')).toHaveLength(1);
  });

  it('the mirror\'s write to the ally\'s sheet is not posted as the ally speaking', async () => {
    await sacrificeResources(kira, 1);
    await settled();

    // The mirror ran: the crew shares one supply.
    expect(dax.system.supply.value).toBe(2);
    // The system logged the module's change to Dax's sheet…
    const forDax = posted.filter(p => p.sheet === 'pc-dax');
    expect(forDax).toHaveLength(1);
    // …and it is not a line Dax says: re-spoken as a note, or not posted at all.
    const spokenByDax = forDax.filter(p => p.went && p.data.speaker?.actor === 'pc-dax').map(p => p.data.content);
    expect(spokenByDax).toEqual([]);
  });
});
