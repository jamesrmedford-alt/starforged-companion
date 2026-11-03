// tests/probes/narration/paceRefusedWriteClaimsSet.probe.js
//
// PROBE (eighth audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// NR PACE-CACHED-MUTATION — `!pace` (and `!roll`) change the cached
// campaignState before the write, and report success when the write is refused.
//
// What the user does: the GM types `!pace hot`; the world refuses the write (a
// server error, a dropped connection — rules/foundry-api.md).
//
// What happens: handlePaceCommand (src/index.js) passes the cached value of
// game.settings.get to applyPaceCommand (src/pacing/router.js), which sets
// `campaignState.pacing.sceneOverride` on it and then calls persist(); persist
// catches the refusal with a console warning, and applyPaceCommand returns
// { status: "Pacing override set to **hot** (+3).", persisted: true }, which
// the card posts. The GM's client now classifies every input at +3 while the
// world (and any other GM client, and the next reload) has no override — the
// U58 shape (issue #321) at a site it did not list. markForceNextAsMove
// (`!roll`) and clearForceMove do the same with `pacing.forceNextAsMove`.
//
// What should happen: a refused write leaves the cached value as it was and
// the card does not claim the override is set.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyPaceCommand, markForceNextAsMove } from '../../../src/pacing/router.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const cached = () => game.settings.get(MODULE_ID, 'campaignState');

beforeEach(() => {
  game.settings._store.clear();
  game.settings._store.set(KEY, { currentSessionId: 's1', pacing: { sceneOverride: null } });
});

describe('a refused !pace / !roll write changes nothing and says so', () => {
  it('`!pace hot` with the write refused: the cached state keeps no override, and it is not reported set', async () => {
    const refused = vi.spyOn(game.settings, 'set').mockRejectedValueOnce(new Error('The server refused the write'));
    const result = await applyPaceCommand(cached(), 'hot');      // what handlePaceCommand passes
    expect(refused).toHaveBeenCalledTimes(1);

    expect(cached().pacing.sceneOverride).toBeNull();
    expect(result.persisted).toBe(false);
  });

  it('`!roll` with the write refused: the cached state does not force the next input', async () => {
    vi.spyOn(game.settings, 'set').mockRejectedValueOnce(new Error('The server refused the write'));
    await markForceNextAsMove(cached());                          // what handleRollCommand passes
    expect(cached().pacing.forceNextAsMove).not.toBe(true);
  });

  it('control: an accepted write sets the override', async () => {
    const result = await applyPaceCommand(cached(), 'hot');
    expect(cached().pacing.sceneOverride).toEqual({ modifier: 3, label: 'hot' });
    expect(result.persisted).toBe(true);
  });
});
