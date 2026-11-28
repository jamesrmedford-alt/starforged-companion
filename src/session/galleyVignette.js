/**
 * STARFORGED COMPANION
 * src/session/galleyVignette.js — Begin a Session's opening scene.
 *
 * A short scene of the characters whose players are at the table, in a quiet
 * moment inside the situation the last session left — set where that session
 * stopped, and built from material rolled on the game's oracles (issue #381;
 * sceneSeeds.js). The file, `collectGalleyParticipants` and the card kind
 * `galley_begin` keep their names from when the scene was set in the ship's
 * galley: every reader of them means "the session's opening scene". The
 * galley is now one row of a table, rolled only for an opening with nothing
 * behind it.
 *
 * Player enumeration — important: in this module the GM IS a player
 * (the dominant solo-GM use case has the GM running their own PC).
 * Active vs absent is determined by Foundry's `User.active` flag, NOT
 * by GM status: a PC is present while the user at the table with it is
 * connected — a player's own PC, or the GM's (one no player has) — see
 * collectGalleyParticipants.
 *
 * Solo play (no other PC registered): the character is alone. No crew is
 * invented, present or absent (issue #377 item 4: told to "invent generic
 * absurd crew", the narrator gave a solo pilot an engineer, a navigator and a
 * cook, and a helper recorded her as a crew member of her own ship). Earlier
 * openings are listed as already used (item 5), and no stat line is sent
 * (#374 A11). What that issue also made of the solo scene — "the ship's
 * noises and habits are the joke" — is gone (issue #381 D7): a fixed joke is
 * fixed stock, and both live campaigns' openings told it the same way.
 *
 * The opening is told where the last session stopped — its summary, kept as
 * LAST SESSION when this one was minted, and the last narration the table
 * read, word for word (whereLastSessionStopped) — and is set there: the long
 * haul's third opening had the character soaking apricots "for the third time
 * this week" with a raider's boarding lock standing open beside the ship, and
 * its fourth wrote "since the Wren" of a ship still grappled alongside (third
 * live run, a50 and a78). The table's own word on where and when it picks up
 * (Begin a Session's dialog) outranks both.
 *
 * Tone override: regardless of the configured narrator tone, the opening
 * always renders `wry + absurd`. The configured tone resumes for the next
 * narration after the session begins.
 */

import { readCharacterSnapshot, getPlayerActors } from "../character/actorBridge.js";
import { resolveUserActorId } from "../multiplayer/speaker.js";
import { proseToHtml } from "../audio/segments.js";
import { earlierVignettes, formatEarlierVignettes } from "./vignetteHistory.js";
import { lastSessionToTell } from "./lifecycle.js";
import { drawDie, rollOpeningSeeds, formatMaterial, seedsForFlags, factBlockWritten } from "./sceneSeeds.js";
import { resolveNarrationPerspective, sessionPerspectiveOf } from "../narration/narratorPrompt.js";
import { normalisePronouns, normalisePronounList, pronounsIn, pronounsFor, withPronouns } from "../factContinuity/pronouns.js";

const MODULE_ID = "starforged-companion";

/**
 * Collect every player character actor, split by connected state. The roster
 * is the canonical PC list (`getPlayerActors`, which excludes NPC/connection
 * cards), NOT the set of users with a `User.character` assignment — a PC actor
 * that no connected user has selected as their character was previously dropped
 * from the vignette entirely (finding B: the second PC was missing). Every PC
 * now appears, present or in the absent list so the banter still references
 * them.
 *
 * A PC is present when a connected user is at the table with it (issue #325
 * W32 — only `User.character` counted, which nothing in the module sets, so a
 * solo GM's own PC was "absent"):
 *   - a connected user has it as their `User.character`;
 *   - it is a connected player's own PC — `resolveUserActorId`, the one
 *     "whose PC is this user?" resolver (User.character, else a PC they own,
 *     else the lone PC of a solo game);
 *   - no player has it (none has it as User.character or owns it): it is the
 *     GM's — a solo game's, or a GM-run PC at a mixed table — and is at the
 *     table while a GM is connected. A GM owns every actor, so ownership
 *     never makes a player's PC the GM's.
 *
 * @param {Object|null} [campaignState] — for resolveUserActorId's solo-play rung
 * @returns {{ active: Array<{ user, actor }>, absent: Array<{ user, actor }> }}
 */
export function collectGalleyParticipants(campaignState = null) {
  const users   = globalThis.game?.users?.contents ?? [];
  const actors  = (() => { try { return getPlayerActors() ?? []; } catch { return []; } })();
  const active  = [];
  const absent  = [];

  const players  = users.filter(u => u && !u.isGM);
  const gmOnline = users.find(u => u?.isGM && u.active === true) ?? null;
  const playerPc = new Map();   // actor id → the connected player at the table with it
  for (const user of players) {
    if (user.active !== true) continue;
    let id = null;
    try {
      id = resolveUserActorId(user, campaignState);
    } catch (err) {
      console.warn(`${MODULE_ID} | galley vignette: could not resolve ${user.name ?? user.id}'s PC:`, err?.message ?? err);
    }
    if (id && !playerPc.has(id)) playerPc.set(id, user);
  }

  for (const actor of actors) {
    if (!actor) continue;
    const assigned = users.find(u => u?.character?.id === actor.id) ?? null;
    const owner    = players.find(u => u.character?.id === actor.id || ownsActor(actor, u)) ?? null;
    const present  = assigned?.active === true ? assigned
      : playerPc.get(actor.id) ?? (!owner ? gmOnline : null);
    if (present) active.push({ user: present, actor });
    else         absent.push({ user: assigned ?? owner, actor });
  }

  // Fallback: if the PC roster came back empty (unusual config), preserve the
  // old user.character enumeration so we never regress to an empty vignette.
  if (!active.length && !absent.length) {
    for (const user of users) {
      const actor = user?.character;
      if (!actor) continue;
      if (user.active === true) active.push({ user, actor });
      else                      absent.push({ user, actor });
    }
  }

  return { active, absent };
}

/**
 * Build the user-message body for the opening scene's narrator call: who is
 * in it, where the last session stopped (and that the scene is set there),
 * its MATERIAL (sceneSeeds.js), the earlier openings as already used, how it
 * ends, and its length last. Pure: what it says of the last session, the
 * material and the table's word are all handed in (composeOpeningScene).
 *
 * Character names, callsigns, pronouns and biography snippets come from the
 * actor-bridge snapshot, so any future schema rename tracks automatically.
 *
 * @param {{ active: Array, absent: Array }} participants
 * @param {Object} campaignState
 * @param {{ earlier?: Array|null, lastSession?: { text?: string, sessionNumber?: number|null, lastNarration?: string }|null,
 *   seeds?: Object[]|null, pickUp?: string, account?: boolean }} [opts] —
 *   `earlier`: the earlier openings, else read from the chat; `lastSession`:
 *   where the last session stopped (whereLastSessionStopped); `seeds`: the
 *   scene's material; `pickUp`: the table's own word on where and when the
 *   session picks up (Begin a Session's dialog); `account`: false when the
 *   narration writes no fact block
 * @returns {string}
 */
export function buildGalleyVignetteUserMessage(participants, campaignState, { earlier = null, lastSession = null, seeds = null, pickUp = "", account = true } = {}) {
  const { active, absent } = participants;

  // No stat line (issue #377 item 4, #374 A11): told "Stats: … wits 3" and to
  // "stay anchored to the PCs' established traits", the opening read a stat
  // aloud — "because Wits 3 is a lot of thinking to do on bland food".
  const summariseActor = (actor) => {
    const snap = readCharacterSnapshot(actor);
    if (!snap) return `- ${actor?.name ?? "Unknown"}`;
    const callsign  = snap.callsign ? ` ("${snap.callsign}")` : "";
    const pronouns  = snap.pronouns ? ` [${snap.pronouns}]` : "";
    const bio       = (snap.biography ?? "").trim();
    const bioLine   = bio ? `\n    Bio: ${truncate(bio, 220)}` : "";
    return `- ${snap.name}${callsign}${pronouns}${bioLine}`;
  };

  const summariseAbsent = (actor) => {
    const snap = readCharacterSnapshot(actor);
    if (!snap) return `- ${actor?.name ?? "Unknown"}`;
    const callsign = snap.callsign ? ` ("${snap.callsign}")` : "";
    // Absent crewmates are the subject of the banter, so the narrator still
    // needs their pronouns to speak of them without misgendering them
    // (pronoun-propagation cluster, sibling of finding R).
    const pronouns = snap.pronouns ? ` [${snap.pronouns}]` : "";
    // Don't include the full bio for absent players — just enough hook
    // for the active PCs to speak of them.
    const trait = (snap.biography ?? "").trim();
    return `- ${snap.name}${callsign}${pronouns}${trait ? ` — ${truncate(trait, 80)}` : ""}`;
  };

  const activeList = active.length
    ? active.map(p => summariseActor(p.actor)).join("\n")
    : "- (No active players have a character set on their Foundry user.)";

  const sectorName = campaignState?.sectors?.find?.(s => s?.id === campaignState?.activeSectorId)?.name
                 ?? "an unspecified sector";

  // With nobody else registered, nobody else is aboard (issue #377 item 4,
  // NARRATOR-ADDS-TO-THE-PREMISE; #374 A4): the instruction used to read "(No
  // absent crewmates registered — invent generic absurd crew.)", so a solo
  // pilot's galley got an engineer, a navigator and a cook — and a helper
  // then recorded her as "a crew member" of her own ship. What an absent
  // crewmate is up to is rolled (issue #381): asked for "specific and weird",
  // two openings had one "recalibrating the gravity in the laundry".
  const crewLines = absent.length
    ? [
      "Absent crewmates (referenced in banter, not present):",
      absent.map(p => summariseAbsent(p.actor)).join("\n"),
      "",
      "The characters present speak, fondly, of what each absent crewmate is up to:",
      "the MATERIAL says what, for each, and nothing else is made up for them.",
    ]
    : [
      `Nobody else is aboard: no other crewmate is registered, so there is none. Do not invent one, present or absent, and do not have ${active.length > 1 ? "the characters" : "the character"} imagine or pretend one.`,
    ];

  const picked   = cleanLine(pickUp);
  const stopped  = formatLastSessionStopped(lastSession, { outranked: !!picked });
  const behind   = !!(picked || stopped);
  const material = formatMaterial(seeds, { account });
  const hasPlace = (Array.isArray(seeds) ? seeds : []).some(s => s?.slot === "place");

  // Where the scene is set (issue #381 D1): where the last session stopped,
  // never by default the galley. The table's own word outranks the records;
  // with neither, the dice say where aboard (the MATERIAL's place).
  const whereLines = [
    ...(picked ? [
      "WHERE AND WHEN THE TABLE PICKS UP — the table's own word, which outranks everything under it:",
      picked,
      "",
      "The scene is set there and then.",
    ] : []),
    ...(stopped ? [...(picked ? [""] : []), stopped] : []),
    ...(!behind ? [
      "No earlier session is on record. Unless this session's own story so far",
      "already puts the characters somewhere, which stands, the scene is set",
      hasPlace ? "aboard the ship, in the place the MATERIAL gives." : "aboard the ship.",
    ] : []),
  ];

  // What the earlier openings showed, as already used (issue #377 item 5,
  // GALLEY-VIGNETTE-REPEATS): four openings of one campaign repeated a quarter
  // of their content — the kettle "that has outlasted three owners" twice.
  // Kept beside the material until a live run shows it holds without it
  // (issue #381 D4, not taken).
  const earlierBlock = formatEarlierVignettes(
    "EARLIER OPENINGS",
    Array.isArray(earlier) ? earlier : earlierVignettes(["galley_begin"]),
    "This one must be different from each: not the same food or drink, objects, noises, jokes or business, and not the beat any of them ends on.",
  );

  // How it ends: where its material takes it, in no shape the prompt gives
  // (known-issues SET-PIECES-SHAPED-BY-THEIR-PROMPT). Told to "end on … a
  // line of dialogue, a question, or a small interruption", a character alone
  // had nobody to speak or ask: all eight openings of two campaigns ended on
  // a device or the ship sounding. Told "Its last sentence returns to what
  // that leaves open … Nothing new happens", the fourth live run's three each
  // handled a counted object and ended still (a20, a54, a89). Only the plot
  // is held back: the first move is the players'.
  const ending = (material
    ? "How it ends is the material's: its last sentence stays with whichever result the scene reaches last."
    : "How it ends comes from the scene itself.")
    // …and never on a hook play let go (overhaul 2 §9 — the last session's
    // record lists them under Let go).
    + (!picked && lastSession?.record?.letGo?.length ? " It never ends on anything under Let go." : "");

  return [
    "OPENING VIGNETTE — begin-session.",
    "",
    "Active players (their PCs are in this scene together):",
    activeList,
    "",
    ...crewLines,
    "",
    `Ship is currently in: ${sectorName}.`,
    "",
    ...whereLines,
    ...(material ? ["", material] : []),
    ...(earlierBlock ? ["", earlierBlock] : []),
    "",
    `${ending} No turn of the plot happens in it: the first move is the players'.`,
    "Stay anchored to what the bios establish, and never state a game stat or",
    "any number from a character sheet.",
    "",
    "TONE OVERRIDE: regardless of any tone configured elsewhere, this",
    "vignette is WRY + ABSURD. Affectionate ribbing, not sneering.",
    "",
    // The limit is the last thing it reads (issue #354 P2-26's rule for the closing).
    "Length: four to six sentences, about 110 words — never more than six",
    "sentences. Count them.",
  ].join("\n");
}

/**
 * Where the last session stopped — the one read of it. Three things say so:
 *
 *   - the last session's record (overhaul 2 §9 — recordedStop): its last
 *     scene's place, who was there at the end, what binds there, the question
 *     still open, what play let go — the table's facts, which the opening may
 *     not contradict;
 *   - the last narration the table read, word for word, from the chat's cards
 *     (narrator.js getLastStoryNarration — the ring's own source, no store of
 *     its own): how it read, its details the narration's own;
 *   - for a session from before the record, the summary of the session
 *     before this one (LAST SESSION — lifecycle.js lastSessionToTell, issue
 *     #382). With a record the summary is not told here: it stays in the
 *     system prompt under its "narrative texture only" caveat, and the fourth
 *     live run's a20 opened against its last narration with it (a slip "left
 *     on Tamsin's counter" while the colour had it in Mira's hands).
 *
 * Null with none — a campaign's first session, or a world whose chat is gone
 * and whose summary is off: nothing is said then, and the opening's place is
 * rolled. Called from one place, composeOpeningScene.
 *
 * @param {Object|null} campaignState
 * @returns {Promise<{ text: string, sessionNumber: number|null, lastNarration: string, lastNarrationThisSession: boolean,
 *   record: Object|null }|null>}
 */
async function whereLastSessionStopped(campaignState) {
  const prev = lastSessionToTell(campaignState);
  const own  = !!prev?.sessionId && prev.sessionId === campaignState?.currentSessionId;
  // LAST SESSION's session, else the newest earlier one the record says a
  // table began: LAST SESSION is told only by a summary, and one never made
  // (the setting off, a call that failed) leaves the record to say it.
  const record = own ? null : await recordedStop(prev?.sessionId ?? null, campaignState);
  const text = !own && !record && typeof prev?.text === "string" ? prev.text.trim() : "";
  // Loaded when asked for: the narrator is this scene's caller, and nothing
  // that only builds or posts the scene's card needs it.
  let last = null;
  try {
    const { getLastStoryNarration } = await import("../narration/narrator.js");
    last = getLastStoryNarration();
  } catch (err) {
    console.warn(`${MODULE_ID} | opening scene: the last narration could not be read:`, err?.message ?? err);
  }
  if (!text && !last?.text && !record) return null;
  return {
    text,
    sessionNumber: (text || record) && Number.isFinite(prev?.sessionNumber) ? prev.sessionNumber
      : (record && Number.isFinite(record.number) ? record.number : null),
    lastNarration: last?.text ?? "",
    lastNarrationThisSession: !!last?.sessionId && last.sessionId === campaignState?.currentSessionId,
    record,
  };
}

/** A record's words, one line. */
const oneLine = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** What a truth rests on, as the opening's WHERE block says it (narratorPrompt.js's labels). */
const STOP_BASIS = Object.freeze({ player: "the player", dice: "the dice", gm: "the GM", setup: "the premise" });

/**
 * Where the last session stopped, by its record (overhaul 2 §9): its last
 * scene that was played — never a cutaway's (a closing's or a spotlight's,
 * `cause: "cutaway"`) — the place it began at (`scene.started`'s place, else the session's
 * end's), who was with them at the end (its last frame's `present`), what binds
 * there (the truths its beats established — the player's, the dice's, the
 * GM's, the premise's; never the narration's colour, which no view tells), the
 * question still open (its last frame's, unanswered — the player's) and what
 * play let go in the session; the ship from its live record (nothing moves it
 * between sessions). Null for a session from before the record (`legacy`) or
 * one with nothing to say. Never throws.
 *
 * @param {string|null} sessionId — null: the newest earlier session the record says a table began
 * @param {Object|null} campaignState
 * @returns {Promise<{ place: string, ship: string, present: string[], remote: string[], pronouns: Array<{ name: string, pronouns: string }>,
 *   binds: Array<{ subject: string, fact: string, basis: string }>, open: string, letGo: string[], number: number|null }|null>}
 */
async function recordedStop(sessionId, campaignState) {
  try {
    const [{ readRecord }, { recordSource }, { sceneForReading }] = await Promise.all([
      import("../record/read.js"), import("../record/pages.js"), import("../narration/narratorPrompt.js"),
    ]);
    const source = recordSource();
    const current = campaignState?.currentSessionId ?? null;
    const id = sessionId ?? [...readRecord({ session: "campaign" }, source).sessions].reverse()
      .find(s => s.sessionId !== current && !s.legacy && s.begun)?.sessionId ?? null;
    if (!id) return null;
    const session = readRecord({ session: id }, source).sessions[0] ?? null;
    if (!session || session.legacy) return null;
    // The last scene that was played. A closing or spotlight cutaway starts a
    // scene of its own (narrator.js narrateSessionVignette, cause `cutaway`),
    // and the closing is the session's last: read as where play stopped, it
    // told every opening of the fifth live long haul the cutaway's company and
    // none of the last scene's binds (issue #388 #1, OPENING-TOLD-FROM-THE-CUTAWAY).
    const played = (Array.isArray(session.scenes) ? session.scenes : []).filter(sc => sc?.cause !== "cutaway");
    const scene = played.length ? played[played.length - 1] : null;
    const where = scene?.last ?? scene?.where ?? null;
    const place = oneLine(scene?.place?.name) || oneLine(session.ended?.place?.name);
    // Who was with them: the frame's Present line, less the player characters
    // themselves — "them" are the characters (the frame lists Mira beside
    // Tamsin; told "With them at the end: Mira Kestrel, Tamsin Okoro" the
    // opening would be told the character was with herself).
    const pcs = new Set((() => { try { return getPlayerActors() ?? []; } catch { return []; } })()
      .map(a => oneLine(a?.name).toLowerCase()).filter(Boolean));
    const present = (Array.isArray(where?.present) ? where.present : []).map(oneLine).filter(n => n && !pcs.has(n.toLowerCase()));
    // …and who was over a comm: each person in the frame, named or not (issue #402, change 2).
    const remote = (Array.isArray(where?.remote) ? where.remote : []).map(oneLine).filter(n => n && !pcs.has(n.toLowerCase()));
    // Each one's pronouns as the scene was given them — a recorded person's card wins.
    const pronouns = await stopPronouns([...present, ...remote], where?.pronouns, campaignState);
    const inScene = (b) => !b.removed && (!scene?.sceneId || b.scene === scene.sceneId);
    const binds = (Array.isArray(session.beats) ? session.beats : []).filter(inScene).flatMap(b => b.established ?? [])
      .map(t => ({ subject: oneLine(t.subject?.text ?? t.subject?.name ?? ""), fact: oneLine(t.fact), basis: t.basis }))
      .filter(t => t.fact && STOP_BASIS[t.basis]);
    const open = where?.question && where.questionAnswered !== true ? oneLine(where.question) : "";
    const letGo = (Array.isArray(session.letGo) ? session.letGo : []).map(oneLine).filter(Boolean);
    const shipLine = oneLine(sceneForReading(campaignState).ship);
    const ship = /^not yet established\b/i.test(shipLine) ? "" : shipLine;
    if (!place && !present.length && !remote.length && !binds.length && !open && !letGo.length) return null;
    return { place, ship, present, remote, pronouns, binds, open, letGo, number: Number.isFinite(session.number) ? session.number : null };
  } catch (err) {
    console.warn(`${MODULE_ID} | opening scene: the last session's record could not be read:`, err?.message ?? err);
    return null;
  }
}

/**
 * The pronouns of the people with them at the end (issue #402, change 2):
 * a recorded person's card's, when it has them — the GM's card wins — else
 * the set the scene was given for them, on the record's last frame. Never
 * throws.
 *
 * @param {string[]} names
 * @param {*} framed — the frame event's `pronouns`
 * @param {Object|null} campaignState
 * @returns {Promise<Array<{ name: string, pronouns: string }>>}
 */
async function stopPronouns(names, framed, campaignState) {
  if (!names.length) return [];
  let cards = [];
  try {
    const { listConnections } = await import("../entities/connection.js");
    cards = listConnections(campaignState ?? {}) ?? [];
  } catch (err) {
    console.debug?.(`${MODULE_ID} | opening scene: the recorded people's pronouns were not read:`, err?.message ?? err);
  }
  const cardOf = (name) => cards.find(c => oneLine(c?.name).toLowerCase() === name.toLowerCase())?.pronouns ?? "";
  return normalisePronounList(names.map(name => ({ name, pronouns: normalisePronouns(cardOf(name)) || pronounsIn(framed, name) })));
}

/**
 * The people where the last session stopped, for its next session's first
 * scene (issue #402 D2: an unnamed person is carried through the next
 * session's first scene at that place): who was with them at the end, with
 * their pronouns, and the place — the scene start gives them to the new
 * scene's frame only when it opens there (sceneLifecycle.js carriedFrame).
 * None when the table gave its own word on where the session picks up: that
 * outranks the record. Pure.
 *
 * @param {Object|null} record — recordedStop's
 * @param {{ outranked?: boolean }} [opts]
 * @returns {{ present: string[], pronouns: Array<{ name: string, pronouns: string }>, place: string }|null}
 */
function sessionCarry(record, { outranked = false } = {}) {
  if (!record || outranked || !record.place || !record.present?.length) return null;
  return { present: [...record.present], pronouns: pronounsFor(record.pronouns, record.present), place: record.place };
}

/**
 * The record's account of where the last session stopped (overhaul 2 §9):
 *
 *   WHERE THE LAST SESSION STOPPED — session 1's record, the table's facts:
 *     Place: Hollow Spire — Kobayashi IV docked at Hollow Spire.
 *     With them at the end: Tamsin Vey.
 *     What binds: the manifest — Mira left it with Tamsin for safekeeping (the player); …
 *     Still open: What will Mira tell the hauler crew about the raiders? (the player's)
 *     Let go — never bring these back: "Who else knew Mira was coming?".
 *
 * @param {Object} record — recordedStop's
 * @param {number|null} sessionNumber
 * @returns {string[]}
 */
function recordedStopLines(record, sessionNumber) {
  const which = Number.isFinite(sessionNumber) ? `session ${sessionNumber}'s record` : "its record";
  const lines = [`WHERE THE LAST SESSION STOPPED — ${which}, the table's facts:`];
  if (record.place || record.ship) {
    lines.push(`  Place: ${record.place || "not recorded"}${record.ship ? ` — ${record.ship}` : ""}.`);
  }
  // Each with their pronouns, as the scene was given them (issue #402, change 2).
  const named = (n) => withPronouns(n, { frame: record.pronouns });
  if (record.present.length) lines.push(`  With them at the end: ${record.present.map(named).join(", ")}.`);
  if (record.remote?.length) lines.push(`  Over a comm at the end, not there in person: ${record.remote.map(named).join(", ")}.`);
  if (record.binds.length) {
    lines.push(`  What binds: ${record.binds.map(t => `${t.subject ? `${t.subject} — ` : ""}${t.fact} (${STOP_BASIS[t.basis]})`).join("; ")}.`);
  }
  if (record.open) lines.push(`  Still open: ${record.open} (the player's)`);
  if (record.letGo.length) lines.push(`  Let go — never bring these back: ${record.letGo.map(t => `"${t}"`).join(", ")}.`);
  return lines;
}

/**
 * The opening's block on where the last session stopped — its summary, the
 * last narration word for word — and the rule that the opening is set there.
 * '' with neither to tell. `outranked`: the table gave its own word on where
 * and when the session picks up, which stands over this.
 *
 * @param {{ text?: string, sessionNumber?: number|null, lastNarration?: string, lastNarrationThisSession?: boolean }|null} lastSession
 * @param {{ outranked?: boolean }} [opts]
 * @returns {string}
 */
function formatLastSessionStopped(lastSession, { outranked = false } = {}) {
  const text = typeof lastSession?.text === "string" ? lastSession.text.replace(/\s+/g, " ").trim() : "";
  const last = typeof lastSession?.lastNarration === "string" ? lastSession.lastNarration.trim() : "";
  const record = lastSession?.record ?? null;
  if (!text && !last && !record) return "";
  const lines = [];
  if (record) {
    // The record's facts first, then the last narration as the table read it
    // (overhaul 2 §9): what binds is the record's, the details the narration's.
    lines.push(...recordedStopLines(record, lastSession.sessionNumber));
    if (last) {
      lines.push(
        "",
        lastSession.lastNarrationThisSession
          ? "THE LAST NARRATION, as the table read it — written this session, before it began; the narration's own words, what binds is above:"
          : "ITS LAST NARRATION, as the table read it — the narration's own words; what binds is above:",
        last,
      );
    }
  } else {
    const which = Number.isFinite(lastSession.sessionNumber) ? ` (session ${lastSession.sessionNumber}, as its summary has it)` : " (as its summary has it)";
    if (text) lines.push(`WHERE THE LAST SESSION STOPPED${which}:`, text);
    if (last) {
      lines.push(
        ...(text ? [""] : []),
        lastSession.lastNarrationThisSession
          ? "THE LAST NARRATION, word for word — written this session, before it began; what the table last read:"
          : `${text ? "ITS LAST NARRATION" : "WHERE THE LAST SESSION STOPPED — ITS LAST NARRATION"}, word for word — what the table last read${text ? " (where the two differ, this is the later word)" : ""}:`,
        last,
      );
    }
  }
  lines.push(
    "",
    ...(outranked
      ? [
        "That is what lies behind the table's word above: nothing in this scene",
        "contradicts it, and nothing of it is undone.",
      ]
      : [
        "This opening picks the story up there, and nowhere later. The scene is set",
        "where that leaves them — aboard or not, at a dock, in a cockpit, wherever",
        "they were — and no time is skipped to move them. It is a quiet",
        "moment inside that situation, not after it: whatever was still going on",
        "when the session stopped is still going on — a ship alongside, a lock",
        "standing open, a question unanswered, someone waiting — and it has its",
        "place in this scene, if only at its edge.",
        // With the record's account (overhaul 2 §9): what binds is not to be
        // contradicted; the last narration's details are its own.
        ...(record
          ? [
            "Nothing in this scene contradicts what binds, above. The last narration is",
            "how it read: its details are the narration's own and may be left out.",
            "Do not write as though it were over or behind them (\"since the …\"), and do",
          ]
          : [
            "Do not contradict it, do not",
            "write as though it were over or behind them (\"since the …\"), and do not",
          ]),
        // Its example of the time not to let pass — "for the third time this
        // week" — came back as a count: "a third time", "fifth time", "third
        // confession" (SET-PIECES-SHAPED-BY-THEIR-PROMPT).
        ...(record ? ["not let more time pass than it allows."] : ["let more time pass than it allows."]),
      ]),
  );
  return lines.join("\n");
}

/** The longest "where and when do we pick up?" told to the opening (Begin a Session's field takes as much). */
const PICK_UP_MAX = 200;

/** A line of the table's own, for a prompt: plain text, one line, bounded. */
function cleanLine(text) {
  return (typeof text === "string" ? text : "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, PICK_UP_MAX);
}

/**
 * The opening scene, ready to narrate: its rolled material and its user
 * message. Run once, on the canonical GM, for a scene that will be narrated
 * (safety/sessionLifecycleDialogs.js beginSessionOnce): this is where the
 * scene's dice are rolled, and the one place that asks where the last session
 * stopped — a place aboard is rolled only when neither the records nor the
 * table say where the scene is set.
 *
 * @param {{ active: Array, absent: Array }} participants — collectGalleyParticipants'
 * @param {Object} campaignState
 * @param {{ pickUp?: string, draw?: (faces: number) => number }} [opts] —
 *   `pickUp`: the table's own word (Begin a Session's dialog); `draw`: the die
 *   (sceneSeeds.js drawDie; a test's script)
 * @returns {Promise<{ userMessage: string, seeds: Object[], carry: Object|null }>} `carry`: the people
 *   the last session stopped with, for the session's first scene (narrator.js narrateSessionVignette)
 */
export async function composeOpeningScene(participants, campaignState, { pickUp = "", draw = drawDie } = {}) {
  const lastSession = await whereLastSessionStopped(campaignState);
  const picked = cleanLine(pickUp);
  const nameOf = (p) => String(p?.actor?.name ?? "").trim();
  const seeds = rollOpeningSeeds({
    present:    participants.active.map(nameOf).filter(Boolean),
    absent:     participants.absent.map(nameOf).filter(Boolean),
    placeKnown: !!(lastSession || picked),
    perspective: openingPerspective(participants, campaignState),
  }, draw);
  const userMessage = buildGalleyVignetteUserMessage(participants, campaignState, {
    lastSession, seeds, pickUp: picked, account: factBlockWritten(),
  });
  // Who the session's first scene opens with, at the place the last stopped (issue #402 D2).
  const carry = sessionCarry(lastSession?.record ?? null, { outranked: !!picked });
  return { userMessage, seeds, carry };
}

/**
 * The perspective the opening's narration is told — as its system prompt
 * resolves it (narratorPrompt.js resolveNarrationPerspective: two characters
 * or more are third person; Auto keeps the session's).
 */
function openingPerspective(participants, campaignState) {
  let setting = "auto";
  try { setting = game.settings.get(MODULE_ID, "narrationPerspective") ?? "auto"; }
  catch (err) { console.debug?.(`${MODULE_ID} | opening: the perspective setting could not be read — Auto:`, err?.message ?? err); }
  const acting = Array.isArray(participants?.active) ? participants.active.length : 0;
  return resolveNarrationPerspective(setting, { actingCharacters: acting > 1 ? acting : 0, sessionPerspective: sessionPerspectiveOf(campaignState) });
}

/** True when `user` owns `actor` (Foundry's permission test, else the ownership map). */
function ownsActor(actor, user) {
  if (typeof actor?.testUserPermission === "function") {
    try {
      return actor.testUserPermission(user, "OWNER") === true;
    } catch (err) {
      console.warn(`${MODULE_ID} | galley vignette: permission test failed:`, err?.message ?? err);
    }
  }
  return Number(actor?.ownership?.[user?.id]) === 3;
}

function truncate(s, max) {
  if (typeof s !== "string") return "";
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/**
 * Post the vignette chat card. Sentinel flag `sessionVignetteCard` is
 * the cross-cutting marker; `vignetteKind` distinguishes begin-session
 * variants from any future ones.
 *
 * @param {Object} args
 * @param {string} args.text
 * @param {string} args.kind
 * @param {string|null} [args.sessionId]
 * @param {Object[]|null} [args.seeds] — the scene's rolled material, marked by its narration
 */
export async function postGalleyVignetteCard({ text, kind, sessionId = null, narrationId = null, seeds = null }) {
  const rolled = seedsForFlags(seeds);
  await globalThis.ChatMessage?.create?.({
    content:
      `<div class="sf-session-vignette-card"><strong>Opening</strong>` +
      `<p class="sf-narration-prose">${proseToHtml(text)}</p>` +
      `<div class="sf-narration-footer">` +
      `<button class="sf-audio-play-btn" data-action="audioPlayToggle" aria-label="Play narrator audio" hidden><i class="fas fa-play"></i> Play</button>` +
      `<button class="sf-audio-stop-btn" data-action="audioStop" aria-label="Stop narrator audio" hidden><i class="fas fa-stop"></i> Stop</button>` +
      `</div></div>`,
    // narratorCard + narrationText bring the card into the audio render path
    // (onChatMessageRender gates on narratorCard; audio synthesises narrationText,
    // which keeps any <npc> markup for voice splitting). The display prose above
    // is already markup-stripped.
    flags:   {
      [MODULE_ID]: {
        sessionVignetteCard: true,
        vignetteKind:        kind,
        sessionId:           sessionId ?? "",
        narratorCard:        true,
        narrationText:       text,
        // The narration's id (narrateSessionVignette stamped it on its
        // sidecar's ledger entries) — what an X-Card on this card retracts.
        narrationId:         narrationId ?? null,
        // What the scene was built from — its rolls, with the narration's
        // account of each (issue #381): the one store of them. "Rolled for
        // this scene" is rendered from here at every render
        // (sceneSeeds.js renderSceneRolls).
        ...(rolled.length ? { builtFrom: rolled } : {}),
      },
    },
  });
}

