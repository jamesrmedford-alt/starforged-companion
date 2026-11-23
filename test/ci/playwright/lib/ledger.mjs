// The fact ledger of a long exploration run (issue #373; #302 slice E part 1).
//
// The memory charter asks about one possession once. A long run plants
// several facts of different kinds — a possession, a name and its pronouns, an
// item handed over, a promise, where the ship is, a correction, a rename, a
// hidden plan — and asks about each more than once, further and further from
// where it was planted. This file scores them. Like the observer it is
// arithmetic over what was read: no model is asked.
//
// A fact has
//   variants  — the words a right answer holds (any one of them);
//   anchor    — optional: words one of which must stand in the same sentence
//               for a *stored* or *prompt* hit, where the variant alone is in
//               every prompt (an NPC's name: "Tamsin" is everywhere once she
//               has a card; "Tamsin" beside "manifest" is the fact);
//   refusals  — what contradicts it: `near` words that refuse when they stand
//               in a sentence that also holds the fact (or its `subject`
//               words), and `anywhere` phrases that refuse wherever they
//               occur (the old value of a corrected fact, an old name);
//   probes    — the questions asked about it, in the player's words as the
//               charter gives them, never naming the fact.
//
// A probe is scored at the memory charter's three layers — stored, in the
// prompt, in the answer — and fails outright when the answer holds a refusal.
//
// Two things the first reviewed run taught (issue #374) are counted here:
//   - what the helpers wrote is read too: every session summary, Chronicle
//     entry and campaign recap is held against the ledger, and a refusal
//     there fails the fact at the stored layer whatever the narrator answers;
//   - a scene that restates a fact before it is asked about is recorded as
//     such — its own prompt is scored — and a probe asked after it is not
//     counted as recall: the fact was on the table again.
//
// A refusal is a contradiction somebody thought of. It is a presence test,
// like the rest: "you never sold the compass" holds "sold" beside "compass".
// Every refusal is reported with its sentence, to be read.

import { variantPattern, factIn, excerptOf, sectionsHolding, LAYERS } from "./observer.mjs";

/** The module calls that narrate in answer to a player's line. */
const NARRATION_KIND = /^callNarratorAPI>narrate(?!SessionVignette)/;
/** Any narrator call — a scene's own prompt, a vignette's included. */
const NARRATOR_KIND = /^callNarratorAPI>/;

const STOPWORDS = new Set(("a an and are as at be been but by for from had has have he her hers him his i if in into is it its me my "
  + "no not of on or our she so than that the their them then there these they this to up us was we were what when where which who "
  + "whom whose why will with would you your yours about after again all also am any because before being between both can could did do "
  + "does doing down during each few further here how just more most much now off once only other out over own same should some such "
  + "still through too under until very while across around back away one two three").split(/\s+/));

/** Sentences of a text, each trimmed. */
export function sentencesOf(text) {
  return String(text ?? "").split(/(?<=[.!?…]["'”’)]*)\s+|\n+/).map(s => s.trim()).filter(Boolean);
}

/** The content words of a text: four letters or more, lower case, no stop words. */
export function contentWords(text) {
  return (String(text ?? "").toLowerCase().match(/[a-z][a-z'’-]{3,}/g) ?? [])
    .map(w => w.replace(/['’]s$/, "").replace(/^['’-]+|['’-]+$/g, ""))
    .filter(w => w.length >= 4 && !STOPWORDS.has(w));
}

const holdsAny = (text, words) => (words ?? []).some(w => new RegExp(variantPattern(w), "i").test(String(text ?? "")));

/**
 * Whether a text holds the fact where the fact needs its anchor: a sentence
 * with one of its variants and one of its anchor words. A fact with no anchor
 * is held as the observer holds one (`factIn`).
 */
export function factHeld(text, fact) {
  if (!fact.anchor?.length) return factIn(text, fact);
  return sentencesOf(text).some(s => factIn(s, fact) && holdsAny(s, fact.anchor));
}

/** The text around the fact as `factHeld` found it, or null. */
export function heldExcerpt(text, fact, width = 90) {
  if (!fact.anchor?.length) return excerptOf(text, fact, width);
  const hit = sentencesOf(text).find(s => factIn(s, fact) && holdsAny(s, fact.anchor));
  return hit ? hit.slice(0, width * 3) : null;
}

/** What a prompt says of a value it lists as corrected, retracted or struck. */
const CORRECTION_MARK = /\b(corrected|retracted|struck|did not happen|no longer (?:true|holds|stands))\b/i;

/**
 * Whether a prompt that holds `word` says it was corrected: the word stands
 * in a block (lines with no blank line between them) that says so, or under
 * a `##` heading that does. Pure.
 *
 * @param {string} prompt
 * @param {string} word
 * @returns {boolean}
 */
export function markedCorrected(prompt, word) {
  const text = String(prompt ?? "");
  if (!holdsAny(text, [word])) return false;
  if (sectionsHolding(text, { variants: [word] }).some(h => CORRECTION_MARK.test(h))) return true;
  return text.split(/\n\s*\n/).some(block => holdsAny(block, [word]) && CORRECTION_MARK.test(block));
}

/**
 * The refusals of a fact found in a text: each `{ refusal, sentence }`.
 * `near` words refuse in a sentence that also holds one of the refusal's
 * `subject` words (the fact's own variants when it names none); `anywhere`
 * phrases refuse wherever they stand.
 */
export function refusalsIn(text, fact) {
  const out = [];
  const sentences = sentencesOf(text);
  for (const r of fact.refusals ?? []) {
    const subject = r.subject?.length ? r.subject : fact.variants;
    for (const s of sentences) {
      const near = (r.near ?? []).find(w => holdsAny(s, [w]) && holdsAny(s, subject));
      const anywhere = (r.anywhere ?? []).find(w => holdsAny(s, [w]));
      const word = near ?? anywhere;
      if (word) out.push({ refusal: r.id ?? r.note ?? word, word, sentence: s.slice(0, 300) });
    }
  }
  return out;
}

/** The number in a step id ("a12" → 12); NaN for a step that is no player action. */
export const actionNumber = (step) => Number(/^a(\d+)$/.exec(String(step ?? ""))?.[1] ?? NaN);

/** How far a probe is from where its fact was planted, as the issue names the distances. */
export function distanceBand(actions) {
  if (!Number.isFinite(actions)) return null;
  return actions <= 15 ? "near" : actions <= 45 ? "mid" : "far";
}

/** How much of `wanted`'s content words `line` holds (0–1). */
export function containment(wanted, line) {
  const want = [...new Set(contentWords(wanted))];
  if (!want.length) return 0;
  const have = new Set(contentWords(line));
  return want.filter(w => have.has(w)).length / want.length;
}

/** A player's line is this probe when it holds most of the probe's own words. */
export const PROBE_FLOOR = 0.6;
export const isProbeLine = (line, probe) => containment(probe.ask, line) >= PROBE_FLOOR
  || (probe.cues?.length > 0 && probe.cues.every(c => holdsAny(line, [c])));

/**
 * The helpers' writing, as the run's marks hold it: every distinct text a
 * helper wrote, with the step it was first seen at. A mark's `helpers` is
 * `{ summaries: [{ session, text }], chronicle: [{ id, text, … }], recap:
 * string, sessionLog: [{ name, text }] }` (lib/table.mjs).
 */
export function helperWritings(marks) {
  const seen = new Set();
  const out = [];
  const note = (kind, key, text, step, extra = {}) => {
    const t = String(text ?? "").trim();
    if (!t || seen.has(`${kind}|${key}|${t}`)) return;
    seen.add(`${kind}|${key}|${t}`);
    out.push({ kind, key, step, text: t, ...extra });
  };
  for (const mark of marks ?? []) {
    const h = mark.helpers ?? {};
    for (const s of h.summaries ?? []) note("summary", `session ${s.session ?? "?"}`, s.text, mark.step, { session: s.session ?? null });
    for (const c of h.chronicle ?? []) note("chronicle", c.id ?? c.text, c.text, mark.step, { salience: c.salience ?? null, type: c.type ?? null });
    if (h.recap) note("recap", "campaign recap", h.recap, mark.step);
    for (const p of h.sessionLog ?? []) note("sessionLog", p.name ?? "page", p.text, mark.step);
  }
  return out;
}

/**
 * Score the ledger. Pure.
 *
 * @param {object} o
 * @param {Array} o.facts — the charter's facts (see the head of this file)
 * @param {Array} o.marks — the observer's marks: `{ step, phase, stores, helpers }`
 * @param {Array} o.messages — the observer's messages, in chat order
 * @param {Array} o.requests — the module's calls: `{ step, kind, system, user }`
 * @param {Record<string, string>} [o.planted] — fact id → the step a world-planted fact became true at
 *   (a ship's arrival, a correction, a rename): the runner supplies it
 * @param {Record<string, string[]>} [o.probeSteps] — a probe set → the steps of the beat that asked it: a
 *   probe is then looked for among those steps' lines only (a line of play elsewhere may hold a short
 *   question's words by accident)
 * @returns {{ facts: object[], totals: object }}
 */
export function scoreLedger({ facts, marks, messages, requests, planted = {}, probeSteps = null }) {
  const order = new Map(messages.map((m, i) => [m, i]));
  const markAt = (step) => marks.findIndex(k => k.step === step);
  const helpers = helperWritings(marks);
  const lines = messages.filter(m => m.fromPlayer && !m.text.startsWith("!"));
  const narrations = messages.filter(m => m.narrator);

  const scored = facts.map((fact) => {
    // Where it was planted: the player's first line holding it, or the step
    // the runner names for a fact the world makes true.
    const stated = fact.from === "world" ? null : lines.find(m => factIn(m.text, fact) && (!fact.anchor?.length || factHeld(m.text, fact))) ?? null;
    const plantStep = planted[fact.id] ?? stated?.step ?? null;
    const plantIndex = stated ? order.get(stated) : (plantStep ? messages.findIndex(m => m.step === plantStep) : -1);
    const plantMark = plantStep ? markAt(plantStep) : -1;
    const after = (m) => plantIndex >= 0 && order.get(m) > plantIndex;
    const stepAfter = (step) => plantMark >= 0 && markAt(step) >= plantMark;
    const base = { id: fact.id, kind: fact.kind ?? null, statement: fact.statement, plantedAt: plantStep, plantedIn: stated?.phase ?? marks[plantMark]?.phase ?? null };

    // What contradicts it, anywhere after it was planted: the narrator's
    // prose, and what the helpers wrote.
    const narrated = plantStep ? narrations.filter(after).flatMap(m => refusalsIn(m.text, fact).map(r => ({ ...r, step: m.step, where: m.vignette ? `narration (${m.vignette})` : "narration" }))) : [];
    const written = plantStep ? helpers.filter(h => stepAfter(h.step)).flatMap(h => refusalsIn(h.text, fact).map(r => ({ ...r, step: h.step, where: `${h.kind} (${h.key})` }))) : [];
    // A corrected fact's old value in a later prompt. The module names a
    // corrected value to the narrator so that it is not asserted again
    // ("CORRECTED (retracted by the table — do NOT re-assert these…)"), and a
    // summary is written from the session as it was played, the retracted
    // lines listed as such — so the old value in a prompt is not by itself a
    // contradiction. A prompt that carries it and says nowhere that it was
    // corrected is: the narrator is handed the old value as if it stood.
    // Every prompt that carries it is listed (`carried`), marked or not.
    const carried = plantStep ? (fact.refusals ?? []).filter(r => r.prompts && r.anywhere?.length).flatMap(r => requests
      .filter(q => NARRATOR_KIND.test(q.kind) && q.step !== plantStep && stepAfter(q.step))
      .flatMap((q) => {
        const prompt = `${q.system}\n${q.user}`;
        const hit = r.anywhere.find(w => holdsAny(prompt, [w]));
        if (!hit) return [];
        const sections = sectionsHolding(prompt, { variants: [hit] });
        return [{ refusal: r.id ?? hit, word: hit, step: q.step, kind: q.kind, sections, marked: markedCorrected(prompt, hit) }];
      })) : [];
    const sent = carried.filter(c => !c.marked).map(c => ({
      refusal: c.refusal, word: c.word, step: c.step, where: `the prompt of ${c.kind}`,
      sentence: `in ${c.sections.join(", ") || "the prompt"} — and nothing in the prompt says it was corrected`,
    }));
    // What the helpers kept of it.
    const kept = plantStep ? helpers.filter(h => stepAfter(h.step)).map(h => ({ kind: h.kind, key: h.key, step: h.step, holds: factHeld(h.text, fact), excerpt: heldExcerpt(h.text, fact) })) : [];

    // The scenes that restated it unasked: a narration in a later phase that
    // holds it when no player line of that phase had named it yet.
    const restatements = [];
    const probes = (fact.probes ?? []).map((probe) => {
      const asking = probeSteps?.[probe.set] ? new Set(probeSteps[probe.set]) : null;
      const line = lines.find(m => (!asking || asking.has(m.step)) && isProbeLine(m.text, probe) && (plantIndex < 0 || order.get(m) > plantIndex)) ?? null;
      if (!line) return { id: probe.id, set: probe.set ?? null, ask: probe.ask, asked: false, counted: false };
      const at = order.get(line);
      const next = messages.findIndex((m, i) => i > at && m.fromPlayer);
      const answers = messages.slice(at + 1, next < 0 ? undefined : next).filter(m => m.narrator && !m.vignette);
      const named = factIn(line.text, fact) && !fact.anchor?.length;
      // Was the fact on the table again before the question — in this phase,
      // by the narrator or by the player?
      const phaseStart = messages.findIndex(m => m.phase === line.phase);
      const before = messages.slice(Math.max(0, phaseStart), at).filter(m => plantIndex < 0 || order.get(m) > plantIndex);
      const primer = line.phase === base.plantedIn ? null : before.find(m => (m.narrator || m.fromPlayer) && factHeld(m.text, fact)) ?? null;
      const prompts = requests.filter(r => r.step === line.step && NARRATION_KIND.test(r.kind));
      const priorMark = marks[markAt(line.step) - 1] ?? null;
      const found = priorMark?.stores?.[fact.id] ?? [];
      const stores = found.filter(s => s.memory !== false && (!fact.anchor?.length || holdsAny(s.excerpt, fact.anchor)));
      const sections = [...new Set(prompts.flatMap(r => (fact.anchor?.length
        ? (factHeld(`${r.system}\n${r.user}`, fact) ? sectionsHolding(`${r.system}\n${r.user}`, fact) : [])
        : sectionsHolding(`${r.system}\n${r.user}`, fact))))];
      const answer = answers.find(a => factIn(a.text, fact)) ?? null;
      const refused = answers.flatMap(a => refusalsIn(a.text, fact));
      const layer = answer ? null : sections.length ? "generation" : stores.length ? "retrieval" : "storage";
      const distance = actionNumber(line.step) - actionNumber(plantStep);
      return {
        id: probe.id, set: probe.set ?? null, ask: probe.ask, asked: true, step: line.step, phase: line.phase, line: line.text,
        distance: Number.isFinite(distance) ? distance : null, band: distanceBand(distance),
        answered: answers.length > 0,
        stored: stores.length > 0, stores: stores.map(s => s.store),
        inPrompt: sections.length > 0, promptSections: sections,
        inAnswer: !!answer, answerExcerpt: answer ? excerptOf(answer.text, fact) : (answers[0]?.text.slice(0, 200) ?? null),
        refused: refused.length > 0, refusals: refused,
        named, primedBy: primer ? { step: primer.step, by: primer.fromPlayer ? "the player" : primer.vignette ? `the ${primer.vignette} scene` : "a narration" } : null,
        // Recall is a question the fact was not on the table for.
        counted: !named && !primer,
        failingLayer: layer,
      };
    });

    // A later phase's narration that holds the fact before anyone asked: the
    // carry, seen without a question. Its own prompt is scored.
    if (plantStep) {
      const phases = [...new Set(messages.map(m => m.phase))];
      for (const phase of phases) {
        if (phase === base.plantedIn) continue;
        const inPhase = messages.filter(m => m.phase === phase && after(m));
        const first = inPhase.find(m => (m.narrator || m.fromPlayer) && factHeld(m.text, fact));
        if (!first || first.fromPlayer) continue;
        const asked = probes.find(p => p.asked && p.phase === phase && order.get(lines.find(l => l.step === p.step && l.text === p.line)) < order.get(first));
        if (asked) continue;
        const own = requests.filter(r => r.step === first.step && NARRATOR_KIND.test(r.kind));
        const sections = [...new Set(own.flatMap(r => (factHeld(`${r.system}\n${r.user}`, fact) ? sectionsHolding(`${r.system}\n${r.user}`, fact) : [])))];
        restatements.push({ step: first.step, phase, scene: first.vignette ?? "narration", inItsPrompt: sections.length > 0, promptSections: sections, excerpt: heldExcerpt(first.text, fact) });
      }
    }

    const asked = probes.filter(p => p.asked);
    const counted = asked.filter(p => p.counted);
    // Recall is earned only by a counted question; it is lost by any that
    // was answered without the fact (a line nothing answered is no answer).
    const missed = asked.filter(p => p.answered && !p.inAnswer);
    const refusedAnywhere = [...narrated, ...written, ...sent, ...asked.flatMap(p => p.refusals.map(r => ({ ...r, step: p.step, where: `the answer to probe ${p.id}` })))];
    const seenRefusals = new Set();
    const refusals = refusedAnywhere.filter(r => { const k = `${r.step}|${r.sentence}`; if (seenRefusals.has(k)) return false; seenRefusals.add(k); return true; });

    let verdict;
    let failingLayer = null;
    if (!plantStep) verdict = "not-planted";
    else if (refusals.length) {
      verdict = "refused";
      // Where it went wrong: in what a helper stored, in what a prompt was sent, or in what was said.
      failingLayer = written.length ? "storage" : sent.length && !narrated.length ? "retrieval" : "generation";
    } else if (missed.length) {
      // A question that was answered without the fact loses it, at whatever
      // distance — and the more so where the fact had just been restated. An
      // answer at one distance does not make up for a miss at another: one
      // sample each, and the miss is the one to read.
      verdict = "lost";
      const depth = (p) => (p.failingLayer ? LAYERS.indexOf(p.failingLayer) : LAYERS.length);
      failingLayer = LAYERS[Math.min(...missed.map(depth))] ?? null;
    } else if (counted.some(p => p.inAnswer)) verdict = "recalled";
    else if (restatements.length) verdict = "carried-unasked";
    else if (asked.length) verdict = "asked-after-restated";
    else verdict = "not-probed";

    return { ...base, verdict, failingLayer, lostAt: verdict === "lost" ? missed.map(p => p.id) : [], probes, restatements, helpers: kept, refusals, carried };
  });

  const count = (v) => scored.filter(f => f.verdict === v).length;
  const probes = scored.flatMap(f => f.probes);
  return {
    facts: scored,
    totals: {
      facts: scored.length,
      recalled: count("recalled"), carriedUnasked: count("carried-unasked"), lost: count("lost"), refused: count("refused"),
      notProbed: count("not-probed") + count("asked-after-restated"), notPlanted: count("not-planted"),
      probesAsked: probes.filter(p => p.asked).length, probesCounted: probes.filter(p => p.counted).length,
      probesRecalled: probes.filter(p => p.counted && p.inAnswer).length,
      bands: Object.fromEntries(["near", "mid", "far"].map(b => [b, probes.filter(p => p.counted && p.band === b).length])),
      refusals: scored.reduce((n, f) => n + f.refusals.length, 0),
    },
  };
}

// ── baits ────────────────────────────────────────────────────────────────────

/**
 * The contradiction baits: lines that assert something false ("didn't I leave
 * the compass with her?"). The narrator should not agree. A bait is taken
 * when its answer holds one of the bait's `agrees` phrases and none of its
 * `corrects` phrases — and is scored `corrected` when it holds a `corrects`
 * phrase. Anything else is `unclear`: to be read.
 */
export function scoreBaits({ baits = [], messages }) {
  const lines = messages.filter(m => m.fromPlayer && !m.text.startsWith("!"));
  return baits.map((bait) => {
    const line = lines.find(m => isProbeLine(m.text, bait)) ?? null;
    if (!line) return { id: bait.id, ask: bait.ask, asked: false, result: "not-asked" };
    const at = messages.indexOf(line);
    const next = messages.findIndex((m, i) => i > at && m.fromPlayer);
    const answer = messages.slice(at + 1, next < 0 ? undefined : next).filter(m => m.narrator && !m.vignette).map(m => m.text).join(" ");
    const agrees = holdsAny(answer, bait.agrees ?? []);
    const corrects = holdsAny(answer, bait.corrects ?? []);
    return {
      id: bait.id, ask: bait.ask, asked: true, step: line.step, line: line.text, answer: answer.slice(0, 400),
      result: !answer ? "unanswered" : corrects ? "corrected" : agrees ? "taken" : "unclear",
    };
  });
}

// ── the hidden plan (F8) ─────────────────────────────────────────────────────

/**
 * Leaks of a hidden plan: a narration that states a plan's truth before the
 * plan was revealed. The truth is the narrator's own text, read from the
 * GM-only Secrets journal by the observer, so it is compared by content: a
 * narration states it when it holds most of the truth's distinctive words
 * (those the plan's own subject line and the world's seed do not already
 * supply). Suspected, always: a narration may circle a truth without stating
 * it, and the excerpt is there to be read.
 *
 * @param {object} o
 * @param {Array<{ id: string, subject?: string, truth: string, firstSeen: string, revealedAt?: string|null }>} o.plans
 * @param {Array} o.messages
 * @param {string[]} [o.common] — words every narration may hold (names from the seed and the cast)
 * @param {number} [o.floor] — the share of the truth's distinctive words that counts as stating it
 */
export function scoreLeaks({ plans = [], messages, common = [], floor = 0.6 }) {
  const usual = new Set(common.flatMap(contentWords));
  const index = new Map(messages.map((m, i) => [m, i]));
  const firstAt = (step) => messages.findIndex(m => m.step === step);
  return plans.map((plan) => {
    const words = [...new Set(contentWords(plan.truth))].filter(w => !usual.has(w) && !contentWords(plan.subject ?? "").includes(w));
    const base = { id: plan.id, subject: plan.subject ?? null, truth: plan.truth, firstSeen: plan.firstSeen, revealedAt: plan.revealedAt ?? null, distinctiveWords: words.length };
    if (words.length < 3) return { ...base, leaks: [], note: "too few distinctive words in its truth to compare" };
    const from = firstAt(plan.firstSeen);
    const until = plan.revealedAt ? firstAt(plan.revealedAt) : Infinity;
    const leaks = [];
    for (const m of messages) {
      if (!m.narrator) continue;
      const i = index.get(m);
      // The narration that made the plan is at `firstSeen`: it may hint, and
      // is compared like the rest. One at or after the reveal is no leak.
      if (i < from || i >= until) continue;
      const have = new Set(contentWords(m.text));
      const shared = words.filter(w => have.has(w));
      if (shared.length >= 3 && shared.length / words.length >= floor) {
        leaks.push({ step: m.step, share: Number((shared.length / words.length).toFixed(2)), shared, excerpt: m.text.slice(0, 300) });
      }
    }
    return { ...base, leaks };
  });
}
