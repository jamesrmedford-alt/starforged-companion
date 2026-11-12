/**
 * STARFORGED COMPANION
 * src/world/journalSplitMerge.js — the GM-confirmed merge of a split journal
 *
 * Issue #347 residual TRACKS-JOURNAL-SPLIT-NOT-MERGED (the maintainer's
 * choice: a GM-confirmed merge at load). Before issue #345 AA62 / AA63 the
 * World Journal's five journals and the Progress Tracks journal were found by
 * their name: a GM's rename in the sidebar hid one, and the next write made a
 * second beside it. A world split that way holds two journals carrying the
 * same flag; AB16 reads and writes the default-named one, so whatever the
 * other copy held — lore, threats, factions, places, session log pages, open
 * tracks — reached no reader. A sidebar Duplicate makes the same split.
 *
 * At the canonical GM's world load (`registerJournalSplitMerge`, from the
 * ready hook), for each World Journal category and the Progress Tracks
 * journal with more than one flagged copy, the GMs are whispered one card
 * listing the entries the other copies hold that the live copy lacks (by the
 * identity the writers use: a page's name — a faction's entity id or name key
 * too — and a track's id). A copy with nothing extra gets no card. The card's
 * Merge is a GM's press, relayed to the canonical GM and claimed once on the
 * card (gmRelay "journal.merge" → `applyJournalMerge`): it copies those pages
 * (with their flags) or tracks (through the tracks write queue) into the live
 * journal, renames each other copy "<name> (merged)" and stamps it
 * `journalMerged`, so no later load offers it again. Nothing is deleted. An
 * unpressed card a later load finds is retired, and a fresh one posted while
 * the split stands.
 *
 * JOURNAL-MERGE-DIFFERING-ENTRY: the card also lists the entries both copies
 * hold that were changed in the other one (newer there, or of unknown age),
 * which Merge leaves as the live journal has them — the other version stays
 * in the renamed copy; a copy holding only those gets a card too. Its Keep
 * separate stamps each copy `journalMerged: { keptSeparate: true }`, name and
 * entries untouched, so no later load asks again. A retired copy is never
 * the live journal either: with the live one deleted, the lookups
 * (worldJournal findJournal, progressTracks findTracksJournal, the
 * interpreter's track read) fell back to it.
 */

import { isCanonicalGM } from "../multiplayer/gmGate.js";
import { onChatMessageRender } from "../system/chatHooks.js";
import { relayCardAction } from "../moves/cardActions.js";
import { JOURNAL_NAMES, worldJournalCopies, journalHoldsEntry, journalEntryMatch } from "./worldJournal.js";
import { tracksJournalCopies, mergeTracksIntoLive } from "../ui/progressTracks.js";

const MODULE_ID = "starforged-companion";

/** The journals a split can hold: the World Journal's categories, then the Progress Tracks journal. */
const TRACKS = "tracks";
const CATEGORIES = [...Object.keys(JOURNAL_NAMES), TRACKS];

/** How many entries a card names per copy before "and N more". */
const LISTED_ENTRIES = 15;

const MERGE_ACTION = "sf-journal-merge";
const KEEP_ACTION  = "sf-journal-keep";

// Cards whose merge is running on this client (the canonical GM).
const _inFlight = new Set();

/** The journal title a card names a category by. */
function categoryTitle(category) {
  return category === TRACKS ? "Progress Tracks" : (JOURNAL_NAMES[category] ?? category);
}

/** The live journal and its other flagged copies, for a category. */
function copiesOf(category) {
  return category === TRACKS ? tracksJournalCopies() : worldJournalCopies(category);
}

/** A track list of a tracks journal (a copy). */
function tracksOf(journal) {
  const list = journal?.getFlag?.(MODULE_ID, "tracks");
  return Array.isArray(list) ? list : [];
}

/**
 * What `copy` holds that `live` lacks: pages (World Journal) or tracks.
 *
 * @returns {Array<{ name: string, page?: Object, track?: Object }>}
 */
function extraEntries(category, live, copy) {
  if (category === TRACKS) {
    const ids = new Set(tracksOf(live).map(t => t?.id).filter(Boolean));
    return tracksOf(copy).filter(t => t?.id && !ids.has(t.id))
      .map(t => ({ name: String(t.label ?? t.id), track: t }));
  }
  return (copy?.pages?.contents ?? []).filter(p => !journalHoldsEntry(live, p, category))
    .map(p => ({ name: String(p.name ?? ""), page: p }));
}

/** A page's last change: the newest `updatedAt` its module flags hold, or Foundry's `modifiedTime`; 0 when neither is known. */
function pageTime(page) {
  let t = Number(page?._stats?.modifiedTime) || 0;
  for (const entry of Object.values(page?.flags?.[MODULE_ID] ?? {})) {
    const u = Date.parse(entry?.updatedAt ?? "");
    if (Number.isFinite(u) && u > t) t = u;
  }
  return t;
}

/** What a page says: its text, whitespace aside (the body a GM reads and edits). */
function pageSignature(page) {
  return String(page?.text?.content ?? "").replace(/\s+/g, " ").trim();
}

/**
 * The entries `copy` holds that `live` holds too, with other text in them —
 * and not an older version of the live one (the live journal took
 * every write since the split): a change made in the copy, by a GM who took
 * it for the one in use, that Merge does not bring across. Listed on the card
 * so it is not lost unseen (JOURNAL-MERGE-DIFFERING-ENTRY). World Journal
 * pages only — a track holds no text, and a copy's tracks are the state
 * before the split.
 *
 * @returns {Array<{ name: string }>}
 */
function differingEntries(category, live, copy) {
  if (category === TRACKS) return [];
  const out = [];
  for (const page of copy?.pages?.contents ?? []) {
    const held = journalEntryMatch(live, page, category);
    if (!held || pageSignature(held) === pageSignature(page)) continue;
    const [mine, theirs] = [pageTime(page), pageTime(held)];
    if (mine && theirs && mine <= theirs) continue;
    out.push({ name: String(page.name ?? "") });
  }
  return out;
}

/**
 * Each copy of a category with what it holds that the live journal lacks,
 * and the entries both hold that it changed — copies with neither left out.
 */
function splitOf(category) {
  const { live, copies } = copiesOf(category);
  if (!live || !copies.length) return null;
  const listed = copies.map(copy => ({
    copy,
    extras:    extraEntries(category, live, copy),
    differing: differingEntries(category, live, copy),
  })).filter(c => c.extras.length || c.differing.length);
  return listed.length ? { live, copies: listed } : null;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function gmIds() {
  return (globalThis.game?.users?.filter?.(u => u?.isGM) ?? []).map(u => u.id);
}

/** A card's list of entry names: the first LISTED_ENTRIES, then "and N more". */
function entryList(entries) {
  const shown = entries.slice(0, LISTED_ENTRIES).map(e => `<li>${escapeHtml(e.name)}</li>`).join("");
  const more  = entries.length > LISTED_ENTRIES ? `<li>…and ${entries.length - LISTED_ENTRIES} more</li>` : "";
  return `<ul>${shown}${more}</ul>`;
}

/** The card's HTML: the live journal, each copy's extra and differing entries, the Merge and Keep separate buttons. */
function cardContent(category, split) {
  const title = categoryTitle(category);
  const what  = category === TRACKS ? "tracks" : "entries";
  const liveName = escapeHtml(split.live.name);
  const copies = split.copies.map(({ copy, extras, differing }) => {
    const name = `<strong>${escapeHtml(copy.name)}</strong>`;
    return (extras.length ? `<p>${name} — ${extras.length} ${what} not in the journal the companion uses:</p>${entryList(extras)}` : "")
      + (differing.length
        ? `<p>${name} — ${differing.length} ${differing.length === 1 ? "entry" : "entries"} both journals hold, changed in this one. Merge keeps <strong>${liveName}</strong>'s; compare them by hand:</p>${entryList(differing)}`
        : "");
  }).join("");
  return `<div class="sf-journal-merge-card">`
    + `<p><strong>📚 Split journal: ${escapeHtml(title)}</strong></p>`
    + `<p>More than one journal holds this record. The companion reads and writes <strong>${liveName}</strong>; the narrator and the panels never see the others.</p>`
    + copies
    + `<p>Merge copies the missing ${what} into <strong>${liveName}</strong> and renames each other journal "… (merged)". Keep separate leaves the other journals as they are and stops asking. Nothing is deleted.</p>`
    + `<div class="sf-milestone-suggest-row">`
    + `<button type="button" class="sf-followup-btn" data-action="${MERGE_ACTION}">Merge</button>`
    + `<button type="button" class="sf-followup-btn" data-action="${KEEP_ACTION}">Keep separate</button>`
    + `</div></div>`;
}

/** The card's HTML once it is done with: why, no button. */
function closedContent(category, line) {
  return `<div class="sf-journal-merge-card"><p><strong>📚 Split journal: ${escapeHtml(categoryTitle(category))}</strong></p><p>${line}</p></div>`;
}

/** Unpressed merge cards of a category in chat. */
function openCards(category) {
  return (globalThis.game?.messages?.contents ?? []).filter(m => {
    const f = m?.flags?.[MODULE_ID];
    return f?.journalMergeCard === true && f.category === category && !f.journalMerge;
  });
}

/**
 * The canonical GM's check at world load: retire the unpressed cards an
 * earlier load posted, then post one card per split category whose other
 * copies hold something the live journal lacks. Never throws.
 *
 * @returns {Promise<number>} the cards posted
 */
export async function checkJournalSplits() {
  if (!isCanonicalGM()) return 0;
  let posted = 0;
  for (const category of CATEGORIES) {
    try {
      const split = splitOf(category);
      for (const old of openCards(category)) {
        await old.update({
          content: closedContent(category, split ? "A newer card below lists this merge." : "Nothing is left to merge."),
          [`flags.${MODULE_ID}.journalMerge`]: "superseded",
        }).catch(err => console.warn(`${MODULE_ID} | journal merge: an earlier card could not be retired:`, err?.message ?? err));
      }
      if (!split) continue;
      await ChatMessage.create({
        content: cardContent(category, split),
        whisper: gmIds(),
        flags:   { [MODULE_ID]: {
          journalMergeCard: true, category,
          liveId:  split.live.id ?? null,
          copyIds: split.copies.map(c => c.copy.id).filter(Boolean),
        } },
      });
      posted += 1;
    } catch (err) {
      console.warn(`${MODULE_ID} | journal merge: checking the ${categoryTitle(category)} journals failed:`, err?.message ?? err);
    }
  }
  return posted;
}

/**
 * The Merge press, on the canonical GM (gmRelay "journal.merge"). A GM's
 * press on a GM-authored merge card, claimed once on the card
 * (`journalMerge: "merging"`, then `"merged"`): copies each listed copy's
 * extra entries into the live journal, then renames the copy
 * "<name> (merged)" and stamps it `journalMerged`. The journals are read
 * again at the press; a card whose live journal is no longer the live one is
 * refused as stale. A failure releases the claim and tells the GMs; a press
 * again copies only what is still missing.
 *
 * With `keep: true` (the Keep separate press) nothing is copied or renamed:
 * the listed copies are stamped kept separate (keepSeparate).
 *
 * @param {{ messageId: string, keep?: boolean }} payload
 * @param {{ requesterIsGM?: boolean, requesterId?: string }} ctx
 * @returns {Promise<Object>}
 */
export async function applyJournalMerge(payload = {}, ctx = {}) {
  const messageId = typeof payload?.messageId === "string" ? payload.messageId : null;
  const message   = messageId ? (globalThis.game?.messages?.get?.(messageId) ?? null) : null;
  const f = message?.flags?.[MODULE_ID] ?? {};
  if (!message || f.journalMergeCard !== true || message.author?.isGM !== true || !CATEGORIES.includes(f.category)) {
    console.warn(`${MODULE_ID} | journal merge: message ${messageId ?? "?"} is not a GM's merge card — ignored.`);
    return { applied: false, reason: "not-a-merge-card" };
  }
  if (!ctx?.requesterIsGM) {
    console.warn(`${MODULE_ID} | journal merge: user ${ctx?.requesterId ?? "?"} is not a GM — refused.`);
    return { applied: false, reason: "not-gm" };
  }
  if (f.journalMerge || _inFlight.has(messageId)) return { applied: false, reason: "already-resolved" };

  const category = f.category;
  _inFlight.add(messageId);
  try {
    try {
      await message.update({ [`flags.${MODULE_ID}.journalMerge`]: "merging" });
    } catch (err) {
      console.warn(`${MODULE_ID} | journal merge: card ${messageId} could not be claimed — nothing merged:`, err?.message ?? err);
      return { applied: false, reason: "claim-refused" };
    }

    const { live, copies } = copiesOf(category);
    if (!live || (f.liveId && live.id !== f.liveId)) {
      await message.update({
        content: closedContent(category, "The journals changed since this card was posted. Reload the world for a fresh card."),
        [`flags.${MODULE_ID}.journalMerge`]: "stale",
      }).catch(err => console.warn(`${MODULE_ID} | journal merge: card ${messageId} could not be closed as stale:`, err?.message ?? err));
      return { applied: false, reason: "stale" };
    }
    const listed = new Set(Array.isArray(f.copyIds) ? f.copyIds : []);
    if (payload?.keep === true) return await keepSeparate(message, category, live, copies.filter(c => listed.has(c.id)));
    let copied = 0;
    const renamed = [];
    const differing = [];
    try {
      for (const copy of copies.filter(c => listed.has(c.id))) {
        differing.push(...differingEntries(category, live, copy).map(e => e.name));
        const extras = extraEntries(category, live, copy);
        if (category === TRACKS) {
          copied += await mergeTracksIntoLive(extras.map(e => e.track));
        } else if (extras.length) {
          await live.createEmbeddedDocuments("JournalEntryPage", extras.map(e => pageData(e.page)));
          copied += extras.length;
        }
        const name = `${copy.name} (merged)`;
        await copy.update({ name, flags: { [MODULE_ID]: { journalMerged: { into: live.id ?? null, category, at: Date.now() } } } });
        renamed.push(name);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | journal merge: the ${categoryTitle(category)} merge did not finish:`, err?.message ?? err);
      await message.update({ [`flags.${MODULE_ID}.journalMerge`]: null }).catch(() => {});
      await ChatMessage.create({
        content: closedContent(category, `The merge did not finish (${escapeHtml(err?.message ?? err)}). What was copied stays; press Merge again for the rest.`),
        whisper: gmIds(),
      }).catch(() => {});
      return { applied: false, reason: "failed" };
    }

    const line = `Merged: ${copied} ${category === TRACKS ? "tracks" : "entries"} copied into <strong>${escapeHtml(live.name)}</strong>`
      + (renamed.length ? `; renamed ${renamed.map(n => `<strong>${escapeHtml(n)}</strong>`).join(", ")}.` : ".")
      + (differing.length
        ? ` ${differing.length === 1 ? "One entry" : `${differing.length} entries`} changed in the other journal kept <strong>${escapeHtml(live.name)}</strong>'s text: ${differing.map(n => `<strong>${escapeHtml(n)}</strong>`).join(", ")} — the other version stays in the renamed journal.`
        : "");
    await message.update({ content: closedContent(category, line), [`flags.${MODULE_ID}.journalMerge`]: "merged" })
      .catch(err => console.warn(`${MODULE_ID} | journal merge: merged, but card ${messageId} could not say so:`, err?.message ?? err));
    return { applied: true, copied, renamed: renamed.length };
  } finally {
    _inFlight.delete(messageId);
  }
}

/**
 * The Keep separate press, past applyJournalMerge's claim: each listed copy
 * is stamped `journalMerged` with `keptSeparate` — out of the split check
 * and every lookup, its name and entries left as they are — so the card,
 * which returned at every load until merged, is not posted again
 * (JOURNAL-MERGE-DIFFERING-ENTRY). A refused stamp frees the card and tells
 * the GMs; a press again stamps the rest.
 *
 * @returns {Promise<Object>}
 */
async function keepSeparate(message, category, live, copies) {
  const kept = [];
  try {
    for (const copy of copies) {
      await copy.update({ flags: { [MODULE_ID]: { journalMerged: { into: null, category, at: Date.now(), keptSeparate: true } } } });
      kept.push(copy.name);
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | journal merge: keeping the ${categoryTitle(category)} journals separate did not finish:`, err?.message ?? err);
    await message.update({ [`flags.${MODULE_ID}.journalMerge`]: null }).catch(() => {});
    await ChatMessage.create({
      content: closedContent(category, `Keep separate did not finish (${escapeHtml(err?.message ?? err)}). Press it again.`),
      whisper: gmIds(),
    }).catch(() => {});
    return { applied: false, reason: "failed" };
  }
  const line = `Kept separate: ${kept.map(n => `<strong>${escapeHtml(n)}</strong>`).join(", ")} left as ${kept.length === 1 ? "it is" : "they are"}. `
    + `The companion reads and writes only <strong>${escapeHtml(live.name)}</strong>, and no later load asks again.`;
  await message.update({ content: closedContent(category, line), [`flags.${MODULE_ID}.journalMerge`]: "kept" })
    .catch(err => console.warn(`${MODULE_ID} | journal merge: kept separate, but card ${message.id} could not say so:`, err?.message ?? err));
  return { applied: true, kept: kept.length };
}

/** A page's data for its copy in another journal: everything but its id. */
function pageData(page) {
  if (typeof page?.toObject === "function") {
    const data = page.toObject();
    delete data._id;
    return data;
  }
  return {
    name:  page?.name ?? "",
    type:  page?.type ?? "text",
    text:  page?.text ? foundry.utils.deepClone(page.text) : undefined,
    flags: foundry.utils.deepClone(page?.flags ?? {}),
  };
}

/**
 * The Merge and Keep separate buttons: a GM's press relays to the canonical
 * GM (one relay kind, `keep` naming the second); a pressed card shows none.
 */
function wireMergeButton(message, root) {
  const f = message?.flags?.[MODULE_ID];
  if (f?.journalMergeCard !== true) return;
  const buttons = [
    { btn: root.querySelector(`[data-action="${MERGE_ACTION}"]`), keep: false },
    { btn: root.querySelector(`[data-action="${KEEP_ACTION}"]`),  keep: true },
  ].filter(b => b.btn);
  if (!buttons.length) return;
  if (f.journalMerge || !game.user?.isGM) { for (const { btn } of buttons) btn.disabled = true; return; }
  for (const { btn, keep } of buttons) {
    btn.addEventListener("click", async (ev) => {
      ev?.preventDefault?.();
      if (btn.disabled) return;
      for (const b of buttons) b.btn.disabled = true;
      await relayCardAction({
        kind:       "journal.merge",
        payload:    keep ? { messageId: message.id, keep: true } : { messageId: message.id },
        isResolved: () => !!game.messages?.get?.(message.id)?.flags?.[MODULE_ID]?.journalMerge,
        restore:    () => { for (const b of buttons) b.btn.disabled = false; },
      });
    });
  }
}

/**
 * Wire the merge card's button on every client, and run the canonical GM's
 * check (ready). Fire-and-forget.
 */
export function registerJournalSplitMerge() {
  onChatMessageRender(wireMergeButton);
  if (isCanonicalGM()) {
    checkJournalSplits().catch(err =>
      console.warn(`${MODULE_ID} | journal merge: the split check failed:`, err?.message ?? err));
  }
}
