// The observer of an exploration run (issue #302 slice D; #290 part 3).
//
// The AI player acts; the observer decides what happened. It reads — the GM's
// world, the chat, the prompts the module sent — and never writes, and its
// verdict is arithmetic over what it read: no model is asked whether the goal
// was met.
//
// The memory charter's question is whether something the player established
// in one session is still known in the next. A planted fact is checked at
// three layers at the moment the player asks about it (issue #302 §6):
//
//   stored  — is it in a store a narration is built from (campaign state,
//             an entity's record, a journal page)?         a miss: storage
//   prompt  — did it reach the narrator's prompt for that question?
//                                                          a miss: retrieval
//   answer  — does the narrator's reply hold it?           a miss: generation
//
// A fact is "held" by text when one of its accepted variants occurs in it
// (case, spacing and hyphenation aside). That is a presence test: it does not
// read negation or paraphrase ("you lost the compass" holds "compass"). The
// run's review — made by whoever ran it (rules/ci-e2e.md) — reads the answer
// for sense; the benchmark of §6 (slice E) is where structured facts belong.

import { MODULE_ID } from "./foundry.mjs";
import { readTable, readCards } from "./table.mjs";

/** The module calls that narrate in answer to a player's line. */
// A scene question (`@scene …`) is answered by the narrator too: its call is `interrogateScene`.
const NARRATION_KIND = /^callNarratorAPI>(?:narrate(?!SessionVignette)|interrogateScene)/;
/** Failing layers, in the order a fact travels them. */
export const LAYERS = ["storage", "retrieval", "generation"];

// ── facts ────────────────────────────────────────────────────────────────────

/** A variant as a regular-expression source: spacing and hyphenation are free, word edges are kept. */
export function variantPattern(variant) {
  const parts = String(variant ?? "").trim().split(/[\s\-‐-―]+/).filter(Boolean)
    .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!parts.length) return "(?!)";
  const body = parts.join("[\\s\\-\\u2010-\\u2015]*");
  return `${/^\w/.test(parts[0]) ? "\\b" : ""}${body}${/\w$/.test(parts.at(-1)) ? "\\b" : ""}`;
}

const patternsOf = (fact) => (fact.variants ?? []).map(variantPattern);

/** Whether `text` holds the fact: one of its variants occurs in it. */
export function factIn(text, fact) {
  const s = String(text ?? "");
  return patternsOf(fact).some(p => new RegExp(p, "i").test(s));
}

/** The text around a fact's first occurrence, or null. */
export function excerptOf(text, fact, width = 80) {
  const s = String(text ?? "");
  for (const p of patternsOf(fact)) {
    const m = new RegExp(p, "i").exec(s);
    if (m) return s.slice(Math.max(0, m.index - width), m.index + m[0].length + width).replace(/\s+/g, " ").trim();
  }
  return null;
}

/** The `## ` sections of a prompt that hold the fact (a match above the first heading: "(preamble)"). */
export function sectionsHolding(prompt, fact) {
  const out = [];
  let heading = "(preamble)";
  let body = [];
  const flush = () => { if (factIn(body.join("\n"), fact) && !out.includes(heading)) out.push(heading); };
  for (const line of String(prompt ?? "").split("\n")) {
    if (/^##\s+\S/.test(line)) { flush(); heading = line.replace(/^#+\s*/, "").trim(); body = [line]; }
    else body.push(line);
  }
  flush();
  return out;
}

// ── reading the world (GM page, read-only) ───────────────────────────────────

/**
 * The session's state, the chat, and where each fact is stored — as the GM's
 * world holds them now. Nothing is written.
 *
 * A store whose label starts with one of `notMemory` is found and named but
 * is not memory: a diagnostic log keeps the player's line and no narration
 * is ever built from it (explore.config.json → notMemory).
 */
export function readWorld(gm, facts, notMemory = []) {
  const wanted = facts.map(f => ({ id: f.id, patterns: patternsOf(f) }));
  return gm.page.evaluate(({ MODULE_ID, wanted, notMemory }) => {
    const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
    const strip = (html) => String(html ?? "").replace(/<[^>]+>/g, " ");
    const cs = game.settings.get(MODULE_ID, "campaignState") ?? {};

    const messages = game.messages.contents.map(m => {
      const f = m.flags?.[MODULE_ID] ?? {};
      return {
        id: m.id, authorId: m.author?.id ?? null, author: m.author?.name ?? null,
        speaker: m.alias ?? m.author?.name ?? null, timestamp: m.timestamp ?? null,
        // A narrator card keeps its prose apart from the card's own chrome.
        text: f.narratorCard === true && typeof f.narrationText === "string" && f.narrationText.trim()
          ? clean(strip(f.narrationText)) : clean(strip(m.content)),
        card: Object.keys(f),
        narrator: f.narratorCard === true,
        vignette: f.sessionVignetteCard === true ? (f.vignetteKind ?? "vignette") : null,
        moveId: f.moveId ?? null, outcome: f.outcome ?? null,
        // The scene it was told in (record/cards.js's stamp — overhaul 2 §8).
        sceneId: typeof f.sceneId === "string" && f.sceneId ? f.sceneId : null,
      };
    });

    // Where the facts are stored. Chat is not a store: it is the transcript.
    const regexes = wanted.map(f => ({ id: f.id, res: f.patterns.map(p => new RegExp(p, "i")) }));
    const stores = Object.fromEntries(wanted.map(f => [f.id, []]));
    const seen = new Set();
    const note = (id, store, text, re) => {
      if (seen.has(`${id}|${store}`)) return;
      seen.add(`${id}|${store}`);
      const m = re.exec(text);
      stores[id].push({
        store, memory: !notMemory.some(prefix => store.startsWith(prefix)),
        excerpt: clean(text.slice(Math.max(0, m.index - 70), m.index + m[0].length + 70)),
      });
    };
    const walk = (value, store, depth = 0) => {
      if (value == null || depth > 14) return;
      if (typeof value === "string") {
        for (const f of regexes) { const re = f.res.find(r => r.test(value)); if (re) note(f.id, store, value, re); }
        return;
      }
      if (typeof value !== "object") return;
      for (const v of Array.isArray(value) ? value : Object.values(value)) walk(v, store, depth + 1);
    };
    for (const [key, value] of Object.entries(cs)) walk(value, `campaign state → ${key}`);
    for (const [fullKey, config] of game.settings.settings) {
      if (!fullKey.startsWith(`${MODULE_ID}.`) || config.scope !== "world") continue;
      const key = fullKey.slice(MODULE_ID.length + 1);
      if (key === "campaignState" || /key|token|secret|password/i.test(key)) continue;
      try { walk(game.settings.get(MODULE_ID, key), `setting → ${key}`); }
      catch (err) { console.warn(`explore observer: the ${key} setting could not be read`, err); }
    }
    for (const a of game.actors.contents) {
      for (const [key, value] of Object.entries(a.flags?.[MODULE_ID] ?? {})) walk(value, `actor "${a.name}" → ${key}`);
      walk(a.system?.toObject?.() ?? null, `actor "${a.name}" → sheet`);
      for (const item of a.items?.contents ?? []) walk(item.toObject(), `actor "${a.name}" → item "${item.name}"`);
    }
    for (const j of game.journal.contents) {
      if (/help/i.test(j.name)) continue;
      for (const p of j.pages?.contents ?? []) {
        walk(strip(p.text?.content), `journal "${j.name}" → page "${p.name}"`);
        walk(p.flags?.[MODULE_ID], `journal "${j.name}" → page "${p.name}" (flags)`);
      }
    }

    return {
      session: {
        active: cs.sessionActive === true, number: cs.sessionNumber ?? null, id: cs.currentSessionId || null,
        pendingMove: cs.pendingMove === true, sceneId: cs.currentSceneId ?? null, locationId: cs.currentLocationId ?? null,
        // Cost cards nobody has answered: a card waits on the player and holds
        // nothing up, so a cost can be typed past (the third live run did, twice).
        // A cost card asks for a choice (`sufferPrompt`); the cards that report a
        // cost applied carry `sufferCard` too and are not owed.
        owed: game.messages.contents
          .filter(m => m.flags?.[MODULE_ID]?.sufferCard === true && m.flags[MODULE_ID].sufferPrompt
            && m.flags[MODULE_ID].resolved !== true && m.flags[MODULE_ID].xCarded !== true)
          .map(m => ({ actor: game.actors.get(m.flags[MODULE_ID].actorId)?.name ?? null, move: m.flags[MODULE_ID].moveId ?? null })),
      },
      messages, stores,
      gmWindows: [...document.querySelectorAll("dialog[open], .application.dialog, .application.sf-window")]
        .map(el => clean(el.querySelector(".window-title, header h1, header h4")?.textContent)).filter(Boolean).slice(0, 6),
    };
  }, { MODULE_ID, wanted, notMemory });
}

// ── the run's record ─────────────────────────────────────────────────────────

/**
 * Collects what the world looked like after each step. `observe` is called
 * once the step's work has settled; a message first seen then belongs to it.
 */
export function createObserver({ gm, facts, playerId, notMemory = [], detail = false }) {
  // `detail` (a long run, issue #373): each mark also holds the table as data
  // (lib/table.mjs) and the cards that changed in the step — what the
  // mechanical checks, the beats and the ledger's reading of the helpers need.
  const cardState = new Map();   // card id → its last state, as JSON
  const marks = [];              // one per step: { step, phase, session, stores }
  const messages = [];           // chat order, each with the step and phase it was first seen in
  const known = new Set();
  const sessions = [];           // the session ids seen active, in order

  const phaseOf = (session) => {
    if (session.active) {
      if (session.id && !sessions.includes(session.id)) sessions.push(session.id);
      return `session-${Math.max(1, sessions.indexOf(session.id) + 1)}`;
    }
    return sessions.length ? `after-session-${sessions.length}` : "before";
  };

  return {
    marks, messages,

    async observe(step, extra = {}) {
      const world = await readWorld(gm, facts, notMemory);
      const phase = phaseOf(world.session);
      for (const m of world.messages) {
        if (known.has(m.id)) continue;
        known.add(m.id);
        // A player's line is what they typed: a card their client posted
        // (Begin a Session's, a move's) carries the module's flags.
        messages.push({ ...m, step, phase, fromPlayer: m.authorId === playerId && !m.card.length });
      }
      const mark = { step, phase, session: world.session, stores: world.stores, gmWindows: world.gmWindows, ...extra };
      if (detail) {
        mark.table = await readTable(gm);
        mark.helpers = mark.table.helpers;
        mark.cards = (await readCards(gm)).filter((card) => {
          const json = JSON.stringify(card);
          if (cardState.get(card.id) === json) return false;
          cardState.set(card.id, json);
          return true;
        });
      }
      marks.push(mark);
      return mark;
    },
  };
}

// ── the memory charter's score (pure) ────────────────────────────────────────

/**
 * @param {object} o
 * @param {Array<{ id: string, statement: string, variants: string[], required?: boolean }>} o.facts
 * @param {string[]} [o.askCues] — words one of which marks a line as the question about the fact
 * @param {Array} o.marks — createObserver().marks
 * @param {Array} o.messages — createObserver().messages
 * @param {Array<{ step: string, kind: string, system: string, user: string }>} o.requests — the module's calls
 * @returns {{ status: "achieved"|"not-achieved"|"not-exercised", reason: string, failingLayer: string|null,
 *   milestones: object, asks: object[], facts: object[] }}
 */
export function scoreMemory({ facts, askCues = [], marks, messages, requests }) {
  const required = facts.filter(f => f.required !== false);
  const inPhase = (phase) => messages.filter(m => m.phase === phase);
  const stated = Object.fromEntries(facts.map(f => [f.id, inPhase("session-1").find(m => m.fromPlayer && factIn(m.text, f)) ?? null]));
  const firstStated = required.map(f => stated[f.id]).filter(Boolean).map(m => messages.indexOf(m)).sort((a, b) => a - b)[0] ?? -1;
  const statedMark = firstStated >= 0 ? marks.find(k => k.step === messages[firstStated].step) : null;
  const laterInSession1 = statedMark ? marks.slice(marks.indexOf(statedMark) + 1).filter(k => k.phase === "session-1") : [];

  const milestones = {
    sessionBegun:      marks.some(k => k.phase === "session-1"),
    factEstablished:   required.every(f => stated[f.id]),
    narratedAfter:     firstStated >= 0 && messages.slice(firstStated + 1).some(m => m.phase === "session-1" && m.narrator && !m.vignette),
    sceneChanged:      !!statedMark && laterInSession1.some(k => k.session.sceneId !== statedMark.session.sceneId || k.session.locationId !== statedMark.session.locationId),
    sessionEnded:      marks.some(k => k.phase === "after-session-1"),
    sessionBegunAgain: marks.some(k => k.phase === "session-2"),
    askedLater:        false,
  };

  // The questions: the player's lines of the second session, up to the first
  // one that names a fact itself — from there the fact is on the table again,
  // and finding it in a prompt or an answer shows nothing about memory.
  const later = inPhase("session-2").filter(m => m.fromPlayer && !m.text.startsWith("!"));
  const leak = later.findIndex(m => required.some(f => factIn(m.text, f)));
  const clean = leak < 0 ? later : later.slice(0, leak);
  const cued = (m) => !askCues.length || askCues.some(c => new RegExp(variantPattern(c), "i").test(m.text));
  const asks = clean.filter(cued).map((ask) => {
    const at = messages.indexOf(ask);
    const until = messages.findIndex((m, i) => i > at && m.fromPlayer);
    const answers = messages.slice(at + 1, until < 0 ? undefined : until).filter(m => m.narrator && !m.vignette);
    const prompts = requests.filter(r => r.step === ask.step && NARRATION_KIND.test(r.kind));
    const before = marks[marks.findIndex(k => k.step === ask.step) - 1] ?? null;
    const perFact = facts.map((f) => {
      const found = before?.stores?.[f.id] ?? [];
      const stores = found.filter(s => s.memory !== false);
      const sections = [...new Set(prompts.flatMap(r => sectionsHolding(`${r.system}\n${r.user}`, f)))];
      const answer = answers.find(a => factIn(a.text, f)) ?? null;
      const layer = answer ? null : sections.length ? "generation" : stores.length ? "retrieval" : "storage";
      return {
        id: f.id, required: f.required !== false,
        stored: stores.length > 0, stores, keptElsewhere: found.filter(s => s.memory === false).map(s => s.store),
        inPrompt: sections.length > 0, promptSections: sections,
        inAnswer: !!answer, answerExcerpt: answer ? excerptOf(answer.text, f) : null,
        failingLayer: layer,
      };
    });
    return { step: ask.step, line: ask.text, answered: answers.length > 0, narrationCalls: prompts.length, facts: perFact };
  });
  milestones.askedLater = asks.length > 0;

  const order = ["sessionBegun", "factEstablished", "narratedAfter", "sessionEnded", "sessionBegunAgain", "askedLater"];
  const missing = order.find(k => !milestones[k]);
  const why = {
    sessionBegun:      "the player never began a session",
    factEstablished:   "the player never established the fact in the first session",
    narratedAfter:     "nothing was narrated after the fact was established",
    sessionEnded:      "the first session was never ended",
    sessionBegunAgain: "a second session was never begun",
    askedLater:        leak >= 0 && !clean.filter(cued).length
      ? "in the second session the player named the fact itself before asking about it"
      : "the player never asked about the fact in the second session",
  };
  const base = { milestones, asks, facts: facts.map(f => ({ id: f.id, statement: f.statement, required: f.required !== false, establishedIn: stated[f.id]?.step ?? null })) };
  if (missing) return { status: "not-exercised", reason: why[missing], failingLayer: null, ...base };

  const req = (ask) => ask.facts.filter(f => f.required);
  if (asks.some(a => req(a).every(f => f.inAnswer))) {
    return { status: "achieved", reason: "the narrator's answer in the second session holds what was established in the first", failingLayer: null, ...base };
  }
  // The question that got furthest: its weakest required fact names the layer.
  const depth = (ask) => Math.min(...req(ask).map(f => (f.failingLayer ? LAYERS.indexOf(f.failingLayer) : LAYERS.length)));
  const best = asks.reduce((a, b) => (depth(b) > depth(a) ? b : a));
  const failingLayer = LAYERS[depth(best)];
  const reasons = {
    storage:    "when the player asked, the fact was in no store a narration is built from",
    retrieval:  "the fact was stored, and no prompt for the player's question carried it",
    generation: "the fact reached the narrator's prompt, and the answer did not hold it",
  };
  return { status: "not-achieved", reason: reasons[failingLayer], failingLayer, ...base };
}

// ── health and the run's class (pure) ────────────────────────────────────────

/** "Mira Kestrel: face_danger ×2; Ren: compel" — the costs left owed, by character and move. */
export function costsOwedText(owed) {
  const by = new Map();
  for (const o of owed ?? []) {
    const key = `${o.actor ?? "someone"}: ${o.move ?? "a move"}`;
    by.set(key, (by.get(key) ?? 0) + 1);
  }
  return [...by].map(([key, n]) => (n > 1 ? `${key} ×${n}` : key)).join("; ");
}

/**
 * What must hold whatever the charter: the move lock free at the end, no
 * error of the module's on any page, no step that never settled.
 *
 * A step that did not settle because the GM's screen was showing a window
 * nobody answered is not one of them. The module asks the GM things before a
 * move rolls, and holds the move while it waits — by design; a table whose
 * GM is an autopilot that does not know the question is a limit of the run
 * (`waitingOnGm`), and the lock it holds is the question's.
 *
 * Nor is a cost card left unanswered (`costsOwed`): the card waits on the
 * player and the module holds nothing for it. It is the player's omission,
 * and it means the run's mechanics are not what the rules give — reported,
 * and the run is not a clean pass (classifyRun).
 */
export function healthOf({ endSession, clients, stalls = [], knownErrors = [], refused = [] }) {
  const errors = [];
  // A known error that names its `asker` is known only where a refused
  // write with that message was asked for by code under that path, with no
  // frame of the module's on the way: "lacks permission to create Item" from
  // the game system's own hook is known, the same words from a call of the
  // module's are not.
  const askedBy = (k, text) => !k.asker || refused.some(r => r.message && text.includes(r.message)
    && String(r.stack ?? "").split("\n")[0].includes(k.asker) && !String(r.stack ?? "").includes(`/modules/${MODULE_ID}/`));
  for (const c of clients) {
    for (const text of c.errors ?? []) {
      const own = text.includes(MODULE_ID) || text.startsWith("pageerror:");
      const known = knownErrors.find(k => text.includes(k.match) && askedBy(k, text)) ?? null;
      errors.push({ client: c.label, text: text.slice(0, 400), module: own, known: known?.id ?? null });
    }
  }
  const failures = [];
  const waitingOnGm = [...new Set(stalls.flatMap(s => s.waitingOnGm ?? []))];
  if (endSession?.pendingMove && !waitingOnGm.length) failures.push("the move lock was still held when the run ended (campaignState.pendingMove)");
  const fresh = errors.filter(e => e.module && !e.known);
  if (fresh.length) failures.push(`${fresh.length} error(s) of the module's on a page — the first: ${fresh[0].text.slice(0, 160)}`);
  for (const s of stalls) if (!s.waitingOnGm?.length) failures.push(`step ${s.step} never settled: ${s.detail}`);
  const costsOwed = Array.isArray(endSession?.owed) ? endSession.owed : [];
  return { failures, waitingOnGm, costsOwed, errors, knownFailures: [...new Set(errors.filter(e => e.known).map(e => e.known))] };
}

/**
 * The run's class (issue #302 §7). A deterministic failure outranks an
 * opinion; a goal that was never put to the test is not a pass.
 *
 * A memory goal that was not achieved is a *suspected* issue at every layer,
 * with the layer named. Storage and the answer are a model's output (the
 * narrator's fact block, the Chronicle's scribe, the prose). Retrieval is
 * code, but which stored facts a prompt owes is a design rule this observer
 * does not know — a Chronicle entry reaches every narration only when pinned
 * — so a stored fact that was not sent is evidence for a person to read, not
 * a verdict. `product-failure` is kept for what holds whatever the charter:
 * healthOf's checks.
 */
export function classifyRun({ infrastructure = null, budgetStop = null, outcome, health }) {
  if (infrastructure) return { classification: "infrastructure-error", because: infrastructure };
  if (health?.failures?.length) return { classification: "product-failure", because: health.failures[0] };
  if (outcome.status === "not-exercised" && health?.waitingOnGm?.length) {
    return { classification: "not-exercised", because: `the GM's screen was waiting on ${health.waitingOnGm.map(t => `"${t}"`).join(", ")}, which the run's GM autopilot does not answer — ${outcome.reason}` };
  }
  if (outcome.status === "not-exercised") {
    return budgetStop
      ? { classification: "budget-exhausted", because: `${budgetStop.cap} cap reached (${budgetStop.detail}) before the goal was put to the test — ${outcome.reason}` }
      : { classification: "not-exercised", because: outcome.reason };
  }
  if (outcome.status === "not-achieved") {
    return { classification: "suspected-quality-issue", because: `${outcome.failingLayer}: ${outcome.reason}` };
  }
  // The goal was met, on a table that owes: a cost card the player never
  // answered. Not the module's failure and not a clean pass — for a person.
  if (health?.costsOwed?.length) {
    const n = health.costsOwed.length;
    return { classification: "suspected-quality-issue", because: `the goal was achieved, but ${n} cost card${n === 1 ? " was" : "s were"} left unanswered — ${n === 1 ? "that cost was" : "those costs were"} never paid (${costsOwedText(health.costsOwed)})` };
  }
  return { classification: "pass", because: outcome.reason };
}
