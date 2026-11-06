/**
 * Eleventh audit — multiplayer probe (MP-4).
 *
 * The Round window's banners say whether a GM, and a GM with a Claude key, is
 * connected (src/batch/roundView.js ROUND_NOTICES.noGm / noKeyedGm), read
 * live in _prepareContext (src/ui/roundWindow.js: `gmConnected`, `keyedGm`).
 * But the window re-renders only when the round, the Batch Mode switch, the
 * draft or campaignState change (registerRoundWindowHooks) — not when a user
 * connects or leaves, nor when the keyed-GM registry changes. So:
 *
 *   - the GM drops: no player's window says "No GM is connected"; a player
 *     who writes and submits learns it only from the refusal;
 *   - the GM comes back: every window that did show it keeps "No GM is
 *     connected — your action is kept here, and is sent once a GM joins"
 *     until some round or campaignState write — and nothing is sent: an
 *     action submitted while the GM was away was refused (requestGmAction
 *     "no-gm"), and the window never re-sends it.
 *
 * Correct: the window re-renders when GM presence changes, so its banner
 * says what is true now.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { ROUND_NOTICES } from '../../../src/batch/roundView.js';

let table;
const round = () => table.world.getSetting('batchMode.round');

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => '{}' });
  silenceConsoleErrors();
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
});

/** Pat's Round window (opened by the round), its renders recorded as the window would show them. */
async function patsWindow() {
  const c = table.client('pl-1');
  const mod = await c.import('../../src/ui/roundWindow.js');
  const app = await c.run(() => mod.RoundWindowApp.open());
  const banners = [];
  app.rendered = true;
  app.render = async function render() {
    const ctx = await c.run(() => this._prepareContext({}));
    banners.push(ctx.view.banners.map(b => b.text));
    return this;
  };
  return { app, banners, c };
}

describe('MP-4 — the Round window\'s GM banners follow the GMs', () => {
  it('control: rendered now, with no GM connected, the window says so', async () => {
    expect(round()).toMatchObject({ phase: 'collecting' });
    const { app, banners } = await patsWindow();
    await table.leave('gm-1');
    try {
      await app.render();
      expect(banners.at(-1)).toContain(ROUND_NOTICES.noGm);
    } finally {
      await table.join('gm-1');
    }
  }, 30_000);

  it('the GM leaves: Pat\'s open window says no GM is connected', async () => {
    const { banners } = await patsWindow();
    await table.leave('gm-1');
    try {
      // Correct: a render follows the GM's departure. Today none does.
      expect(banners.flat()).toContain(ROUND_NOTICES.noGm);
    } finally {
      await table.join('gm-1');
    }
  }, 30_000);

  it('the GM comes back: the "No GM is connected" banner goes', async () => {
    const { app, banners } = await patsWindow();
    await table.leave('gm-1');
    await app.render();
    expect(banners.at(-1)).toContain(ROUND_NOTICES.noGm);
    await table.join('gm-1');
    await table.settle();
    await table.drain();
    // Correct: the window re-renders without it. Today the last render still
    // says "No GM is connected — your action is kept here, and is sent once a
    // GM joins".
    expect(banners.at(-1)).not.toContain(ROUND_NOTICES.noGm);
  }, 30_000);
});
