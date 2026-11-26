/**
 * STARFORGED COMPANION
 * src/session/endSessionVignette.js — End a Session's closing cutaway.
 *
 * A short scene away from the characters, at the session's close: someone
 * the campaign has — a connection in play, a named threat — or, with nobody,
 * a settlement the table knows, at something small, built from material
 * rolled on the game's oracles (issue #381; sceneSeeds.js). "A cutaway to an
 * NPC in a place the players are NOT" (decisions.md); specific, small,
 * almost tender. Its scene is its own and ends with its card
 * (safety/sessionLifecycleDialogs.js).
 *
 * Who it shows (chooseClosingSubject), in this order:
 *   1. the table's choice — End a Session's connection focus, when it names a
 *      connection in play who was not with the characters at the end;
 *   2. else a die among the campaign's people — the connections in play and
 *      the named active threats (sceneRecords.js) — weighted as the old fixed
 *      priority ranked them: a bonded connection three, a connection of rank
 *      dangerous or above two, a named threat two, any other connection one.
 *      The fixed priority gave the same answer at every End a Session: one
 *      campaign's three closings were Tamsin three times;
 *   3. never the one the last closing showed, while there is another — read
 *      in code from the last closing card's flags (its `builtFrom` subject,
 *      by stable ref; a card from before that, by `vignetteNpc`);
 *   4. never someone the scene the session ended in had with the characters
 *      (its frame's Present line): a cutaway to a person beside them is no
 *      cutaway. With everyone the campaign has beside them, it is a place
 *      (issue #388 #3: one NPC, present, was shown "somewhere the characters
 *      are NOT" twice in the fifth live long haul);
 *   5. with nobody else, a die among the active sector's settlements, other than
 *      the one the characters are at — and not the last closing's, while
 *      there is another. With no such place there is no closing (issue #381
 *      D6). The old fifth and sixth tiers — "the architect of" the sector's
 *      trouble, "a familiar adversary you can't quite name" — were nobody the
 *      table knew: the third live run's closings were an unnamed woman three
 *      times.
 *
 * Then the dice (sceneSeeds.js rollClosingSeeds): where they are — their
 * card's LAST KNOWN location, else a settlement zone and its area — what they
 * are busy with, and the thing in hand. The lists of example tasks ("eating,
 * tidying, watering a plant …") and of example gestures ("a shrug, a
 * half-smile, switching a light off …") are gone: given examples, the model
 * wrote the examples — a darned sock in two separate campaigns.
 *
 * Reuses the `session_vignette` narrator mode (narratorPrompt.js
 * ROLE_DESCRIPTIONS) with the user message's FLAVOUR set to CLOSING.
 */

import { wholeWordsFit } from "../context/relevanceResolver.js";
import { proseToHtml } from "../audio/segments.js";
import { earlierVignettes, formatEarlierVignettes } from "./vignetteHistory.js";
import { connectionsInPlay, namedThreats, sectorSettlements } from "./sceneRecords.js";
import { drawDie, chooseSeed, recordSeed, rollClosingSeeds, formatMaterial, seedsForFlags, factBlockWritten } from "./sceneSeeds.js";

const MODULE_ID = "starforged-companion";

const RANK_WEIGHT = { troublesome: 1, dangerous: 2, formidable: 3, extreme: 4, epic: 5 };

/** What the subject's die is cast among, to the narrator and the table. */
const PEOPLE_POOL = "the campaign's people";
const PLACES_POOL = "the active sector's settlements";

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/**
 * The campaign's people a closing may show, each with its weight in the die:
 * the connections in play, then the named threats (one who is both is the
 * connection).
 *
 * @param {Object} campaignState
 * @returns {Object[]}
 */
function campaignPeople(campaignState) {
  const people = connectionsInPlay(campaignState).map(c => ({
    ...c, weight: c.bonded ? 3 : ((RANK_WEIGHT[c.rank] ?? 0) >= 2 ? 2 : 1),
  }));
  for (const t of namedThreats(campaignState)) {
    if (people.some(p => p.name.toLowerCase() === t.name.toLowerCase())) continue;
    people.push({ ...t, weight: 2, lastKnown: "" });
  }
  return people;
}

/**
 * Whom — or where — the last closing showed: the newest closing card the
 * table still has (not one the X-Card removed, an upgrade struck or a
 * fallback). Its `builtFrom` subject, by ref and name; on a card from before
 * issue #381, the name it featured (`vignetteNpc`). Null with none.
 *
 * @param {Object[]|null} [messages] — default: the chat
 * @returns {{ ref: string|null, name: string }|null}
 */
function lastClosingShown(messages = null) {
  const list = Array.isArray(messages) ? messages : (globalThis.game?.messages?.contents ?? []);
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const f = list[i]?.flags?.[MODULE_ID];
    if (!f?.sessionVignetteCard || f.vignetteKind !== "npc_end") continue;
    if (f.xCarded || f.burnSuperseded || f.narrationFallback) continue;
    const seed = (Array.isArray(f.builtFrom) ? f.builtFrom : []).find(s => s?.slot === "subject") ?? null;
    const name = clean(seed?.result ?? f.vignetteNpc);
    if (!name) continue;
    return { ref: typeof seed?.ref === "string" && seed.ref ? seed.ref : null, name };
  }
  return null;
}

/** The subject the last closing showed: by ref when both have one, else by name. */
function shownLast(option, last) {
  if (!last) return false;
  if (option.ref && last.ref) return option.ref === last.ref;
  return option.name.toLowerCase() === last.name.toLowerCase();
}

/** Leave out what `drop` names — while something else is left. */
function whileAnother(options, drop) {
  const kept = options.filter(o => !drop(o));
  return kept.length ? kept : options;
}

/** The names the scene frame's Present line gives. */
const presentIn = (frame) => (Array.isArray(frame?.present) ? frame.present : []).map(clean).filter(Boolean);

/**
 * The connection the table's connection focus names, by a bounded ladder
 * (rules/reachability.md §6): its name; its name, whole, inside the focus;
 * its first name, whole, inside it — each rung only when one connection fits,
 * and none when two do.
 *
 * @param {string} focus
 * @param {Object[]} people — campaignPeople's
 * @returns {Object|null}
 */
function connectionNamedBy(focus, people) {
  const text = clean(focus);
  if (!text) return null;
  const connections = people.filter(p => p.kind !== "threat");
  const rungs = [
    (p) => p.name.toLowerCase() === text.toLowerCase(),
    (p) => wholeWordsFit(text, p.name),
    (p) => { const first = p.name.split(" ")[0]; return first.length > 2 && wholeWordsFit(text, first); },
  ];
  for (const fits of rungs) {
    const found = connections.filter(fits);
    if (found.length === 1) return found[0];
    if (found.length > 1) return null;
  }
  return null;
}

/**
 * Whom — or, with nobody, where — the closing cutaway shows, as its first
 * seed (the file header has the order). A die is drawn only where there is
 * a choice to make: a pool of one is its seed with no die.
 *
 * @param {Object} campaignState
 * @param {{ connectionFocus?: string, frame?: Object|null, messages?: Object[]|null, draw?: (faces: number) => number }} [opts] —
 *   `connectionFocus`: End a Session's; `frame`: the scene frame the session
 *   ended in (its Present line, its Where); `messages`: the chat the last
 *   closing is read from (default: the chat)
 * @returns {{ seed: Object, option: Object }|null} null: nobody and nowhere — no closing
 */
export function chooseClosingSubject(campaignState, { connectionFocus = "", frame = null, messages = null, draw = drawDie } = {}) {
  const people = campaignPeople(campaignState);
  // Whoever the session's last scene had with the characters is never the
  // cutaway: it shows the world going on without them. With one person in
  // the campaign and that person present, the pool used to fall back to her,
  // and the prompt said she "is not with them" — the fifth live long haul
  // walked Tamsin through Hollow Spire's market moments after she stood beside
  // Mira at Bleakhold (a94; a17 the same; issue #388 #3). Nobody else → a place.
  const present = presentIn(frame);
  const withThem = (o) => present.some(n => wholeWordsFit(n, o.name));
  const away = people.filter(o => !withThem(o));
  const named = connectionNamedBy(connectionFocus, people);
  if (named && !withThem(named)) {
    return { option: named, seed: recordSeed("subject", "Who it shows", "the table's connection focus", named.name, { ref: named.ref, kind: named.kind }) };
  }
  const last = lastClosingShown(messages);
  if (away.length) {
    const pool = whileAnother(away, o => shownLast(o, last));
    const chosen = chooseSeed("subject", "Who it shows", PEOPLE_POOL, pool, draw);
    return chosen ? { seed: chosen.seed, option: chosen.pick } : null;
  }
  const where = clean(frame?.location);
  const here  = campaignState?.currentLocationId ?? null;
  const places = sectorSettlements(campaignState)
    .filter(s => !(here && s.id === here) && !(where && wholeWordsFit(where, s.name)));
  const chosen = chooseSeed("subject", "Where it shows", PLACES_POOL, whileAnother(places, o => shownLast(o, last)), draw);
  return chosen ? { seed: chosen.seed, option: chosen.pick } : null;
}

/**
 * The closing cutaway, ready to narrate: whom or where it shows, its rolled
 * material and its user message. Run once, on the canonical GM, for a scene
 * that will be narrated (safety/sessionLifecycleDialogs.js endSessionOnce):
 * this is where the closing's dice are rolled. Null with nobody and nowhere
 * to show — nothing is rolled then, and there is no closing.
 *
 * @param {Object} campaignState
 * @param {{ connectionFocus?: string, frame?: Object|null, draw?: (faces: number) => number }} [opts]
 * @returns {{ userMessage: string, seeds: Object[], subject: Object }|null}
 */
export function composeClosingScene(campaignState, { connectionFocus = "", frame = null, draw = drawDie } = {}) {
  let chosen = null;
  try {
    chosen = chooseClosingSubject(campaignState, { connectionFocus, frame, draw });
  } catch (err) {
    console.warn(`${MODULE_ID} | closing scene: whom it shows could not be chosen — no closing:`, err?.message ?? err);
    return null;
  }
  if (!chosen) return null;
  const { seed, option } = chosen;
  // Their LAST KNOWN place — unless the scene just ended had them with the
  // characters: that place is where the characters are, so it is rolled.
  const withThem = presentIn(frame).some(n => wholeWordsFit(n, option.name));
  const seeds = rollClosingSeeds({ subject: seed, lastKnown: withThem ? "" : option.lastKnown }, draw);
  const userMessage = buildEndSessionVignetteUserMessage(option, campaignState, {
    seeds, charactersAt: frame?.location ?? "", account: factBlockWritten(),
  });
  return { userMessage, seeds, subject: option };
}

/**
 * Build the user-message body for the closing cutaway's narrator call: who or
 * where it shows (the "Subject (<kind>): <name>." line the playtest runner's
 * counts read — test/ci/playwright/scene-counts.mjs closingSubject), where
 * the characters are, its MATERIAL (sceneSeeds.js), the earlier closings as
 * already used, how it stops, and its length last. Pure.
 *
 * @param {{ kind: string, name: string, hint?: string }} subject
 * @param {Object} campaignState
 * @param {{ earlier?: Array|null, seeds?: Object[]|null, charactersAt?: string, account?: boolean }} [opts] —
 *   `earlier`: the earlier closings, else read from the chat; `seeds`: the
 *   scene's material; `charactersAt`: where the session's last scene had the
 *   characters (its frame's Where); `account`: false when the narration
 *   writes no fact block
 * @returns {string}
 */
export function buildEndSessionVignetteUserMessage(subject, campaignState, { earlier = null, seeds = null, charactersAt = "", account = true } = {}) {
  const sectorName = campaignState?.sectors?.find?.(s => s?.id === campaignState?.activeSectorId)?.name
                 ?? "an unspecified sector";
  const name  = clean(subject?.name) || "someone the campaign knows";
  const place = subject?.kind === "settlement";
  const hint  = clean(subject?.hint);
  const where = clean(charactersAt);
  const material = formatMaterial(seeds, { account });

  // What the earlier closings showed, as already used (issue #377 item 5,
  // CLOSING-SCENE-REPEATS): with one NPC of weight in the campaign, the long
  // haul's three closings were one scene three times — her ledger stall, a
  // meal eaten standing, the condensate filter. Kept beside the material
  // until a live run shows it holds without it (issue #381 D4, not taken).
  const earlierBlock = formatEarlierVignettes(
    "EARLIER CLOSINGS",
    Array.isArray(earlier) ? earlier : earlierVignettes(["npc_end"]),
    "Whoever is featured, show them somewhere else, at something else: not the same place, task, food or objects, and not the gesture any of them ends on.",
  );

  return [
    "CLOSING VIGNETTE — end-session cutaway.",
    "",
    "FLAVOUR: CLOSING.",
    "",
    `Subject (${clean(subject?.kind) || "connection"}): ${name}.${hint ? ` Context: ${hint}` : ""}`,
    // Where the characters are, from the frame of the scene the session
    // ended in — the cutaway is set elsewhere (issue #381).
    where
      ? `Where the characters are as the session ends: ${where}.`
      : `Ship's sector when the session ended: ${sectorName}.`,
    "",
    place
      ? `A cutaway to ${name}, away from the characters: the place going on without them, and someone there at something small. Nobody in it knows what the characters are doing now.`
      : `A cutaway to ${name}, somewhere the characters are NOT: the world going on without them. ${name} is not with them, and does not know what they are doing now.`,
    "The audience knows what this means to the campaign; the prose does not need to remind them.",
    ...(material ? ["", material] : []),
    ...(earlierBlock ? ["", earlierBlock] : []),
    "",
    // How it ends: where its material takes it, in no shape the prompt gives
    // (known-issues SET-PIECES-SHAPED-BY-THEIR-PROMPT). Told "end on a small
    // private gesture — a shrug, a half-smile, switching a light off", the
    // closings ended on a lamp put out and a nod; told "It stops when the
    // small thing is done, or put down", every closing of the fourth live run
    // ended on a thing put down (a18, a52, a87).
    "How it ends is the material's: its last sentence stays with whichever result the scene reaches last, as it stands then. No closing gesture, and nothing finished or set aside to end it. Do not describe a move, do not propose a mechanical action.",
    "",
    // Issue #354 P2-26: asked for 3-5 sentences in its opening line only, the
    // vignette ran to about eight. The limit is the last thing it reads.
    "Length: three to five sentences, about 90 words — never more than five",
    "sentences. Short ones. Count them, and stop there.",
  ].join("\n");
}

/**
 * Post the closing cutaway's card. Sentinel flag `sessionVignetteCard` is
 * the cross-cutting marker; `vignetteKind` distinguishes it from the
 * session's opening.
 *
 * @param {Object} args
 * @param {string} args.text
 * @param {string} args.npcName — whom or where it showed
 * @param {string|null} [args.sessionId]
 * @param {string|null} [args.narrationId]
 * @param {Object[]|null} [args.seeds] — the scene's rolled material, marked by its narration
 */
export async function postEndSessionVignetteCard({ text, npcName, sessionId = null, narrationId = null, seeds = null }) {
  const rolled = seedsForFlags(seeds);
  await globalThis.ChatMessage?.create?.({
    content:
      `<div class="sf-session-vignette-card"><strong>Closing — ${escapeHtml(npcName)}</strong>` +
      `<p class="sf-narration-prose">${proseToHtml(text)}</p>` +
      `<div class="sf-narration-footer">` +
      `<button class="sf-audio-play-btn" data-action="audioPlayToggle" aria-label="Play narrator audio" hidden><i class="fas fa-play"></i> Play</button>` +
      `<button class="sf-audio-stop-btn" data-action="audioStop" aria-label="Stop narrator audio" hidden><i class="fas fa-stop"></i> Stop</button>` +
      `</div></div>`,
    // narratorCard + narrationText bring the card into the audio render path.
    flags:   {
      [MODULE_ID]: {
        sessionVignetteCard: true,
        vignetteKind:        "npc_end",
        // Who it featured — the next closing's EARLIER CLOSINGS names them
        // (vignetteHistory.js earlierVignettes, issue #377 item 5).
        vignetteNpc:         npcName ?? "",
        sessionId:           sessionId ?? "",
        narratorCard:        true,
        narrationText:       text,
        // The narration's id — what an X-Card on this card retracts.
        narrationId:         narrationId ?? null,
        // What the scene was built from — its subject by stable ref, its
        // rolls, the narration's account of each (issue #381): the one store
        // of them. "Rolled for this scene" is rendered from here, and the
        // next closing reads from it whom this one showed.
        ...(rolled.length ? { builtFrom: rolled } : {}),
      },
    },
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
