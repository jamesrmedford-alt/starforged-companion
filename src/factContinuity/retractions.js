/**
 * STARFORGED COMPANION
 * src/factContinuity/retractions.js
 *
 * A struck truth reaches every store that copied it (issue #286 B6).
 *
 * The prose that made a truth also fed the generative-tier pass, the
 * detection pass's auto-confirmed World Journal lore and the rolling session
 * summary. A Strike used to mark only the scene ledger entry, and its
 * CORRECTED line ended with the scene, so the struck fact came back from any
 * of those afterwards — the mirror-drift family (rules/reachability.md §5).
 *
 *   - propagateRetraction(truth, campaignState) — on Strike / Replace: drop
 *     the subject entity's same-session tier details that state the fact,
 *     take same-session lore that states it about the same subject out of
 *     confirmed canon, drop the same-session Chronicle entries the scribe
 *     wrote stating it (STRIKE-CHRONICLE), and mark the rolling summary for
 *     a regen (markSummaryForRegen).
 *   - rememberSessionRetractions(campaignState) — at scene end: keep the
 *     scene's bare strikes for the rest of the session, so the CORRECTED
 *     block and the summary prompt still name them.
 *   - sessionRetractedFacts(campaignState) — the current session's struck
 *     facts, newest last, for those two readers.
 *   - retractNarrationCapture(narrationIds) — on an X-Card: undo what the
 *     X-carded narrations' captures recorded, by their narration id (issue
 *     #329 X01) — the World Journal entries and Session Log beats
 *     (undoNarrationEntries) and the entity tier details. Those copies
 *     mostly restate no sidecar truth, so propagateRetraction never finds
 *     them.
 *
 * "Same session" is the bound: tier details and detection lore carry a
 * sessionId, not a sceneId. Matching is word overlap (factsOverlap), so the
 * tier pass's paraphrase of a struck truth is found too. Sidecar facts are
 * short subject-less phrases ("Is dead"), so a lore entry must also be about
 * the struck truth's subject (issue #321 U39: striking "Vance — Is dead" took
 * the dockmaster's death out of canon), and a session's strikes are told
 * apart by subject and fact together.
 */

import { getEntityDocument, readEntityFlag, writeEntityFlag, resolveEntityById, iterEntityDocuments, hasSheetNotes } from '../entities/registry.js';
import { retractSessionLore, undoNarrationEntries } from '../world/worldJournal.js';
import { XCARD_RETRACTED_BY, SUPERSEDED_RETRACTED_BY, subjectKey, withXCardBlocks, isReplacedOriginal, keptStrikeStandsAt } from './ledgers.js';

const MODULE_ID = 'starforged-companion';

/** Session retractions kept past their scene (CORRECTED block + summary prompt). */
const SESSION_RETRACTION_CAP = 20;

const OVERLAP_STOPWORDS = new Set([
  'the', 'and', 'but', 'for', 'from', 'with', 'into', 'onto', 'upon', 'over', 'under',
  'his', 'her', 'hers', 'its', 'their', 'our', 'your', 'him', 'them', 'they', 'she',
  'was', 'were', 'has', 'had', 'have', 'been', 'are', 'is', 'this', 'that', 'these', 'those',
  'who', 'whom', 'which', 'what', 'not', 'now', 'all', 'any',
]);

function significantWords(text) {
  return new Set(
    String(text ?? '')
      .toLowerCase()
      .replace(/[’']s\b/gu, '')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(w => w.length >= 3 && !OVERLAP_STOPWORDS.has(w)),
  );
}

/** A text's words, lowercased and single-spaced — punctuation dropped. */
function wordSequence(text) {
  return String(text ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ');
}

/** True when `needle`'s words appear in `haystack`, in order, as whole words. */
function containsWords(haystack, needle) {
  const n = wordSequence(needle);
  return Boolean(n) && ` ${wordSequence(haystack)} `.includes(` ${n} `);
}

/**
 * True when two facts say the same thing: one contains the other as whole
 * words ("is dead" is not in "this deadline"), or at least two significant
 * words are shared and they make up 60% of the shorter fact.
 * "has a ragged scar along his jaw" ~ "Kael has a scar along his jaw";
 * "a scar on his arm" !~ "a scar on his jaw". Exported for unit testing.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function factsOverlap(a, b) {
  const la = wordSequence(a);
  const lb = wordSequence(b);
  if (!la || !lb) return false;
  if (containsWords(la, lb) || containsWords(lb, la)) return true;
  const wa = significantWords(la);
  const wb = significantWords(lb);
  if (!wa.size || !wb.size) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  return shared >= 2 && shared / Math.min(wa.size, wb.size) >= 0.6;
}

/**
 * Carry a Strike (or the struck half of a Replace) to the stores that copied
 * the fact. Mutates campaignState (the summary's regen mark); the caller
 * persists it with the ledger. Runs on the canonical GM — every caller is a
 * GM-side correction path. Fail-open: never throws.
 *
 * @param {Object} truth          — the struck sceneTruths entry
 * @param {Object} campaignState
 * @returns {Promise<{ tierDetails: number, lore: number, chronicle: number }>}
 */
export async function propagateRetraction(truth, campaignState) {
  const out = { tierDetails: 0, lore: 0, chronicle: 0 };
  const fact = String(truth?.fact ?? '').trim();
  if (!fact) return out;
  const sessionId = truth.sessionId ?? campaignState?.currentSessionId ?? null;

  if (truth.subject?.kind === 'entity' && truth.subject.entityId && truth.subject.entityType) {
    try {
      out.tierDetails = await dropTierDetails(truth.subject, fact, sessionId);
    } catch (err) {
      console.warn(`${MODULE_ID} | retraction: tier propagation failed:`, err?.message ?? err);
    }
  }

  if (sessionId) {
    try {
      const label = subjectLabel(truth.subject);
      out.lore = await retractSessionLore(sessionId, (entry) => loreStatesStrike(entry, truth.subject, label, fact),
        { truthId: typeof truth.id === "string" ? truth.id : null });
    } catch (err) {
      console.warn(`${MODULE_ID} | retraction: lore propagation failed:`, err?.message ?? err);
    }
    // The session's Chronicle entries the scribe wrote stating it: the
    // Chronicle feeds the campaign recap and, pinned, the CHARACTER block
    // (STRIKE-CHRONICLE). Matched as lore is; a pinned or player-edited
    // entry stays.
    try {
      const { retractStruckChronicle } = await import('../character/chronicle.js');
      const label = subjectLabel(truth.subject);
      out.chronicle = await retractStruckChronicle(sessionId,
        (entry) => loreStatesStrike({ text: entry?.text ?? '' }, truth.subject, label, fact));
    } catch (err) {
      console.warn(`${MODULE_ID} | retraction: Chronicle propagation failed:`, err?.message ?? err);
    }
  }

  // The summary is regenerated from source, and the source prose still says
  // it: the next regen runs regardless of the debounce, with the struck fact
  // in its leave-out list (sessionRetractedFacts).
  markSummaryForRegen(campaignState);
  return out;
}

/**
 * True when a lore entry states the struck fact about the struck subject.
 *
 *   - An archived scene truth (`subject` + `fact` on the entry, from
 *     archiveSceneTruth) must name the same subject: its subject key equals
 *     the struck subject's label ("scene" for a scene truth).
 *   - Any other lore (detection pass, `!journal lore`) must mention a named
 *     subject — a text subject or the entity's name — as whole words in its
 *     title or text. A scene truth's fact describes the scene itself ("the
 *     cargo hatch is welded shut"), so the fact alone decides.
 *
 * Either way the fact must overlap the entry's fact, text or title.
 */
function loreStatesStrike(entry, subject, label, fact) {
  if (!entry) return false;
  const archived = typeof entry.subject === 'string' && typeof entry.fact === 'string' && entry.fact.trim();
  if (archived) {
    return wordSequence(entry.subject) === wordSequence(label) && factsOverlap(entry.fact, fact);
  }
  const named = subject?.kind === 'text' || subject?.kind === 'entity';
  if (named && !containsWords(entry.title, label) && !containsWords(entry.text, label)) return false;
  return factsOverlap(entry.fact ?? entry.text ?? '', fact) || factsOverlap(entry.title ?? '', fact);
}

/**
 * What still retracts a lore entry once a strike is lifted — for that lift's
 * restore (worldJournal `restoreStruckLore`, issue #336 Y32). A lore entry
 * remembers one strike (`retractedByTruth`, issue #331 X31): a second strike
 * stating it passed over it (already retracted), so lifting the first put it
 * back in ESTABLISHED LORE while the second stood under CORRECTED "do NOT
 * re-assert" — the conflict W60 exists to prevent. Checked against the
 * session's other standing retractions, matched as propagateRetraction
 * matched the strike (loreStatesStrike):
 *   - the active scene's other bare strikes → that truth's id, so the entry
 *     is handed to it and lifting it restores the entry;
 *   - the earlier scenes' strikes (`sessionRetractions`) → the struck truth's
 *     id they keep, which a `!truth set` lifts too (issue #342 Z42) — `true`
 *     for one kept before they kept it;
 *   - the active scene's X-Card retractions (never lifted, U07) → `true`: the
 *     entry stays out of canon — and the earlier scenes' too, kept unnamed
 *     (`sessionRetractions.blocked`, XCARD-RETRACTION-SCENE-SCOPED: once its
 *     scene ended, a lift restored the X-carded fact to canon), with the
 *     Replace originals kept beside them (issue #345 AA05).
 * The lifted strike itself is linked (`correctedTo`) on the lift's copy, or —
 * kept from an earlier scene — dropped from it, so it is not one of them.
 *
 * @param {Object} campaignState — the lift's working copy, after the lift
 * @returns {(entry: Object) => (string|true|null)} null when nothing holds it
 */
export function loreRetractionHolder(campaignState) {
  const sessionId = campaignState?.currentSessionId ?? null;
  const active = (campaignState?.sceneTruths ?? []).filter(t =>
    (isNamedStrike(t) || (t?.retracted && t.retractedBy === XCARD_RETRACTED_BY)) && String(t.fact ?? '').trim());
  const thisSession = !!sessionId && campaignState?.sessionRetractions?.sessionId === sessionId;
  const earlier = thisSession ? (campaignState.sessionRetractions.facts ?? []) : [];
  const blocked = thisSession ? (campaignState.sessionRetractions.blocked ?? []) : [];
  // A kept entry is its label and fact: "scene" for a scene truth, else a name.
  const statesKept = (entry, f) => {
    const label = String(f?.label ?? '').trim();
    const fact  = String(f?.fact ?? '').trim();
    if (!label || !fact) return false;
    const subject = label.toLowerCase() === 'scene' ? { kind: 'scene' } : { kind: 'text', text: label };
    return loreStatesStrike(entry, subject, label, fact);
  };
  return (entry) => {
    for (const t of active) {
      if (!loreStatesStrike(entry, t.subject, subjectLabel(t.subject), String(t.fact).trim())) continue;
      return (t.retractedBy !== XCARD_RETRACTED_BY && typeof t.id === 'string' && t.id) ? t.id : true;
    }
    for (const f of earlier) {
      if (statesKept(entry, f)) return (typeof f.truthId === 'string' && f.truthId) ? f.truthId : true;
    }
    return blocked.some(f => statesKept(entry, f)) ? true : null;
  };
}

/**
 * Mark this session's rolling summary for a regen: the next refresh runs
 * regardless of the debounce (`coveredCount` 0). propagateRetraction marks
 * its caller's copy; a correction that persists onto the latest store marks
 * the stored summary the same way (issue #321 U06 — the copy's summary may
 * predate a regen that landed meanwhile). Mutates campaignState.
 *
 * @param {Object} campaignState
 * @returns {boolean} true when a summary was marked
 */
export function markSummaryForRegen(campaignState) {
  const summary = campaignState?.sessionSummary;
  if (!summary || summary.sessionId !== campaignState.currentSessionId) return false;
  campaignState.sessionSummary = { ...summary, coveredCount: 0 };
  return true;
}

/**
 * Drop the subject's same-session tier details that state the struck fact.
 * A pinned detail stays (the GM keeps it), and so does a promoted one — its
 * line is the GM's on the Notes tab, and the entry is the one link between
 * that line and its narration: dropped, an X-Card on that narration could no
 * longer take the line off the Notes tab (issue #342 Z43 — D7's reach). The
 * entry and its Notes copy change together.
 */
async function dropTierDetails(subject, fact, sessionId) {
  const document = getEntityDocument(subject.entityType, subject.entityId);
  if (!document) return 0;
  const data = readEntityFlag(subject.entityType, document) ?? {};
  const tier = Array.isArray(data.generativeTier) ? data.generativeTier : [];
  const keep = tier.filter(e =>
    e?.pinned || e?.promoted || (sessionId && e?.sessionId !== sessionId) || !factsOverlap(e?.detail, fact));
  const dropped = tier.length - keep.length;
  if (!dropped) return 0;
  await writeEntityFlag(subject.entityType, document, {
    ...data,
    generativeTier: keep,
    updatedAt:      new Date().toISOString(),
  });
  return dropped;
}

/** The entity types whose records carry a generative tier. */
const TIER_ENTITY_TYPES = ['connection', 'ship', 'settlement', 'faction', 'planet', 'location', 'creature'];

/**
 * Undo what X-carded narrations' captures recorded (issue #329 X01;
 * rules/narrator-memory.md 6b: anything a narration writes outside the
 * ledgers carries its `narrationId` so the X-Card can undo it too). The
 * capture — the detection and tier passes that run after a narration —
 * stamps the narration's id on every World Journal entry, Session Log beat
 * and tier detail it writes; this takes them back by that id: World Journal
 * entries are restored to their version before or taken out of play
 * (undoNarrationEntries), beats leave the Session Log, and tier details
 * leave every entity's card — pinned or not, since the table removed them;
 * one the GM had promoted takes the line the Promote added to the notes with
 * it (issue #338 D7).
 * What a scene end kept from the narration's ledger entries before the card
 * was played carries the same id (issue #335 Y01): its migrated tier details
 * and archived lore go the same way, and a LAST KNOWN value it set gives way
 * to the newest one before it no removed narration set (lastKnownWithout).
 * A placeholder figure the capture renamed to the removed prose's name gets
 * its name back (revertNarrationRenames, issue #335 Y02), and the draft rows
 * it queued for the GM's review are withdrawn (withdrawNarrationDrafts,
 * issue #338 D6(i)).
 * Runs on the canonical GM after the pause is written (suppressScene's
 * finish). Fail-open: never throws.
 *
 * @param {string[]} narrationIds — the X-carded narrations
 * @returns {Promise<{ entries: Object, tierDetails: number, lastKnown: number, renames: number, drafts: number }>}
 */
export async function retractNarrationCapture(narrationIds) {
  const removed = new Set((narrationIds ?? []).filter(id => typeof id === 'string' && id));
  const out = { entries: { restored: 0, retracted: 0, deleted: 0, beats: 0 }, tierDetails: 0, lastKnown: 0, renames: 0, drafts: 0 };
  if (!removed.size) return out;
  try {
    out.entries = await undoNarrationEntries([...removed]);
  } catch (err) {
    console.warn(`${MODULE_ID} | X-Card: undoing the capture's World Journal entries failed:`, err?.message ?? err);
  }
  for (const typeKey of TIER_ENTITY_TYPES) {
    let docs = [];
    try { docs = [...iterEntityDocuments(typeKey)]; } catch { docs = []; }
    for (const { document } of docs) {
      // Read right before this record's write: the loop awaits between records.
      const data = readEntityFlag(typeKey, document);
      if (!data) continue;
      const tier = Array.isArray(data.generativeTier) ? data.generativeTier : [];
      const fromRemoved = (e) => typeof e?.narrationId === 'string' && removed.has(e.narrationId);
      const keep = tier.filter(e => !fromRemoved(e));
      const lastKnown = lastKnownWithout(data.lastKnown, removed);
      if (keep.length === tier.length && !lastKnown) continue;
      // A dropped detail the GM had promoted leaves the notes too (issue
      // #338 D7): the line the Promote appended (`promotedText`; the detail
      // itself for one promoted before it was kept) — on the sheet's Notes
      // tab for an NPC card or a ship (X12), else in the record's notes.
      const promoted = tier.filter(e => fromRemoved(e) && e?.promoted)
        .map(e => String(e.promotedText ?? e.detail ?? '').trim()).filter(Boolean);
      const onSheet = hasSheetNotes(typeKey) && !!document?.system;
      const notes   = (!onSheet && promoted.length) ? withoutPromotedBlocks(data.notes, promoted) : null;
      try {
        await writeEntityFlag(typeKey, document, {
          ...data,
          ...(keep.length !== tier.length ? { generativeTier: keep } : {}),
          ...(lastKnown ? { lastKnown: lastKnown.next } : {}),
          ...(notes !== null && notes !== data.notes ? { notes } : {}),
          updatedAt: new Date().toISOString(),
        });
        out.tierDetails += tier.length - keep.length;
        out.lastKnown   += lastKnown?.changed ?? 0;
      } catch (err) {
        console.warn(`${MODULE_ID} | X-Card: dropping the capture's tier details from ${typeKey} ${document?.id} failed:`, err?.message ?? err);
        continue;
      }
      if (onSheet && promoted.length) {
        try {
          const html = String(document.system.notes ?? '');
          const next = withoutPromotedParagraphs(html, promoted);
          if (next !== html) await document.update({ 'system.notes': next });
        } catch (err) {
          console.warn(`${MODULE_ID} | X-Card: taking the promoted detail off ${typeKey} ${document?.id}'s Notes tab failed:`, err?.message ?? err);
        }
      }
    }
  }
  out.renames = await revertNarrationRenames(removed);
  // The rows it queued on the GM's ◈ New Entities card are withdrawn, so a
  // Confirm cannot mint an NPC from the removed prose (issue #338 D6(i)).
  try {
    const { withdrawNarrationDrafts } = await import('../entities/entityExtractor.js');
    out.drafts = await withdrawNarrationDrafts([...removed]);
  } catch (err) {
    console.warn(`${MODULE_ID} | X-Card: withdrawing the capture's draft rows failed:`, err?.message ?? err);
  }
  return out;
}

/**
 * Put back the placeholder name a removed narration's capture renamed a
 * connection from (applyEntityRenames' `renamedBy` stamp — issue #335 Y02):
 * "Unknown Suited Figure" revealed as "Vex" by the removed prose is the
 * figure again. Where the card no longer carries the name the narration gave
 * it (a GM renamed it since), the name stands. Through updateConnection,
 * which renames the NPC card's Actor too. Fail-open per card.
 *
 * @param {Set<string>} removed
 * @returns {Promise<number>} cards renamed back
 */
async function revertNarrationRenames(removed) {
  let docs = [];
  try { docs = [...iterEntityDocuments('connection')]; } catch { docs = []; }
  const stamped = docs.filter(({ data }) => typeof data?.renamedBy?.narrationId === 'string'
    && removed.has(data.renamedBy.narrationId) && data.renamedBy.from && data.name === data.renamedBy.to);
  if (!stamped.length) return 0;
  let reverted = 0;
  try {
    const { updateConnection } = await import('../entities/connection.js');
    for (const { document, data } of stamped) {
      try {
        await updateConnection(document.id, { name: data.renamedBy.from, renamedBy: null });
        reverted += 1;
      } catch (err) {
        console.warn(`${MODULE_ID} | X-Card: renaming ${document?.id} back to "${data.renamedBy.from}" failed:`, err?.message ?? err);
      }
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | X-Card: undoing the capture's renames failed:`, err?.message ?? err);
  }
  return reverted;
}

/** A notes line as compared: lowercased, whitespace collapsed. */
const noteLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

/** The text of an HTML fragment: tags dropped, the entities escapeHtml writes decoded. */
function htmlText(html) {
  return String(html ?? '').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');
}

/**
 * A sheet's Notes HTML without the paragraph the Entities panel's Promote
 * appended for each text (`<p>detail</p>` — issue #338 D7): the last
 * paragraph whose text is that detail. Anything else on the tab stays. The
 * Promote takes its own line back with it when the X-Card removed the
 * detail's narration during its Notes write (entityPanel.js — issue #342 Z44).
 *
 * @param {string} html
 * @param {string[]} texts — the promoted details
 * @returns {string}
 */
export function withoutPromotedParagraphs(html, texts) {
  let out = String(html ?? '');
  for (const text of texts) {
    const want  = noteLine(text);
    const found = [...out.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].filter(m => noteLine(htmlText(m[1])) === want).at(-1);
    if (found) out = out.slice(0, found.index) + out.slice(found.index + found[0].length);
  }
  return out;
}

/**
 * A record's plain notes without the block the Promote appended for each
 * text (blocks are joined by a blank line — issue #338 D7): the last block
 * that is that detail.
 *
 * @param {string} notes
 * @param {string[]} texts
 * @returns {string}
 */
function withoutPromotedBlocks(notes, texts) {
  const blocks = String(notes ?? '').split(/\n\s*\n/);
  for (const text of texts) {
    const at = blocks.map(noteLine).lastIndexOf(noteLine(text));
    if (at >= 0) blocks.splice(at, 1);
  }
  return blocks.join('\n\n');
}

/**
 * A record's LAST KNOWN without the values removed narrations set (issue #335
 * Y01): each such attribute falls back to the newest value in its `previous`
 * chain no removed narration set, the removed ones gone from the chain too —
 * or to none (null: a key left out of a merged flag write keeps its stored
 * value). null when no value was theirs.
 *
 * @param {Object|undefined} lastKnown — `{ [attribute]: { value, sessionNum, at, narrationId, previous } }`
 * @param {Set<string>} removed
 * @returns {{ next: Object, changed: number }|null}
 */
function lastKnownWithout(lastKnown, removed) {
  if (!lastKnown || typeof lastKnown !== 'object') return null;
  const fromRemoved = (v) => typeof v?.narrationId === 'string' && removed.has(v.narrationId);
  const next = { ...lastKnown };
  let changed = 0;
  for (const [attr, value] of Object.entries(lastKnown)) {
    if (!value || typeof value !== 'object') continue;
    const chain = [value, ...(Array.isArray(value.previous) ? value.previous : [])];
    if (!chain.some(fromRemoved)) continue;
    const [head, ...older] = chain.filter(v => v && typeof v === 'object' && !fromRemoved(v));
    next[attr] = head ? { ...head, narrationId: head.narrationId ?? null, previous: older.length ? older : null } : null;
    changed += 1;
  }
  return changed ? { next, changed } : null;
}

/** A ledger subject as the CORRECTED block and the summary prompt name it. */
function subjectLabel(subject) {
  switch (subject?.kind) {
    case 'scene':  return 'scene';
    case 'text':   return String(subject.text ?? '').trim() || 'unknown';
    case 'entity': {
      try {
        const name = resolveEntityById(subject.entityId)?.data?.name;
        if (typeof name === 'string' && name.trim()) return name.trim();
      } catch (err) {
        console.debug?.(`${MODULE_ID} | retraction: name lookup for ${subject.entityId} failed:`, err?.message ?? err);
      }
      return String(subject.entityId ?? 'entity');
    }
    default: return 'unknown';
  }
}

/**
 * A bare strike the CORRECTED block and the summary's leave-out list name: a
 * retracted truth with no replacement. A truth the X-Card removed is not one
 * (issue #321 U07): naming it — even as "do not re-assert" — would hand the
 * narrator the content the table removed. It stays retracted in the ledger,
 * which is what blocks its re-assertion. Nor is one a superseded narration
 * wrote (issue #338 D8): the table corrected nothing — an upgrade replaced
 * the outcome — and the narration of the upgraded one may state it again.
 */
function isNamedStrike(t) {
  return !!t?.retracted && !t.correctedTo && t.retractedBy !== XCARD_RETRACTED_BY
    && t.retractedBy !== SUPERSEDED_RETRACTED_BY && !!String(t.fact ?? '').trim();
}

/**
 * Where a kept strike of a scene fact stands: the place its truth was
 * asserted at (`sceneLocation`, issue #326 D2). A scene fact is its place's,
 * so the strike stands there only (ledgers.js keptStrikeStandsAt — issue #345
 * AA28: struck at Bleakhold, it blocked Vantage Station's own scene fact of
 * the same words for the rest of the session). Null for any other subject,
 * and for a scene fact asserted before any frame stood — those stand
 * anywhere.
 *
 * @param {Object} t — the struck truth
 * @returns {string|null}
 */
function keptPlaceOf(t) {
  if (t?.subject?.kind !== 'scene') return null;
  const at = typeof t.sceneLocation === 'string' ? t.sceneLocation.trim() : '';
  return at || null;
}

/**
 * At scene end, keep the scene's bare strikes (a Replace's replacement
 * stands, so it is not kept) on `campaignState.sessionRetractions` for the
 * rest of the session. Each keeps the `narrationId` of the narration that
 * asserted it: an X-Card played on that narration later takes it out of the
 * named list into the unnamed blocks below (ledgers.js retractNarrations —
 * XCARD-AFTER-STRIKE-STILL-NAMED: naming it would hand the narrator the
 * content the table removed). Each keeps what a
 * strike is to its two defenses too (issue #342 Z42 — it outlived its scene as
 * text only): its subject's key, which a later scene's narrator re-assertion
 * is blocked by (ledgers.js findSessionStrike) — a scene fact's at the place
 * it was asserted at only (`place`, keptPlaceOf — issue #345 AA28); who struck it and who
 * asserted it, which decide whether a player's `!truth set` may lift it
 * (W60); and the struck truth's id, by which a lift restores the lore it
 * retracted (restoreStruckLore). Mutates campaignState; endScene persists it.
 *
 * The scene's X-Card retractions are kept too, apart and unnamed
 * (`sessionRetractions.blocked` — ledgers.js withXCardBlocks): they go on
 * blocking a re-assertion for the session (findSessionStrike's write half)
 * and holding their lore out of canon (loreRetractionHolder), and nothing
 * renders them — not CORRECTED, not the summary's leave-out list, no card.
 * Their block was the retracted ledger entry, which the scene end clears
 * (XCARD-RETRACTION-SCENE-SCOPED). So are a Replace's struck originals
 * (ledgers.js isReplacedOriginal): the replacement stands, so they are never named
 * either, and the next scene's narration restating the old wording — the
 * ring still carries the prose that stated it — was recorded live and filed
 * as canon beside the replacement (issue #345 AA05); an X-Card on their
 * narration finds them blocked already.
 *
 * @param {Object} campaignState
 */
export function rememberSessionRetractions(campaignState) {
  const sessionId = campaignState?.currentSessionId ?? null;
  if (!sessionId) return;
  const truths = campaignState.sceneTruths ?? [];
  const byId = new Map(truths.filter(t => t?.id).map(t => [t.id, t]));
  const struck = truths.filter(isNamedStrike);
  const removed = truths.filter(t => t?.retracted && t.retractedBy === XCARD_RETRACTED_BY && String(t.fact ?? '').trim());
  const replaced = truths.filter(t => isReplacedOriginal(t, byId));
  if (!struck.length && !removed.length && !replaced.length) return;

  const same = campaignState.sessionRetractions?.sessionId === sessionId;
  const prior = same ? (campaignState.sessionRetractions.facts ?? []) : [];
  const block = (t, place) => ({
    label:       subjectLabel(t.subject),
    fact:        String(t.fact).trim(),
    subjectKey:  subjectKey(t.subject) || null,
    narrationId: t.narrationId ?? null,
    truthId:     t.id ?? null,
    place,
  });
  // The X-Card's blocks stand anywhere; a Replace's, as a strike, at its place (AA28).
  const blocked = withXCardBlocks(same ? campaignState.sessionRetractions.blocked : [],
    [...removed.map(t => block(t, null)), ...replaced.map(t => block(t, keptPlaceOf(t)))]);
  const facts = [...prior];
  for (const t of struck) {
    const strike = { label: subjectLabel(t.subject), fact: String(t.fact).trim() };
    const place = keptPlaceOf(t);
    // The same strike kept already — standing wherever this one would (issue #345 AA28).
    if (facts.some(f => sameStrike(f, strike) && (!f.place || (place && keptStrikeStandsAt(f.place, place))))) continue;
    facts.push({
      ...strike,
      ...(place ? { place } : {}),
      sceneId:     t.sceneId ?? null,
      at:          t.retractedAt ?? Date.now(),
      narrationId: typeof t.narrationId === 'string' && t.narrationId ? t.narrationId : null,
      truthId:     typeof t.id === 'string' && t.id ? t.id : null,
      subjectKey:  subjectKey(t.subject) || null,
      retractedBy: t.retractedBy ?? null,
      asserter:    t.asserter ?? null,
    });
  }
  campaignState.sessionRetractions = {
    ...(same ? campaignState.sessionRetractions : {}),   // the session's other lists (`narrated`)
    sessionId, facts: facts.slice(-SESSION_RETRACTION_CAP), blocked,
  };
}

/**
 * How many of its ended scenes' narration truths a session keeps for a later
 * X-Card — the newest: the X-Card answers only the session's newest beat.
 * Live and superseded truths are counted apart: the superseded ones shared
 * the live ones' fifty, so a scene with many live truths after an upgrade
 * pushed out the struck narration's, which an X-Card on the upgraded beat
 * then left unblocked (SUPERSEDED-TRUTHS-SHARE-LIMIT).
 */
const SESSION_NARRATED_CAP = 50;

/**
 * At scene end, keep each narration truth the scene closes live — with the
 * `narrationId` of the narration that recorded it — on an unnamed list
 * (`sessionRetractions.narrated`). The X-Card answers the session's newest
 * narration, which can be in a scene that has since ended; it takes back what
 * that scene end migrated (retractNarrationCapture, issue #335 Y01), but the
 * ledger it retracts holds none of those truths, so nothing blocked the
 * narrator re-asserting them (XCARD-ENDED-SCENE-TRUTHS-UNBLOCKED). An X-Card
 * on the narration moves them to the session's blocks (ledgers.js
 * retractNarrations); nothing else reads the list, and nothing renders it. A
 * GM's `!truth set` carries no narration id and is not kept. Mutates
 * campaignState; endScene persists it.
 *
 * A truth a Burn Momentum or Improve Result superseded is kept the same way
 * (issue #347 residual XCARD-STRUCK-FACTS-AFTER-SCENE-END): an X-Card on the
 * beat takes the narration the upgrade struck with its re-narration (D2),
 * and its facts become the X-Card's, blocked — but the scene end dropped
 * them, so after it nothing blocked them. Kept here, a superseded truth is
 * still no bar to a later narration restating it until an X-Card takes it.
 *
 * @param {Object} campaignState
 * @param {Array<Object>} truths — the truths the scene end closed (migrated, archived or dropped)
 */
export function rememberNarratedTruths(campaignState, truths) {
  const sessionId = campaignState?.currentSessionId ?? null;
  if (!sessionId) return;
  const closed = (Array.isArray(truths) ? truths : []).filter(t => t
    && (!t.retracted || t.retractedBy === SUPERSEDED_RETRACTED_BY)
    && typeof t.narrationId === 'string' && t.narrationId && String(t.fact ?? '').trim());
  if (!closed.length) return;
  const same = campaignState.sessionRetractions?.sessionId === sessionId;
  const base = same ? campaignState.sessionRetractions : { sessionId, facts: [], blocked: [] };
  const narrated = [...(Array.isArray(base.narrated) ? base.narrated : [])];
  for (const t of closed) {
    const truthId = typeof t.id === 'string' && t.id ? t.id : null;
    if (truthId && narrated.some(n => n?.truthId === truthId)) continue;
    narrated.push({
      label: subjectLabel(t.subject), fact: String(t.fact).trim(),
      subjectKey: subjectKey(t.subject) || null, narrationId: t.narrationId, truthId,
      ...(t.retracted ? { superseded: true } : {}),
    });
  }
  const kept = new Set([
    ...narrated.filter(n => !n?.superseded).slice(-SESSION_NARRATED_CAP),
    ...narrated.filter(n => n?.superseded).slice(-SESSION_NARRATED_CAP),
  ]);
  campaignState.sessionRetractions = { ...base, sessionId, narrated: narrated.filter(n => kept.has(n)) };
}

/**
 * Two strikes are one when they name the same subject and the same fact —
 * sidecar facts are subject-less phrases, so "Vance — Is dead" and
 * "Kira — Is dead" are two (issue #321 U39).
 */
function sameStrike(a, b) {
  return String(a?.label ?? '').trim().toLowerCase() === String(b?.label ?? '').trim().toLowerCase()
    && String(a?.fact ?? '').trim().toLowerCase() === String(b?.fact ?? '').trim().toLowerCase();
}

/**
 * This session's struck facts — earlier scenes' (sessionRetractions) and the
 * active scene's bare strikes — oldest first, `{ label, fact }`.
 *
 * `here`: the place the narration stands at (the CORRECTED block's caller —
 * the scene frame's location). An earlier scene's strike of a scene fact is
 * that place's (issue #345 AA28), so it is named only where it stands
 * (ledgers.js keptStrikeStandsAt) — as the narrator is blocked from
 * re-asserting it, and a `!truth set` lifts it, there only; named elsewhere,
 * the place's own fact of those words read binding and "do NOT re-assert" at
 * once (W60). Left out — the summary's leave-out list, which covers the whole
 * session's prose — every strike is named.
 *
 * @param {Object} campaignState
 * @param {{ here?: string|null }} [opts]
 * @returns {Array<{ label: string, fact: string }>}
 */
export function sessionRetractedFacts(campaignState, { here } = {}) {
  const sessionId = campaignState?.currentSessionId ?? null;
  const earlier = (sessionId && campaignState?.sessionRetractions?.sessionId === sessionId)
    ? (campaignState.sessionRetractions.facts ?? []).filter(f => keptStrikeStandsAt(f?.place, here))
      .map(f => ({ label: f.label, fact: f.fact }))
    : [];
  const current = (campaignState?.sceneTruths ?? [])
    .filter(isNamedStrike)
    .map(t => ({ label: subjectLabel(t.subject), fact: String(t.fact).trim() }));
  const out = [];
  for (const f of [...earlier, ...current]) {
    if (!out.some(o => sameStrike(o, f))) out.push(f);
  }
  return out;
}
