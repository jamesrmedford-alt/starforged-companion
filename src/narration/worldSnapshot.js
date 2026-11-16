/**
 * STARFORGED COMPANION
 * src/narration/worldSnapshot.js — the narrator's world snapshot, built (issue #357)
 *
 * The narrator used to be shown a handful of world records a beat, chosen by
 * keyword: the lore entries that shared words with the player's line, the top
 * four threats, the cards of the entities a beat named, four hidden plans.
 * Whatever a beat did not name was out of view, and the prompt changed every
 * call, so none of it was ever read back from the prompt cache.
 *
 * The whole world state is now rendered once — the snapshot — and sent byte
 * for byte as a cached block on every narrator call until a new one is taken
 * (worldSnapshotStore.js decides when; snapshotEvents.js holds the list).
 * What changed since rides in the per-beat context, in full, and wins.
 *
 * A snapshot is made of **units**: one per durable record — a sector, an
 * entity card, a faction, a threat, a lore entry, an earlier session's
 * summary, a hidden plan — each `{ key, section, text }`, its key a stable id.
 *   - collectWorldUnits reads the world into units (Foundry reads; fail-open
 *     a section);
 *   - renderWorldSnapshot lays units out as the block: sections in a fixed
 *     order, units sorted by key, so the same records give the same text in
 *     any input order. No timestamp and no count is rendered;
 *   - a snapshot keeps a manifest — each unit's key and a hash of its text —
 *     and diffWorldUnits compares the world as it stands against it: the
 *     units made or changed since (sent in full under CHANGED SINCE THE
 *     SNAPSHOT) and the keys gone (the snapshot would go on asserting them,
 *     so a new one is taken).
 *
 * What stays out, because it changes within a session: the scene frame and
 * ledger, character meters, clocks, progress, recent oracle results, this
 * session's rolling summary and recent narration. An unexplored site stays
 * out too — nothing names it until it is charted.
 *
 * Hidden plans are in the snapshot (decided: all active plans), in a section
 * of their own, so this module reads the plan store. It builds prompt text
 * and nothing else: no card, no chat message (tests/unit/secretsStayHidden).
 */

import { collectAllEntities } from '../context/relevanceResolver.js';
import { getConnection } from '../entities/connection.js';
import { getSettlement } from '../entities/settlement.js';
import { getFaction, listFactions, mergeFactionLandscape, factionNameKey } from '../entities/faction.js';
import { getShip } from '../entities/ship.js';
import { getPlanet } from '../entities/planet.js';
import { getLocation } from '../entities/location.js';
import { getCreature } from '../entities/creature.js';
import {
  listWorldJournalEntries, getFactionLandscape, normalizeThreatSeverity, THREAT_SEVERITIES,
} from '../world/worldJournal.js';
import { listSkeletons, skeletonsEnabled } from '../world/secrets.js';
import { tableVows, distinctOpenVows, trackVowName } from '../session/openThreads.js';
import { formatEntityCard, formatSnapshotPlan, SNAPSHOT_BLOCK_HEADING } from './narratorPrompt.js';

const MODULE_ID = 'starforged-companion';

const ENTITY_GETTERS = Object.freeze({
  connection: getConnection,
  settlement: getSettlement,
  faction:    getFaction,
  ship:       getShip,
  planet:     getPlanet,
  location:   getLocation,
  creature:   getCreature,
});

/** How many earlier sessions' summaries the snapshot's memory holds. */
const SNAPSHOT_SESSION_SUMMARIES = 3;

/**
 * The snapshot's sections, in the order they are rendered, each with its
 * heading and the standing line the narrator reads with it. The per-beat
 * sections these replace carried the same lines.
 */
const SECTIONS = Object.freeze([
  { id: 'sectors', heading: 'SECTORS',
    intro: 'Every sector charted so far, with who and what is in it. Reuse these names: never invent a new ' +
      'settlement, world or site for a place that exists. Respect each settlement\'s Authority and Trouble — no ' +
      'official, administrator or governing figure for a settlement whose Authority is none or lawless.\n' +
      'CAST DISCIPLINE — reuse before you invent: when a scene needs a character to fill a role (an official, a ' +
      'vendor, a pilot, a fixer, a guard, a witness, a contact, a voice on the comm), first decide whether an ' +
      'established character — one of the people listed for the active sector, a player character, or anyone ' +
      'already in the scene — can plausibly fill it, and if so use them by name. Introduce a new named character ' +
      'only when none can; a new one belongs to the active sector, fits its authority and troubles, and is given ' +
      'enough substance to recur.' },
  { id: 'entities', heading: 'RECORDED PEOPLE, PLACES AND SHIPS',
    intro: 'One card for each. Keep every one consistent with its card: do not reassign a role or a goal, change ' +
      'pronouns or disposition, or invent a history that contradicts it. NARRATOR-ADDED lines are details earlier ' +
      'narrations established — honour and build on them.' },
  { id: 'factions', heading: 'FACTIONS',
    intro: 'These stances are established — keep faction behaviour consistent with them; a stance changes only ' +
      'through played fiction.' },
  { id: 'threats', heading: 'THREATS',
    intro: 'These dangers are established and in motion — weave them consistently; do not resolve or dismiss one ' +
      'without the fiction earning it.' },
  { id: 'lore', heading: 'ESTABLISHED LORE',
    intro: 'What the story has established as fact.' },
  { id: 'memory', heading: 'EARLIER SESSIONS',
    intro: 'Narrative texture only — where a summary conflicts with ACTIVE SCENE or CHARACTER STATE in the ' +
      'context for this narration, those win.' },
  { id: 'plans', heading: 'HIDDEN PLANS — FOR THE NARRATOR ONLY',
    intro: 'The story holds these truths, but the characters do not know them yet. Never state one outright, and ' +
      'never hint that a plan exists. For each narration, UNREVEALED in its context names the plans in play and ' +
      'says how they are used: use only those. Every other plan here is background — do not draw on it, hint at ' +
      'it or advance it. A context with no UNREVEALED section has no plan in play.' },
]);

const SECTION_BY_ID = new Map(SECTIONS.map(s => [s.id, s]));

/** The snapshot's opening, under its heading. The same words every snapshot. */
const SNAPSHOT_INTRO =
  'The campaign\'s world as it stood when this snapshot was taken: every sector, recorded person, place and ' +
  'ship, the factions, threats and lore, what earlier sessions left, and the hidden plans. It is reference, not ' +
  'this narration\'s cast. IN PLAY NOW, in the context for this narration, names the records the narration ' +
  'involves — find them here by name or id. Where CHANGED SINCE THE SNAPSHOT, ACTIVE SCENE or CHARACTER STATE ' +
  'there disagree with this snapshot, they win.';

// ─────────────────────────────────────────────────────────────────────────────
// Unit keys
// ─────────────────────────────────────────────────────────────────────────────

/** An entity's unit key, from its host document id (the id relevance matches). */
export const entityUnitKey = (id) => `entity:${id}`;
/** A hidden plan's unit key, from its plan id. */
export const planUnitKey   = (id) => `plan:${id}`;
/** An earlier session's summary's unit key. */
const sessionUnitKey       = (id) => `memory:session:${id}`;

/** A value on one line: whitespace collapsed, trimmed. */
function oneLine(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * A unit's text as the snapshot carries it: no line of it is a section rule
 * or a top-level heading — a card's own `## ` heading is one level down here,
 * and a rule a record's text holds is spelled out — so the snapshot is one
 * section of the prompt whatever its records say (splitNarratorSystemPrompt
 * and `!narrator debug` find the blocks by those lines).
 */
function unitText(text) {
  return String(text ?? '').split('\n')
    .map(line => (/^-{3,}\s*$/.test(line) ? '- - -' : line.replace(/^#{1,3} /, '#### ')))
    .join('\n')
    .trim();
}

function unit(key, section, text, meta = {}) {
  const body = unitText(text);
  return body ? { key, section, text: body, ...meta } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Collect — the world, as units
// ─────────────────────────────────────────────────────────────────────────────

/** Run one section's collector; a failure is that section left out, never a blocked narration. */
function safely(label, fn) {
  try {
    return (fn() ?? []).filter(Boolean);
  } catch (err) {
    console.warn(`${MODULE_ID} | world snapshot: the ${label} could not be read — left out:`, err?.message ?? err);
    return [];
  }
}

/** The host ids of the sites no expedition has charted yet: each sector's discovery records not yet discovered. */
function unchartedSiteIds(campaignState) {
  const ids = new Set();
  for (const sector of campaignState?.sectors ?? []) {
    for (const d of sector?.mapData?.discoveries ?? []) {
      if (d?.actorId && d.discovered !== true) ids.add(d.actorId);
    }
  }
  return ids;
}

/** Every recorded entity with its record, less the uncharted sites: `[{ id, type, name, sectorId, record }]`. */
function recordedEntities(campaignState) {
  const hidden = unchartedSiteIds(campaignState);
  const out = [];
  for (const ref of collectAllEntities(campaignState)) {
    const id = ref?.journalId;
    const getter = ENTITY_GETTERS[ref?.entityType];
    if (!id || !getter || hidden.has(id)) continue;
    let record = null;
    try {
      record = getter(id);
    } catch (err) {
      console.debug?.(`${MODULE_ID} | world snapshot: the ${ref.entityType} ${id} could not be read:`, err?.message ?? err);
    }
    if (record?.name) out.push({ id, type: ref.entityType, name: String(record.name).trim(), sectorId: record.sectorId ?? ref.sectorId ?? null, record });
  }
  return out;
}

/** An entity's card, its heading carrying the id IN PLAY NOW names it by. */
function entityUnit(entity) {
  const card = formatEntityCard(entity.record, entity.type);
  if (!card) return null;
  const [heading, ...rest] = card.split('\n');
  return unit(entityUnitKey(entity.id), 'entities', [`${heading} (id ${entity.id})`, ...rest].join('\n'),
    { label: entity.name, entityType: entity.type });
}

const byId = (a, b) => String(a.id).localeCompare(String(b.id));

/** One sector: what it is, its routes, and who and what is in it — by name; each one's card holds the rest. */
function sectorUnit(sector, entities) {
  if (!sector?.id || !sector.name) return null;
  const inSector = entities.filter(e => e.sectorId === sector.id).sort(byId);
  const names = (type, format = (e) => e.name) => inSector.filter(e => e.type === type).map(format);
  const lines = [`#### ${oneLine(sector.name)} (id ${sector.id})`];
  const facts = [
    (sector.regionLabel ?? sector.region) ? `Region: ${oneLine(sector.regionLabel ?? sector.region)}` : '',
    sector.trouble ? `Trouble: ${oneLine(sector.trouble)}` : '',
    sector.faction ? `Faction control: ${oneLine(sector.faction)}` : '',
  ].filter(Boolean);
  if (facts.length) lines.push(facts.join(' · '));
  if (typeof sector.stubs?.sector === 'string' && sector.stubs.sector.trim()) lines.push(oneLine(sector.stubs.sector));

  const settlements = names('settlement');
  // A sector whose settlement records cannot be read is still named by its map.
  const mapNames = (sector.mapData?.settlements ?? []).map(s => oneLine(s?.name)).filter(Boolean);
  if (settlements.length || mapNames.length) lines.push(`Settlements: ${(settlements.length ? settlements : mapNames).join('; ')}`);

  const mapName = (id) => oneLine((sector.mapData?.settlements ?? []).find(s => s?.id === id)?.name);
  const passages = (sector.mapData?.passages ?? [])
    .map(p => [mapName(p?.fromId), p?.toEdge ? 'the sector\'s edge' : mapName(p?.toId)])
    .filter(([from, to]) => from && to)
    .map(([from, to]) => `${from} — ${to}`);
  if (passages.length) lines.push(`Passages: ${passages.join('; ')}`);

  const typed = (e) => `${e.name}${e.record.type ? ` (${oneLine(e.record.type)})` : ''}`;
  const planets = names('planet', typed);
  if (planets.length) lines.push(`Planets: ${planets.join('; ')}`);

  const isSite = (e) => ['vault', 'derelict', 'uncharted'].includes(String(e.record.type ?? '').toLowerCase());
  const places = inSector.filter(e => e.type === 'location' && !isSite(e)).map(typed);
  if (places.length) lines.push(`Locations: ${places.join('; ')}`);
  const sites = inSector.filter(e => e.type === 'location' && isSite(e))
    .map(e => `${e.name} (${[e.record.type, e.record.status].map(oneLine).filter(Boolean).join(', ')})`);
  if (sites.length) lines.push(`Charted sites: ${sites.join('; ')}`);

  const person = (e) => `${e.name}${e.record.role ? ` — ${oneLine(e.record.role)}` : ''}`;
  const people = inSector.filter(e => e.type === 'connection');
  const cast = people.filter(e => e.record.active !== false).map(person);
  const lost = people.filter(e => e.record.active === false).map(person);
  if (cast.length) lines.push(`People: ${cast.join('; ')}`);
  if (lost.length) lines.push(`Lost connections (the bond with the crew is broken — not cast to reuse as friends): ${lost.join('; ')}`);
  return unit(`sector:${sector.id}`, 'sectors', lines.join('\n'), { label: oneLine(sector.name) });
}

/** The threats not resolved, each with the severity it is read as (worldJournal.js getActiveThreats' rule). */
function threatUnits() {
  return listWorldJournalEntries('threats')
    .map(({ pageId, entry }) => ({
      pageId, entry,
      severity: THREAT_SEVERITIES.includes(entry.severity) ? entry.severity : (normalizeThreatSeverity(entry.severity) ?? 'active'),
    }))
    .filter(t => t.entry.name && t.severity !== 'resolved')
    .map(t => unit(`threat:${t.pageId}`, 'threats',
      `- ${oneLine(t.entry.name)} (${t.severity}; id ${t.pageId})${t.entry.summary ? `: ${oneLine(t.entry.summary)}` : ''}`,
      { label: oneLine(t.entry.name), severity: t.severity, pageId: t.pageId, updatedAt: String(t.entry.updatedAt ?? '') }));
}

/** The whole faction landscape: records and World Journal intelligence merged, one line a faction. */
function factionUnits(campaignState) {
  return mergeFactionLandscape(listFactions(campaignState), getFactionLandscape(campaignState, { limit: Infinity }), Infinity)
    .filter(line => line?.name)
    .map(line => {
      const bits = [line.stance ? `stance: ${line.stance}` : '', line.detail ?? ''].filter(Boolean).join(' · ');
      return unit(`faction:${factionNameKey(line.name)}`, 'factions',
        `- ${oneLine(line.name)}${bits ? ` — ${oneLine(bits)}` : ''}`, { label: oneLine(line.name) });
    });
}

/** All confirmed lore, the places recorded with no card of their own, and the table's `!lore` recap. */
function loreUnits(campaignState) {
  const out = [];
  for (const { pageId, entry } of listWorldJournalEntries('lore')) {
    if (entry.confirmed !== true || entry.retracted === true) continue;
    const text = oneLine(entry.text || entry.fact);
    const title = oneLine(entry.title);
    if (!title && !text) continue;
    out.push(unit(`lore:${pageId}`, 'lore', `- ${title || 'Lore'}${text ? `: ${text}` : ''}`, { label: title }));
  }
  for (const { pageId, entry } of listWorldJournalEntries('locations')) {
    const name = oneLine(entry.locationName);
    if (!name) continue;
    const text = oneLine(entry.description);
    out.push(unit(`place:${pageId}`, 'lore', `- ${name} (a place)${text ? `: ${text}` : ''}`, { label: name }));
  }
  const recap = oneLine(campaignState?.loreRecap);
  if (recap) out.push(unit('lore:recap', 'lore', `- The world, as the table recapped it: ${recap}`));
  return out;
}

/**
 * Earlier sessions' summaries — the newest SNAPSHOT_SESSION_SUMMARIES before
 * this one, oldest first: the summary the last mint kept (LAST SESSION,
 * `previousSessionSummary`) and the "Story so far" each session's Session Log
 * page holds — and what stands open: the open vows and tracks, by name.
 */
function memoryUnits(campaignState, { progressTracks = [], summaries = true } = {}) {
  const out = [];
  if (summaries) {
    const current = campaignState?.currentSessionId ?? null;
    const bySession = new Map();
    for (const { entry } of listWorldJournalEntries('sessionLog')) {
      const text = oneLine(entry.summary?.narrative);
      if (!entry.sessionId || entry.sessionId === current || !text) continue;
      bySession.set(entry.sessionId, { sessionId: entry.sessionId, number: Number(entry.sessionNumber), text });
    }
    const prev = campaignState?.previousSessionSummary;
    if (prev?.sessionId && prev.sessionId !== current && oneLine(prev.text)) {
      bySession.set(prev.sessionId, { sessionId: prev.sessionId, number: Number(prev.sessionNumber), text: oneLine(prev.text) });
    }
    const numbered = (s) => (Number.isFinite(s.number) ? s.number : -1);
    const newest = [...bySession.values()]
      .sort((a, b) => (numbered(b) - numbered(a)) || String(b.sessionId).localeCompare(String(a.sessionId)))
      .slice(0, SNAPSHOT_SESSION_SUMMARIES);
    for (const s of newest) {
      const label = Number.isFinite(s.number) ? `Session ${s.number}` : 'An earlier session';
      out.push(unit(sessionUnitKey(s.sessionId), 'memory', `- ${label}: ${s.text}`,
        { order: String(Math.max(0, numbered(s))).padStart(6, '0') }));
    }
  }

  const vows = tableVows();
  const open = distinctOpenVows(vows).filter(v => oneLine(v.name))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)))
    .map(v => `"${oneLine(v.name)}"${[v.rank, ...(v.holders ?? [])].filter(Boolean).length ? ` (${[v.rank, ...(v.holders ?? [])].filter(Boolean).map(oneLine).join(', ')})` : ''}`);
  const KINDS = { combat: 'Fight', expedition: 'Expedition', scene_challenge: 'Scene challenge' };
  const tracks = (Array.isArray(progressTracks) ? progressTracks : [])
    .filter(t => t && !t.completed && KINDS[t.type] && oneLine(t.label))
    .sort(byId)
    .map(t => {
      const vow = trackVowName(t, vows);
      return `${KINDS[t.type]} — ${oneLine(t.label)}${vow ? ` (serves the vow "${oneLine(vow)}")` : ''}`;
    });
  const lines = [];
  if (open.length)   lines.push(`- Open vows: ${open.join('; ')}`);
  if (tracks.length) lines.push(`- Under way: ${tracks.join('; ')}`);
  // After the summaries: what stands open now.
  if (lines.length) out.push(unit('memory:open', 'memory', lines.join('\n'), { order: '999999' }));
  return out;
}

/** Every active plan: a decided one as UNREVEALED shows it, an undecided one by its rolls. */
function planUnits() {
  if (!skeletonsEnabled()) return [];
  return listSkeletons().map(record => unit(planUnitKey(record.id), 'plans', formatSnapshotPlan(record),
    { label: record.subject?.name ?? '', decided: !!record.truth }));
}

/**
 * The world as it stands, as snapshot units — every durable record the
 * narrator is given. Reads Foundry documents; a section that cannot be read
 * is left out (logged), the rest still collected.
 *
 * @param {Object} campaignState — the world's entity lists, sectors, `loreRecap`, `previousSessionSummary`
 * @param {Object} [opts]
 * @param {Object[]} [opts.progressTracks] — the open tracks (ui/progressTracks.js listOpenProgressTracks)
 * @param {boolean} [opts.summaries] — earlier sessions' summaries (off with the rolling summary's setting)
 * @param {{ threats?: boolean, factions?: boolean, lore?: boolean }} [opts.include] — the World Journal's
 *   per-section context settings; a section switched off is left out
 * @returns {Array<{ key: string, section: string, text: string }>}
 */
export function collectWorldUnits(campaignState, { progressTracks = [], summaries = true, include = {} } = {}) {
  const entities = safely('recorded entities', () => recordedEntities(campaignState));
  return [
    ...safely('sectors',  () => (campaignState?.sectors ?? []).map(s => sectorUnit(s, entities))),
    ...safely('entity cards', () => entities.map(entityUnit)),
    ...(include.factions === false ? [] : safely('factions', () => factionUnits(campaignState))),
    ...(include.threats  === false ? [] : safely('threats',  () => threatUnits())),
    ...(include.lore     === false ? [] : safely('lore',     () => loreUnits(campaignState))),
    ...safely('earlier sessions', () => memoryUnits(campaignState, { progressTracks, summaries })),
    ...safely('hidden plans', () => planUnits()),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Render, and compare
// ─────────────────────────────────────────────────────────────────────────────

/** A hash of a unit's text (cyrb53), as a string: what the manifest keeps in place of the text. */
function hashText(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Units in the order a snapshot lists them: by section, then by `order` where a section has one, then by key. */
function sortedUnits(units) {
  const rank = (u) => SECTIONS.findIndex(s => s.id === u.section);
  const at = (u) => `${u.order ?? ''}\u0000${u.key}`;
  return (Array.isArray(units) ? units : [])
    .filter(u => u && typeof u.key === 'string' && SECTION_BY_ID.has(u.section) && typeof u.text === 'string' && u.text)
    .filter((u, i, all) => all.findIndex(o => o.key === u.key) === i)
    .sort((a, b) => (rank(a) - rank(b)) || (at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : 0));
}

/** Estimated tokens of a text (~4 characters a token, as the ledger's budget counts). */
export function estimateSnapshotTokens(text) {
  return text ? Math.ceil(String(text).length / 4) : 0;
}

/**
 * Units laid out under their section headings: each section that has any,
 * in the snapshot's order, units by key. Shared by the snapshot and by the
 * per-beat CHANGED SINCE THE SNAPSHOT block, so a changed record reads there
 * as it does here.
 *
 * @param {Object[]} units
 * @param {{ intros?: boolean }} [opts] — with each section's standing line (the snapshot's own)
 * @returns {string}
 */
export function renderUnitSections(units, { intros = false } = {}) {
  const list = sortedUnits(units);
  const parts = [];
  for (const section of SECTIONS) {
    const own = list.filter(u => u.section === section.id);
    if (!own.length) continue;
    // A card or a plan is several lines: a blank line between two of them.
    const gap = own.some(u => u.text.includes('\n')) ? '\n\n' : '\n';
    parts.push(`### ${section.heading}\n\n${intros ? `${section.intro}\n\n` : ''}${own.map(u => u.text).join(gap)}`);
  }
  return parts.join('\n\n');
}

/**
 * Render a snapshot from units: the block the narrator is sent (it opens on
 * SNAPSHOT_BLOCK_HEADING), and the manifest that says what it holds. The same
 * units give the same text in any order; nothing here reads a clock.
 *
 * @param {Object[]} units — collectWorldUnits'
 * @param {{ activeSector?: string|null }} [opts] — the active sector's name when the snapshot is taken
 * @returns {{ text: string, manifest: Array<[string, string]>, tokens: number }}
 */
export function renderWorldSnapshot(units, { activeSector = null } = {}) {
  const list = sortedUnits(units);
  const active = oneLine(activeSector);
  const body = renderUnitSections(list, { intros: true });
  const text = [
    `${SNAPSHOT_BLOCK_HEADING}\n\n${SNAPSHOT_INTRO}`,
    active ? `The active sector when this snapshot was taken: ${active}. IN PLAY NOW names the active sector for each narration.` : '',
    body || 'Nothing is recorded yet.',
  ].filter(Boolean).join('\n\n');
  const manifest = list.map(u => [u.key, hashText(u.text)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { text, manifest, tokens: estimateSnapshotTokens(text) };
}

/**
 * The world as it stands against a snapshot's manifest: the units made or
 * changed since it was taken (in snapshot order), and the keys it holds that
 * no unit has now — a record deleted, retracted, resolved or retired.
 *
 * @param {Array<[string, string]>} manifest — renderWorldSnapshot's
 * @param {Object[]} units — collectWorldUnits', now
 * @returns {{ changed: Object[], removed: string[] }}
 */
export function diffWorldUnits(manifest, units) {
  const held = new Map((Array.isArray(manifest) ? manifest : []).filter(e => Array.isArray(e) && typeof e[0] === 'string'));
  const now = sortedUnits(units);
  const keys = new Set(now.map(u => u.key));
  return {
    changed: now.filter(u => held.get(u.key) !== hashText(u.text)),
    removed: [...held.keys()].filter(k => !keys.has(k)).sort(),
  };
}
