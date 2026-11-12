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
 */

import { isCanonicalGM } from "../multiplayer/gmGate.js";
import { onChatMessageRender } from "../system/chatHooks.js";
import { relayCardAction } from "../moves/cardActions.js";
import { JOURNAL_NAMES, worldJournalCopies, journalHoldsEntry } from "./worldJournal.js";
import { tracksJournalCopies, mergeTracksIntoLive } from "../ui/progressTracks.js";

const MODULE_ID = "starforged-companion";

/** The journals a split can hold: the World Journal's categories, then the Progress Tracks journal. */
const TRACKS = "tracks";
const CATEGORIES = [...Object.keys(JOURNAL_NAMES), TRACKS];

/** How many entries a card names per copy before "and N more". */
const LISTED_ENTRIES = 15;

const MERGE_ACTION = "sf-journal-merge";

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

/** Each copy of a category with what it holds that the live journal lacks — copies with nothing extra left out. */
function splitOf(category) {
  const { live, copies } = copiesOf(category);
  if (!live || !copies.length) return null;
  const withExtras = copies.map(copy => ({ copy, extras: extraEntries(category, live, copy) }))
    .filter(c => c.extras.length);
  return withExtras.length ? { live, copies: withExtras } : null;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function gmIds() {
  return (globalThis.game?.users?.filter?.(u => u?.isGM) ?? []).map(u => u.id);
}

/** The card's HTML: the live journal, each copy's extra entries, the Merge button. */
function cardContent(category, split) {
  const title = categoryTitle(category);
  const what  = category === TRACKS ? "tracks" : "entries";
  const copies = split.copies.map(({ copy, extras }) => {
    const shown = extras.slice(0, LISTED_ENTRIES).map(e => `<li>${escapeHtml(e.name)}</li>`).join("");
    const more  = extras.length > LISTED_ENTRIES ? `<li>…and ${extras.length - LISTED_ENTRIES} more</li>` : "";
    return `<p><strong>${escapeHtml(copy.name)}</strong> — ${extras.length} ${what} not in the journal the companion uses:</p><ul>${shown}${more}</ul>`;
  }).join("");
  return `<div class="sf-journal-merge-card">`
    + `<p><strong>📚 Split journal: ${escapeHtml(title)}</strong></p>`
    + `<p>More than one journal holds this record. The companion reads and writes <strong>${escapeHtml(split.live.name)}</strong>; the narrator and the panels never see the others.</p>`
    + copies
    + `<p>Merge copies them into <strong>${escapeHtml(split.live.name)}</strong> and renames each other journal "… (merged)". Nothing is deleted.</p>`
    + `<div class="sf-milestone-suggest-row"><button type="button" class="sf-followup-btn" data-action="${MERGE_ACTION}">Merge</button></div>`
    + `</div>`;
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
 * @param {{ messageId: string }} payload
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
    let copied = 0;
    const renamed = [];
    try {
      for (const copy of copies.filter(c => listed.has(c.id))) {
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
      + (renamed.length ? `; renamed ${renamed.map(n => `<strong>${escapeHtml(n)}</strong>`).join(", ")}.` : ".");
    await message.update({ content: closedContent(category, line), [`flags.${MODULE_ID}.journalMerge`]: "merged" })
      .catch(err => console.warn(`${MODULE_ID} | journal merge: merged, but card ${messageId} could not say so:`, err?.message ?? err));
    return { applied: true, copied, renamed: renamed.length };
  } finally {
    _inFlight.delete(messageId);
  }
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

/** The Merge button: a GM's press relays to the canonical GM; a pressed card shows none. */
function wireMergeButton(message, root) {
  const f = message?.flags?.[MODULE_ID];
  if (f?.journalMergeCard !== true) return;
  const btn = root.querySelector(`[data-action="${MERGE_ACTION}"]`);
  if (!btn) return;
  if (f.journalMerge || !game.user?.isGM) { btn.disabled = true; return; }
  btn.addEventListener("click", async (ev) => {
    ev?.preventDefault?.();
    if (btn.disabled) return;
    btn.disabled = true;
    await relayCardAction({
      kind:       "journal.merge",
      payload:    { messageId: message.id },
      isResolved: () => !!game.messages?.get?.(message.id)?.flags?.[MODULE_ID]?.journalMerge,
      restore:    () => { btn.disabled = false; },
    });
  });
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
