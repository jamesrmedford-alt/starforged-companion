// The beats of a long exploration run, and the pointer that walks them (issue
// #373 slice 1).
//
// A beat is something the player is asked to bring about, with a result the
// observer can check in the world. The player is told the beats in order and
// which one is current. **The observer, not the player, marks a beat done**
// and moves the pointer: asking the player whether it did what it was asked is
// asking a model for the result.
//
// A beat that is not reached is `not-exercised` and the run goes on: eight
// actions on a beat that makes no progress (`STALL_ACTIONS`), or a beat that
// needs one that was never done. A beat with several parts (four facts to
// plant, a track to fill) reports its progress, and the eight actions are
// counted from the last time it moved. Nothing here calls a beat that was
// never reached a pass.
//
// Pure: a beat's check is a function of the marks (the table after each step
// and the cards that changed in it — lib/table.mjs), the messages and the
// actions. The checks say what was brought about; whether it was brought about
// *correctly* is the mechanical checks' (lib/mechanics.mjs) and the ledger's
// (lib/ledger.mjs).

import { factIn } from "./observer.mjs";
import { factHeld, isProbeLine } from "./ledger.mjs";
import { cardsAt } from "./mechanics.mjs";
import { parseDiceLine, parsePriceLine } from "./table.mjs";
import { castMembers, castMemberFor } from "./cast.mjs";
import { TICKS_PER_BOX, rankOf } from "../../../../tests/helpers/sequence/rules.js";

/** Actions on a beat with no progress before it is given up as not exercised. */
export const STALL_ACTIONS = 8;
/** Plain lines that bring nothing about before a beat's `lastResort` is told to the player. */
export const LAST_RESORT_AFTER = 2;
/** Waits in a row, on a beat that has not moved, before the player is told that waiting will not finish it. */
export const WAITS_BEFORE_TOLD = 2;
/** A scene question (`@scene …`): asked of the narrator, not a line of play. */
export const isSceneQuestion = (text) => /^@scene\b/i.test(String(text ?? "").trim());

const slug = (name) => String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
/** A move's id as the table writes it: "gain_ground" → "Gain Ground". */
const moveTitle = (id) => String(id ?? "").split("_").filter(Boolean).map((w, i) => (i > 0 && /^(?:a|an|the|of)$/.test(w) ? w : w[0].toUpperCase() + w.slice(1))).join(" ");
const OUTCOME = { strong_hit: "a strong hit", weak_hit: "a weak hit", miss: "a miss" };

/**
 * The card a cast member was made as, by its id: the first connection card
 * the run saw under one of their names, or under a whole-word part of one
 * that is no other member's (lib/cast.mjs — the third live run's "Tamsin" for
 * Tamsin Vey). The card is then followed by that id, whatever it is called
 * later. Pure.
 *
 * @param {Array<{ table?: { connections?: object[] } }>} marks
 * @param {object} cast — the charter's
 * @param {string} name — one of the member's names
 * @returns {string|null}
 */
export function castCardId(marks, cast, name) {
  const members = castMembers(cast);
  const member = castMemberFor(name, members);
  if (!member) return null;
  // The first card the run saw that was theirs: a card given one of their
  // names later is another card.
  const card = (marks ?? []).flatMap(k => k.table?.connections ?? []).find(c => !c.missing && castMemberFor(c.name, members)?.name === member.name);
  return card?.hostId ?? null;
}

/**
 * What a check sees: the marks from the step the beat became current at
 * (`from`) to now, and the run so far.
 */
export function beatView({ marks, messages, actions, charter, from }) {
  // `from` is the step the beat became current at: the world as that step
  // left it is where the beat starts (`entered`), and what happened in that
  // step belongs to the beat before — a roll that finished one beat is not
  // also the next beat's roll.
  const start = Math.max(0, marks.findIndex(k => k.step === from));
  const window = marks.slice(start + 1);
  const steps = new Set(window.map(k => k.step));
  const now = marks.at(-1)?.table ?? null;
  const entered = marks[start]?.table ?? now;
  const allCards = [...cardsAt(marks, marks.length - 1).values()];
  const firstSeen = new Map();
  for (const k of marks) for (const c of k.cards ?? []) if (!firstSeen.has(c.id)) firstSeen.set(c.id, k.step);
  const inWindow = (card) => steps.has(firstSeen.get(card.id));
  const narratedMove = (move) => allCards.find(c => c.narration?.resolutionId && c.narration.resolutionId === move.resolutionId && !c.narration.upgradeOf)?.narration ?? null;
  /** The rolls on move cards first seen while the beat was current. */
  const rolls = allCards.filter(c => c.move && inWindow(c)).map((c) => {
    const n = narratedMove(c.move);
    return {
      card: c, step: firstSeen.get(c.id),
      moveId: n?.moveId ?? c.move.burn?.moveId ?? c.move.held?.resolution?.moveId ?? slug(c.move.name),
      outcome: c.move.burn?.originalOutcome ?? c.move.held?.resolution?.outcome ?? c.move.shown,
      rolled: !!parseDiceLine(c.move.diceLine), kind: parseDiceLine(c.move.diceLine)?.kind ?? null,
    };
  });
  const pc = now?.pcs?.[0] ?? null;
  const lines = messages.filter(m => m.fromPlayer && !m.text.startsWith("!"));
  const live = () => (now?.connections ?? []).filter(c => !c.missing);
  const members = castMembers(charter.cast);
  const memberOf = (name) => castMemberFor(name, members)?.name ?? null;
  // A vow the charter's seed put on the sheet is the character's background
  // vow, not the quest a beat swears, marks or fulfils.
  const seeded = new Set((charter.seed?.pc?.vows ?? []).map(x => String(x?.name ?? "").trim().toLowerCase()).filter(Boolean));
  const questVows = () => (pc?.vows ?? []).filter(x => !seeded.has(String(x.name ?? "").trim().toLowerCase()));
  return {
    marks, window, steps, now, entered, allCards, inWindow, firstSeen, rolls, pc, charter, actions,
    lines, linesInWindow: lines.filter(m => steps.has(m.step)),
    messagesInWindow: messages.filter(m => steps.has(m.step)),
    cast: charter.cast ?? {},
    /** The connection cards called exactly this. */
    connectionNamed: (name) => live().filter(c => same(c.name, name)),
    // A connection by name: the card called that — else, for a name of the
    // cast's, the card that cast member was made as (the third live run's
    // card for Tamsin Vey was "Tamsin": lib/cast.mjs), followed by its id.
    connection: (name) => {
      const exact = live().filter(c => same(c.name, name));
      if (exact.length) return exact;
      const id = castCardId(marks, charter.cast, name);
      return id ? live().filter(c => c.hostId === id) : [];
    },
    /** The id of the card the cast member of that name was made as, or null. */
    castCardId: (name) => castCardId(marks, charter.cast, name),
    /** Whether two names are one cast member's. */
    sameCastMember: (a, b) => !!memberOf(a) && memberOf(a) === memberOf(b),
    // The cast's connection is one card, whatever it is called by now: found
    // by the name it was made under — or a part of it — then followed by its
    // id (a rename in beat 18 left beats 22 and 23 looking for a name nobody
    // had).
    castConnection: () => {
      const made = charter.cast?.connection?.name ?? null;
      const hostId = castCardId(marks, charter.cast, made);
      return live().find(c => (hostId ? c.hostId === hostId : same(c.name, made))) ?? null;
    },
    openVows: () => (pc?.vows ?? []).filter(v => !v.completed),
    questVows,
  };
}

/**
 * A beat that asks for an attack in a fight (Strike, Clash) takes any of the
 * fight's attack moves: which one a plain line is depends on the position and
 * the reader. The third live run's "I press my advantage and drive in close"
 * was Gain Ground — the rules' own gloss for it, in control — its miss was
 * paid through Withstand Damage, and the check, wanting Strike or Clash,
 * called the beat not exercised while the player waited six turns.
 */
export const ATTACK_MOVES = ["strike", "clash", "gain_ground", "react_under_fire"];
const attacks = (moves) => (moves.some(m => m === "strike" || m === "clash") ? [...new Set([...moves, ...ATTACK_MOVES])] : moves);

/** The moves a beat wants rolled: its `wants`, and the moves its check names. */
export const wantsOf = (beat) => attacks([...new Set([...(beat?.wants ?? []), ...(beat?.check?.moves ?? []), ...(beat?.check?.move ? [beat.check.move] : [])])]);

const done = (detail, extra = {}) => ({ done: true, detail, ...extra });
const notYet = (detail, progress = 0) => ({ done: false, detail, progress });
const failed = (detail) => ({ done: true, failed: true, detail });

/** The checks, by `check.type`. Each: (view, check) → { done, failed?, detail, progress? }. */
export const BEAT_CHECKS = {
  /** A session is open — the n-th of the run — and, where asked, a vow at that rank is on the sheet. */
  sessionBegun(v, c) {
    const sessions = new Set(v.marks.filter(k => k.table?.session?.active && k.table.session.id).map(k => k.table.session.id));
    if (!v.now?.session.active || sessions.size < (c.n ?? 1)) return notYet(`session ${c.n ?? 1} is not open (${sessions.size} begun so far)`);
    if (!c.vow) return done(`session ${c.n ?? 1} is open`);
    const vow = v.questVows().find(x => rankOf(x.rank) === c.vow.rank);
    if (!vow) return notYet(`the session is open; no ${c.vow.rank} vow is on ${v.pc?.name ?? "the character"}'s sheet`, 1);
    if (c.sworn && !v.allCards.some(k => k.vowCard?.swearRolled)) return notYet(`the ${rankOf(vow.rank)} vow "${vow.name}" is on the sheet and has not been sworn with a roll`, 2);
    return done(`session ${c.n ?? 1} is open; the ${rankOf(vow.rank)} vow "${vow.name}" is on the sheet at ${vow.ticks} ticks`);
  },

  /** One card for the named NPC, a connection held by the character, its bond Item mirroring it. */
  connectionMade(v, c) {
    const name = c.name ?? v.cast.connection?.name;
    const conns = v.connection(name);
    // One person, one card — under the name, or under a part of it.
    const cards = (v.now?.entityCards ?? []).filter(e => same(e.name, name) || (e.entityType === "connection" && v.sameCastMember(e.name, name)));
    if (cards.length > 1) return failed(cards.every(e => same(e.name, name)) ? `${cards.length} cards are named ${name}` : `${cards.length} cards are ${name}'s: ${cards.map(e => `"${e.name}"`).join(", ")}`);
    if (conns.length !== 1 || !conns[0].active) return notYet(`${name} has no connection card yet`);
    const who = same(conns[0].name, name) ? name : `${name} — the card was made as "${conns[0].name}" —`;
    const bond = (v.pc?.bonds ?? []).find(b => b.connectionId && b.connectionId === conns[0].recordId);
    if (!bond) return notYet(`${name} has a card; ${v.pc?.name ?? "the character"} holds no bond Item for it`, 1);
    // Where the beat asks for the move too: Make a Connection rolled, and still one card.
    if (c.move) {
      const roll = v.rolls.find(r => r.moveId === c.move && r.rolled);
      if (!roll) return notYet(`${name} has a card and a bond Item; ${c.move} has not been rolled`, 2);
      if (roll.outcome === "miss") return notYet(`${name} has a card; ${c.move} missed`, 3);
    }
    return done(`${who} is a ${conns[0].rank} connection held by ${v.pc?.name}; its bond Item reads ${bond.ticks} ticks${c.move ? `; ${c.move} was rolled and there is still one card` : ""}`);
  },

  /** The vow is linked to that connection's card, by its id. */
  vowLinked(v, c) {
    const name = c.name ?? v.cast.connection?.name;
    const conn = v.connection(name)[0];
    const vow = (v.pc?.vows ?? []).find(x => x.linkedConnectionId || x.linkedConnectionName);
    if (!vow) {
      const card = v.allCards.find(k => k.vowCard && !k.vowCard.vowGone);
      return notYet(card && !card.vowCard.hasLinkRow ? "no vow is linked; the vow's card offers no Link" : "no vow is linked to a connection");
    }
    if (!conn || vow.linkedConnectionId !== conn.hostId) return failed(`the vow "${vow.name}" is linked to "${vow.linkedConnectionName}" (card ${vow.linkedConnectionId ?? "none"}), not to ${name}'s card`);
    return done(`the vow "${vow.name}" is linked to ${conn.name}'s card`);
  },

  /** One of the named moves was rolled while the beat was current — with the outcome, where one is asked for. */
  moveRolled(v, c) {
    const hits = v.rolls.filter(r => r.rolled && (c.moves ?? []).includes(r.moveId));
    if (!hits.length) return notYet(`none of ${c.moves.join(" / ")} has been rolled`);
    const want = hits.find(r => !c.outcome || [].concat(c.outcome).includes(r.outcome));
    if (!want) return notYet(`${hits.at(-1).moveId} came up ${hits.at(-1).outcome}, not ${[].concat(c.outcome).join(" / ")}`, hits.length);
    return done(`${want.moveId} was rolled at ${want.step}: ${want.outcome}`);
  },

  /** Each of the named facts has been stated by the player. */
  factsPlanted(v, c) {
    const facts = (v.charter.facts ?? []).filter(f => (c.facts ?? []).includes(f.id));
    const planted = facts.filter(f => v.lines.some(m => (f.anchor?.length ? factHeld(m.text, f) : factIn(m.text, f))));
    if (planted.length < facts.length) return notYet(`${planted.length} of ${facts.length} stated (${facts.filter(f => !planted.includes(f)).map(f => f.id).join(", ")} to go)`, planted.length);
    return done(`${facts.map(f => f.id).join(", ")} stated by the player`);
  },

  /** The n-th session is closed. */
  sessionEnded(v, c) {
    const begun = new Set(v.marks.filter(k => k.table?.session?.active && k.table.session.id).map(k => k.table.session.id));
    if (v.now?.session.active || begun.size < (c.n ?? 1)) return notYet(`session ${c.n ?? 1} is still open`);
    return done(`session ${c.n ?? 1} is closed${v.now.session.questFocus ? `; the focus noted: "${v.now.session.questFocus}"` : ""}`);
  },

  /**
   * Every probe of the set has been asked, in the charter's words — and, with
   * `recap`, the campaign recap posted with something in it: a card that says
   * "No campaign history available yet" is no recap (the module posts one
   * when the recap comes back empty, as it does when the reply was not the
   * cited JSON it asks for — issue #382).
   */
  probesAsked(v, c) {
    if (c.session) {
      const begun = new Set(v.marks.filter(k => k.table?.session?.active && k.table.session.id).map(k => k.table.session.id));
      if (!v.now?.session.active || begun.size < c.session) return notYet(`session ${c.session} is not open`);
    }
    const probes = (v.charter.facts ?? []).flatMap(f => (f.probes ?? []).filter(p => p.set === c.set));
    const baits = (v.charter.baits ?? []).filter(b => (c.baits ?? []).includes(b.id));
    const asked = [...probes, ...baits].filter(p => v.linesInWindow.some(m => isProbeLine(m.text, p)));
    const total = probes.length + baits.length;
    const recaps = c.recap ? v.allCards.filter(k => k.recap && v.inWindow(k)) : [];
    const recap = c.recap ? recaps.some(k => k.recap.recapEmpty !== true) : true;
    const noRecap = recaps.length ? "; the recap card came up empty" : "; no recap card yet";
    if (asked.length < total || !recap) return notYet(`${c.session ? `session ${c.session} is open; ` : ""}${asked.length} of ${total} asked${c.recap && !recap ? noRecap : ""}`, 1 + asked.length + (c.recap && recap ? 1 : 0));
    return done(`probe set ${c.set}: ${probes.length} question(s) asked${baits.length ? `, ${baits.length} bait(s)` : ""}${c.recap ? "; the recap was posted" : ""}`);
  },

  /** The ship is at the named settlement — and its token with it. A course that missed moves neither. */
  arrived(v, c) {
    const courses = v.rolls.filter(r => r.moveId === "set_a_course" && r.rolled);
    const there = same(v.now?.location?.name, c.settlement);
    const missedAndMoved = courses.some((r) => {
      if (r.outcome !== "miss") return false;
      const i = v.marks.findIndex(k => k.step === r.step);
      const a = v.marks[i - 1]?.table, b = v.marks[i]?.table;
      return a && b && (a.location.id !== b.location.id || a.ship.tokenAt !== b.ship.tokenAt);
    });
    if (missedAndMoved) return failed("a Set a Course that missed moved the ship");
    if (!there) return notYet(courses.length ? `Set a Course came up ${courses.at(-1).outcome}; the ship is at ${v.now?.location?.name ?? "?"}` : "no course has been set", courses.length);
    if (v.now.ship.token && !same(v.now.ship.tokenAt, c.settlement)) return failed(`the location is ${c.settlement}; the ship's token is at ${v.now.ship.tokenAt ?? "no pin"}`);
    return done(`the ship is at ${c.settlement}${v.now.ship.token ? ", its token on the pin" : ""}`);
  },

  /**
   * An expedition into uncharted space: a track begun while the beat was
   * current, progress marked on it, a waypoint explored — and, where the beat
   * ends it (`finished`), the track complete.
   *
   * What the table does (docs/flows/exploration-flow.md): a hit on Undertake
   * an Expedition begins the track under the destination's working label, at
   * the rank the move reader inferred (dangerous unless it says), and marks
   * it once; its card ("Expedition") carries "🗺 Finish the Expedition". A
   * strong hit on Explore a Waypoint posts a choice — "Mark expedition
   * progress" or "+2 momentum" — a weak hit gives +1 momentum, a miss pays
   * the price. Finish an Expedition is a progress roll: a hit completes the
   * track and docks the ship at the place it was for; a miss leaves it open.
   * An expedition left open is told to every later narration as under way,
   * its hidden plan in play — so a beat that is followed by a course for a
   * charted station ends it.
   */
  expedition(v, c) {
    const before = new Set((v.entered?.tracks ?? []).filter(t => t.type === "expedition").map(t => t.id));
    const begun = (v.now?.tracks ?? []).filter(t => t.type === "expedition" && !before.has(t.id));
    const set = v.rolls.filter(r => r.moveId === "undertake_an_expedition" && r.rolled);
    if (!begun.length) return notYet(set.length ? `Undertake an Expedition came up ${OUTCOME[set.at(-1).outcome] ?? set.at(-1).outcome} at ${set.at(-1).step}; no expedition is under way` : "no expedition is under way", set.length ? 1 : 0);
    if (begun.length > 1) return failed(`${begun.length} expeditions were begun for one journey: ${begun.map(t => `"${t.label}"`).join(", ")}`);
    const track = begun[0];
    const boxes = Math.floor(track.ticks / TICKS_PER_BOX);
    const what = `the ${rankOf(track.rank) ?? track.rank} expedition "${track.label}"`;
    if (!track.ticks) return notYet(`${what} is begun and no progress is marked on it`, 2);
    const looks = v.rolls.filter(r => r.moveId === "explore_a_waypoint" && r.rolled);
    if (!looks.length) return notYet(`${what} stands at ${boxes} of 10 boxes; no waypoint has been explored`, 3);
    const look = looks.at(-1);
    if (look.card.move.held?.open) return notYet(`${what} stands at ${boxes} of 10 boxes; the waypoint's result is held — nothing comes of it until it is kept`, 4);
    // What the waypoint offers is a card of its own: a strong hit's choice, a matched miss's.
    const offered = v.allCards.filter(k => k.suffer && v.inWindow(k) && (k.suffer.moveId === "explore_a_waypoint" || (k.suffer.resolutionId && k.suffer.resolutionId === look.card.move.resolutionId)));
    if (offered.length && !offered.some(k => k.suffer.resolved)) return notYet(`${what} stands at ${boxes} of 10 boxes; a waypoint was explored (${OUTCOME[look.outcome] ?? look.outcome}) and its choice is not made`, 4);
    const explored = `a waypoint explored at ${look.step} (${OUTCOME[look.outcome] ?? look.outcome})`;
    const end = v.rolls.filter(r => r.moveId === "finish_an_expedition" && r.rolled).at(-1) ?? null;
    if (c.finished && !track.completed) {
      // The track's own cards: the one whose Finish is pressed, and what a missed finish offers.
      const pressed = v.allCards.some(k => k.expedition?.trackId === track.id && k.expedition.expeditionFinishAttempted);
      const recommit = v.allCards.some(k => k.recommit?.trackId === track.id && !k.recommit.recommitted);
      const why = end ? `Finish an Expedition came up ${OUTCOME[end.outcome] ?? end.outcome} and the expedition is still open${recommit ? " — a recommit is offered" : ""}`
        : pressed ? "its Finish was pressed and has not been rolled" : "the expedition is still open";
      return notYet(`${what} stands at ${boxes} of 10 boxes, ${explored}; ${why}`, end ? 6 : 5);
    }
    // Where it ended: the place the table recorded for it, where it recorded one.
    const where = track.siteId ? `the ship at ${v.now?.location?.name ?? "no tracked place"}` : "its destination no place on the map";
    return done(`${what} was begun${set.length ? ` at ${set[0].step}` : " by the waypoint's own mark"} and marked to ${boxes} of 10 boxes, ${explored}${track.completed ? ` — and finished${end ? ` (${OUTCOME[end.outcome] ?? end.outcome})` : ""}, ${where}` : ""}`);
  },

  /** An open fight, linked to the vow. */
  fightBegun(v) {
    const fight = (v.now?.tracks ?? []).find(t => t.type === "combat" && !t.completed);
    if (!fight) return notYet(v.allCards.some(k => k.threshold && v.inWindow(k)) ? "a fight is offered and not entered" : "no fight has begun", v.allCards.some(k => k.threshold && v.inWindow(k)) ? 1 : 0);
    const vow = v.openVows().find(x => (fight.linkedVowId && (x.vowId === fight.linkedVowId || x.id === fight.linkedVowId)) || same(x.name, fight.linkedVowName));
    if (!vow) return notYet(`the fight "${fight.label}" is open and serves no vow`, 2);
    return done(`the ${fight.rank} fight "${fight.label}" is open, serving the vow "${vow.name}"`);
  },

  /**
   * A miss in the fight was paid for with a suffer move: its price named one
   * and the table took it, or a suffer card was offered and answered.
   */
  sufferPaid(v, c) {
    const miss = v.rolls.find(r => attacks(c.moves ?? ["strike", "clash"]).includes(r.moveId) && r.outcome === "miss");
    if (!miss) return notYet("no miss in the fight yet");
    if (miss.card.move.held?.open) return notYet(`${miss.moveId} missed at ${miss.step}; its result is held — nothing is paid until it is kept`, 1);
    const prices = v.allCards.filter(k => k.price && v.inWindow(k)).map(k => ({ step: v.firstSeen.get(k.id), ...parsePriceLine(k.price.text) }));
    const routed = prices.find(p => p.route);
    if (routed) return done(`${miss.moveId} missed at ${miss.step}; its price (${routed.roll}: "${routed.entry}") was ${routed.route.move} (-${routed.route.amount}), taken at ${routed.step}`);
    // The suffer card of this miss — not one a later move brought (the first
    // live run: a voluntary Endure Stress's choice was taken for the miss's).
    const ofMiss = (k) => !k.suffer.moveId || k.suffer.moveId === miss.moveId || (k.suffer.resolutionId && k.suffer.resolutionId === miss.card.move.resolutionId);
    const suffer = v.allCards.filter(k => k.suffer && v.inWindow(k) && ofMiss(k));
    if (suffer.length) {
      if (!suffer.some(k => k.suffer.resolved)) return notYet("a suffer card is offered and not answered", 2);
      return done(`${miss.moveId} missed at ${miss.step}; the suffer card was offered and answered`);
    }
    // A price that names no suffer move — one stated before the roll, or a
    // table entry that is a complication — is paid in the story. The miss
    // was made and paid for; the suffer path was not walked, and the beat
    // says so (the `suffer-cost` check then reads "never exercised").
    if (prices.length) return done(`${miss.moveId} missed at ${miss.step}; its price named no suffer move and was paid in the story — the suffer path was not exercised`);
    return notYet(`${miss.moveId} missed at ${miss.step}; no price has been paid`, 1);
  },

  /** Momentum was burned on a roll made while the beat was current. */
  burned(v, c) {
    const roll = v.rolls.find(r => r.rolled && (!c.moves || attacks(c.moves).includes(r.moveId)) && (!c.outcome || r.outcome === c.outcome));
    if (!roll) return notYet("no such roll yet");
    if (!roll.card.move.burn) return notYet(`${roll.moveId} came up ${roll.outcome}; its card offers no burn`, 1);
    if (!roll.card.move.burn.consumed) return notYet(`${roll.moveId} came up ${roll.outcome}; momentum has not been burned`, 2);
    return done(`${roll.moveId} came up ${roll.outcome} at ${roll.step} and momentum was burned for ${roll.card.move.burn.previewOutcome ?? "a better result"}`);
  },

  /** The fight was won with Take Decisive Action and its milestone marked on the vow. */
  fightWon(v) {
    const win = v.rolls.find(r => r.moveId === "take_decisive_action" && r.outcome !== "miss");
    if (!win) return notYet("the fight has not been finished");
    const victory = v.allCards.find(k => k.victory && v.inWindow(k));
    if (!victory) return notYet("the fight was won; no victory card names a vow", 1);
    if (!victory.victory.resolvedActions?.markMilestone) return notYet("the fight was won; its milestone is not marked", 2);
    return done(`Take Decisive Action came up ${win.outcome}; the milestone (×${victory.victory.marks}) is marked on "${victory.victory.vowName}"`);
  },

  /** A truth holding the old value is struck and one holding the new value stands. */
  corrected(v, c) {
    const fact = (v.charter.facts ?? []).find(f => f.id === c.fact);
    const old = (fact?.refusals ?? []).flatMap(r => r.anywhere ?? []);
    const truths = v.now?.scene?.truths ?? [];
    const states = (t, words) => words.some(w => factIn(t.fact, { variants: [w] }));
    const filed = (t, words) => words.some(w => factIn(t.subject, { variants: [w] }));
    // The correction is of the truth that stated the old value. Truths the
    // narrator filed under the old name as their subject are not struck by
    // it — the table has no command that renames a subject — so they are
    // said, and they do not hold the beat (the first live run: the naming
    // truth was struck, the new one set, and two others stayed filed under
    // "Ashen Wake"). What becomes of the old name afterwards is the ledger's.
    const standingOld = truths.filter(t => !t.retracted && states(t, old));
    const standingNew = truths.filter(t => !t.retracted && states(t, fact?.variants ?? []));
    const struck = truths.filter(t => t.retracted && states(t, old));
    const under = truths.filter(t => !t.retracted && !states(t, old) && filed(t, old));
    if (!standingNew.length) return notYet(`no standing truth holds the corrected value${struck.length ? "; the old one is struck" : ""}`, struck.length ? 1 : 0);
    if (standingOld.length) return notYet(`the corrected value is set and the old one still stands ("${standingOld[0].fact}")`, 1);
    return done(`the old value is struck${struck.length ? "" : " (or was never in the ledger)"} and "${standingNew[0].fact}" stands${under.length ? `; ${under.length} other truth(s) are still filed under the old name ("${under[0].subject} — ${under[0].fact.slice(0, 60)}")` : ""}`);
  },

  /** One oracle card. */
  oracleAsked(v) {
    const cards = v.allCards.filter(k => k.oracle && v.inWindow(k));
    if (!cards.length) return notYet("the oracle has not been asked");
    if (cards.length > 1) return failed(`${cards.length} oracle cards for one question`);
    return done(`the oracle answered ${cards[0].oracle.answer ?? "?"}`);
  },

  /** A recover move was made and what it offers was taken. */
  recovered(v, c) {
    // Any recover move's hit, not the first roll's: the second live run's Heal
    // missed and its Resupply came up a strong hit, and the beat was read off
    // the miss alone (issue #377 round 2).
    const rolls = v.rolls.filter(r => (c.moves ?? ["heal", "resupply", "sojourn", "hearten"]).includes(r.moveId) && r.rolled);
    if (!rolls.length) return notYet("no recover move yet");
    const roll = [...rolls].reverse().find(r => r.outcome !== "miss") ?? rolls[rolls.length - 1];
    if (roll.outcome === "miss") return notYet(`${roll.moveId} missed`, 1);
    const offered = v.allCards.filter(k => k.suffer && v.inWindow(k) && k.suffer.moveId === roll.moveId);
    if (offered.length && !offered.some(k => k.suffer.resolved)) return notYet(`${roll.moveId} came up ${roll.outcome}; its choice is not made`, 2);
    return done(`${roll.moveId} came up ${roll.outcome} at ${roll.step}`);
  },

  /**
   * One of the named moves was offered — a narration's "Roll …" button — or
   * rolled while the beat was current. With `offered: false` the opposite: a
   * line of play was answered and none of them was offered or rolled — a
   * recovery move with nothing to recover (known-issues
   * HEAL-ROLLED-AT-FULL-HEALTH: the third live run's "I treat my wounds" was
   * offered Heal at 5 health of 5, pressed and rolled). An offer or a roll
   * then is the beat brought about wrongly.
   */
  moveOffered(v, c) {
    const moves = c.moves ?? [];
    const sheet = v.pc ? `${v.pc.name} at health ${v.pc.health}, spirit ${v.pc.spirit}, supply ${v.pc.supply}${v.pc.debilities?.length ? `, ${v.pc.debilities.join(", ")}` : ", no impact marked"}` : "";
    const offers = v.allCards.filter(k => k.narration?.suggestedMove && v.inWindow(k) && moves.includes(k.narration.suggestedMove))
      .map(k => ({ step: v.firstSeen.get(k.id), moveId: k.narration.suggestedMove, how: "offered on the narration's Roll button" }));
    const made = v.rolls.filter(r => moves.includes(r.moveId)).map(r => ({ step: r.step, moveId: r.moveId, how: r.rolled ? `rolled (${OUTCOME[r.outcome] ?? r.outcome})` : "made" }));
    const seen = [...offers, ...made].sort((a, b) => v.marks.findIndex(k => k.step === a.step) - v.marks.findIndex(k => k.step === b.step));
    if (c.offered === false) {
      if (seen.length) return failed(`${moveTitle(seen[0].moveId)} was ${seen[0].how} at ${seen[0].step}, with ${sheet || "the sheet as it was"}`);
      const answered = v.linesInWindow.filter(m => !isSceneQuestion(m.text)).find(l => v.messagesInWindow.some(m => m.narrator && m.step === l.step && !m.vignette));
      if (!answered) return notYet("no line of play has been answered yet");
      return done(`the line at ${answered.step} was narrated with nothing of ${moves.map(moveTitle).join(" / ")} offered or rolled — ${sheet}`);
    }
    if (!seen.length) return notYet(`none of ${moves.map(moveTitle).join(" / ")} has been offered or rolled${sheet ? ` (${sheet})` : ""}`);
    return done(`${moveTitle(seen[0].moveId)} was ${seen[0].how} at ${seen[0].step}${sheet ? `, with ${sheet}` : ""}`);
  },

  /**
   * Progress was marked on a quest vow while the beat was current — a step
   * toward it said in the fiction, offered as the milestone it is (known-issues
   * VOW-STEP-SAID-IN-FICTION-NOT-READ: "I now have proof…" was narrated with
   * nothing offered, twelve readings of twelve). The size of the mark is the
   * mechanical checks' (`progress-per-mark`, `milestone-once`).
   */
  milestoneMarked(v) {
    const before = new Map(((v.entered?.pcs?.[0]?.vows) ?? []).map(x => [x.id, x.ticks]));
    const gained = v.questVows().filter(x => !x.completed && x.ticks > (before.get(x.id) ?? 0));
    const offer = v.allCards.find(k => k.narration?.suggestedMove === "reach_a_milestone" && v.inWindow(k)) ?? null;
    if (!gained.length) {
      const open = v.questVows().find(x => !x.completed);
      return notYet(`${open ? `the vow "${open.name}" stands at ${open.ticks} ticks` : "no quest vow is open"}${offer ? `; the milestone was offered at ${v.firstSeen.get(offer.id)} and is not marked` : "; no milestone has been offered or marked"}`, offer ? 1 : 0);
    }
    const vow = gained[0];
    return done(`the vow "${vow.name}" went from ${before.get(vow.id) ?? 0} to ${vow.ticks} ticks${offer ? `, the milestone offered at ${v.firstSeen.get(offer.id)}` : ""}`);
  },

  /**
   * The relationship with the cast's connection (or the one named) moved
   * forward while the beat was current — Develop Your Relationship, which
   * marks progress and rolls nothing while the two are not bonded. A favour
   * done for them is at least offered it (known-issues
   * FAVOUR-TO-A-CONNECTION-READ-AS-TALK).
   */
  relationshipDeveloped(v, c) {
    const conn = c.name ? v.connection(c.name)[0] : v.castConnection();
    if (!conn) return notYet("no such connection");
    const was = (v.entered?.connections ?? []).find(x => x.hostId === conn.hostId)?.ticks ?? 0;
    const offer = v.allCards.find(k => k.narration?.suggestedMove === "develop_your_relationship" && v.inWindow(k)) ?? null;
    if (conn.ticks <= was) return notYet(`the relationship with ${conn.name} stands at ${conn.ticks} of 40 ticks${offer ? `; Develop Your Relationship was offered at ${v.firstSeen.get(offer.id)}` : ""}`, offer ? 1 : 0);
    return done(`the relationship with ${conn.name} went from ${was} to ${conn.ticks} of 40 ticks`);
  },

  /**
   * A scene question (`@scene …`) was answered, and nothing of the answer was
   * written back: no truth of its narration, no draft card, no hidden plan,
   * the scene's frame as it was (known-issues SCENE-ANSWER-NOT-A-CAMERA: each
   * of the third live run's answers added scenery that invented, and each was
   * applied to the scene's record — frame, truths, lore, draft cards). The
   * answer's words are quoted, and how many sentences it ran to: whether it
   * is plain is for the reading.
   */
  sceneAnswered(v) {
    const asked = [...v.linesInWindow].reverse().find(m => isSceneQuestion(m.text)) ?? null;
    if (!asked) return notYet("no scene question has been asked");
    const answer = v.messagesInWindow.find(m => m.step === asked.step && m.narrator && (m.card ?? []).includes("sceneResponse")) ?? null;
    if (!answer) return notYet(`the scene question at ${asked.step} has had no answer`, 1);
    const i = v.marks.findIndex(k => k.step === asked.step);
    const was = v.marks[i - 1]?.table ?? v.entered;
    const then = v.marks[i]?.table ?? v.now;
    const card = v.allCards.find(k => k.id === answer.id);
    const narrationId = card?.narration?.narrationId ?? null;
    const problems = [];
    const truths = (then?.scene?.truths ?? []).filter(t => narrationId && t.narrationId === narrationId);
    if (truths.length) problems.push(`${truths.length} truth(s) of it stand ("${truths[0].fact.slice(0, 80)}")`);
    const drafts = v.allCards.filter(k => k.drafts?.length && v.firstSeen.get(k.id) === asked.step);
    if (drafts.length) problems.push(`a draft card was raised from it (${drafts.flatMap(k => k.drafts.map(d => `"${d.name}"`)).join(", ")})`);
    const plansWas = new Set((was?.plans ?? []).map(p => p.id));
    const plans = (then?.plans ?? []).filter(p => !plansWas.has(p.id));
    if (plans.length) problems.push(`a hidden plan was decided in its step ("${plans[0].subject}")`);
    if (JSON.stringify(was?.scene?.frame ?? null) !== JSON.stringify(then?.scene?.frame ?? null)) problems.push("the scene's frame changed");
    const sentences = String(answer.text ?? "").split(/(?<=[.!?])\s+/).filter(s => s.trim()).length;
    if (problems.length) return failed(`the scene question at ${asked.step} was answered and written back: ${problems.join("; ")}`);
    return done(`the scene question at ${asked.step} was answered in ${sentences} sentence(s), and nothing of the answer was written back: "${String(answer.text ?? "").slice(0, 160)}"`);
  },

  /** The relationship's track is full and the bond is forged. */
  bondForged(v, c) {
    const conn = c.name ? v.connection(c.name)[0] : v.castConnection();
    if (!conn) return notYet("no such connection");
    if (!conn.bonded) return notYet(`the relationship with ${conn.name} stands at ${conn.ticks} of 40 ticks`, conn.ticks);
    return done(`a bond is forged with ${conn.name} (${conn.rank}), its track at ${conn.ticks} ticks`);
  },

  /** Develop Your Relationship with a bonded connection: a roll, and no progress marked. */
  bondedDevelop(v, c) {
    const conn = c.name ? v.connection(c.name)[0] : v.castConnection();
    const roll = v.rolls.find(r => r.moveId === "develop_your_relationship" && r.kind === "action");
    if (!roll) return notYet("no bonded Develop Your Relationship has been rolled");
    const i = v.marks.findIndex(k => k.step === roll.step);
    const before = v.marks[i - 1]?.table.connections.find(x => x.hostId === conn?.hostId);
    const after = v.marks[i]?.table.connections.find(x => x.hostId === conn?.hostId);
    if (before && after && before.ticks !== after.ticks) return failed(`the bonded roll marked progress: ${before.ticks} → ${after.ticks} ticks`);
    return done(`the bonded Develop Your Relationship was rolled at ${roll.step} (${roll.outcome}); no progress was marked`);
  },

  /**
   * The vow is fulfilled; a bonded connection's track is untouched and its
   * bonded roll offered once. With `told`, its truth is told too: the hidden
   * plan the table decided for the vow — what it was sworn to find — is
   * revealed by the fulfilment's narration (known-issues
   * VOW-FULFILLED-WITH-NOBODY-NAMED: the third live run's vow ended on "both
   * are named now", with no name anywhere, and its truth was recorded as
   * revealed). The module marks a plan's truth revealed only where the prose
   * states it, so the mark is the check; the narration is quoted, to be read.
   */
  vowFulfilled(v, c) {
    const vow = v.questVows().find(x => x.completed) ?? null;
    const open = v.questVows().find(x => !x.completed) ?? null;
    if (!vow) return notYet(open ? `the vow "${open.name}" stands at ${open.ticks} ticks` : "no vow on the sheet", open?.ticks ?? 0);
    const roll = v.rolls.find(r => r.moveId === "fulfill_your_vow");
    let told = "";
    if (c.told) {
      if (!roll) return notYet(`the vow "${vow.name}" is complete and no Fulfill Your Vow was rolled for it`, 1);
      const narrated = v.allCards.find(k => k.narration?.resolutionId && k.narration.resolutionId === roll.card.move.resolutionId && !k.narration.upgradeOf);
      if (!narrated) return notYet(`the vow "${vow.name}" is fulfilled (${roll.outcome}); its narration has not come`, 2);
      const plan = (v.now?.plans ?? []).find(p => p.kind === "vow" && same(p.subject, vow.name)) ?? null;
      const prose = v.messagesInWindow.find(m => m.id === narrated.id)?.text ?? "";
      if (!plan) return failed(`the vow "${vow.name}" is fulfilled (${roll.outcome}) and no plan was ever decided for it: there was no truth to tell`);
      if (!plan.truthRevealed) return failed(`the vow "${vow.name}" is fulfilled (${roll.outcome}) and its truth was not told — "${plan.truth.slice(0, 120)}" is not revealed; the narration: "${prose.slice(0, 160)}"`);
      told = `; its truth is told ("${plan.truth.slice(0, 120)}") — the narration: "${prose.slice(0, 160)}"`;
    }
    const conn = vow.linkedConnectionId ? (v.now.connections ?? []).find(x => x.hostId === vow.linkedConnectionId) : null;
    if (conn?.bonded && roll && c.bondedPayoff !== false) {
      const i = v.marks.findIndex(k => k.step === roll.step);
      const before = v.marks[i - 1]?.table.connections.find(x => x.hostId === conn.hostId);
      if (before && before.bonded && before.ticks !== conn.ticks) return failed(`the fulfilment marked the bonded connection's track: ${before.ticks} → ${conn.ticks} ticks`);
      const offers = v.allCards.filter(k => k.picker && v.inWindow(k) && k.picker.pickAction === "develop" && k.picker.choices?.length === 1 && k.picker.choices[0].hostId === conn.hostId);
      if (offers.length !== 1) return failed(`the vow was fulfilled for the bonded ${conn.name}; ${offers.length} bonded roll(s) offered, not one`);
      return done(`the vow "${vow.name}" is fulfilled; ${conn.name}'s track is untouched and one bonded roll is offered${told}`);
    }
    return done(`the vow "${vow.name}" is fulfilled${roll ? ` (${roll.outcome})` : ""}${told}`);
  },

  // ── the interruptions: the runner acts, the world is compared ──────────────

  /** After the GM's page reloaded: the fight, its track, the meters and the lock as they were. */
  survivedReload(v) {
    const a = v.entered, b = v.now;
    const fightA = a.tracks.find(t => t.type === "combat" && !t.completed), fightB = b.tracks.find(t => t.id === fightA?.id);
    const problems = [];
    if (fightA && (!fightB || fightB.completed || fightB.ticks !== fightA.ticks || fightB.combatState !== fightA.combatState)) problems.push(`the fight's track changed (${fightA.ticks} ticks, ${fightA.combatState} → ${fightB ? `${fightB.ticks} ticks, ${fightB.combatState}` : "gone"})`);
    if (b.session.pendingMove) problems.push("the move lock is held");
    if (!b.session.active) problems.push("the session is no longer open");
    for (const pc of a.pcs) {
      const now = b.pcs.find(p => p.id === pc.id);
      for (const m of ["health", "spirit", "supply", "momentum"]) if (now && now[m] !== pc[m]) problems.push(`${pc.name}'s ${m} went from ${pc[m]} to ${now[m]}`);
    }
    return problems.length ? failed(problems.join("; ")) : done(`after the reload: ${fightA ? `the fight "${fightA.label}" at ${fightA.ticks} ticks, ` : ""}the meters unchanged, the lock free`);
  },

  /** After a window was opened and closed unanswered: nothing changed. */
  nothingChanged(v) {
    const a = v.entered, b = v.now;
    const problems = [];
    if (a.session.active !== b.session.active) problems.push(`the session is now ${b.session.active ? "open" : "closed"}`);
    if (b.session.pendingMove) problems.push("the move lock is held");
    for (const pc of a.pcs) {
      const now = b.pcs.find(p => p.id === pc.id);
      for (const m of ["health", "spirit", "supply", "momentum"]) if (now && now[m] !== pc[m]) problems.push(`${pc.name}'s ${m} went from ${pc[m]} to ${now[m]}`);
    }
    if (a.session.questFocus !== b.session.questFocus) problems.push("the session's focus changed");
    return problems.length ? failed(problems.join("; ")) : done("End a Session was opened and closed unanswered: the session is open, nothing was paid, the lock is free");
  },

  /** After the X-Card: the narration it removed has no standing fact, and the GM has resumed. */
  xCarded(v) {
    const carded = v.allCards.filter(k => k.xCarded && k.narration?.narrationId);
    if (!v.allCards.some(k => k.xcard && v.inWindow(k))) return notYet("the X-Card has not been played");
    if (!carded.length) return notYet("the X-Card was played; no narration is marked as removed", 1);
    if (v.now.session.xCardActive) return notYet("the X-Card is still up", 2);
    const ids = new Set(carded.map(k => k.narration.narrationId));
    // What stands now. The first live run was failed for a truth that stood
    // in the step before the card was played, and was retracted by it.
    const standing = (v.now.scene?.truths ?? []).filter(t => ids.has(t.narrationId) && !t.retracted).map(t => `"${t.fact}"`);
    const kept = (v.now.helpers?.chronicle ?? []).filter(e => ids.has(e.narrationId));
    if (standing.length || kept.length) return failed(`the removed narration still has ${standing.length} standing truth(s)${standing.length ? ` (${standing[0]})` : ""} and ${kept.length} Chronicle entr${kept.length === 1 ? "y" : "ies"}`);
    return done(`${carded.length} narration(s) removed; none of their facts stands, and play has resumed`);
  },

  /** After the GM renamed the connection's card: one card, the new name on the vow's link. */
  renamed(v, c) {
    const conns = v.connectionNamed(c.to);
    if (conns.length !== 1) return notYet(`no connection is named ${c.to}`);
    // The card renamed is the one the cast member was made as, whatever it
    // was called — and no other card is still theirs.
    const made = v.castCardId(c.from);
    if (made && conns[0].hostId !== made) return failed(`${c.to} is another card: the one ${c.from} was made as was not renamed`);
    const others = (v.now.entityCards ?? []).filter(e => e.id !== conns[0].hostId && (same(e.name, c.from) || (e.entityType === "connection" && v.sameCastMember(e.name, c.from))));
    if (others.length) return failed(`a card is still named ${others[0].name}: two people`);
    const vow = (v.pc?.vows ?? []).find(x => x.linkedConnectionId === conns[0].hostId);
    if (vow && !same(vow.linkedConnectionName, c.to)) return failed(`the vow "${vow.name}" still shows its link as "${vow.linkedConnectionName}"`);
    return done(`${c.from} is now ${c.to}${vow ? `; the vow "${vow.name}" shows the new name` : "; no vow is linked to that card"}`);
  },
};

/**
 * The pointer over a charter's beats.
 *
 * @param {Array<{ id: string, n: number, session: number, title: string, tell?: string, check: object,
 *   needs?: string[], stall?: number, interruption?: string }>} beats
 */
export function createPointer(beats) {
  // `lines` / `linesAtProgress`: the lines of play typed on the beat, and how
  // many of them had been typed when it last moved — the difference is the
  // plain lines that brought nothing about (`lastResort`, below).
  // `waits`: the waits in a row on a beat that has not moved since; `rolled`:
  // the rolls made while the beat was current, and `rolledAtProgress` how
  // many of them there were when it last moved — what `brief` tells the
  // player a roll was, when it was not the beat's and nothing has moved since.
  const state = beats.map(b => ({ id: b.id, n: b.n, session: b.session, title: b.title, status: "pending", actions: 0, steps: [], enteredAt: null, doneAt: null, detail: "", progress: 0, sinceProgress: 0, lines: 0, linesAtProgress: 0, lastResort: false, waits: 0, rolled: [], rolledAtProgress: 0 }));
  let at = 0;
  const byId = (id) => state.find(s => s.id === id);

  return {
    state,
    /** The beat the player is on, or null when the beats are over. */
    current() { return at < beats.length ? { beat: beats[at], state: state[at] } : null; },
    finished() { return at >= beats.length; },

    /** A player action was taken on the current beat, at `step` — `action` says whether it was a wait. */
    record(step, action = null) {
      const cur = state[at];
      if (!cur) return;
      cur.actions += 1;
      cur.sinceProgress += 1;
      cur.waits = action?.action === "wait" ? cur.waits + 1 : 0;
      if (!cur.steps.includes(step)) cur.steps.push(step);
    },

    /**
     * Evaluate the current beat against the run so far, and move on while
     * beats are done, failed or given up. Returns what changed.
     *
     * @param {{ marks: object[], messages: object[], actions: object[], charter: object }} run
     * @param {string} step — the step just observed
     */
    advance(run, step) {
      const changes = [];
      while (at < beats.length) {
        const beat = beats[at];
        const cur = state[at];
        if (cur.status === "pending") {
          cur.status = "current";
          cur.enteredAt = step;
          const missing = (beat.needs ?? []).filter(id => byId(id)?.status !== "done");
          if (missing.length) {
            Object.assign(cur, { status: "not-exercised", doneAt: step, detail: `it needs beat ${missing.map(id => byId(id)?.n ?? id).join(", ")}, which was not done` });
            changes.push({ ...cur });
            at += 1;
            continue;
          }
        }
        // An interruption is the runner's to make before it can be checked.
        if (beat.interruption && !cur.interrupted) return changes;
        const check = BEAT_CHECKS[beat.check?.type];
        if (!check) throw new Error(`beat ${beat.n} has no check the observer knows (${beat.check?.type})`);
        const view = beatView({ ...run, from: cur.enteredAt });
        const result = check(view, beat.check);
        cur.detail = result.detail;
        cur.lines = view.linesInWindow.filter(m => !isSceneQuestion(m.text)).length;
        cur.rolled = view.rolls.filter(r => r.rolled).map(r => ({ step: r.step, moveId: r.moveId, outcome: r.outcome }));
        if ((result.progress ?? 0) > cur.progress) { cur.progress = result.progress; cur.sinceProgress = 0; cur.linesAtProgress = cur.lines; cur.waits = 0; cur.rolledAtProgress = cur.rolled.length; }
        if (result.done) {
          Object.assign(cur, { status: result.failed ? "failed" : "done", doneAt: step });
          changes.push({ ...cur });
          at += 1;
          continue;
        }
        // An interruption is checked once: what it left is what it left.
        if (beat.interruption || cur.sinceProgress >= (beat.stall ?? STALL_ACTIONS)) {
          Object.assign(cur, { status: beat.interruption ? "failed" : "not-exercised", doneAt: step,
            detail: beat.interruption ? result.detail : `not reached in ${cur.sinceProgress} actions — ${result.detail}` });
          changes.push({ ...cur });
          at += 1;
          continue;
        }
        break;
      }
      return changes;
    },

    /** The runner made the current beat's interruption. */
    interrupted() { if (state[at]) state[at].interrupted = true; },

    /** The current beat could not be put to the test: not exercised, for the reason given. */
    giveUp(step, detail) {
      const cur = state[at];
      if (!cur) return;
      Object.assign(cur, { status: "not-exercised", doneAt: step, detail });
      at += 1;
    },

    /**
     * What the player is told about the beat it is on. A player never names a
     * move in what it types (decisions.md → "A player is never made to name a
     * move"), so a beat's `tell` does not name one and the player is shown
     * `playerTitle` where the beat's own title does. A beat that needs a roll
     * says how to name it under `lastResort` — told to the player only once
     * plain lines have brought nothing about, so that the beats after it can
     * still be reached. The beat keeps that it was (`state.lastResort`): its
     * move was not had from plain lines.
     *
     * And the player is never left to take a roll for the end of a beat. The
     * third live run's player rolled a move that was not the beat's, twice —
     * a Compel where a connection was to be made, a Gain Ground the check
     * did not then count — and each time waited six turns for the observer
     * to move it on ("Beat appears done; wait for observer"). So when the
     * last roll made on the beat is not one the beat wants, or the player has
     * waited twice running on a beat that has not moved, `alert` says so
     * plainly: what was rolled, that the beat is NOT done, that waiting will
     * not finish it — and the last resort is unlocked then too, not only
     * after `lastResortAfter` plain lines (two unless the beat says). Not on
     * a beat that is the table's (an interruption): there waiting is right.
     */
    brief() {
      const cur = this.current();
      if (!cur) return null;
      const { beat, state: st } = cur;
      const unread = st.lines - st.linesAtProgress;
      const tables = !!beat.interruption;
      const wanted = wantsOf(beat);
      // The last roll, where the beat has not moved since it was made.
      const last = st.rolled.length > st.rolledAtProgress ? st.rolled.at(-1) : null;
      const stray = !tables && wanted.length && last && !wanted.includes(last.moveId) ? last : null;
      const idle = !tables && st.waits >= WAITS_BEFORE_TOLD;
      const unreadLines = unread >= (beat.lastResortAfter ?? LAST_RESORT_AFTER);
      const resort = !!beat.lastResort && (unreadLines || !!stray || idle);
      if (resort) st.lastResort = true;
      const alert = [
        stray ? `A ROLL WAS MADE — ${moveTitle(stray.moveId)}, ${OUTCOME[stray.outcome] ?? stray.outcome} — AND IT IS NOT WHAT THIS BEAT NEEDS. The beat is NOT done, and waiting will not finish it: do what the beat asks again, in other words.` : "",
        idle ? `YOU HAVE WAITED ${st.waits} TIMES RUNNING AND NOTHING HAS CHANGED. The beat is NOT done, and waiting will not finish it: act.` : "",
      ].filter(Boolean).join(" ");
      const why = unreadLines ? `${unread} plain lines have brought nothing about` : stray ? "a roll came that is not this beat's" : "waiting has brought nothing about";
      const note = [
        st.detail ? `the observer sees: ${st.detail}` : "",
        resort ? `LAST RESORT — ${why}: this once you may name the move — ${beat.lastResort}` : "",
      ].filter(Boolean).join("; ");
      return { n: beat.n, of: beats.length, session: beat.session, title: beat.playerTitle ?? beat.title, tell: beat.tell ?? "", actions: st.actions, note, alert };
    },

    summary() {
      const count = (s) => state.filter(x => x.status === s).length;
      return { beats: beats.length, done: count("done"), failed: count("failed"), notExercised: count("not-exercised") + count("pending") + count("current") };
    },
  };
}

/**
 * A long run's class (issue #373; issue #302 §7's classes). A deterministic
 * failure outranks an opinion, and a run that never put most of its beats to
 * the test is not a pass:
 *
 *   infrastructure-error   the run itself broke
 *   product-failure        a health check failed, a mechanical check was
 *                          violated, or a beat was brought about wrongly —
 *                          each with its step, to be read: the check may be
 *                          the one at fault
 *   budget-exhausted /     more than a quarter of the beats were never
 *   not-exercised          exercised — the run is not counted in its round
 *   suspected-quality-issue  a fact was lost or refused
 *   pass                   the run's own verdict — one line of its review
 */
export function classifyLongRun({ infrastructure = null, budgetStop = null, health, beats, mechanics, ledger }) {
  if (infrastructure) return { classification: "infrastructure-error", because: infrastructure };
  if (health?.failures?.length) return { classification: "product-failure", because: health.failures[0] };
  const violated = mechanics?.violations ?? [];
  if (violated.length) return { classification: "product-failure", because: `${violated.length} mechanical check(s) violated — the first, at ${violated[0].step}: ${violated[0].check}: ${violated[0].detail}` };
  const failedBeats = beats.filter(b => b.status === "failed");
  if (failedBeats.length) return { classification: "product-failure", because: `beat ${failedBeats[0].n} (${failedBeats[0].title}) was brought about wrongly: ${failedBeats[0].detail}` };
  const never = beats.filter(b => b.status !== "done" && b.status !== "failed");
  if (never.length > beats.length / 4) {
    const because = `${never.length} of ${beats.length} beats were not exercised — more than a quarter, so the run is not counted (the first: beat ${never[0].n}, ${never[0].detail || "never reached"})`;
    if (health?.waitingOnGm?.length) return { classification: "not-exercised", because: `the GM's screen was waiting on ${health.waitingOnGm.map(t => `"${t}"`).join(", ")}, which the GM's rules do not answer — ${because}` };
    return budgetStop ? { classification: "budget-exhausted", because: `${budgetStop.cap} cap reached (${budgetStop.detail}) — ${because}` } : { classification: "not-exercised", because };
  }
  const t = ledger?.totals ?? {};
  if (t.refused || t.lost) return { classification: "suspected-quality-issue", because: `the ledger: ${t.refused ?? 0} fact(s) refused, ${t.lost ?? 0} lost — each excerpt is to be read` };
  return { classification: "pass", because: `${beats.length - never.length} of ${beats.length} beats done${never.length ? `, ${never.length} not exercised` : ""}; no check violated, no fact lost or refused` };
}
