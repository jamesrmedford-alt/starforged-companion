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
 *     confirmed canon, and mark the rolling summary for a regen
 *     (markSummaryForRegen).
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

import { getEntityDocument, readEntityFlag, writeEntityFlag, resolveEntityById, iterEntityDocuments } from '../entities/registry.js';
import { retractSessionLore, undoNarrationEntries } from '../world/worldJournal.js';
import { XCARD_RETRACTED_BY } from './ledgers.js';

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
 * @returns {Promise<{ tierDetails: number, lore: number }>}
 */
export async function propagateRetraction(truth, campaignState) {
  const out = { tierDetails: 0, lore: 0 };
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
      out.lore = await retractSessionLore(sessionId, (entry) => loreStatesStrike(entry, truth.subject, label, fact));
    } catch (err) {
      console.warn(`${MODULE_ID} | retraction: lore propagation failed:`, err?.message ?? err);
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

async function dropTierDetails(subject, fact, sessionId) {
  const document = getEntityDocument(subject.entityType, subject.entityId);
  if (!document) return 0;
  const data = readEntityFlag(subject.entityType, document) ?? {};
  const tier = Array.isArray(data.generativeTier) ? data.generativeTier : [];
  const keep = tier.filter(e =>
    e?.pinned || (sessionId && e?.sessionId !== sessionId) || !factsOverlap(e?.detail, fact));
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
 * leave every entity's card — pinned or not, since the table removed them.
 * Runs on the canonical GM after the pause is written (suppressScene's
 * finish). Fail-open: never throws.
 *
 * @param {string[]} narrationIds — the X-carded narrations
 * @returns {Promise<{ entries: Object, tierDetails: number }>}
 */
export async function retractNarrationCapture(narrationIds) {
  const removed = new Set((narrationIds ?? []).filter(id => typeof id === 'string' && id));
  const out = { entries: { restored: 0, retracted: 0, deleted: 0, beats: 0 }, tierDetails: 0 };
  if (!removed.size) return out;
  try {
    out.entries = await undoNarrationEntries([...removed]);
  } catch (err) {
    console.warn(`${MODULE_ID} | X-Card: undoing the capture's World Journal entries failed:`, err?.message ?? err);
  }
  for (const typeKey of TIER_ENTITY_TYPES) {
    let docs = [];
    try { docs = [...iterEntityDocuments(typeKey)]; } catch { docs = []; }
    for (const { document, data } of docs) {
      const tier = Array.isArray(data?.generativeTier) ? data.generativeTier : [];
      const keep = tier.filter(e => !(typeof e?.narrationId === 'string' && removed.has(e.narrationId)));
      if (keep.length === tier.length) continue;
      try {
        await writeEntityFlag(typeKey, document, { ...data, generativeTier: keep, updatedAt: new Date().toISOString() });
        out.tierDetails += tier.length - keep.length;
      } catch (err) {
        console.warn(`${MODULE_ID} | X-Card: dropping the capture's tier details from ${typeKey} ${document?.id} failed:`, err?.message ?? err);
      }
    }
  }
  return out;
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
 * which is what blocks its re-assertion.
 */
function isNamedStrike(t) {
  return !!t?.retracted && !t.correctedTo && t.retractedBy !== XCARD_RETRACTED_BY && !!String(t.fact ?? '').trim();
}

/**
 * At scene end, keep the scene's bare strikes (a Replace's replacement
 * stands, so it is not kept) on `campaignState.sessionRetractions` for the
 * rest of the session. Mutates campaignState; endScene persists it.
 *
 * @param {Object} campaignState
 */
export function rememberSessionRetractions(campaignState) {
  const sessionId = campaignState?.currentSessionId ?? null;
  if (!sessionId) return;
  const struck = (campaignState.sceneTruths ?? []).filter(isNamedStrike);
  if (!struck.length) return;

  const prior = campaignState.sessionRetractions?.sessionId === sessionId
    ? (campaignState.sessionRetractions.facts ?? [])
    : [];
  const facts = [...prior];
  for (const t of struck) {
    const strike = { label: subjectLabel(t.subject), fact: String(t.fact).trim() };
    if (facts.some(f => sameStrike(f, strike))) continue;
    facts.push({
      ...strike,
      sceneId: t.sceneId ?? null,
      at:      t.retractedAt ?? Date.now(),
    });
  }
  campaignState.sessionRetractions = { sessionId, facts: facts.slice(-SESSION_RETRACTION_CAP) };
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
 * @param {Object} campaignState
 * @returns {Array<{ label: string, fact: string }>}
 */
export function sessionRetractedFacts(campaignState) {
  const sessionId = campaignState?.currentSessionId ?? null;
  const earlier = (sessionId && campaignState?.sessionRetractions?.sessionId === sessionId)
    ? (campaignState.sessionRetractions.facts ?? []).map(f => ({ label: f.label, fact: f.fact }))
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
