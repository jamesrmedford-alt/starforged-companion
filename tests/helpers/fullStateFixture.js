// tests/helpers/fullStateFixture.js
// Shared fixture for cross-dependency tests that exercise both the entity
// records (Phase 1–2) and World Journal entries (Phase 3) at once.
//
// Phase 4 onwards: the combined detection pass routes its output to both
// systems. Tests of the routing rule require fixtures that contain both
// entity records and WJ pages — building them inline in every spec is
// noisy, so this helper centralises the setup.

const MODULE_ID = "starforged-companion";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory journal mock — supports pages, page.setFlag, journal.getName
// ─────────────────────────────────────────────────────────────────────────────

export function makePage(doc) {
  const flags = JSON.parse(JSON.stringify(doc.flags ?? {}));
  const page = {
    id:    `page-${doc.name ?? "unnamed"}-${Math.random().toString(36).slice(2, 8)}`,
    name:  doc.name,
    type:  doc.type ?? "text",
    text:  doc.text ?? null,
    flags,
    setFlag: async (mod, key, val) => {
      page.flags[mod] = page.flags[mod] ?? {};
      page.flags[mod][key] = val;
    },
    getFlag: (mod, key) => page.flags?.[mod]?.[key],
    update:  async (data) => Object.assign(page, data),
    delete:  async () => {},
  };
  return page;
}

export function makeJournal(name) {
  const pages = [];
  const journal = {
    id:    `journal-${name}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    flags: {},
    pages: {
      get contents() { return pages; },
      find: (fn) => pages.find(fn),
    },
    createEmbeddedDocuments: async (_type, docs) => {
      const created = docs.map(d => makePage(d));
      pages.push(...created);
      return created;
    },
    setFlag: async (mod, key, val) => {
      journal.flags[mod] = journal.flags[mod] ?? {};
      journal.flags[mod][key] = val;
    },
    getFlag: (mod, key) => journal.flags?.[mod]?.[key],
  };
  return journal;
}

/**
 * Install a fresh in-memory journal collection on global.game.journal +
 * global.JournalEntry. Returns the collection (Map<name, journal>) so the
 * caller can inspect created pages directly.
 */
export function installJournalMock() {
  const journals = new Map();

  const previous = {
    get:     global.game.journal.get,
    getName: global.game.journal.getName,
    find:    global.game.journal.find,
    journalEntry: global.JournalEntry,
  };

  global.game.journal.get     = (id) => [...journals.values()].find(j => j.id === id) ?? null;
  global.game.journal.getName = (n) => journals.get(n) ?? null;
  global.game.journal.find    = (fn) => [...journals.values()].find(fn) ?? null;

  global.JournalEntry = {
    create: async (data) => {
      const j = makeJournal(data.name);
      journals.set(data.name, j);
      return j;
    },
  };

  return {
    journals,
    restore() {
      global.game.journal.get     = previous.get;
      global.game.journal.getName = previous.getName;
      global.game.journal.find    = previous.find;
      global.JournalEntry         = previous.journalEntry;
    },
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// Synthetic entity records — bypass createConnection's randomized id flow
// so tests can assert against deterministic journal IDs.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add a faction entity record directly to the journal mock.
 *
 * @param {Map} journals
 * @param {Object} data — { name, type, attitude, ... }
 * @returns {{ journalId, internalId }}
 */
export function addFactionEntity(journals, data) {
  const journalId  = `journal-faction-${randomToken()}`;
  const internalId = `fac-${randomToken()}`;
  const flags = {
    [MODULE_ID]: {
      faction: {
        _id:           internalId,
        name:          data.name,
        type:          data.type ?? "Dominion",
        relationship:  data.relationship ?? data.attitude ?? "unknown",
        canonicalLocked: data.canonicalLocked ?? false,
        generativeTier: data.generativeTier ?? [],
        active:        true,
        notes:         data.notes ?? "",
      },
    },
  };
  const journal = makeJournalWithId(journalId, data.name);
  journal.pages.contents.push(makePage({ name: "Faction Data", flags }));
  journals.set(journal.name, journal);
  return { journalId: journal.id, internalId };
}

export function addConnectionEntity(journals, data) {
  const internalId = `conn-${randomToken()}`;
  const flags = {
    [MODULE_ID]: {
      connection: {
        _id:           internalId,
        name:          data.name,
        role:          data.role ?? "",
        rank:          data.rank ?? "dangerous",
        relationshipType: data.relationshipType ?? "neutral",
        active:        true,
        canonicalLocked: data.canonicalLocked ?? false,
        generativeTier: data.generativeTier ?? [],
        history:       data.history ?? [],
      },
    },
  };
  const journal = makeJournalWithId(`journal-conn-${randomToken()}`, data.name);
  journal.pages.contents.push(makePage({ name: "Connection Data", flags }));
  journals.set(journal.name, journal);
  return { journalId: journal.id, internalId };
}

export function addLocationEntity(journals, data) {
  const internalId = `loc-${randomToken()}`;
  const flags = {
    [MODULE_ID]: {
      location: {
        _id:           internalId,
        name:          data.name,
        type:          data.type ?? "derelict",
        active:        true,
        canonicalLocked: false,
        generativeTier: [],
      },
    },
  };
  const journal = makeJournalWithId(`journal-loc-${randomToken()}`, data.name);
  journal.pages.contents.push(makePage({ name: "Location Data", flags }));
  journals.set(journal.name, journal);
  return { journalId: journal.id, internalId };
}

function makeJournalWithId(id, name) {
  const j = makeJournal(name);
  j.id = id;
  return j;
}

function randomToken() {
  return Math.random().toString(36).slice(2, 8);
}


// ─────────────────────────────────────────────────────────────────────────────
// Full state builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a campaign state populated with both entity records and a journal
 * mock containing them. Returns:
 *   {
 *     campaignState — full CampaignStateSchema-shaped object
 *     journals      — Map<name, journal>
 *     refs          — { covenant, ironCompactWj, sable, kovashLoc, ... }
 *     restore()     — restore the original journal mock
 *   }
 *
 * The "Covenant" faction has an entity record. The "Iron Compact" faction
 * has a WJ entry but no entity record. This is the canonical setup for
 * the routing-suppression test in Phase 4.
 *
 * @param {Object} [overrides] — partial campaignState fields
 */
export function buildFullCampaignState(overrides = {}) {
  const installed = installJournalMock();
  const { journals } = installed;

  const covenant = addFactionEntity(journals, {
    name: "The Covenant", type: "Dominion", relationship: "antagonistic",
  });
  const sable = addConnectionEntity(journals, {
    name: "Sable", role: "AI navigator", rank: "dangerous",
  });
  const kovash = addLocationEntity(journals, {
    name: "Kovash Derelict", type: "derelict",
  });

  const campaignState = {
    _id:                 "test-campaign",
    currentSessionId:    "session-1",
    sessionNumber:       3,
    currentLocationId:   null,
    currentLocationType: null,

    connectionIds: [sable.journalId],
    settlementIds: [],
    factionIds:    [covenant.journalId],
    shipIds:       [],
    planetIds:     [],
    locationIds:   [kovash.journalId],
    creatureIds:   [],

    dismissedEntities:   [],
    pendingClarification: null,

    safety: { lines: [], veils: [], privateLines: [] },
    worldTruths: {},
    sectors:    [],
    progressTrackIds: [],
    clockIds:        [],
    oracleResultIds: [],

    ...overrides,
  };

  return {
    campaignState,
    journals,
    refs: {
      covenant,
      sable,
      kovash,
    },
    restore: installed.restore,
  };
}
