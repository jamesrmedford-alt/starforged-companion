// What the table holds, read from the GM's world after each action of a long
// exploration run (issue #373). Nothing is written.
//
// The observer's `readWorld` (lib/observer.mjs) answers one question — where
// is each fact stored. A long run asks more of the same world: whether the
// mechanics came out as the game's text says (lib/mechanics.mjs), whether a
// beat was brought about (lib/beats.mjs), what the helpers wrote and what the
// hidden plans hold (lib/ledger.mjs). This is the one reading they share, as
// plain data, so that everything that judges it is a pure function.
//
// Read from the GM's page because the GM's world is the whole world: the
// Secrets journal and the whispered cards are not on a player's.

import { MODULE_ID } from "./foundry.mjs";

/**
 * The dice of a move card, from the card's own text (the `.sf-move-dice`
 * line): what the table was shown. Pure.
 *
 *   "Action: 4 + 3 + 1 = 8 | Challenge: 2, 9"          an action roll
 *   "Action: 4 (cancelled by momentum -4) + 2 = 2 | …"  its die cancelled
 *   "Progress: 6 | Challenge: 1, 2 ✦ Match"             a progress roll
 *
 * @returns {{ kind: "action"|"progress", actionDie?: number, cancelled?: boolean, stat?: number, adds?: number,
 *   score: number, challenge: [number, number], match: boolean }|null}
 */
export function parseDiceLine(text) {
  const s = String(text ?? "").replace(/\s+/g, " ");
  const action = /Action:\s*(\d+)(\s*\(cancelled[^)]*\))?\s*\+\s*(-?\d+)(?:\s*\+\s*(-?\d+))?\s*=\s*(-?\d+)\s*\|\s*Challenge:\s*(\d+),\s*(\d+)/i.exec(s);
  if (action) {
    return {
      kind: "action", actionDie: Number(action[1]), cancelled: !!action[2], stat: Number(action[3]), adds: Number(action[4] ?? 0),
      score: Number(action[5]), challenge: [Number(action[6]), Number(action[7])], match: /Match/i.test(s.slice(action.index)),
    };
  }
  const progress = /Progress:\s*(\d+)\s*\|\s*Challenge:\s*(\d+),\s*(\d+)/i.exec(s);
  if (progress) {
    return { kind: "progress", score: Number(progress[1]), challenge: [Number(progress[2]), Number(progress[3])], match: /Match/i.test(s.slice(progress.index)) };
  }
  return null;
}

/**
 * A Pay the Price card, from its text: the d100, the entry it rolled, and —
 * where the entry names a suffer move — the move and its cost, which the
 * module applies at once ("d100 = 78 · You are harmed Routes to Endure Harm
 * (-1)."). Pure.
 *
 * @returns {{ roll: number|null, entry: string, route: { move: string, amount: number }|null }}
 */
export function parsePriceLine(text) {
  const s = String(text ?? "").replace(/\s+/g, " ");
  const rolled = /d100\s*=\s*(\d+)\s*·\s*(.+?)(?:\s+Routes to\b|$)/i.exec(s);
  const route = /Routes to\s+(Endure Harm|Endure Stress|Lose Momentum|Sacrifice Resources|Withstand Damage|Companion Takes a Hit)\s*\(-(\d+)\)/i.exec(s);
  return {
    roll: rolled ? Number(rolled[1]) : null,
    entry: rolled ? rolled[2].trim() : "",
    route: route ? { move: route[1].toLowerCase().replace(/\s+/g, "_"), amount: Number(route[2]) } : null,
  };
}

/** A die face as the uniform value that rolls it, and back: Math.floor(u * faces) + 1. */
export const uniformFor = (face, faces) => (face - 0.5) / faces;
export const faceOf = (uniform, faces) => Math.floor(uniform * faces) + 1;

/**
 * The table, as data.
 *
 * @returns {Promise<object>} see the fields below
 */
export function readTable(gm) {
  return gm.page.evaluate((MODULE_ID) => {
    const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
    const strip = (html) => clean(String(html ?? "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
    const cs = game.settings.get(MODULE_ID, "campaignState") ?? {};
    const flagsOf = (doc) => doc?.flags?.[MODULE_ID] ?? {};
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

    // ── the player characters ────────────────────────────────────────────────
    const isPc = (a) => a.type === "character" && !flagsOf(a).entityType;
    const progressItems = (a, subtype) => (a.items?.contents ?? []).filter(i => i.type === "progress" && String(i.system?.subtype ?? "") === subtype);
    const pcs = game.actors.contents.filter(isPc).map((a) => {
      const sys = a.system ?? {};
      return {
        id: a.id, name: a.name,
        health: num(sys.health?.value), spirit: num(sys.spirit?.value), supply: num(sys.supply?.value),
        momentum: num(sys.momentum?.value),
        momentumMax: num(sys.momentumMax ?? sys.momentum?.max), momentumReset: num(sys.momentumReset ?? sys.momentum?.resetValue),
        debilities: Object.entries(sys.debility ?? {}).filter(([, v]) => v === true).map(([k]) => k),
        combatPosition: sys.combatPosition ?? null,
        legacies: { quests: num(sys.legacies?.quests), bonds: num(sys.legacies?.bonds), discoveries: num(sys.legacies?.discoveries) },
        vows: progressItems(a, "vow").map(i => ({
          id: i.id, name: i.name, rank: i.system?.rank ?? null, ticks: num(i.system?.current) ?? 0, completed: i.system?.completed === true,
          vowId: flagsOf(i).vowId ?? null,
          linkedConnectionName: flagsOf(i).linkedConnectionName ?? null, linkedConnectionId: flagsOf(i).linkedConnectionId ?? null,
          fulfilPaid: flagsOf(i).fulfilPaid === true, fulfilPayoff: flagsOf(i).fulfilPayoff ?? {},
          reward: flagsOf(i).reward?.status ?? null,
        })),
        bonds: progressItems(a, "bond").map(i => ({
          id: i.id, name: i.name, rank: i.system?.rank ?? null, ticks: num(i.system?.current) ?? 0, completed: i.system?.completed === true,
          connectionId: flagsOf(i).connectionId ?? null, lost: flagsOf(i).lost === true,
        })),
      };
    });

    // ── connections and the other cards ──────────────────────────────────────
    const entityCards = game.actors.contents.filter(a => !!flagsOf(a).entityType)
      .map(a => ({ id: a.id, name: a.name, entityType: flagsOf(a).entityType }));
    const connections = (cs.connectionIds ?? []).map((hostId) => {
      const actor = game.actors.get(hostId);
      const rec = actor ? flagsOf(actor).connection ?? null : null;
      if (!rec) return { hostId, missing: true };
      return {
        hostId, recordId: rec._id ?? flagsOf(actor).entityId ?? null,
        name: actor.name, recordName: rec.name ?? null,
        rank: rec.rank ?? null, bonded: rec.bonded === true, active: rec.active !== false,
        ticks: num(rec.relationshipTicks) ?? 0, pronouns: rec.pronouns ?? "", role: rec.role ?? "",
      };
    });

    // ── progress tracks, legacy, where the ship is ───────────────────────────
    const trackJournal = game.journal.contents.find(j => Array.isArray(flagsOf(j).tracks));
    const tracks = (trackJournal ? flagsOf(trackJournal).tracks : []).map(t => ({
      id: t.id, label: t.label, type: t.type, rank: t.rank, ticks: num(t.ticks) ?? 0, completed: t.completed === true,
      linkedVowName: t.linkedVowName ?? null, linkedVowId: t.linkedVowId ?? null, combatState: t.combatState ?? null,
      objective: t.objective ?? null,
    }));
    const legacyOf = (t) => ({ ticks: num(cs.legacyTracks?.[t]?.ticks) ?? 0, cleared: cs.legacyTracks?.[t]?.cleared === true, cycles: num(cs.legacyTracks?.[t]?.cycles) ?? 0 });
    const sectorScene = game.scenes.contents.find(sc => flagsOf(sc).sectorScene);
    const shipToken = sectorScene?.tokens.find(t => flagsOf(t).commandVehicle) ?? null;
    const notes = (sectorScene?.notes.contents ?? []).map(n => ({ name: n.text, x: n.x, y: n.y }));
    const at = shipToken ? notes.find(n => n.x === shipToken.x && n.y === shipToken.y) ?? null : null;
    const here = cs.currentLocationId ? game.actors.get(cs.currentLocationId) : null;

    // ── the scene's ledger ───────────────────────────────────────────────────
    const subjectOf = (s) => (typeof s === "string" ? s : s?.kind === "entity" ? (game.actors.get(s.entityId)?.name ?? s.entityId) : s?.text ?? "");
    const truths = (cs.sceneTruths ?? []).map(t => ({
      id: t.id, subject: clean(subjectOf(t.subject)), fact: clean(t.fact), retracted: t.retracted === true, retractedBy: t.retractedBy ?? null,
      narrationId: t.narrationId ?? null, asserter: t.asserter ?? null,
    }));

    // ── what the helpers wrote ───────────────────────────────────────────────
    const summaries = [];
    if (cs.previousSessionSummary?.text) summaries.push({ session: cs.previousSessionSummary.sessionId ?? "previous", text: clean(cs.previousSessionSummary.text) });
    if (cs.sessionSummary?.text) summaries.push({ session: cs.sessionSummary.sessionId ?? "current", text: clean(cs.sessionSummary.text) });
    const chronicle = [];
    for (const j of game.journal.contents) {
      if (!flagsOf(j).chronicleActorId) continue;
      for (const p of j.pages?.contents ?? []) {
        for (const e of flagsOf(p).chronicle ?? []) {
          chronicle.push({ id: e.id, text: clean(e.text), type: e.type ?? null, sessionId: e.sessionId ?? null, narrationId: e.narrationId ?? null, automated: e.automated === true, moveId: e.moveId ?? null });
        }
      }
    }
    const sessionLog = [];
    for (const j of game.journal.contents) {
      if (!/Session Log/i.test(j.name)) continue;
      for (const p of j.pages?.contents ?? []) {
        const log = flagsOf(p).sessionLogPage ?? null;
        sessionLog.push({ name: p.name, text: clean(`${strip(p.text?.content)} ${log?.summary?.narrative ?? ""}`) });
      }
    }

    // ── the hidden plans (GM only) ───────────────────────────────────────────
    const plans = [];
    for (const j of game.journal.contents) {
      if (!/Secrets/i.test(j.name)) continue;
      for (const p of j.pages?.contents ?? []) {
        const e = flagsOf(p).secretEntry;
        if (!e || !e.truth) continue;
        plans.push({
          id: e.id, kind: e.kind ?? null, subject: clean(e.subject?.name ?? ""), truth: clean(e.truth), question: clean(e.question ?? ""),
          truthRevealed: e.truthRevealed === true, status: e.status ?? null,
        });
      }
    }

    return {
      session: {
        active: cs.sessionActive === true, number: cs.sessionNumber ?? null, id: cs.currentSessionId || null,
        pendingMove: cs.pendingMove === true, sceneId: cs.currentSceneId ?? null,
        xCardActive: cs.xCardActive === true, questFocus: cs.questFocus ?? "", connectionFocus: cs.connectionFocus ?? "",
      },
      location: { id: cs.currentLocationId ?? null, type: cs.currentLocationType ?? null, name: here?.name ?? null },
      ship: { token: shipToken ? { x: shipToken.x, y: shipToken.y } : null, tokenAt: at?.name ?? null },
      pcs, connections, entityCards, tracks,
      legacy: { quests: legacyOf("quests"), bonds: legacyOf("bonds"), discoveries: legacyOf("discoveries") },
      scene: { id: cs.currentSceneId ?? null, frame: cs.sceneFrame ?? null, truths },
      xCardedNarrationIds: [...(cs.xCardedNarrationIds ?? [])],
      helpers: { summaries, chronicle, recap: clean(cs.campaignRecapCache?.text ?? ""), sessionLog },
      plans,
      recentOracles: (cs.recentOracles ?? []).map(o => ({ name: o.name ?? null, question: o.question ?? null, answer: o.answer ?? null })),
    };
  }, MODULE_ID);
}

/**
 * The chat as the mechanics read it: each message's module flags that say
 * what the card is and did, and — for a move card — its dice line. The
 * observer's own messages (step, phase, who spoke) are joined to these by id.
 */
export function readCards(gm) {
  return gm.page.evaluate((MODULE_ID) => {
    const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
    const pick = (o, keys) => Object.fromEntries(keys.filter(k => o?.[k] !== undefined).map(k => [k, o[k]]));
    return game.messages.contents.map((m) => {
      const f = m.flags?.[MODULE_ID] ?? {};
      const doc = new DOMParser().parseFromString(String(m.content ?? ""), "text/html");
      const text = (sel) => clean(doc.querySelector(sel)?.textContent ?? "");
      const result = doc.querySelector(".sf-move-result");
      const card = { id: m.id, timestamp: m.timestamp ?? null };
      if (f.moveResolution) {
        card.move = {
          resolutionId: f.resolutionId ?? null, actorId: f.actorId ?? null,
          name: text(".sf-move-name"), statLine: text(".sf-move-stat"), diceLine: text(".sf-move-dice"),
          outcomeLine: text(".sf-move-outcome"), effect: text(".sf-move-effect").slice(0, 400),
          shown: result ? (result.classList.contains("sf-strong-hit") ? "strong_hit" : result.classList.contains("sf-weak-hit") ? "weak_hit" : result.classList.contains("sf-miss") ? "miss" : null) : null,
          upgraded: !!doc.querySelector(".sf-move-outcome--upgraded, .sf-move-burn-result"),
          burn: f.burn ? pick(f.burn, ["canBurn", "momentum", "originalOutcome", "previewOutcome", "originalApplied", "consumed", "moveId", "challengeDice"]) : null,
          improve: f.improve ? pick(f.improve, ["canImprove", "improveTo", "consumed"]) : null,
          held: f.awaitingUpgrade ? { open: f.awaitingUpgrade.open === true, resolvedBy: f.awaitingUpgrade.resolvedBy ?? null,
            resolution: f.awaitingUpgrade.resolution ? pick(f.awaitingUpgrade.resolution, ["moveId", "outcome", "isMatch", "actionDie", "actionDieCancelled", "actionScore", "statUsed", "statValue", "adds", "challengeDice", "progressScore", "rollKind"]) : null } : null,
          combatTrackId: f.combatTrackId ?? null,
        };
      }
      if (f.narratorCard) {
        card.narration = pick(f, ["moveId", "outcome", "isMatch", "resolutionId", "narrationId", "upgradeOf", "burnSuperseded", "xCarded", "playerText", "pacedNarrative", "oracleNarrationCard", "sessionNumber"]);
      }
      // Two cards carry `sufferCard`: one that asks the player to choose a
      // cost (or what a recovery gives), and one that says what a cost took
      // ("Endure Harm (-1) Health: 5 → 4") when a price named it outright.
      if (f.sufferCard && f.before !== undefined && f.after !== undefined) {
        card.sufferTaken = { move: f.suffer ?? null, amount: f.amount ?? null, before: f.before, after: f.after, atZero: f.atZero === true, actorId: f.actorId ?? null, text: clean(doc.body?.textContent ?? "").slice(0, 160) };
      } else if (f.sufferCard) {
        card.suffer = { resolved: f.resolved === true, picked: f.pickedIndices ?? [], moveId: f.moveId ?? null, resolutionId: f.resolutionId ?? null, actorId: f.actorId ?? null,
          options: [...doc.querySelectorAll('[data-action="sf-suffer-pick"]')].map(b => ({ label: clean(b.textContent), kind: b.dataset.pickKind ?? null, sufferId: b.dataset.sufferId ?? null })) };
      }
      if (f.payThePriceCard) card.price = { text: clean(doc.body?.textContent ?? "").slice(0, 300), actorId: f.actorId ?? null, resolutionId: f.resolutionId ?? null };
      if (f.fightVowCard) card.victory = pick(f, ["vowName", "vowId", "marks", "connectionName", "connectionId", "actorId", "resolvedActions", "fulfilAttempted", "deepenRetired"]);
      if (f.connectionPicker) card.picker = pick(f, ["pickAction", "resolved", "choices", "actorId"]);
      if (f.playerVowCard) card.vowCard = { ...pick(f, ["vowName", "vowId", "actorId", "swearRolled", "linkedConnection", "vowGone"]), hasLinkRow: !!doc.querySelector(".sf-vow-connection") };
      if (f.vowLinkedCard) card.vowLinked = true;
      if (f.combatThresholdCard) card.threshold = pick(f, ["label", "position", "actorId", "thresholdTaken"]);
      if (f.combatTrackCard) card.trackCard = pick(f, ["created", "trackId", "trackLabel"]);
      if (f.setACourseFeedback) card.course = pick(f, ["outcome", "destination", "tokenMoved"]);
      if (f.legacyXpCard) card.legacyXp = pick(f, ["track", "boxes", "xp", "cleared"]);
      if (f.forgeABondCard) card.forged = pick(f, ["connectionName", "legacyTicks"]);
      if (f.reachMilestoneCard) card.milestone = true;
      if (f.oracleCommandCard) card.oracle = { answer: f.oracleMemory?.answer ?? null, question: f.oracleMemory?.question ?? null };
      if (f.recapCard) card.recap = pick(f, ["recapType", "sessionNumber"]);
      if (f.draftEntityCard) card.drafts = (f.drafts ?? []).map(d => pick(d, ["name", "type", "status", "index"]));
      if (f.xcardCard || f.type === "xcard") card.xcard = true;
      if (f.xcardClearedCard) card.xcardCleared = true;
      if (f.xCarded) card.xCarded = true;
      if (f.factContinuityCommand) card.truthCommand = pick(f, ["domain", "verb"]);
      if (f.deepenBondCard) card.deepen = true;
      if (f.sessionLifecycleCard) card.lifecycle = true;
      if (f.payoffFailureCard) card.payoffFailure = true;
      return card;
    });
  }, MODULE_ID);
}
