/**
 * STARFORGED COMPANION
 * tests/unit/snapshotCausesNamedByOrder.test.js
 *
 * Issue #364 SNAPSHOT-EVENT-SAME-MS (found while fixing TESTS-FLAKY-UNDER-LOAD).
 *
 * A new world snapshot's log names the events this client reported since the
 * snapshot it replaces (snapshotEvents.js namedSnapshotCauses, issue #362 D3).
 * "Since" was read by the clock — an event counted when it was stamped at or
 * after the replaced snapshot's `takenAt` — so an event reported in the same
 * millisecond as the snapshot that answered it was named again by the next
 * one, and an event stamped earlier by a clock stepped back was dropped. A
 * snapshot taken on this client now marks where it cut the event list
 * (markSnapshotTaken), and the next snapshot names the events after that cut
 * by order. A snapshot taken on another client, or before this page loaded,
 * has no cut here and keeps the clock's reading.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  reportSnapshotEvent, namedSnapshotCauses, markSnapshotTaken, _resetSnapshotEventsForTests,
} from '../../src/narration/snapshotEvents.js';

const iso = (ms) => new Date(ms).toISOString();

beforeEach(() => {
  // A GM's client: marks are a GM's to write. The settings store holds no mark,
  // and the snapshot's own setting is unregistered — on, as in a unit test.
  let events = { events: [] };
  globalThis.game = {
    user: { isGM: true },
    settings: {
      get: (_module, key) => {
        if (key === 'worldSnapshotEvents') return events;
        throw new Error(`setting ${key} is not registered`);
      },
      set: async (_module, key, value) => { if (key === 'worldSnapshotEvents') events = value; return value; },
    },
  };
  _resetSnapshotEventsForTests();
});
afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.game;
});

describe('issue #364 SNAPSHOT-EVENT-SAME-MS — a snapshot taken on this client names the events after its own cut', () => {
  it('an event reported in the same millisecond as the snapshot that answered it is not named again', () => {
    reportSnapshotEvent('plan_made', { now: 1_000 });
    markSnapshotTaken(iso(1_000));                    // the snapshot that answered it, taken in that millisecond
    reportSnapshotEvent('plan_decided', { now: 1_500 });

    const causes = namedSnapshotCauses([], { sinceMs: 1_000, heldTakenAt: iso(1_000) });
    expect(causes).toContain('plan_decided');
    expect(causes).not.toContain('plan_made');
  });

  it('an event stamped before the snapshot by a clock stepped back is still named', () => {
    reportSnapshotEvent('plan_made', { now: 1_000 });
    markSnapshotTaken(iso(1_000));
    reportSnapshotEvent('plan_decided', { now: 900 }); // reported after the snapshot, the clock set back

    expect(namedSnapshotCauses([], { sinceMs: 1_000, heldTakenAt: iso(1_000) })).toContain('plan_decided');
  });
});

describe('issue #364 SNAPSHOT-EVENT-SAME-MS — controls: a snapshot this client did not take keeps the clock', () => {
  it('no cut for the replaced snapshot (another GM\'s, or one from before this page loaded): events from its time on are named', () => {
    reportSnapshotEvent('plan_made', { now: 500 });
    reportSnapshotEvent('plan_decided', { now: 1_500 });

    const causes = namedSnapshotCauses([], { sinceMs: 1_000, heldTakenAt: iso(1_000) });
    expect(causes).toContain('plan_decided');
    expect(causes).not.toContain('plan_made');
  });

  it('a call that names no replaced snapshot reads by the clock, as before', () => {
    reportSnapshotEvent('plan_made', { now: 500 });
    markSnapshotTaken(iso(800));
    reportSnapshotEvent('plan_decided', { now: 1_500 });

    expect(namedSnapshotCauses([], { sinceMs: 1_000 })).toEqual(['plan_decided']);
  });
});
