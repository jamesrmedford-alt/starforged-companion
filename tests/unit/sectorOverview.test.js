/**
 * Phase 3.5: sector-record overview rewrite + live updateActor sync.
 *
 * The overview's `<h3>Settlements</h3>` block lives inside a sector-record
 * JournalEntry that also holds the narrator-stub paragraph. Surgical
 * replacement (via marker comments or a regex fallback) lets us update the
 * settlements list without touching the rest.
 *
 * Fixtures use the shape storeSector actually persists to
 * campaignState.sectors[] — `mapData.settlements` + `entityJournalIds`, never a
 * `settlements` array (issue #321 U13: the rewrite read `sector.settlements`,
 * which the stored record never has, and wrote an empty list over the real one
 * — hidden by fixtures that hand-built that array). The "real generate → store
 * chain" block runs the production producers end to end.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("../../src/entities/finalize.js", () => ({ finalizeEntityArtOnly: vi.fn() }));
// storeSector records the sector trouble as a World Journal threat — not the
// subject here, and the journal harness below is not a World Journal.
vi.mock("../../src/world/worldJournal.js", async () => {
  const actual = await vi.importActual("../../src/world/worldJournal.js");
  return { ...actual, recordThreat: vi.fn(async () => null) };
});

import {
  buildSettlementsListHtml,
  rewriteSectorOverviewSettlements,
  cleanupSectorRecordPages,
  registerSectorOverviewSync,
  _flushPendingRewrites,
} from "../../src/sectors/sectorOverview.js";
import {
  generateSector,
  createEntityJournals,
  createSectorJournal,
  storeSector,
} from "../../src/sectors/sectorGenerator.js";
import { _resetFolderCache } from "../../src/entities/folder.js";

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

/**
 * A settlement Actor as createSettlement writes it: `system.klass` (what the
 * sheet edits) and the full record on `flags.settlement`.
 */
function settlementActor({ id, name, klass = "orbital", location = "Orbital", population = "", authority = "", sectorId = null }) {
  const actor = global.makeTestActor({
    id, type: "location", name,
    system: { subtype: "settlement", klass },
    flags: { [MODULE]: { entityType: "settlement", settlement: { name, location, population, authority, sectorId } } },
  });
  global.game.actors._set(id, actor);
  return actor;
}

/**
 * A sector record in the shape storeSector persists: settlement rows live on
 * mapData.settlements (id, name, marker type) and entityJournalIds maps each
 * generator id to its settlement Actor.
 */
function storedSector({ id, name, settlements }) {
  return {
    id, name,
    mapData: { settlements: settlements.map(s => ({ id: s.genId, name: s.name, type: s.type ?? "orbital", gridX: 1, gridY: 1 })) },
    entityJournalIds: Object.fromEntries(settlements.map(s => [s.genId, s.actorId])),
    settlementIds: settlements.map(s => s.actorId),
  };
}

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset();
  global.game.settings._store.clear();
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
    expect(html).toContain("@UUID[Actor.actor-1]{Bleakhold} — Planetside, Pop: Thousands, Authority: Notorious");
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

  it("lists a stored sector record from its map data, each row from the settlement Actor", () => {
    const a = settlementActor({ id: "actor-A", name: "Bleakhold", klass: "planetside", location: "Planetside", population: "Thousands", authority: "Notorious" });
    const b = settlementActor({ id: "actor-B", name: "Floater", klass: "deep space", location: "Deep Space", population: "Few", authority: "None" });
    const sector = storedSector({ id: "sec", name: "Reach", settlements: [
      { genId: "g1", actorId: "actor-A", name: "Bleakhold", type: "planetside" },
      { genId: "g2", actorId: "actor-B", name: "Floater",   type: "deep_space" },
    ] });
    expect(sector.settlements).toBeUndefined();   // the persisted shape carries no settlements array

    const html = buildSettlementsListHtml(sector, { g1: a, g2: b });
    expect(html).toContain("<li>@UUID[Actor.actor-A]{Bleakhold} — Planetside, Pop: Thousands, Authority: Notorious</li>");
    expect(html).toContain("<li>@UUID[Actor.actor-B]{Floater} — Deep Space, Pop: Few, Authority: None</li>");
  });

  it("shows the Actor's current name, class, population and authority over the generated values", () => {
    const actor = settlementActor({ id: "actor-A", name: "Bleak Hold Station", klass: "orbital", location: "Orbital", population: "Tens of thousands", authority: "Corrupt" });
    const sector = {
      settlements: [{ id: "g1", name: "Bleakhold", locationType: "planetside", population: "Few", authority: "None" }],
    };
    const html = buildSettlementsListHtml(sector, { g1: actor });
    expect(html).toContain("@UUID[Actor.actor-A]{Bleak Hold Station} — Orbital, Pop: Tens of thousands, Authority: Corrupt");
  });

  it("keeps a map row whose settlement Actor is gone, as a plain name", () => {
    const sector = storedSector({ id: "sec", name: "Reach", settlements: [
      { genId: "g1", actorId: "actor-gone", name: "Lost Haven", type: "orbital" },
    ] });
    expect(buildSettlementsListHtml(sector, {})).toContain("<li>Lost Haven — Orbital, Pop: , Authority: </li>");
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
    settlementActor({ id: "actor-A", name: "Bleakhold", klass: "planetside", location: "Planetside", population: "Thousands", authority: "Notorious" });

    const campaignState = { sectors: [storedSector({ id: sectorId, name: sectorName, settlements: [
      { genId: "g1", actorId: "actor-A", name: "Bleakhold", type: "planetside" },
    ] })] };

    const ok = await rewriteSectorOverviewSettlements(sectorId, campaignState);
    expect(ok).toBe(true);
    expect(overviewPage.text.content).toContain("A grim stretch of frontier");  // stub preserved
    expect(overviewPage.text.content).toContain("@UUID[Actor.actor-A]{Bleakhold} — Planetside, Pop: Thousands, Authority: Notorious");
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

    settlementActor({ id: "actor-B", name: "Outpost 7", population: "Few", authority: "None" });

    const campaignState = { sectors: [storedSector({ id: sectorId, name: sectorName, settlements: [
      { genId: "g7", actorId: "actor-B", name: "Outpost 7" },
    ] })] };

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
    settlementActor({ id: "actor-C", name: "Outerward", klass: "deep space", location: "Deep Space", population: "Dozens", authority: "Notorious" });

    const campaignState = { sectors: [storedSector({ id: sectorId, name: sectorName, settlements: [
      { genId: "g-out", actorId: "j-legacy", name: "Outerward", type: "deep_space" },   // still pointing at the legacy id
    ] })] };

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

    settlementActor({ id: "actor-D", name: "Stable", population: "Few", authority: "None" });

    const campaignState = { sectors: [storedSector({ id: sectorId, name: sectorName, settlements: [
      { genId: "g-d", actorId: "actor-D", name: "Stable" },
    ] })] };

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

    const actor = settlementActor({ id: "actor-L", name: "New Name", population: "Few", authority: "None", sectorId });

    // The stored campaignState rewriteSectorOverviewSettlements reads
    global.game.settings._store.set(`${MODULE}.campaignState`, {
      sectors: [storedSector({ id: sectorId, name: sectorName, settlements: [
        { genId: "g-l", actorId: "actor-L", name: "Old Name" },
      ] })],
    });

    registerSectorOverviewSync();
    expect(registeredHandler).toBeTruthy();
    // Simulate a rename
    registeredHandler(actor, { name: "New Name" });
    // Drain the debounce
    await _flushPendingRewrites();

    expect(overviewPage.text.content).toContain("@UUID[Actor.actor-L]{New Name} — Orbital, Pop: Few, Authority: None");
    expect(overviewPage.text.content).not.toContain("Old Name");
  });

  it("a GM's edit to the Actor's class, population or authority shows in its row", async () => {
    restore = installRichJournalMock();
    const sectorId   = "sec-edit";
    const sectorName = "Edited Reach";
    const { journal, overviewPage } = makeSectorRecordJournal(sectorId, sectorName,
      `<h3>Settlements</h3>
<!-- sf:settlements-list --><ul><li>@UUID[Actor.actor-E]{Hold} — Orbital, Pop: Few, Authority: None</li></ul><!-- /sf:settlements-list -->`);
    global.game.journal._add(journal);
    const actor = settlementActor({ id: "actor-E", name: "Hold", population: "Few", authority: "None", sectorId });
    global.game.settings._store.set(`${MODULE}.campaignState`, {
      sectors: [storedSector({ id: sectorId, name: sectorName, settlements: [
        { genId: "g-e", actorId: "actor-E", name: "Hold" },
      ] })],
    });
    registerSectorOverviewSync();

    // The sheet's settlement-type dropdown edits system.klass; the record holds the rest.
    actor.system.klass = "planetside";
    actor.flags[MODULE].settlement.population = "Thousands";
    actor.flags[MODULE].settlement.authority  = "Martial law";
    registeredHandler(actor, { system: { klass: "planetside" } });
    await _flushPendingRewrites();

    expect(overviewPage.text.content).toContain("@UUID[Actor.actor-E]{Hold} — Planetside, Pop: Thousands, Authority: Martial law");
  });

  it("leaves the overview to the canonical GM — a player's or second GM's client does not rewrite it", async () => {
    restore = installRichJournalMock();
    const sectorId   = "sec-gate";
    const sectorName = "Gated Reach";
    const initialContent = `<h3>Settlements</h3>
<!-- sf:settlements-list --><ul><li>@UUID[Actor.actor-G]{Old Name}</li></ul><!-- /sf:settlements-list -->`;
    const { journal, overviewPage } = makeSectorRecordJournal(sectorId, sectorName, initialContent);
    global.game.journal._add(journal);
    const actor = settlementActor({ id: "actor-G", name: "New Name", sectorId });
    global.game.settings._store.set(`${MODULE}.campaignState`, {
      sectors: [storedSector({ id: sectorId, name: sectorName, settlements: [
        { genId: "g-g", actorId: "actor-G", name: "Old Name" },
      ] })],
    });
    registerSectorOverviewSync();

    for (const user of [{ id: "pl-1", isGM: false }, { id: "gm-2", isGM: true }]) {
      global.game.users._set([{ id: "gm-1", isGM: true, active: true }, { ...user, active: true }]);
      const undo = withUser(user);
      try {
        registeredHandler(actor, { name: "New Name" });
        await _flushPendingRewrites();
      } finally {
        undo();
      }
      expect(overviewPage.text.content, user.id).toContain("{Old Name}");
    }
    global.game.users._set([{ id: "test-user-gm", isGM: true, active: true }]);
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

    const actor = settlementActor({ id: "actor-Q", name: "Quiet", sectorId });

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

// ─────────────────────────────────────────────────────────────────────────────
// The real generate → store chain (issue #321 U13) — the record the rewrite
// reads comes from storeSector, the overview page from createSectorJournal.
// ─────────────────────────────────────────────────────────────────────────────

describe("the overview of a sector the creator stored (real generate → store chain)", () => {
  let restoreJournal;
  let prevCreate;

  // A journal collection + JournalEntry.create that keep their pages, so the
  // real createSectorJournal writes a real overview page we can read back.
  beforeEach(() => {
    _resetFolderCache();
    restoreJournal = installRichJournalMock();
    prevCreate = global.JournalEntry.create;
    global.JournalEntry.create = async (data) => {
      const pages = [];
      const journal = {
        id:    foundry.utils.randomID(),
        name:  data.name,
        flags: data.flags ?? {},
        pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
        createEmbeddedDocuments: async (_type, docs) => docs.map(d => {
          const page = makePage({ name: d.name, text: d.text ?? {} });
          pages.push(page);
          return page;
        }),
      };
      global.game.journal._add(journal);
      return journal;
    };
  });
  afterEach(() => {
    global.JournalEntry.create = prevCreate;
    restoreJournal?.();
  });

  async function buildRealSector() {
    const sector = generateSector("outlands");
    // runSectorCreationPipeline hands createEntityJournals the setting's object.
    const campaignState = { sectors: [], settlementIds: [], connectionIds: [], locationIds: [] };
    global.game.settings._store.set(`${MODULE}.campaignState`, campaignState);

    const entityData = await createEntityJournals(sector, campaignState);
    const journal    = await createSectorJournal(sector, { sector: "A grim stretch of frontier.", settlements: {} }, entityData.settlements);
    await storeSector(sector, {
      settlements:         entityData.settlements,
      connectionJournalId: entityData.connectionJournalId,
      sites:               entityData.sites,
      sceneId:             null,
      sectorJournalId:     journal?.id ?? null,
      stubs:               { sector: null, settlements: {} },
    }, campaignState);

    const page   = journal.pages.contents[0];
    const actors = Object.values(entityData.settlements).filter(Boolean);
    return { sector, page, actors };
  }

  it("a rewrite of the stored record still lists every settlement", async () => {
    const { sector, page, actors } = await buildRealSector();
    expect(actors).toHaveLength(3);
    // The freshly created overview links each settlement Actor.
    for (const a of actors) expect(page.text.content).toContain(`@UUID[Actor.${a.id}]`);

    const stored = global.game.settings.get(MODULE, "campaignState");
    expect(stored.sectors.find(s => s.id === sector.id).settlements).toBeUndefined();
    await rewriteSectorOverviewSettlements(sector.id, stored);

    for (const a of actors) expect(page.text.content).toContain(`@UUID[Actor.${a.id}]{${a.name}}`);
    expect(page.text.content).not.toMatch(/<!-- sf:settlements-list --><ul><\/ul>/);
  });

  it("renaming a settlement Actor (the live updateActor sync) keeps the list, renamed", async () => {
    const { page, actors } = await buildRealSector();
    const handlers = [];
    const prevHooks = global.Hooks;
    global.Hooks = { on: (name, fn) => { if (name === "updateActor") handlers.push(fn); } };
    try {
      registerSectorOverviewSync();
    } finally {
      global.Hooks = prevHooks;
    }

    const target = actors[0];
    target.name = "Bleak Hold Station";                // the GM renames the Actor on its sheet
    for (const fn of handlers) fn(target, { name: "Bleak Hold Station", _id: target.id });
    await _flushPendingRewrites();

    expect(page.text.content).toContain(`@UUID[Actor.${target.id}]{Bleak Hold Station}`);
    for (const a of actors.slice(1)) expect(page.text.content).toContain(`@UUID[Actor.${a.id}]{${a.name}}`);
  });
});
