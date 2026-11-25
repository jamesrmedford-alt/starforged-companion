// The mechanical checks of a long exploration run (issue #373 slice 2).
//
// After every action the table is read (lib/table.mjs) and held to the game's
// own text: each roll recomputed from the dice on its card, each meter inside
// its bounds, each mark of progress the size its rank gives, each reward the
// size its rank gives, each effect landing once on the character who rolled,
// a session's momentum paid once each way, the move lock free once the table
// has settled, every line of play answered exactly once — and a result held
// for Keep or Burn narrated before the line after it, not after.
//
// The expectations come from tests/helpers/sequence/rules.js — transcribed
// from the play kit and the recorded decisions, importing nothing from src/.
// An expectation computed with the module's own functions would agree with
// the module whatever it did (decisions.md → "Generated command sequences
// against an independent model").
//
// Pure: it is given the run's marks (the table after each step, and the cards
// that changed in it), its messages and its actions, and returns the checks
// it made and the ones that failed, each with its step. A check that could
// not be made — the card it needs was never posted — is counted as not made,
// never as passed: the scorecard lists what was never exercised.

import {
  METER_MIN, METER_MAX, MOMENTUM_MIN, MOMENTUM_MAX, PROGRESS_TICKS, TRACK_TICKS, TICKS_PER_BOX,
  BONDED_DEVELOP, MOVE_MOMENTUM, FIGHT_MARKS, SUFFER_METER, EXPEDITION_MARKS, WAYPOINT_CHOICE,
  rolledScore, boxesFilled, bondReward, burnedOutcome, decisiveOutcome, dieCancelled, expeditionFinished, expeditionReward, fulfilReward, isMatch, outcomeOf, progressScore,
  rankOf, recover, sufferCost, xpForBoxes,
} from "../../../../tests/helpers/sequence/rules.js";
import { parseDiceLine, parsePriceLine, faceOf } from "./table.mjs";

/** The checks, in the order the scorecard lists them. */
export const CHECKS = [
  "roll-score", "roll-outcome", "roll-match", "roll-cancelled-die", "roll-narrated-as-rolled", "dice-as-they-fell", "progress-score",
  "meter-bounds", "track-bounds", "progress-per-mark", "expedition-progress", "bond-mirror", "link-mirror",
  "legacy-reward", "xp-per-box",
  "move-momentum", "milestone-once", "suffer-cost", "recover-amount", "burn",
  "session-momentum", "lock-free", "answered-once", "held-narrated-in-turn",
];

const slug = (name) => String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const OUTCOME_WORDS = { strong_hit: "a strong hit", weak_hit: "a weak hit", miss: "a miss" };
const say = (o) => OUTCOME_WORDS[o] ?? String(o);

/** Every card's state after step `i` of the marks: the latest of each card that changed up to there. */
export function cardsAt(marks, i) {
  const cards = new Map();
  for (let k = 0; k <= i && k < marks.length; k++) for (const c of marks[k].cards ?? []) cards.set(c.id, c);
  return cards;
}

const pcOf = (table, id) => table?.pcs?.find(p => p.id === id) ?? (table?.pcs?.length === 1 ? table.pcs[0] : null);
const openFight = (table, id = null) => (table?.tracks ?? []).find(t => t.type === "combat" && (id ? t.id === id : !t.completed)) ?? null;

const expeditions = (table) => (table?.tracks ?? []).filter(t => t.type === "expedition");
/** What each expedition's track gained in a step — a track begun in it counts from nothing. */
const expeditionGains = (before, after) => expeditions(after)
  .map(t => ({ track: t, gain: t.ticks - (expeditions(before).find(b => b.id === t.id)?.ticks ?? 0), begun: !expeditions(before).some(b => b.id === t.id) }))
  .filter(g => g.gain !== 0 || g.begun);

/**
 * @param {object} o
 * @param {Array<{ step: string, phase?: string, table: object, cards?: object[], settled?: boolean, waitingOnGm?: boolean }>} o.marks
 * @param {Array<{ id: string, step: string, fromPlayer?: boolean, narrator?: boolean, vignette?: string|null, text: string }>} o.messages
 * @param {Array<{ step: string, action?: object }>} o.actions
 * @param {number[]} [o.dice] — the dice as they fell, as uniform values (window.__sfcRolled)
 * @param {Array<{ step: string, faces: number[] }>} [o.scripted] — where the runner scripted a roll
 * @returns {{ checks: number, byCheck: Record<string, { made: number, violated: number }>, violations: object[], rolls: object[] }}
 */
export function checkMechanics({ marks = [], messages = [], actions = [], dice = null, scripted = [] }) {
  const byCheck = Object.fromEntries(CHECKS.map(c => [c, { made: 0, violated: 0 }]));
  const violations = [];
  const rolls = [];
  const made = (check) => { byCheck[check].made += 1; };
  const fail = (check, step, detail) => { byCheck[check].violated += 1; violations.push({ step, check, detail }); };
  /** One check: counted, and failed when `ok` is false. */
  const hold = (check, step, ok, detail) => { made(check); if (!ok) fail(check, step, typeof detail === "function" ? detail() : detail); };

  const index = new Map(marks.map((k, i) => [k.step, i]));
  const actionAt = (step) => actions.find(a => a.step === step)?.action ?? null;
  const firstSeen = new Map();          // card id → the step it was first seen in
  for (const k of marks) for (const c of k.cards ?? []) if (!firstSeen.has(c.id)) firstSeen.set(c.id, k.step);
  const newIn = (mark) => (mark.cards ?? []).filter(c => firstSeen.get(c.id) === mark.step);

  // The recorded dice, as faces are taken from them roll by roll.
  let cursor = 0;
  const takeFaces = (roll) => {
    if (!Array.isArray(dice)) return null;
    const want = roll.kind === "action" ? [...roll.challenge, roll.actionDie] : [...roll.challenge];
    const sizes = roll.kind === "action" ? [10, 10, 6] : [10, 10];
    // Something else may have rolled in between (a recommit, an oracle's own
    // roller is not kept): look a little way ahead for the roll's dice.
    for (let at = cursor; at <= Math.min(dice.length - want.length, cursor + 12); at++) {
      if (want.every((face, j) => faceOf(dice[at + j], sizes[j]) === face)) { cursor = at + want.length; return true; }
    }
    return false;
  };

  for (let i = 1; i < marks.length; i++) {
    const mark = marks[i];
    const before = marks[i - 1].table;
    const after = mark.table;
    const step = mark.step;
    const fresh = newIn(mark);
    const changed = mark.cards ?? [];
    const action = actionAt(step);
    const label = action?.action === "click" ? String(action.label ?? "") : "";

    // ── the rolls on this step's new move cards ───────────────────────────────
    for (const card of fresh.filter(c => c.move)) {
      const move = card.move;
      const roll = parseDiceLine(move.diceLine);
      const narrated = [...cardsAt(marks, i).values()].find(c => c.narration?.resolutionId && c.narration.resolutionId === move.resolutionId && !c.narration.upgradeOf) ?? null;
      const moveId = narrated?.narration?.moveId ?? move.burn?.moveId ?? move.held?.resolution?.moveId ?? slug(move.name);
      const original = move.burn?.originalOutcome ?? move.held?.resolution?.outcome ?? move.shown;
      if (!roll) continue;                               // a move with no roll
      const wasScripted = scripted.some(s => s.step === step);
      rolls.push({ step, moveId, outcome: original, dice: move.diceLine, scripted: wasScripted, kind: roll.kind, resolutionId: move.resolutionId });
      const pc = pcOf(before, move.actorId);

      if (roll.kind === "action") {
        const score = rolledScore(roll);
        hold("roll-score", step, score === roll.score, `${moveId}: the card shows a score of ${roll.score}; its own dice give ${score} (${move.diceLine})`);
        const expected = outcomeOf(roll.score, roll.challenge);
        hold("roll-outcome", step, expected === original, `${moveId}: the card says ${say(original)}; a score of ${roll.score} against ${roll.challenge.join(", ")} is ${say(expected)}`);
        if (pc && Number.isFinite(pc.momentum)) {
          hold("roll-cancelled-die", step, dieCancelled(roll.actionDie, pc.momentum) === roll.cancelled,
            `${moveId}: the action die ${roll.actionDie} was ${roll.cancelled ? "" : "not "}cancelled with momentum at ${pc.momentum}`);
        }
      } else {
        let expected = outcomeOf(roll.score, roll.challenge);
        if (moveId === "take_decisive_action") {
          const fight = openFight(before, move.combatTrackId);
          const inBadSpot = fight ? fight.combatState === "bad_spot" : pc?.combatPosition === "inABadSpot";
          expected = decisiveOutcome(expected, { inBadSpot, match: isMatch(roll.challenge) });
          if (fight) hold("progress-score", step, progressScore(fight.ticks) === roll.score, `take_decisive_action: scored ${roll.score}; the fight's track had ${fight.ticks} ticks (${progressScore(fight.ticks)} boxes)`);
        }
        if (moveId === "fulfill_your_vow") {
          const done = (after.pcs ?? []).flatMap(p => p.vows).filter(v => v.completed && !(before.pcs ?? []).flatMap(p => p.vows).find(b => b.id === v.id)?.completed);
          const vow = done.length === 1 ? (before.pcs ?? []).flatMap(p => p.vows).find(b => b.id === done[0].id) : null;
          if (vow) hold("progress-score", step, progressScore(vow.ticks) === roll.score, `fulfill_your_vow: scored ${roll.score}; the vow had ${vow.ticks} ticks (${progressScore(vow.ticks)} boxes)`);
        }
        if (moveId === "finish_an_expedition") {
          // The expedition it scores: the one it completed, else the one open one.
          const ended = expeditions(after).filter(t => t.completed && expeditions(before).find(b => b.id === t.id)?.completed === false);
          const open = expeditions(before).filter(t => !t.completed);
          const track = ended.length === 1 ? expeditions(before).find(b => b.id === ended[0].id) : open.length === 1 ? open[0] : null;
          if (track) hold("progress-score", step, progressScore(track.ticks) === roll.score, `finish_an_expedition: scored ${roll.score}; the expedition "${track.label}" had ${track.ticks} ticks (${progressScore(track.ticks)} boxes)`);
        }
        if (moveId === "forge_a_bond") {
          const forged = (after.connections ?? []).filter(c => c.bonded && !(before.connections ?? []).find(b => b.hostId === c.hostId)?.bonded);
          const conn = forged.length === 1 ? (before.connections ?? []).find(b => b.hostId === forged[0].hostId) : null;
          if (conn) hold("progress-score", step, progressScore(conn.ticks) === roll.score, `forge_a_bond: scored ${roll.score}; the relationship had ${conn.ticks} ticks (${progressScore(conn.ticks)} boxes)`);
        }
        hold("roll-outcome", step, expected === original, `${moveId}: the card says ${say(original)}; a progress score of ${roll.score} against ${roll.challenge.join(", ")} is ${say(expected)}`);
      }
      hold("roll-match", step, isMatch(roll.challenge) === roll.match, `${moveId}: challenge dice ${roll.challenge.join(", ")} ${roll.match ? "are shown as a match" : "are a match the card does not show"}`);
      if (narrated?.narration?.outcome) {
        hold("roll-narrated-as-rolled", step, narrated.narration.outcome === original, `${moveId}: rolled ${say(original)}, narrated as ${say(narrated.narration.outcome)}`);
      }
      const fell = takeFaces(roll);
      if (fell !== null) hold("dice-as-they-fell", step, fell, `${moveId}: the card's dice (${move.diceLine}) are not among the dice that fell`);

      // The momentum the outcome's text gives, where it gives one number —
      // when the result was final in this step (a held result's effects wait
      // for Keep or Burn) and nothing else in the step moves momentum.
      const settledHere = !move.held || move.held.open === false;
      const gives = moveId === "develop_your_relationship" && roll.kind === "action" ? BONDED_DEVELOP[original]?.momentum : MOVE_MOMENTUM[moveId]?.[original];
      const alone = fresh.filter(c => c.move && parseDiceLine(c.move.diceLine)).length === 1 && !changed.some(c => c.suffer?.picked?.length)
        && before.session.active === after.session.active && !move.burn?.consumed;
      const pcAfter = pcOf(after, move.actorId);
      if (settledHere && alone && Number.isFinite(gives) && pc && pcAfter) {
        const want = Math.min(pcAfter.momentumMax ?? MOMENTUM_MAX, pc.momentum + gives);
        hold("move-momentum", step, pcAfter.momentum === want, `${moveId} (${say(original)}) gives +${gives} momentum: ${pc.name} went from ${pc.momentum} to ${pcAfter.momentum}, not ${want}`);
      }
    }

    // ── bounds, at every step ─────────────────────────────────────────────────
    for (const pc of after.pcs ?? []) {
      for (const meter of ["health", "spirit", "supply"]) {
        if (pc[meter] == null) continue;
        hold("meter-bounds", step, pc[meter] >= METER_MIN && pc[meter] <= METER_MAX, `${pc.name}'s ${meter} is ${pc[meter]}`);
      }
      if (pc.momentum != null) {
        const max = pc.momentumMax ?? MOMENTUM_MAX;
        hold("meter-bounds", step, pc.momentum >= MOMENTUM_MIN && pc.momentum <= Math.min(MOMENTUM_MAX, max), `${pc.name}'s momentum is ${pc.momentum} (its maximum is ${max})`);
      }
    }
    const allTracks = (t) => [
      ...(t.pcs ?? []).flatMap(p => [...p.vows.map(v => ({ ...v, what: `vow "${v.name}"`, key: `vow:${v.id}` })), ...p.bonds.map(b => ({ ...b, what: `bond "${b.name}"`, key: `bond:${b.id}` }))]),
      ...(t.connections ?? []).filter(c => !c.missing).map(c => ({ ...c, what: `relationship with ${c.name}`, key: `conn:${c.hostId}` })),
      ...(t.tracks ?? []).map(x => ({ ...x, what: `track "${x.label}"`, key: `track:${x.id}` })),
    ];
    for (const t of allTracks(after)) {
      hold("track-bounds", step, t.ticks >= 0 && t.ticks <= TRACK_TICKS, `the ${t.what} holds ${t.ticks} ticks`);
      const was = allTracks(before).find(b => b.key === t.key);
      if (!was || was.ticks === t.ticks) continue;
      const rank = rankOf(t.rank);
      const per = PROGRESS_TICKS[rank];
      const delta = t.ticks - was.ticks;
      if (delta > 0) {
        hold("progress-per-mark", step, !!per && (delta % per === 0 || t.ticks === TRACK_TICKS), `the ${t.what} (${rank}) gained ${delta} ticks; a mark at that rank is ${per}`);
      } else {
        // Progress is only ever cleared by a recommit: whole boxes, the rank raised.
        hold("progress-per-mark", step, rankOf(was.rank) !== rank && (-delta) % TICKS_PER_BOX === 0, `the ${t.what} lost ${-delta} ticks with its rank ${rankOf(was.rank) === rank ? "unchanged" : "raised"}`);
      }
    }

    // ── an expedition: one mark for a hit that undertakes it, one for a waypoint's ──
    // Undertake an Expedition marks once on a hit — on the track it begins,
    // or the open one — and nothing on a miss; Explore a Waypoint's strong
    // hit marks once when its roller picks the progress. Each by the rank's
    // own mark (a track filled to its tenth box holds no more).
    const oneMark = (g) => g.gain === PROGRESS_TICKS[rankOf(g.track.rank)] || (g.gain > 0 && g.track.ticks === TRACK_TICKS);
    const gains = expeditionGains(before, after);
    for (const card of fresh.filter(c => c.move && parseDiceLine(c.move.diceLine))) {
      const narrated = [...cardsAt(marks, i).values()].find(c => c.narration?.resolutionId && c.narration.resolutionId === card.move.resolutionId && !c.narration.upgradeOf) ?? null;
      const moveId = narrated?.narration?.moveId ?? card.move.burn?.moveId ?? card.move.held?.resolution?.moveId ?? slug(card.move.name);
      if (moveId !== "undertake_an_expedition") continue;
      // A result held for a burn has marked nothing yet; one burned in this step is the upgrade's to answer for.
      if (card.move.held?.open || card.move.burn?.consumed) continue;
      const outcome = card.move.shown;
      const marksWanted = EXPEDITION_MARKS[outcome];
      if (marksWanted == null) continue;
      hold("expedition-progress", step, marksWanted === 0 ? gains.length === 0 : gains.length === 1 && oneMark(gains[0]),
        marksWanted === 0
          ? `undertake_an_expedition missed, and ${gains.map(g => `"${g.track.label}" ${g.begun ? "was begun" : `gained ${g.gain} ticks`}`).join("; ")}`
          : `undertake_an_expedition (${say(outcome)}) marks progress once: ${gains.length ? gains.map(g => `the ${rankOf(g.track.rank)} expedition "${g.track.label}" gained ${g.gain} ticks`).join("; ") : "no expedition gained any"}`);
    }
    if (/^Mark expedition progress\b/i.test(label)) {
      hold("expedition-progress", step, gains.length === 1 && oneMark(gains[0]),
        `"${label}" marks progress ${WAYPOINT_CHOICE.marks === 1 ? "once" : `${WAYPOINT_CHOICE.marks} times`}: ${gains.length ? gains.map(g => `the ${rankOf(g.track.rank)} expedition "${g.track.label}" gained ${g.gain} ticks`).join("; ") : "no expedition gained any"}`);
    }

    // ── mirrors: one fact in two stores ───────────────────────────────────────
    for (const pc of after.pcs ?? []) {
      for (const bond of pc.bonds.filter(b => !b.lost)) {
        const conn = (after.connections ?? []).find(c => c.recordId && c.recordId === bond.connectionId);
        if (!conn) continue;
        hold("bond-mirror", step, bond.ticks === conn.ticks && bond.completed === conn.bonded && bond.name === conn.name,
          `${pc.name}'s bond Item for ${conn.name} says ${bond.ticks} ticks, ${bond.completed ? "forged" : "not forged"}, "${bond.name}"; the connection's card says ${conn.ticks}, ${conn.bonded ? "bonded" : "not bonded"}, "${conn.name}"`);
      }
      for (const vow of pc.vows.filter(v => v.linkedConnectionId)) {
        const conn = (after.connections ?? []).find(c => c.hostId === vow.linkedConnectionId);
        if (!conn) continue;
        hold("link-mirror", step, vow.linkedConnectionName === conn.name, `the vow "${vow.name}" is linked to the card of ${conn.name} and shows the name "${vow.linkedConnectionName}"`);
      }
    }

    // ── legacy rewards, by rank; experience, by box ───────────────────────────
    const stepRolls = rolls.filter(r => r.step === step);
    const outcomeHere = (moveId) => stepRolls.find(r => r.moveId === moveId)?.outcome ?? null;
    const ticksOf = (table, track) => (table.legacy?.[track]?.ticks ?? 0) + TRACK_TICKS * (table.legacy?.[track]?.cycles ?? 0);
    const questsGain = ticksOf(after, "quests") - ticksOf(before, "quests");
    const fulfilled = (after.pcs ?? []).flatMap(p => p.vows).filter(v => v.completed && (before.pcs ?? []).flatMap(p => p.vows).find(b => b.id === v.id)?.completed === false);
    if (fulfilled.length === 1 && outcomeHere("fulfill_your_vow")) {
      const want = fulfilReward(rankOf(fulfilled[0].rank), outcomeHere("fulfill_your_vow"));
      hold("legacy-reward", step, questsGain === want, `the ${rankOf(fulfilled[0].rank)} vow "${fulfilled[0].name}" was fulfilled on ${say(outcomeHere("fulfill_your_vow"))}: the quests legacy gained ${questsGain} ticks, not ${want}`);
    } else if (questsGain !== 0) hold("legacy-reward", step, false, `the quests legacy gained ${questsGain} ticks and no vow was fulfilled in this step`);
    const bondsGain = ticksOf(after, "bonds") - ticksOf(before, "bonds");
    const forgedNow = (after.connections ?? []).filter(c => c.bonded && (before.connections ?? []).find(b => b.hostId === c.hostId)?.bonded === false);
    const bondedRoll = stepRolls.find(r => r.moveId === "develop_your_relationship" && r.kind === "action") ?? null;
    if (forgedNow.length === 1 && outcomeHere("forge_a_bond")) {
      const want = bondReward(rankOf(forgedNow[0].rank), outcomeHere("forge_a_bond"));
      hold("legacy-reward", step, bondsGain === want, `a bond was forged with ${forgedNow[0].name} (${rankOf(forgedNow[0].rank)}): the bonds legacy gained ${bondsGain} ticks, not ${want}`);
    } else if (bondedRoll && !fresh.find(c => c.move?.resolutionId === bondedRoll.resolutionId)?.move?.held?.open) {
      const want = BONDED_DEVELOP[bondedRoll.outcome]?.bondsTicks ?? 0;
      hold("legacy-reward", step, bondsGain === want, `a bonded Develop Your Relationship came up ${say(bondedRoll.outcome)}: the bonds legacy gained ${bondsGain} ticks, not ${want}`);
    } else if (bondsGain !== 0) hold("legacy-reward", step, false, `the bonds legacy gained ${bondsGain} ticks with no bond forged and no bonded roll in this step`);
    // An expedition finished: the discoveries legacy by its rank — one rank
    // lower on a weak hit — and nothing for one a miss left open.
    const finish = stepRolls.find(r => r.moveId === "finish_an_expedition") ?? null;
    if (finish && !fresh.find(c => c.move?.resolutionId === finish.resolutionId)?.move?.held?.open) {
      const ended = expeditions(after).filter(t => t.completed && expeditions(before).find(b => b.id === t.id)?.completed === false);
      const discoveriesGain = ticksOf(after, "discoveries") - ticksOf(before, "discoveries");
      if (expeditionFinished(finish.outcome)) {
        if (ended.length === 1) {
          const want = expeditionReward(rankOf(ended[0].rank), finish.outcome);
          // Its card must say what the legacy track shows.
          const told = fresh.find(c => c.expeditionFinished)?.expeditionFinished.legacyTicks ?? null;
          const cardWrong = told != null && Number(told) !== discoveriesGain;
          hold("legacy-reward", step, discoveriesGain === want && !cardWrong,
            `the ${rankOf(ended[0].rank)} expedition "${ended[0].label}" was finished on ${say(finish.outcome)}: the discoveries legacy gained ${discoveriesGain} ticks`
            + (discoveriesGain !== want ? `, not ${want}` : "") + (cardWrong ? ` — and its card says ${told}` : ""));
        } else hold("legacy-reward", step, false, `finish_an_expedition came up ${say(finish.outcome)} and ${ended.length} expeditions were completed, not one`);
      } else hold("legacy-reward", step, ended.length === 0 && discoveriesGain === 0, `finish_an_expedition missed: ${ended.length} expedition(s) completed and the discoveries legacy gained ${discoveriesGain} ticks`);
    }
    for (const card of fresh.filter(c => c.legacyXp)) {
      const { track, boxes, xp, cleared } = card.legacyXp;
      const filled = boxesFilled(ticksOf(before, track), ticksOf(after, track));
      hold("xp-per-box", step, xp === xpForBoxes(boxes, cleared === true) && (filled === 0 || filled === boxes),
        `the ${track} legacy's card gives ${xp} experience for ${boxes} box(es)${filled !== boxes ? `; the track filled ${filled}` : ""}`);
    }

    // ── an effect lands once, on the character who rolled ─────────────────────
    const vowsBefore = (before.pcs ?? []).flatMap(p => p.vows);
    const vowsAfter = (after.pcs ?? []).flatMap(p => p.vows);
    const milestone = /Mark milestone\s*\(×\s*(\d+)\)/.exec(label);
    if (milestone) {
      const card = changed.find(c => c.victory?.resolvedActions?.markMilestone) ?? [...cardsAt(marks, i).values()].find(c => c.victory) ?? null;
      const vow = card ? vowsBefore.find(v => (card.victory.vowId && (v.vowId === card.victory.vowId || v.id === card.victory.vowId)) || v.name === card.victory.vowName) : null;
      const now = vow ? vowsAfter.find(v => v.id === vow.id) : null;
      if (vow && now) {
        const want = Math.min(TRACK_TICKS, vow.ticks + Number(milestone[1]) * PROGRESS_TICKS[rankOf(vow.rank)]);
        hold("milestone-once", step, now.ticks === want, `"${label}" on the ${rankOf(vow.rank)} vow "${vow.name}": ${vow.ticks} → ${now.ticks} ticks, not ${want}`);
      }
    }
    const cost = /^(Endure Harm|Endure Stress|Lose Momentum|Sacrifice Resources)\s*\(-(\d+)\)/i.exec(label);
    if (cost) {
      const meter = SUFFER_METER[slug(cost[1])];
      const card = changed.find(c => c.suffer?.picked?.length) ?? null;
      const pc = pcOf(before, card?.suffer?.actorId);
      const now = pcOf(after, card?.suffer?.actorId);
      if (meter && pc && now) {
        const { after: want, remainder } = sufferCost(pc[meter], Number(cost[2]), meter === "momentum" ? MOMENTUM_MIN : METER_MIN);
        const spilled = meter === "health" || meter === "spirit" ? remainder : 0;
        hold("suffer-cost", step, now[meter] === want && (spilled === 0 || now.momentum === Math.max(MOMENTUM_MIN, pc.momentum - spilled)),
          `"${label}": ${pc.name}'s ${meter} went from ${pc[meter]} to ${now[meter]}, not ${want}${spilled ? ` (and ${spilled} more from momentum: ${pc.momentum} → ${now.momentum})` : ""}`);
      }
    }
    // A price that names a suffer move is paid at once: the meter goes down
    // by what the price's card says, in the step the card appears.
    for (const card of fresh.filter(c => c.price)) {
      const route = parsePriceLine(card.price.text).route;
      const meter = route ? SUFFER_METER[route.move] : null;
      const others = fresh.filter(c => c.price).length > 1 || changed.some(c => c.suffer?.picked?.length) || cost;
      const pc = pcOf(before, card.price.actorId);
      const now = pcOf(after, card.price.actorId);
      if (!meter || others || !pc || !now) continue;
      const moved = fresh.some(c => c.move && parseDiceLine(c.move.diceLine)) && meter === "momentum";
      if (moved) continue;                               // the same step's roll may move momentum too
      const { after: want, remainder } = sufferCost(pc[meter], route.amount, meter === "momentum" ? MOMENTUM_MIN : METER_MIN);
      const spilled = meter === "health" || meter === "spirit" ? remainder : 0;
      // The card that says what was taken must say what the sheet shows.
      const told = fresh.find(c => c.sufferTaken)?.sufferTaken ?? null;
      const toldRight = !told || (Number(told.before) === pc[meter] && Number(told.after) === now[meter]);
      hold("suffer-cost", step, now[meter] === want && toldRight && (spilled === 0 || now.momentum <= pc.momentum - spilled),
        `the price "${parsePriceLine(card.price.text).entry}" routes to ${route.move} (-${route.amount}): ${pc.name}'s ${meter} went from ${pc[meter]} to ${now[meter]}, not ${want}${toldRight ? "" : ` — and its card says ${told.before} → ${told.after}`}`);
    }
    const gain = /\+(\d+)\s+(health|spirit|supply|momentum)\b/i.exec(label);
    if (gain && !cost && !milestone) {
      const meter = gain[2].toLowerCase();
      const card = changed.find(c => c.suffer?.picked?.length) ?? null;
      const pc = pcOf(before, card?.suffer?.actorId);
      const now = pcOf(after, card?.suffer?.actorId);
      const second = /\+\d+\s+(?:health|spirit|supply|momentum)\b.*\+\d+\s+(?:health|spirit|supply|momentum)\b/i.test(label);
      if (pc && now && !second && Number.isFinite(pc[meter])) {
        const ceiling = meter === "momentum" ? (now.momentumMax ?? MOMENTUM_MAX) : METER_MAX;
        const want = recover(pc[meter], Number(gain[1]), ceiling);
        hold("recover-amount", step, now[meter] === want, `"${label}": ${pc.name}'s ${meter} went from ${pc[meter]} to ${now[meter]}, not ${want}`);
      }
    }
    if (/Burn Momentum/i.test(label)) {
      const card = changed.find(c => c.move?.burn?.consumed) ?? null;
      made("burn");
      if (!card) fail("burn", step, `"${label}" was pressed and no move card is marked burned`);
      else {
        const rolledAt = index.get(firstSeen.get(card.id)) ?? i;
        const atRoll = marks[Math.max(0, rolledAt - 1)].table;
        const pc = pcOf(before, card.move.actorId);
        const now = pcOf(after, card.move.actorId);
        const roll = parseDiceLine(card.move.diceLine);
        const replaced = fresh.filter(c => c.narration?.upgradeOf && c.narration.upgradeOf === card.move.resolutionId);
        const problems = [];
        if (pc && now && now.momentum !== pc.momentumReset) problems.push(`momentum is ${now.momentum} after the burn; its reset value is ${pc.momentumReset}`);
        if (replaced.length !== 1) problems.push(`the outcome was narrated again ${replaced.length} time(s), not once`);
        if (roll && pc) {
          const want = burnedOutcome(pc.momentum, roll.challenge);
          if (replaced[0]?.narration?.outcome && replaced[0].narration.outcome !== want) problems.push(`burning ${pc.momentum} against ${roll.challenge.join(", ")} is ${say(want)}; it was narrated as ${say(replaced[0].narration.outcome)}`);
          const moveId = card.move.burn.moveId ?? slug(card.move.name);
          const fight = FIGHT_MARKS[moveId] ? openFight(atRoll, card.move.combatTrackId) : null;
          const fightNow = fight ? (after.tracks ?? []).find(t => t.id === fight.id) : null;
          if (fight && fightNow) {
            // The first outcome's marks are taken back: the track holds what
            // the burned outcome gives, counted from before the roll.
            const ticks = Math.min(TRACK_TICKS, fight.ticks + FIGHT_MARKS[moveId][want] * PROGRESS_TICKS[rankOf(fight.rank)]);
            if (fightNow.ticks !== ticks) problems.push(`the fight's track holds ${fightNow.ticks} ticks; ${moveId} on ${say(want)} from ${fight.ticks} gives ${ticks}`);
          }
        }
        if (problems.length) fail("burn", step, problems.join("; "));
      }
    }

    // ── a session's momentum, once each way ───────────────────────────────────
    if (before.session.active !== after.session.active && action?.action === "dialog") {
      const field = (name) => String(action.fields?.find(f => f.name === name)?.value ?? "");
      const paid = after.session.active ? field("vignette") === "true" : !!(field("questFocus").trim() || field("connectionFocus").trim());
      const rolledHere = fresh.some(c => c.move && parseDiceLine(c.move.diceLine)) || changed.some(c => c.suffer?.picked?.length);
      if (!rolledHere) for (const pc of before.pcs ?? []) {
        const now = pcOf(after, pc.id);
        if (!now) continue;
        const want = paid ? Math.min(now.momentumMax ?? MOMENTUM_MAX, pc.momentum + 1) : pc.momentum;
        hold("session-momentum", step, now.momentum === want,
          `${after.session.active ? "Begin" : "End"} a Session ${paid ? "with" : "without"} its +1: ${pc.name}'s momentum went from ${pc.momentum} to ${now.momentum}, not ${want}`);
      }
    }

    // ── the lock, and every line answered once ────────────────────────────────
    if (mark.settled !== false && !mark.waitingOnGm) {
      hold("lock-free", step, after.session.pendingMove !== true, "the move lock was held after the table had settled");
    }
    // A held result's narration comes when it is kept or burned — with its
    // own move card's resolutionId, rolled in an earlier step. Pressed "Keep
    // the result", it is narrated in the press's step, before any other line;
    // kept by the roller's next line (src/moves/heldResult.js "later"), it is
    // narrated after that line — the player reads a result of an earlier line
    // as if it answered this one. The fourth live run's a38 Enter the Fray
    // miss, kept by a41's attack, was told after it: "You are a half-beat
    // late…", then the Clash's own "The turn is too tight and too late…".
    // That is no second answer to the line (`answered-once`); it is a
    // finding of its own (known-issues HELD-RESULT-NARRATED-AFTER-THE-NEXT-LINE).
    const narrations = fresh.filter(c => c.narration && !c.narration.upgradeOf && !c.narration.oracleNarrationCard
      && !messages.find(m => m.id === c.id)?.vignette);
    const heldCard = (c) => {
      const card = c.narration.resolutionId ? [...cardsAt(marks, i).values()].find(k => k.move?.resolutionId === c.narration.resolutionId) : null;
      return card?.move?.held && firstSeen.get(card.id) !== step ? card : null;
    };
    const kept = narrations.map(c => ({ narration: c, card: heldCard(c) })).filter(x => x.card);
    const isLine = action?.action === "say" && !String(action.text ?? "").startsWith("!");
    for (const { card } of kept) {
      const moveId = card.move.held.resolution?.moveId ?? slug(card.move.name);
      const outcome = card.move.held.resolution?.outcome ?? card.move.shown;
      hold("held-narrated-in-turn", step, !isLine,
        `${moveId} (${say(outcome)}), rolled at ${firstSeen.get(card.id)} and held for Keep or Burn, was kept by the next line and narrated after the next line (${step}): the player read it as this line's answer`);
    }
    if (isLine && before.session.active && after.session.active && mark.settled !== false && !mark.waitingOnGm) {
      const answers = narrations.filter(c => !kept.some(x => x.narration.id === c.id));
      // A card that asks for a choice answers the line too: a fight offered, a
      // cost to pick, a result held until it is kept or burned.
      const asks = fresh.filter(c => c.threshold || c.picker || c.suffer || c.price || c.move?.held?.open);
      hold("answered-once", step, answers.length === 1 || (answers.length === 0 && asks.length > 0),
        answers.length ? `the line was narrated ${answers.length} times` : "the line got no narration and no card that asks for a choice");
    }
  }

  // Scripted dice are recorded where the runner armed them.
  for (const s of scripted) {
    const roll = rolls.find(r => r.step === s.step);
    if (roll) roll.scripted = true;
  }
  return { checks: Object.values(byCheck).reduce((n, c) => n + c.made, 0), byCheck, violations, rolls };
}
