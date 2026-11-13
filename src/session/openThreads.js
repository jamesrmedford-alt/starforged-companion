/**
 * STARFORGED COMPANION
 * src/session/openThreads.js — what is open at the table (issue #353 R3, R4)
 *
 * The vow is Starforged's own answer to "what is this story about", and
 * marking progress on it is the game's main reward. What is still open was
 * spread over the character sheets, the Progress Tracks and Clocks panels and
 * the World Journal, and nothing said when no vow was in play at all. This
 * module reads it from stores that already exist — no model call, no write:
 *
 *   - the table's vows (`tableVows`, through actorBridge), one per vow
 *     (`distinctOpenVows`), and the quests among them — every open vow but a
 *     character's background vow (`questVows`): Begin a Session says when no
 *     character holds one (R3);
 *   - the vow a scene serves (`selectSceneVow` / `readSceneVow`): a linked
 *     track's vow, the session's quest focus, or the only vow in play — the
 *     line at the top of the narrator's per-beat context (R3);
 *   - the open vows a vow link or a quest focus can name (`vowChoices`), the
 *     link a choice makes, checked against the vows as they stand
 *     (`resolveVowChoice`) — an expedition or a scene challenge linked to the
 *     vow it serves, as a fight is — and the vow a track serves, by its link's
 *     id first (`trackVowName`) (R3);
 *   - the Session panel's "what's open" rows (`openThreadRows`) and the
 *     connections End a Session offers as a focus (`tableConnectionNames`)
 *     (R4). The panel adds the narrative skeleton's revealed rows itself
 *     (src/ui/sessionPanel.js — this module never reads a plan).
 */

import { getPlayerActors, readVows, readConnections } from "../character/actorBridge.js";
import { wholeWordsFit } from "../context/relevanceResolver.js";

const MODULE_ID = "starforged-companion";

/**
 * Every player character's vows (actorBridge.readVows), each with its holder:
 * `actorId`, `actorName`. In roster order, each PC's vows in the sheet's
 * order. Fail-open: none.
 *
 * @returns {Object[]}
 */
export function tableVows() {
  try {
    return (getPlayerActors() ?? []).flatMap(actor => (readVows(actor) ?? [])
      .map(v => ({ ...v, actorId: actor?.id ?? null, actorName: String(actor?.name ?? "") })));
  } catch (err) {
    console.warn(`${MODULE_ID} | open threads: the characters' vows could not be read:`, err?.message ?? err);
    return [];
  }
}

/** A vow's id across its copies: its `vowId` flag, else its Item's own id (actorBridge.vowCopyId's rule). */
function vowKey(vow) {
  if (typeof vow?.vowId === "string" && vow.vowId) return vow.vowId;
  return typeof vow?.id === "string" && vow.id ? vow.id : null;
}

/**
 * The open vows, one per vow — a shared vow's copies are one — each its
 * first copy's fields plus `key` (its id across copies) and `holders` (the
 * names of the characters holding it, in roster order).
 *
 * @param {Object[]} vows — tableVows'
 * @returns {Object[]}
 */
export function distinctOpenVows(vows) {
  const byKey = new Map();
  for (const v of Array.isArray(vows) ? vows : []) {
    if (!v || v.completed) continue;
    const key = vowKey(v);
    if (!key) continue;
    const held = byKey.get(key);
    if (!held) byKey.set(key, { ...v, key, holders: v.actorName ? [v.actorName] : [] });
    else if (v.actorName && !held.holders.includes(v.actorName)) held.holders.push(v.actorName);
  }
  return [...byKey.values()];
}

/**
 * The open vows that are quests: every open vow but its character's
 * background vow (issue #353 R3 — "no character has an open vow besides a
 * background vow"). A character's background vow, for this question, is
 * their first vow on the sheet that is not the shared inciting vow — the
 * foundry-ironsworn convention readVows' fallback follows. The shared
 * inciting vow is the campaign's first quest, so it is always one here,
 * though readVows labels it "Background vow" for the narrator (that label is
 * unchanged — decisions.md, "Collaborative character creation").
 *
 * @param {Object[]} vows — tableVows' (each with its `actorId`)
 * @returns {Object[]} the open quest vows, copies and all
 */
export function questVows(vows) {
  const list = (Array.isArray(vows) ? vows : []).filter(Boolean);
  const background = new Set();
  const seen = new Set();
  for (const v of list) {
    if (v.shared === true) continue;
    const pc = v.actorId ?? "";
    if (seen.has(pc)) continue;
    seen.add(pc);
    background.add(v);
  }
  return list.filter(v => !v.completed && !background.has(v));
}

/** Which linked track's vow a scene serves first: the fight under way, then a scene challenge, then an expedition. */
const LINKED_TRACK_ORDER = Object.freeze(["combat", "scene_challenge", "expedition"]);

/**
 * The open vow a track serves: by its `linkedVowId` (any copy's), else — a
 * fight linked at its threshold card carries a name — the one open vow of
 * its `linkedVowName`. A vow linked by id that is closed or gone serves no
 * scene, and a name two open vows share names neither: neither is a guess
 * (rules/reachability.md §6).
 */
function linkedOpenVow(track, open, all) {
  const id = typeof track?.linkedVowId === "string" ? track.linkedVowId.trim() : "";
  if (id) {
    const copy = all.find(v => !v.completed && (vowKey(v) === id || v.id === id));
    return copy ? (open.find(o => o.key === vowKey(copy)) ?? null) : null;
  }
  const name = typeof track?.linkedVowName === "string" ? track.linkedVowName.trim().toLowerCase() : "";
  if (!name) return null;
  const named = open.filter(o => String(o.name ?? "").trim().toLowerCase() === name);
  return named.length === 1 ? named[0] : null;
}

/** The one open vow `text` names: exactly, else as whole words either way; null for none or several. */
function vowNamedBy(open, text) {
  const lo = String(text ?? "").trim().toLowerCase();
  if (!lo) return null;
  const exact = open.filter(v => String(v.name ?? "").trim().toLowerCase() === lo);
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const words = open.filter(v => wholeWordsFit(String(v.name ?? "").toLowerCase(), lo));
  return words.length === 1 ? words[0] : null;
}

/**
 * The vow this scene serves (issue #353 R3), and why — a bounded ladder:
 *   1. a linked track's vow: an open fight, scene challenge or expedition
 *      linked to an open vow — a fight first, then a scene challenge, then an
 *      expedition, the newest of a kind;
 *   2. the session's quest focus, when it names one open vow;
 *   3. the only vow in play: the one quest (questVows), else — with no quest
 *      in play — the one open vow.
 * Null when none of these settles on one vow.
 *
 * @param {{ vows?: Object[], tracks?: Object[], focus?: { quest?: string }|null }} input
 *   vows — tableVows'; tracks — the open tracks (listOpenProgressTracks);
 *   focus — campaignState.sessionFocus
 * @returns {{ vow: Object, source: "track"|"focus"|"only", track?: { type: string, label: string } }|null}
 */
export function selectSceneVow({ vows = [], tracks = [], focus = null } = {}) {
  const all  = (Array.isArray(vows) ? vows : []).filter(Boolean);
  const open = distinctOpenVows(all);
  if (!open.length) return null;

  const linked = (Array.isArray(tracks) ? tracks : [])
    .filter(t => t && !t.completed && LINKED_TRACK_ORDER.includes(t.type))
    .map(track => ({ track, vow: linkedOpenVow(track, open, all) }))
    .filter(x => x.vow)
    .sort((a, b) => (LINKED_TRACK_ORDER.indexOf(a.track.type) - LINKED_TRACK_ORDER.indexOf(b.track.type))
      || ((Number(b.track.createdAt) || 0) - (Number(a.track.createdAt) || 0)));
  if (linked.length) {
    const { track, vow } = linked[0];
    return { vow, source: "track", track: { type: track.type, label: String(track.label ?? "").trim() } };
  }

  const focused = vowNamedBy(open, focus?.quest);
  if (focused) return { vow: focused, source: "focus" };

  const quests = distinctOpenVows(questVows(all));
  if (quests.length === 1) return { vow: quests[0], source: "only" };
  if (!quests.length && open.length === 1) return { vow: open[0], source: "only" };
  return null;
}

/**
 * selectSceneVow over the characters' vows as they stand — the narrator's
 * `extras.sceneVow` (narrator.js buildNarratorExtras). Fail-open: null.
 *
 * @param {{ tracks?: Object[], focus?: Object|null }} [input]
 * @returns {Object|null}
 */
export function readSceneVow({ tracks = [], focus = null } = {}) {
  return selectSceneVow({ vows: tableVows(), tracks, focus });
}

/**
 * The open vows a vow link or a quest focus can name, one per vow:
 * `{ id, name, label }` — `id` the vow's id across its copies (what a link
 * stores), `label` its name, with whose vow it is when more than one
 * character holds vows and this one is not everyone's.
 *
 * @param {Object[]} [vows] — tableVows' (read now when not given)
 * @returns {Array<{ id: string, name: string, label: string }>}
 */
export function vowChoices(vows = tableVows()) {
  const all = (Array.isArray(vows) ? vows : []).filter(Boolean);
  const pcs = new Set(all.map(v => v.actorId).filter(Boolean));
  return distinctOpenVows(all)
    .filter(v => String(v.name ?? "").trim())
    .map(v => {
      const name = String(v.name).trim();
      const whose = pcs.size > 1 && v.holders.length && v.holders.length < pcs.size ? ` (${v.holders.join(", ")})` : "";
      return { id: v.key, name, label: `${name}${whose}` };
    });
}

/**
 * The link a vow choice makes — `{ linkedVowId, linkedVowName }` — for an
 * open vow named by its id (a copy's `vowId` or its Item id), as the vows
 * stand now; null for any other id: a vow fulfilled, forsaken or deleted
 * since the choice was offered is not linked. The canonical GM checks what a
 * panel sent this way (rules/reachability.md §8).
 *
 * @param {string} id
 * @param {Object[]} [vows] — tableVows' (read now when not given)
 * @returns {{ linkedVowId: string, linkedVowName: string|null }|null}
 */
export function resolveVowChoice(id, vows = tableVows()) {
  const want = typeof id === "string" ? id.trim() : "";
  if (!want) return null;
  const copy = (Array.isArray(vows) ? vows : []).find(v => v && !v.completed && (vowKey(v) === want || v.id === want));
  return copy ? { linkedVowId: vowKey(copy), linkedVowName: String(copy.name ?? "").trim() || null } : null;
}

/**
 * The connections the characters hold — their bond Items, a severed one left
 * out — one per name, in roster order: End a Session's connection-focus
 * choices (R4). Fail-open: none.
 *
 * @returns {string[]}
 */
export function tableConnectionNames() {
  try {
    const names = [];
    for (const actor of getPlayerActors() ?? []) {
      for (const c of readConnections(actor) ?? []) {
        const name = String(c?.name ?? "").trim();
        if (!name || c.lost === true) continue;
        if (!names.some(n => n.toLowerCase() === name.toLowerCase())) names.push(name);
      }
    }
    return names;
  } catch (err) {
    console.warn(`${MODULE_ID} | open threads: the characters' connections could not be read:`, err?.message ?? err);
    return [];
  }
}

/** The tracks the Progress Tracks panel lists, as the Session panel names them. */
const TRACK_KIND_LABELS = Object.freeze({ combat: "Fight", expedition: "Expedition", scene_challenge: "Scene challenge" });

/** Filled progress boxes, 0–10. */
const boxes = (n) => Math.max(0, Math.min(10, Math.floor(Number(n) || 0)));

/**
 * The name of the vow a track serves: its linked vow's name now (by its
 * `linkedVowId`, so a renamed vow is named as it is), else the name it was
 * linked under (a fight's threshold link carries the name only); null for a
 * track that serves none.
 *
 * @param {Object} track
 * @param {Object[]} [vows] — tableVows' (read now when not given)
 * @returns {string|null}
 */
export function trackVowName(track, vows = tableVows()) {
  const id = typeof track?.linkedVowId === "string" ? track.linkedVowId : "";
  if (id) {
    const copy = (Array.isArray(vows) ? vows : []).find(v => v && (vowKey(v) === id || v.id === id));
    const now = String(copy?.name ?? "").trim();
    if (now) return now;
  }
  const name = typeof track?.linkedVowName === "string" ? track.linkedVowName.trim() : "";
  return name || null;
}

/**
 * The Session panel's "what's open" rows (issue #353 R4), from the stores
 * that hold them — no model call:
 *   - vows: the open vows, one per vow, with rank, filled boxes, countdown
 *     clock and holders; `questInPlay` false when no character holds a vow
 *     besides a background vow (questVows);
 *   - tracks: the open fights, expeditions and scene challenges, with rank,
 *     filled boxes, the vow each serves and a scene challenge's danger clock;
 *   - clocks: the running clocks — active and not yet full — less a scene
 *     challenge's own, which its row shows.
 *
 * @param {{ vows?: Object[], tracks?: Object[], clocks?: Object[] }} input
 *   vows — tableVows'; tracks — listOpenProgressTracks'; clocks — campaignState.clocks
 * @returns {{ vows: Object[], questInPlay: boolean, tracks: Object[], clocks: Object[] }}
 */
export function openThreadRows({ vows = [], tracks = [], clocks = [] } = {}) {
  const all       = (Array.isArray(vows) ? vows : []).filter(Boolean);
  const clockList = (Array.isArray(clocks) ? clocks : []).filter(c => c && typeof c.name === "string" && c.name.trim());
  const clockById = new Map(clockList.map(c => [c._id, c]));
  const open      = (Array.isArray(tracks) ? tracks : [])
    .filter(t => t && !t.completed && TRACK_KIND_LABELS[t.type] && String(t.label ?? "").trim());
  const paired    = new Set(open.map(t => t.tensionClockId).filter(Boolean));
  const running   = (c) => c.active !== false && (Number(c.filled) || 0) < (Number(c.segments) || 0);
  return {
    vows: distinctOpenVows(all).map(v => ({
      name:     String(v.name ?? "").trim(),
      rank:     v.rank ?? null,
      progress: boxes(v.progress),
      clock:    Number(v.clock?.max) > 0 ? { filled: Number(v.clock.ticks) || 0, segments: Number(v.clock.max) } : null,
      holders:  v.holders,
    })),
    questInPlay: questVows(all).length > 0,
    tracks: open.map(t => {
      const clock = t.tensionClockId ? clockById.get(t.tensionClockId) : null;
      return {
        kind:     TRACK_KIND_LABELS[t.type],
        label:    String(t.label).trim(),
        rank:     t.rank ?? null,
        progress: boxes((Number(t.ticks) || 0) / 4),
        vowName:  trackVowName(t, all),
        clock:    clock && clock.active !== false ? { filled: Number(clock.filled) || 0, segments: Number(clock.segments) || 0 } : null,
      };
    }),
    clocks: clockList.filter(c => running(c) && !paired.has(c._id)).map(c => ({
      name:     c.name.trim(),
      type:     c.type === "campaign" ? "campaign" : "tension",
      filled:   Number(c.filled) || 0,
      segments: Number(c.segments) || 0,
    })),
  };
}
