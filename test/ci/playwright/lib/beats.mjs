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
import { rankOf } from "../../../../tests/helpers/sequence/rules.js";

/** Actions on a beat with no progress before it is given up as not exercised. */
export const STALL_ACTIONS = 8;

const slug = (name) => String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/**
 * What a check sees: the marks from the step the beat became current at
 * (`from`) to now, and the run so far.
 */
function view({ marks, messages, actions, charter, from }) {
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
  return {
    marks, window, steps, now, entered, allCards, inWindow, firstSeen, rolls, pc, charter, actions,
    lines, linesInWindow: lines.filter(m => steps.has(m.step)),
    messagesInWindow: messages.filter(m => steps.has(m.step)),
    cast: charter.cast ?? {},
    connection: (name) => (now?.connections ?? []).filter(c => !c.missing && same(c.name, name)),
    // The cast's connection is one card, whatever it is called by now: found
    // by the name it was made under, then followed by its id (a rename in
    // beat 18 left beats 22 and 23 looking for a name nobody had).
    castConnection: () => {
      const made = charter.cast?.connection?.name ?? null;
      const hostId = marks.flatMap(k => k.table?.connections ?? []).find(c => !c.missing && same(c.name, made))?.hostId ?? null;
      return (now?.connections ?? []).find(c => !c.missing && (hostId ? c.hostId === hostId : same(c.name, made))) ?? null;
    },
    openVows: () => (pc?.vows ?? []).filter(v => !v.completed),
  };
}

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
    const vow = (v.pc?.vows ?? []).find(x => rankOf(x.rank) === c.vow.rank);
    if (!vow) return notYet(`the session is open; no ${c.vow.rank} vow is on ${v.pc?.name ?? "the character"}'s sheet`, 1);
    if (c.sworn && !v.allCards.some(k => k.vowCard?.swearRolled)) return notYet(`the ${rankOf(vow.rank)} vow "${vow.name}" is on the sheet and has not been sworn with a roll`, 2);
    return done(`session ${c.n ?? 1} is open; the ${rankOf(vow.rank)} vow "${vow.name}" is on the sheet at ${vow.ticks} ticks`);
  },

  /** One card for the named NPC, a connection held by the character, its bond Item mirroring it. */
  connectionMade(v, c) {
    const name = c.name ?? v.cast.connection?.name;
    const conns = v.connection(name);
    const cards = (v.now?.entityCards ?? []).filter(e => same(e.name, name));
    if (cards.length > 1) return failed(`${cards.length} cards are named ${name}`);
    if (conns.length !== 1 || !conns[0].active) return notYet(`${name} has no connection card yet`);
    const bond = (v.pc?.bonds ?? []).find(b => b.connectionId && b.connectionId === conns[0].recordId);
    if (!bond) return notYet(`${name} has a card; ${v.pc?.name ?? "the character"} holds no bond Item for it`, 1);
    // Where the beat asks for the move too: Make a Connection rolled, and still one card.
    if (c.move) {
      const roll = v.rolls.find(r => r.moveId === c.move && r.rolled);
      if (!roll) return notYet(`${name} has a card and a bond Item; ${c.move} has not been rolled`, 2);
      if (roll.outcome === "miss") return notYet(`${name} has a card; ${c.move} missed`, 3);
    }
    return done(`${name} is a ${conns[0].rank} connection held by ${v.pc?.name}; its bond Item reads ${bond.ticks} ticks${c.move ? `; ${c.move} was rolled and there is still one card` : ""}`);
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

  /** Every probe of the set has been asked, in the charter's words. */
  probesAsked(v, c) {
    if (c.session) {
      const begun = new Set(v.marks.filter(k => k.table?.session?.active && k.table.session.id).map(k => k.table.session.id));
      if (!v.now?.session.active || begun.size < c.session) return notYet(`session ${c.session} is not open`);
    }
    const probes = (v.charter.facts ?? []).flatMap(f => (f.probes ?? []).filter(p => p.set === c.set));
    const baits = (v.charter.baits ?? []).filter(b => (c.baits ?? []).includes(b.id));
    const asked = [...probes, ...baits].filter(p => v.linesInWindow.some(m => isProbeLine(m.text, p)));
    const total = probes.length + baits.length;
    const recap = c.recap ? v.allCards.some(k => k.recap && v.inWindow(k)) : true;
    if (asked.length < total || !recap) return notYet(`${c.session ? `session ${c.session} is open; ` : ""}${asked.length} of ${total} asked${c.recap && !recap ? "; no recap card yet" : ""}`, 1 + asked.length + (c.recap && recap ? 1 : 0));
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
    const miss = v.rolls.find(r => (c.moves ?? ["strike", "clash"]).includes(r.moveId) && r.outcome === "miss");
    if (!miss) return notYet("no miss in the fight yet");
    if (miss.card.move.held?.open) return notYet(`${miss.moveId} missed at ${miss.step}; its result is held — nothing is paid until it is kept`, 1);
    const prices = v.allCards.filter(k => k.price && v.inWindow(k)).map(k => ({ step: v.firstSeen.get(k.id), ...parsePriceLine(k.price.text) }));
    const routed = prices.find(p => p.route);
    if (routed) return done(`${miss.moveId} missed at ${miss.step}; its price (${routed.roll}: "${routed.entry}") was ${routed.route.move} (-${routed.route.amount}), taken at ${routed.step}`);
    const suffer = v.allCards.filter(k => k.suffer && v.inWindow(k));
    if (!suffer.length) return notYet(prices.length ? `${miss.moveId} missed at ${miss.step}; its price ("${prices[0].entry}") named no suffer move` : `${miss.moveId} missed at ${miss.step}; no price has been paid`, prices.length ? 2 : 1);
    if (!suffer.some(k => k.suffer.resolved)) return notYet("a suffer card is offered and not answered", 2);
    return done(`${miss.moveId} missed at ${miss.step}; the suffer card was offered and answered`);
  },

  /** Momentum was burned on a roll made while the beat was current. */
  burned(v, c) {
    const roll = v.rolls.find(r => r.rolled && (!c.moves || c.moves.includes(r.moveId)) && (!c.outcome || r.outcome === c.outcome));
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
    const holds = (t, words) => words.some(w => factIn(`${t.subject} ${t.fact}`, { variants: [w] }));
    const standingOld = truths.filter(t => !t.retracted && holds(t, old));
    const standingNew = truths.filter(t => !t.retracted && holds(t, fact?.variants ?? []));
    const struck = truths.filter(t => t.retracted && holds(t, old));
    if (!standingNew.length) return notYet(`no standing truth holds the corrected value${struck.length ? "; the old one is struck" : ""}`, struck.length ? 1 : 0);
    if (standingOld.length) return notYet(`the corrected value is set and the old one still stands ("${standingOld[0].fact}")`, 1);
    return done(`the old value is struck${struck.length ? "" : " (or was never in the ledger)"} and "${standingNew[0].fact}" stands`);
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
    const roll = v.rolls.find(r => (c.moves ?? ["heal", "resupply", "sojourn", "hearten"]).includes(r.moveId) && r.rolled);
    if (!roll) return notYet("no recover move yet");
    if (roll.outcome === "miss") return notYet(`${roll.moveId} missed`, 1);
    const offered = v.allCards.filter(k => k.suffer && v.inWindow(k) && k.suffer.moveId === roll.moveId);
    if (offered.length && !offered.some(k => k.suffer.resolved)) return notYet(`${roll.moveId} came up ${roll.outcome}; its choice is not made`, 2);
    return done(`${roll.moveId} came up ${roll.outcome} at ${roll.step}`);
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

  /** The vow is fulfilled; a bonded connection's track is untouched and its bonded roll offered once. */
  vowFulfilled(v, c) {
    const vow = (v.pc?.vows ?? []).find(x => x.completed) ?? null;
    const open = v.openVows()[0] ?? null;
    if (!vow) return notYet(open ? `the vow "${open.name}" stands at ${open.ticks} ticks` : "no vow on the sheet", open?.ticks ?? 0);
    const roll = v.rolls.find(r => r.moveId === "fulfill_your_vow");
    const conn = vow.linkedConnectionId ? (v.now.connections ?? []).find(x => x.hostId === vow.linkedConnectionId) : null;
    if (conn?.bonded && roll && c.bondedPayoff !== false) {
      const i = v.marks.findIndex(k => k.step === roll.step);
      const before = v.marks[i - 1]?.table.connections.find(x => x.hostId === conn.hostId);
      if (before && before.bonded && before.ticks !== conn.ticks) return failed(`the fulfilment marked the bonded connection's track: ${before.ticks} → ${conn.ticks} ticks`);
      const offers = v.allCards.filter(k => k.picker && v.inWindow(k) && k.picker.pickAction === "develop" && k.picker.choices?.length === 1 && k.picker.choices[0].hostId === conn.hostId);
      if (offers.length !== 1) return failed(`the vow was fulfilled for the bonded ${conn.name}; ${offers.length} bonded roll(s) offered, not one`);
      return done(`the vow "${vow.name}" is fulfilled; ${conn.name}'s track is untouched and one bonded roll is offered`);
    }
    return done(`the vow "${vow.name}" is fulfilled${roll ? ` (${roll.outcome})` : ""}`);
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
    const standing = v.window.flatMap(k => (k.table.scene?.truths ?? []).filter(t => ids.has(t.narrationId) && !t.retracted).map(t => `${k.step}: "${t.fact}"`));
    const kept = (v.now.helpers?.chronicle ?? []).filter(e => ids.has(e.narrationId));
    if (standing.length || kept.length) return failed(`the removed narration still has ${standing.length} standing truth(s)${standing.length ? ` (${standing[0]})` : ""} and ${kept.length} Chronicle entr${kept.length === 1 ? "y" : "ies"}`);
    return done(`${carded.length} narration(s) removed; none of their facts stands, and play has resumed`);
  },

  /** After the GM renamed the connection's card: one card, the new name on the vow's link. */
  renamed(v, c) {
    const conns = v.connection(c.to);
    if (conns.length !== 1) return notYet(`no connection is named ${c.to}`);
    if ((v.now.entityCards ?? []).some(e => same(e.name, c.from))) return failed(`a card is still named ${c.from}: two people`);
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
  const state = beats.map(b => ({ id: b.id, n: b.n, session: b.session, title: b.title, status: "pending", actions: 0, steps: [], enteredAt: null, doneAt: null, detail: "", progress: 0, sinceProgress: 0 }));
  let at = 0;
  const byId = (id) => state.find(s => s.id === id);

  return {
    state,
    /** The beat the player is on, or null when the beats are over. */
    current() { return at < beats.length ? { beat: beats[at], state: state[at] } : null; },
    finished() { return at >= beats.length; },

    /** A player action was taken on the current beat, at `step`. */
    record(step) {
      const cur = state[at];
      if (!cur) return;
      cur.actions += 1;
      cur.sinceProgress += 1;
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
        const result = check(view({ ...run, from: cur.enteredAt }), beat.check);
        cur.detail = result.detail;
        if ((result.progress ?? 0) > cur.progress) { cur.progress = result.progress; cur.sinceProgress = 0; }
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

    /** What the player is told about the beat it is on. */
    brief() {
      const cur = this.current();
      if (!cur) return null;
      return { n: cur.beat.n, of: beats.length, session: cur.beat.session, title: cur.beat.title, tell: cur.beat.tell ?? "", actions: cur.state.actions,
        note: cur.state.detail ? `the observer sees: ${cur.state.detail}` : "" };
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
