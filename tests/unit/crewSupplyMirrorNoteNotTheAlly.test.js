/**
 * STARFORGED COMPANION
 * tests/unit/crewSupplyMirrorNoteNotTheAlly.test.js
 *
 * Issue #362 AC77 CREW-SUPPLY-MIRROR-NOTE-SPOKEN-BY-ALLY (an incomplete fix of
 * issue #348 PT14) — two player characters, Kira and Dax, share one supply
 * track (multiplayer/sharedSupply.js). The module takes 1 supply from Kira
 * (Sacrifice Resources); the canonical GM's sync then writes Dax's sheet to
 * the crew's supply. The ironsworn system logs every sheet change to chat
 * ("log-changes", on by default; vendor chat-alert.ts): its preUpdateActor
 * hook, on the client making the update, posts `<em>-1 supply (now 2)</em>`
 * as an emote spoken by the Actor. The mirror wrote Dax with a bare
 * `actor.update`, not through actorBridge's marked write, so the note stood
 * as Dax speaking. It now writes through actorBridge.writeSheetSupply: said
 * by the system (PT14), or not posted inside a quiet write (P2-13).
 *
 * Set up as tests/unit/systemNotesNotThePlayer.test.js sets PT14 up: the
 * system's change log is emulated at its boundary (posted through the real
 * preCreateChatMessage handlers while the update is in flight), and Foundry's
 * preUpdateActor / updateActor dispatch around each sheet write. The suffer
 * executor, the bridge, the shared-supply hook and the attribution hook are
 * the module's own.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

import { applyMeterChanges, registerSystemNoteAttribution } from '../../src/character/actorBridge.js';
import { registerSharedSupplyHook, _resetSharedSupplyForTests } from '../../src/multiplayer/sharedSupply.js';
import { sacrificeResources } from '../../src/moves/sufferExecutor.js';

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
let pendingSyncs;  // the updateActor / createActor handlers' work

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
function livePc(id, name, supply = 3) {
  const actor = globalThis.makeTestActor({ id, name, system: { supply: { value: supply } } });
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

const spokenBy = (id) => posted.filter(p => p.sheet === id && p.went && p.data.speaker?.actor === id).map(p => p.data.content);

describe('issue #362 AC77 — the system\'s change note for the crew-supply mirror is not the ally speaking', () => {
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

    expect(dax.system.supply.value, 'the mirror ran (setup)').toBe(2);
    expect(posted.filter(p => p.sheet === 'pc-dax'), 'the system logged the change to Dax (setup)').toHaveLength(1);
    expect(spokenBy('pc-dax')).toEqual([]);
  });

  it('a player\'s own sheet edit keeps its note; the mirror to the ally is said by the system, the ally named', async () => {
    // Kira's player edits her sheet: no module write is in flight for Kira.
    await kira.update({ 'system.supply.value': 2 });
    await settled();

    expect(spokenBy('pc-kira'), 'the player\'s own edit is theirs (PT14)').toEqual(['<em>-1 supply (now 2)</em>']);
    expect(dax.system.supply.value).toBe(2);
    expect(spokenBy('pc-dax')).toEqual([]);
    const forDax = posted.filter(p => p.sheet === 'pc-dax');
    expect(forDax).toEqual([expect.objectContaining({ went: true })]);
    expect(forDax[0].data.content).toBe('<em>Dax: -1 supply (now 2)</em>');
    expect(forDax[0].data.flags?.[MODULE_ID]?.systemNote).toBe(true);
  });

  it('a PC made mid-session is set to the crew\'s supply, and that note is not the new PC speaking', async () => {
    await kira.update({ 'system.supply.value': 2 });
    await settled();
    posted = [];
    const ren = livePc('pc-ren', 'Ren', 5);
    for (const fn of Hooks._handlers.get('createActor') ?? []) pendingSyncs.push(fn(ren, {}, game.user.id));
    await settled();
    await new Promise(r => setTimeout(r, 0));

    expect(ren.system.supply.value).toBe(2);
    expect(spokenBy('pc-ren')).toEqual([]);
  });
});
