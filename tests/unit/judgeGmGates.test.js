/**
 * STARFORGED COMPANION
 * tests/unit/judgeGmGates.test.js
 *
 * Issue #399's bug audit, the multiplayer gates of the narration's two
 * checks (the maintainer's call: "address all bugs from audit with
 * recommended choice"):
 *   - N26: a narration is audited where it ran — on the GM whose client
 *     narrated, AA34's gate, as its capture and its judge. The audit
 *     re-checked isCanonicalGM when the reply landed, so a narration that a
 *     lower-id GM joining meanwhile had taken over was audited by no one.
 *   - N27: the judge and the audit agree — a keyed GM who is not canonical
 *     judged a narration it then did not audit — and the Consistency Check
 *     page has one writer, the canonical GM: each GM wrote it from its own
 *     copy, so two GMs, or a stale page, could drop each other's rows. A
 *     co-GM's row goes to it through the GM relay.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/factContinuity/consistencyCheck.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runConsistencyCheck: vi.fn(async () => ({ contradictions: [], dispatched: false })),
}));

import { runConsistencyCheck } from '../../src/factContinuity/consistencyCheck.js';
import { applyNarratorSidecar } from '../../src/narration/narrator.js';
import { logConsistencyDecision } from '../../src/pacing/telemetry.js';
import { GM_RELAY_SOCKET, GM_RELAY_KIND_PREFIX, _resetGmRelayForTests } from '../../src/multiplayer/gmRelay.js';
import { isCanonicalGM } from '../../src/multiplayer/gmGate.js';

const MODULE_ID = 'starforged-companion';
const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const GM_1 = { id: 'gm-1', isGM: true, active: true };
const GM_2 = { id: 'gm-2', isGM: true, active: true };
const PLAYER = { id: 'pl-1', isGM: false, active: true };

function setUsers(users, currentUserId) {
  global.game.users = Object.assign([...users], { get: (id) => users.find(u => u.id === id) ?? null });
  global.game.user = users.find(u => u.id === currentUserId) ?? null;
}

const state = () => ({ currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
  sceneState: { bySubject: {}, sceneId: 'sc-1' } });

beforeEach(() => {
  vi.clearAllMocks();
  game.socket._reset();
  game.settings._store.clear();
  _resetGmRelayForTests();
});

describe('N26: a narration is audited on the GM whose client narrated', () => {
  it('a GM no longer canonical — a lower-id GM joined while it narrated — still audits its narration', () => {
    setUsers([GM_1, GM_2], 'gm-2');
    expect(isCanonicalGM()).toBe(false);
    applyNarratorSidecar(`The lock gives under your hands.${SIDECAR}`, state(), { narrationId: 'nar-n26', mode: 'move_resolution' });
    expect(runConsistencyCheck).toHaveBeenCalledTimes(1);
    expect(runConsistencyCheck.mock.calls[0][2]).toMatchObject({ narrationId: 'nar-n26' });
  });

  it('the canonical GM audits as before, and a player\'s client, narrating on its own key, audits nothing', () => {
    setUsers([GM_1, GM_2], 'gm-1');
    applyNarratorSidecar(`The lock gives under your hands.${SIDECAR}`, state(), { narrationId: 'nar-gm1' });
    expect(runConsistencyCheck).toHaveBeenCalledTimes(1);
    setUsers([GM_1, PLAYER], 'pl-1');
    applyNarratorSidecar(`The lock gives under your hands.${SIDECAR}`, state(), { narrationId: 'nar-pl1' });
    expect(runConsistencyCheck).toHaveBeenCalledTimes(1);
  });
});

describe('N27: the Consistency Check page has one writer, the canonical GM', () => {
  const ROW = { sceneId: 'sc-1', sessionId: 'sess-1', prose: '[obligations move]', contradictions: [], dispatched: false, obligations: 'move' };
  const relayed = () => (game.socket._emitted ?? []).filter(e => e.event === GM_RELAY_SOCKET && e.payload?.kind === `${GM_RELAY_KIND_PREFIX}telemetry.consistency`);

  it('a co-GM\'s row is relayed to the canonical GM — not written from its own copy', async () => {
    setUsers([GM_1, GM_2], 'gm-2');
    await logConsistencyDecision(ROW);
    expect(relayed()).toHaveLength(1);
    expect(relayed()[0].payload.payload).toMatchObject({ obligations: 'move', sceneId: 'sc-1' });
  });

  it('the canonical GM writes it itself; a player neither writes nor relays', async () => {
    setUsers([GM_1, GM_2], 'gm-1');
    await logConsistencyDecision(ROW);
    expect(relayed()).toHaveLength(0);
    setUsers([GM_1, PLAYER], 'pl-1');
    await logConsistencyDecision(ROW);
    expect(relayed()).toHaveLength(0);
  });
});
