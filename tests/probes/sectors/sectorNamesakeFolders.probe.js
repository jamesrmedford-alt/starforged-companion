/**
 * PROBE — SEC-D2 SECTOR-NAMESAKE-FOLDERS  (needs a decision)
 * (src/entities/folder.js getOrCreateSectorActorFolder lines 161–169,
 *  getOrCreateSectorNpcActorFolder 182–190, getOrCreateSectorJournalFolder
 *  201–209 — the per-sector folders are keyed by the sector's NAME;
 *  src/index.js handleSectorCommand lines 6352–6354 — `!sector <name>`
 *  switches to the first sector whose name matches;
 *  src/sectors/sectorOverview.js findOverviewPage 337–345 by name)
 *
 * What the user does: creates a second sector whose rolled name equals an
 * earlier one's (generateSectorName rolls prefix × suffix with no check
 * against the stored sectors; a GM can also rename a Scene / record to an
 * existing name).
 *
 * What happens: both sectors' settlements, sites and NPCs land in the first
 * sector's Actor folders (`Sectors / <name>`, `Sectors / <name> / NPCs`) and
 * both Sector Records in its Journal folder; `!sector <name>` can only ever
 * switch to the older one, and `!sector list` shows two identical lines.
 * Identity by mutable display name (rules/reachability.md §6) where every
 * other sector lookup is by `sector.id`.
 *
 * The decision: (A) key the per-sector folders by sector id (a folder flag;
 * the name as the label) and let `!sector` take an id or disambiguate; or
 * (B) never mint a namesake — the creation pipeline re-rolls / numbers a
 * sector name already stored, as precursorSites dedupes site names within a
 * sector.
 *
 * The probe asserts (A)'s shape for the folders; under (B) it is replaced by
 * a creation-time test.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sectors/sectorNamesakeFolders.probe.js
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  getOrCreateSectorActorFolder,
  getOrCreateSectorJournalFolder,
  _resetFolderCache,
} from "../../../src/entities/folder.js";

beforeEach(() => {
  game.folders._reset?.();
  _resetFolderCache();
});

describe("PROBE SEC-D2 — two sectors with one name keep their own folders", () => {
  const state = { sectors: [{ id: "sec-1", name: "Vega Reach" }, { id: "sec-2", name: "Vega Reach" }] };

  it("two same-named sectors get distinct Actor folders", async () => {
    const a = await getOrCreateSectorActorFolder("sec-1", state);
    const b = await getOrCreateSectorActorFolder("sec-2", state);
    // Expected: distinct folders (keyed by id). Today: the same folder.
    expect(a).toBeTruthy();
    expect(b).not.toBe(a);
  });

  it("two same-named sectors get distinct Journal folders", async () => {
    const a = await getOrCreateSectorJournalFolder("sec-1", state);
    const b = await getOrCreateSectorJournalFolder("sec-2", state);
    expect(a).toBeTruthy();
    expect(b).not.toBe(a);
  });

  it("control: two differently named sectors get distinct folders, and the same sector the same folder", async () => {
    const two = { sectors: [{ id: "sec-1", name: "Vega Reach" }, { id: "sec-2", name: "Cinder Drift" }] };
    const a  = await getOrCreateSectorActorFolder("sec-1", two);
    const b  = await getOrCreateSectorActorFolder("sec-2", two);
    const a2 = await getOrCreateSectorActorFolder("sec-1", two);
    expect(b).not.toBe(a);
    expect(a2).toBe(a);
  });
});
