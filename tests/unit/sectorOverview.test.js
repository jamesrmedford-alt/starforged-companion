/**
 * Phase 3.5: sector-record overview rewrite + live updateActor sync.
 *
 * The overview's `<h3>Settlements</h3>` block lives inside a sector-record
 * JournalEntry that also holds the narrator-stub paragraph. Surgical
 * replacement (via marker comments or a regex fallback) lets us update the
 * settlements list without touching the rest.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildSettlementsListHtml,
  rewriteSectorOverviewSettlements,
  cleanupSectorRecordPages,
  registerSectorOverviewSync,
  _flushPendingRewrites,
} from "../../src/sectors/sectorOverview.js";

const MODULE = "starforged-companion";

// In-memory journal/actor harness — Phase 2's setup added Actor.create and
// Folder.create but the journal collection is still the basic
// JournalEntry.create stub. We need a writable collection that supports
// iteration and journal-side page mutation for these tests.
function installRichJournalMock() {
  const items = [];
  const stash = items;
  const previous = global.game.journal;
  global.game.journal = {
    get:    (id) => stash.find(j => j.id === id) ?? null,
    getName:(n)  => stash.find(j => j.name === n) ?? null,
    find:   (fn) => stash.find(fn) ?? null,
    [Symbol.iterator]() { return stash[Symbol.iterator](); },
    _items: stash,
    _add:   (j) => stash.push(j),
  };
  return () => { global.game.journal = previous; };
}

function makeSectorRecordJournal(sectorId, sectorName, overviewContent) {
  const overviewPage = makePage({
    name: sectorName,
    text: { content: overviewContent, format: 1 },
  });
  const pages = [overviewPage];
  const journal = {
    id:    `journal-sector-${sectorId}`,
    name:  `${sectorName} — Sector Record`,
    flags: { [MODULE]: { sectorRecord: true, sectorId } },
    pages: {
      get contents() { return pages; },
      find: (fn) => pages.find(fn),
    },
    _addPage: (p) => pages.push(p),
  };
  return { journal, overviewPage, pages };
}

function makePage(seed) {
  const page = {
    id:   `page-${Math.random().toString(36).slice(2, 8)}`,
    name: seed.name,
    text: { ...seed.text },
    update: async (changes) => {
      for (const [path, val] of Object.entries(changes)) {
        const parts = path.split(".");
        let cur = page;
        for (let i = 0; i < parts.length - 1; i += 1) cur = cur[parts[i]];
        cur[parts[parts.length - 1]] = val;
      }
    },
    delete: async () => {
      page._deleted = true;
    },
  };
  return page;
}

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset();
});

describe("buildSettlementsListHtml", () => {
  it("emits UUID document links when the actor map carries an entry", () => {
    const sector = {
      settlements: [
        { id: "g1", name: "Bleakhold", locationType: "planetside", population: "Thousands", authority: "Notorious" },
      ],
    };
    const actor = { id: "actor-1", name: "Bleakhold" };
    const html  = buildSettlementsListHtml(sector, { g1: actor });
    expect(html).toContain("@UUID[Actor.actor-1]{Bleakhold}");
    expect(html).toMatch(/<!-- sf:settlements-list -->[\s\S]*<!-- \/sf:settlements-list -->/);
  });

  it("falls back to a plain name when no actor is provided", () => {
    const sector = {
      settlements: [
        { id: "g1", name: "Floater", locationType: "orbital", population: "Hundreds", authority: "Strict" },
      ],
    };
    const html = buildSettlementsListHtml(sector, {});
    expect(html).not.toContain("@UUID");
    expect(html).toContain("<li>Floater — Orbital, Pop: Hundreds, Authority: Strict</li>");
  });
});

describe("rewriteSectorOverviewSettlements — surgical replacement", () => {
  let restore;
  afterEach(() => { restore?.(); });

  it("replaces the marker-wrapped block when present, preserving the narrator stub", async () => {
    restore = installRichJournalMock();
    const sectorId   = "sec-1";
    const sectorName = "Sigma Draconis";
    const initialContent = `<h2>${sectorName}</h2>
<p class="narrator-stub">A grim stretch of frontier...</p>
<h3>Settlements</h3>
<!-- sf:settlements-list --><ul><li>OLD ENTRY</li></ul><!-- /sf:settlements-list -->
<h3>Passages</h3>
<p>1 passage charted.</p>`;
    const { journal, overviewPage } = makeSectorRecordJournal(sectorId, sectorName, initialContent);
    global.game.journal._add(journal);

    // Seed the settlement Actor that the gen→host map points at
    global.game.actors._set("actor-A", global.makeTestActor({
      id: "actor-A", type: "location", name: "Bleakhold",
      flags: { [MODULE]: { settlement: { name: "Bleakhold" } } },
    }));

    const campaignState = { sectors: [{
      id: sectorId, name: sectorName,
      settlements: [{ id: "g1", name: "Bleakhold", locationType: "planetside", population: "Thousands", authority: "Notorious" }],
      entityJournalIds: { g1: "actor-A" },
    }]};

    const ok = await rewriteSectorOverviewSettlements(sectorId, campaignState);
    expect(ok).toBe(true);
    expect(overviewPage.text.content).toContain("A grim stretch of frontier");  // stub preserved
    expect(overviewPage.text.content).toContain("@UUID[Actor.actor-A]{Bleakhold}");
    expect(overviewPage.text.content).not.toContain("OLD ENTRY");
    expect(overviewPage.text.content).toContain("1 passage charted");           // passages preserved
  });

  it("uses the heuristic <h3>Settlements</h3><ul>...</ul> when no markers exist", async () => {
    restore = installRichJournalMock();
    const sectorId   = "sec-2";
    const sectorName = "Pelican Reach";
    // Legacy page content from before Phase 3.5 — no marker comments
    const initialContent = `<h2>${sectorName}</h2>
<p class="narrator-stub">A trader's haven.</p>
<h3>Settlements</h3>
<ul><li>Outpost 7 — Orbital, Pop: Few</li></ul>
<h3>Passages</h3>
<p>2 passages charted.</p>`;
    const { journal, overviewPage } = makeSectorRecordJournal(sectorId, sectorName, initialContent);
    global.game.journal._add(journal);

    global.game.actors._set("actor-B", global.makeTestActor({
      id: "actor-B", type: "location", name: "Outpost 7",
      flags: { [MODULE]: { settlement: { name: "Outpost 7" } } },
    }));

    const campaignState = { sectors: [{
      id: sectorId, name: sectorName,
      settlements: [{ id: "g7", name: "Outpost 7", locationType: "orbital", population: "Few", authority: "None" }],
      entityJournalIds: { g7: "actor-B" },
    }]};

    const ok = await rewriteSectorOverviewSettlements(sectorId, campaignState);
    expect(ok).toBe(true);
    expect(overviewPage.text.content).toContain("@UUID[Actor.actor-B]{Outpost 7}");
    expect(overviewPage.text.content).toContain("A trader's haven");
    expect(overviewPage.text.content).toContain("2 passages charted");
  });

  it("follows the migrated.toActorId pointer on a legacy journal", async () => {
    restore = installRichJournalMock();
    const sectorId   = "sec-3";
    const sectorName = "Kuiper Belt";
    const content = `<h3>Settlements</h3>
<!-- sf:settlements-list --><ul></ul><!-- /sf:settlements-list -->`;
    const { journal, overviewPage } = makeSectorRecordJournal(sectorId, sectorName, content);
    global.game.journal._add(journal);

    // Legacy settlement journal — migrated, not yet deleted, still resident
    // in the world. Carries a migrated.toActorId pointer to the new Actor.
    const legacy = {
      id:    "j-legacy",
      name:  "Outerward",
      flags: { [MODULE]: { migrated: { toActorId: "actor-C", at: new Date().toISOString() } } },
      pages: { contents: [] },
    };
    global.game.journal._add(legacy);
    global.game.actors._set("actor-C", global.makeTestActor({
      id: "actor-C", type: "location", name: "Outerward",
      flags: { [MODULE]: { settlement: { name: "Outerward" } } },
    }));

    const campaignState = { sectors: [{
      id: sectorId, name: sectorName,
      settlements: [{ id: "g-out", name: "Outerward", locationType: "deep_space", population: "Dozens", authority: "Notorious" }],
      entityJournalIds: { "g-out": "j-legacy" },   // still pointing at the legacy id
    }]};

    const ok = await rewriteSectorOverviewSettlements(sectorId, campaignState);
    expect(ok).toBe(true);
    expect(overviewPage.text.content).toContain("@UUID[Actor.actor-C]{Outerward}");
  });

  it("returns false when no rewrite is needed (idempotent)", async () => {
    restore = installRichJournalMock();
    const sectorId   = "sec-4";
    const sectorName = "Idle Reach";
    // Already in the canonical form for the seeded data.
    const content = `<h3>Settlements</h3>
<!-- sf:settlements-list --><ul><li>@UUID[Actor.actor-D]{Stable} — Orbital, Pop: Few, Authority: None</li></ul><!-- /sf:settlements-list -->`;
    const { journal, overviewPage } = makeSectorRecordJournal(sectorId, sectorName, content);
    global.game.journal._add(journal);

    global.game.actors._set("actor-D", global.makeTestActor({
      id: "actor-D", type: "location", name: "Stable",
      flags: { [MODULE]: { settlement: { name: "Stable" } } },
    }));

    const campaignState = { sectors: [{
      id: sectorId, name: sectorName,
      settlements: [{ id: "g-d", name: "Stable", locationType: "orbital", population: "Few", authority: "None" }],
      entityJournalIds: { "g-d": "actor-D" },
    }]};

    const before = overviewPage.text.content;
    const result = await rewriteSectorOverviewSettlements(sectorId, campaignState);
    expect(result).toBe(false);
    expect(overviewPage.text.content).toBe(before);
  });
});

describe("cleanupSectorRecordPages", () => {
  let restore;
  afterEach(() => { restore?.(); });

  it("deletes every embedded page except the overview", async () => {
    restore = installRichJournalMock();
    const sectorId   = "sec-X";
    const sectorName = "Cinder Belt";
    const { journal, overviewPage } = makeSectorRecordJournal(sectorId, sectorName, "<h2>Cinder Belt</h2>");

    const extra1 = makePage({ name: "Outpost A", text: { content: "<p>legacy settlement page</p>", format: 1 } });
    const extra2 = makePage({ name: "Outpost B", text: { content: "<p>legacy settlement page</p>", format: 1 } });
    journal._addPage(extra1);
    journal._addPage(extra2);
    global.game.journal._add(journal);

    const deleted = await cleanupSectorRecordPages(sectorId, {
      sectors: [{ id: sectorId, name: sectorName }],
    });
    expect(deleted).toBe(2);
    expect(extra1._deleted).toBe(true);
    expect(extra2._deleted).toBe(true);
    expect(overviewPage._deleted).toBeUndefined();
  });
});

describe("registerSectorOverviewSync — live updateActor hook", () => {
  let restore;
  let registeredHandler = null;

  beforeEach(() => {
    registeredHandler = null;
    global.Hooks = {
      on: (name, fn) => {
        if (name === "updateActor") registeredHandler = fn;
      },
    };
  });

  afterEach(() => { restore?.(); });

  it("rewrites the overview when a settlement actor is renamed", async () => {
    restore = installRichJournalMock();
    const sectorId   = "sec-live";
    const sectorName = "Live Reach";
    const initialContent = `<h3>Settlements</h3>
<!-- sf:settlements-list --><ul><li>@UUID[Actor.actor-L]{Old Name} — Orbital, Pop: Few, Authority: None</li></ul><!-- /sf:settlements-list -->`;
    const { journal, overviewPage } = makeSectorRecordJournal(sectorId, sectorName, initialContent);
    global.game.journal._add(journal);

    const actor = global.makeTestActor({
      id: "actor-L", type: "location", name: "New Name",
      flags: { [MODULE]: { settlement: { name: "New Name", sectorId } } },
    });
    global.game.actors._set("actor-L", actor);

    // Seed campaignState so rewriteSectorOverviewSettlements can find it
    global.game.settings.get = () => ({
      sectors: [{
        id: sectorId, name: sectorName,
        settlements: [{ id: "g-l", name: "New Name", locationType: "orbital", population: "Few", authority: "None" }],
        entityJournalIds: { "g-l": "actor-L" },
      }],
    });

    registerSectorOverviewSync();
    expect(registeredHandler).toBeTruthy();
    // Simulate a rename
    registeredHandler(actor, { name: "New Name" });
    // Drain the debounce
    await _flushPendingRewrites();

    expect(overviewPage.text.content).toContain("@UUID[Actor.actor-L]{New Name}");
    expect(overviewPage.text.content).not.toContain("Old Name");
  });

  it("ignores updates that don't touch a rendered field (e.g. flag changes elsewhere)", async () => {
    restore = installRichJournalMock();
    const sectorId   = "sec-ignore";
    const sectorName = "Quiet Reach";
    const initialContent = `<h3>Settlements</h3>
<!-- sf:settlements-list --><ul><li>existing</li></ul><!-- /sf:settlements-list -->`;
    const { journal, overviewPage } = makeSectorRecordJournal(sectorId, sectorName, initialContent);
    global.game.journal._add(journal);
    const before = overviewPage.text.content;

    const actor = global.makeTestActor({
      id: "actor-Q", type: "location", name: "Quiet",
      flags: { [MODULE]: { settlement: { name: "Quiet", sectorId } } },
    });

    registerSectorOverviewSync();
    // A meter-tick-style change: nothing visible in the overview should fire.
    registeredHandler(actor, { system: { momentum: { value: 4 } } });
    await _flushPendingRewrites();

    expect(overviewPage.text.content).toBe(before);
  });

  it("skips non-location actor types (a starship rename doesn't trigger anything)", async () => {
    restore = installRichJournalMock();
    const ship = global.makeTestActor({
      id: "actor-S", type: "starship", name: "Renamed Ship",
      flags: { [MODULE]: { ship: { name: "Renamed Ship" } } },
    });

    registerSectorOverviewSync();
    // Should not throw or schedule any rewrite for a starship rename
    registeredHandler(ship, { name: "Renamed Ship" });
    await _flushPendingRewrites();
    // No assertion needed — just verifying no error and no scheduled work
  });
});
