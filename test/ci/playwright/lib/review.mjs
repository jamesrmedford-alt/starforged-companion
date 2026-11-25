// What a run has to have counted before it can be reviewed (issue #373 slice
// 5; issue #374 A7).
//
// Every live run ends with a review by the agent that made it: the whole
// transcript annotated, a scorecard, the action items, and what the run cost
// and returned (rules/ci-e2e.md → "AI exploration"). The first review was
// assembled by hand from the run's files and could not say how long a player
// waits, what the cache did for each kind of call, or how alike two opening
// scenes were — the run had not recorded them, or had measured the wrong
// thing (shared five-word runs scored a repeated scene at 1%).
//
// This file is the counting, and the generated layers of the two documents:
// `annotated-transcript.md` with every step's facts filled in and a place for
// the reader's notes, and `scorecard.md` with every row that is arithmetic.
// The judgement — what went right, what went wrong, and why — is left to
// write. Pure: no model, no clock, no file.

import { contentWords, sentencesOf, isProbeLine } from "./ledger.mjs";
import { costOf } from "./budget.mjs";
import { movesNamedIn } from "./moveNames.mjs";

// ── speed ────────────────────────────────────────────────────────────────────

/** The p-th percentile of a list of numbers (nearest rank), or null for none. */
export function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

const spread = (values) => ({
  n: values.filter(Number.isFinite).length,
  p50: percentile(values, 50), p95: percentile(values, 95),
  max: values.filter(Number.isFinite).reduce((a, b) => Math.max(a, b), 0) || null,
});

/**
 * Each call kind's latency, and the time from what a player typed to the
 * first narration that answers it — a line of play and a scene question
 * (`@scene …`) apart. A scene question skips the pacing reader and the move
 * path, so it is answered sooner; counted together, the third live run's
 * sixteen questions (p50 3.6 s) made its fifteen lines of play (p50 6.0 s)
 * look a second and more quicker than a player waited.
 *
 * @param {object} o
 * @param {Array<{ kind: string, ms?: number|null }>} o.requests — the module's calls, each with how long it took
 * @param {Array<{ step: string, action?: object, saidAt?: number|null, repliedAt?: number|null }>} o.actions
 * @returns {{ calls: object, allCalls: object, lineToReply: object, sceneQuestionToReply: object, unanswered: string[] }}
 *   `lineToReply` is lines of play alone
 */
export function speedOf({ requests = [], actions = [] }) {
  const byKind = {};
  for (const r of requests) (byKind[r.kind] ??= []).push(r.ms);
  const typed = actions.filter(a => a.action?.action === "say" && !String(a.action.text ?? "").startsWith("!") && Number.isFinite(a.saidAt));
  const asksScene = (a) => /^@scene\b/i.test(String(a.action.text ?? "").trim());
  const waits = (list) => list.filter(a => Number.isFinite(a.repliedAt)).map(a => a.repliedAt - a.saidAt);
  return {
    calls: Object.fromEntries(Object.entries(byKind).map(([kind, ms]) => [kind, spread(ms)])),
    allCalls: spread(requests.map(r => r.ms)),
    lineToReply: spread(waits(typed.filter(a => !asksScene(a)))),
    sceneQuestionToReply: spread(waits(typed.filter(asksScene))),
    unanswered: typed.filter(a => !Number.isFinite(a.repliedAt)).map(a => a.step),
  };
}

// ── caching and cost, by call kind ───────────────────────────────────────────

const tokens = (u = {}) => ({
  uncached: u.input_tokens ?? 0, read: u.cache_read_input_tokens ?? 0, written: u.cache_creation_input_tokens ?? 0, output: u.output_tokens ?? 0,
});

/**
 * Per call kind: prompt tokens read from cache, written to it and sent
 * uncached; what the calls cost; what the cache saved (what its reads would
 * have cost as plain input, less what they did cost); and the kinds that
 * write a cache nothing ever reads.
 *
 * @param {Array<{ kind: string, model: string, usage?: object|null }>} requests — every call with its usage
 * @param {Record<string, { input: number, output: number, cacheRead?: number }>} prices — dollars per million tokens
 */
export function cachingOf(requests = [], prices = {}) {
  const rows = {};
  for (const r of requests) {
    if (!r.usage) continue;
    const t = tokens(r.usage);
    const price = prices[r.model] ?? null;
    const row = (rows[r.kind] ??= { kind: r.kind, calls: 0, prompt: 0, read: 0, written: 0, uncached: 0, output: 0, usd: 0, savedUsd: 0, models: [] });
    row.calls += 1;
    row.prompt += t.uncached + t.read + t.written;
    row.read += t.read; row.written += t.written; row.uncached += t.uncached; row.output += t.output;
    if (!row.models.includes(r.model)) row.models.push(r.model);
    if (price) {
      row.usd += costOf(price, r.usage);
      row.savedUsd += t.read * (price.input - (price.cacheRead ?? price.input)) / 1_000_000;
    }
  }
  const list = Object.values(rows).map(r => ({
    ...r, usd: Number(r.usd.toFixed(4)), savedUsd: Number(r.savedUsd.toFixed(4)),
    readShare: r.prompt ? Number((r.read / r.prompt).toFixed(3)) : 0,
  })).sort((a, b) => b.usd - a.usd);
  const sum = (key) => list.reduce((n, r) => n + r[key], 0);
  return {
    byKind: list,
    total: {
      calls: sum("calls"), prompt: sum("prompt"), read: sum("read"), written: sum("written"), uncached: sum("uncached"), output: sum("output"),
      usd: Number(sum("usd").toFixed(4)), savedUsd: Number(sum("savedUsd").toFixed(4)),
      readShare: sum("prompt") ? Number((sum("read") / sum("prompt")).toFixed(3)) : 0,
    },
    // A kind that writes and never reads pays the write's premium for nothing.
    writesNeverRead: list.filter(r => r.written > 0 && r.read === 0).map(r => ({ kind: r.kind, calls: r.calls, written: r.written })),
    uncachedKinds: list.filter(r => r.written === 0 && r.read === 0 && r.prompt > 0).map(r => ({ kind: r.kind, calls: r.calls, prompt: r.prompt })),
  };
}

/** The run's dollars split between the module under test and the test's own models. */
export function costSplit(budgetReport, { actions = 0, lines = 0 } = {}) {
  const by = budgetReport?.byRole ?? {};
  const usd = (role) => by[role]?.usd ?? 0;
  const total = Object.values(by).reduce((n, r) => n + (r.usd ?? 0), 0);
  const share = (n) => (total ? Number((n / total).toFixed(3)) : 0);
  const test = total - usd("module");
  return {
    total: Number(total.toFixed(4)),
    module: { usd: usd("module"), share: share(usd("module")), calls: by.module?.calls ?? 0 },
    player: { usd: usd("player"), share: share(usd("player")), calls: by.player?.calls ?? 0 },
    test: { usd: Number(test.toFixed(4)), share: share(test) },
    perAction: actions ? Number((total / actions).toFixed(4)) : null,
    perLine: lines ? Number((total / lines).toFixed(4)) : null,
  };
}

// ── prompt length against the action number ──────────────────────────────────

/**
 * How the prompts grow as the run goes on: for each call kind, the size of
 * its prompt at each action, and the slope of a line through them (characters
 * per action). A prompt that must not grow — the AI player's — shows here.
 */
export function lengthOf(requests = []) {
  const byKind = {};
  for (const r of requests) {
    const n = Number(/^a(\d+)$/.exec(String(r.step ?? ""))?.[1] ?? NaN);
    if (!Number.isFinite(n)) continue;
    (byKind[r.kind] ??= []).push({ action: n, chars: (r.system?.length ?? 0) + (r.user?.length ?? 0) });
  }
  const slope = (points) => {
    if (points.length < 2) return 0;
    const mx = points.reduce((s, p) => s + p.action, 0) / points.length;
    const my = points.reduce((s, p) => s + p.chars, 0) / points.length;
    const den = points.reduce((s, p) => s + (p.action - mx) ** 2, 0);
    return den ? points.reduce((s, p) => s + (p.action - mx) * (p.chars - my), 0) / den : 0;
  };
  return Object.fromEntries(Object.entries(byKind).map(([kind, points]) => [kind, {
    calls: points.length,
    first: points[0].chars, last: points.at(-1).chars,
    min: Math.min(...points.map(p => p.chars)), max: Math.max(...points.map(p => p.chars)),
    charsPerAction: Number(slope(points).toFixed(1)),
  }]));
}

// ── repetition by content ────────────────────────────────────────────────────

/**
 * Names in a text: capitalised words. One that opens a sentence counts only
 * when it is no common word (contentWords drops those) — "Dree is in the
 * laundry" names Dree; "The galley smells" names nobody.
 */
export function namesIn(text) {
  const out = new Set();
  for (const sentence of sentencesOf(text)) {
    const words = sentence.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i].replace(/^[^A-Za-z]+|[^A-Za-z'’]+$/g, "").replace(/['’]s$/, "");
      if (!/^[A-Z][a-z]{2,}$/.test(w)) continue;
      if (i === 0 && !contentWords(w).length) continue;
      out.add(w);
    }
  }
  return [...out];
}

/**
 * Who a text speaks of by what they are, not by a name: the word after
 * "the" ("the navigator", "the cook") — and, since "the galley" is found the
 * same way, a subject counts as repeated only with what is said of it
 * (contentOverlap). Lower case, four letters or more, no common word.
 */
export function rolesIn(text) {
  const out = new Set();
  for (const m of String(text ?? "").matchAll(/\b[Tt]he\s+([a-z]{4,})\b/g)) {
    if (contentWords(m[1]).length) out.add(m[1]);
  }
  return [...out];
}

/**
 * How alike two scenes are in what they say, not in how they word it.
 *
 *   sharedWords  — content words of the later scene that the earlier one also
 *                  used, over the later scene's content words;
 *   repeatedActs — "who is doing what" said twice: a name both scenes use,
 *                  or somebody both call by their role ("the navigator"),
 *                  with content words in common between the sentences that
 *                  speak of them — two for a name, three for a role, the
 *                  subject's own word not counted.
 *
 * Five-word runs in common scored a repeated opening scene at 1% (issue #374
 * A3): the wording was new, the content was not.
 */
export function contentOverlap(earlier, later) {
  const a = new Set(contentWords(earlier));
  const b = [...new Set(contentWords(later))];
  const shared = b.filter(w => a.has(w));
  const names = namesIn(later);
  const namesNobody = (s) => !names.some(n => new RegExp(`\\b${n}\\b`).test(s));
  const repeatedActs = [];
  const said = (pattern, word, atLeast, who, keep = () => true) => {
    const naming = (text) => sentencesOf(text).filter(s => pattern.test(s) && keep(s));
    const before = naming(earlier);
    if (!before.length) return;
    const beforeWords = new Set(before.flatMap(contentWords).filter(w => w !== word));
    const nowWords = [...new Set(naming(later).flatMap(contentWords))].filter(w => w !== word);
    const common = nowWords.filter(w => beforeWords.has(w));
    // One sentence said twice is one act: a subject that is only a word of
    // an act already counted ("the loader" in the navigator's) is not another.
    if (common.length >= atLeast && !repeatedActs.some(a => a.doing.includes(word))) repeatedActs.push({ who, doing: common.slice(0, 8) });
  };
  for (const name of names) said(new RegExp(`\\b${name}\\b`), name.toLowerCase(), 2, name);
  // A role is a looser handle than a name: one more word in common is asked,
  // and only in sentences that name nobody — what is said of a named person
  // is already counted as theirs.
  for (const role of rolesIn(later)) said(new RegExp(`\\b[Tt]he\\s+${role}\\b`), role, 3, `the ${role}`, namesNobody);
  return {
    words: b.length, shared: shared.length,
    sharedShare: b.length ? Number((shared.length / b.length).toFixed(3)) : 0,
    repeatedActs,
  };
}

/**
 * Repetition between the scenes of one kind — the openings of each session,
 * the closings — each compared with every one before it.
 *
 * @param {Array<{ step: string, phase: string, vignette?: string|null, narrator?: boolean, text: string }>} messages
 */
export function repetitionOf(messages = []) {
  const kinds = {};
  for (const m of messages) if (m.narrator && m.vignette) (kinds[m.vignette] ??= []).push(m);
  const out = {};
  for (const [kind, scenes] of Object.entries(kinds)) {
    const pairs = [];
    for (let j = 1; j < scenes.length; j++) {
      for (let i = 0; i < j; i++) {
        pairs.push({ earlier: scenes[i].step, later: scenes[j].step, ...contentOverlap(scenes[i].text, scenes[j].text) });
      }
    }
    out[kind] = {
      scenes: scenes.map(s => ({ step: s.step, phase: s.phase, words: contentWords(s.text).length })),
      pairs,
      worst: pairs.reduce((w, p) => (!w || p.sharedShare > w.sharedShare ? p : w), null),
    };
  }
  return out;
}

// ── refrains: what a session's narrations keep returning to ──────────────────

/** Words that carry no image: a refrain is counted in the words that do. */
const REFRAIN_STOP = new Set((`the a an and or but of to in on at for with from by as is are was were be been being it its this that these those
you your yours she her hers he his him they them their there here then than so not no nor do does did done have has had having
into onto over under up down out off away back again once more most some any each every all both one two three first last next
when while where what which who whom whose why how if because though although until before after since still just only very too
now never ever always also yet already even much many such own same other another mine ours can could would should
will shall may might must about above below between through across against toward towards behind beside along around near
says said say asks asked ask tells told tell like something nothing anything everything someone anyone`).split(/\s+/));
/** A narration that ends on someone waiting, watching or holding still. */
const REFRAIN_WAITS = new RegExp("\\b(wait(?:s|ed|ing)?|watch(?:es|ed|ing)?|listen(?:s|ed|ing)?|hold(?:s|ing)?\\s+(?:still|steady)|goes? (?:still|quiet)|"
  + "gone (?:still|quiet)|silence|silent|pause[sd]?|does not (?:move|answer|look)|has not (?:moved|looked)|stays? (?:on|where)|"
  + "hang(?:s|ing)?|linger(?:s|ed|ing)?|stops?|stopped|until you|for you to|to see what you)\\b", "i");
/** The share of a session's narrations a word or a phrase must be in to be listed as a refrain. */
export const REFRAIN_SHARE = 1 / 3;
/** Fewer narrations than this are no session to count a refrain in. */
const REFRAIN_MIN_NARRATIONS = 4;

/** What may stand between a preposition and the word it places: "over the hatch", "under her slate". */
const REFRAIN_ARTICLES = new Set(["the", "a", "an", "her", "his", "its", "your", "their", "that", "this"]);
/** A preposition a phrase may open on, with one content word after it. */
const REFRAIN_PREPOSITIONS = new Set(["over", "under", "at", "by", "in", "on", "from", "behind", "beside", "across", "against", "through", "above", "below", "toward", "towards", "into", "onto", "along", "around", "near", "past", "inside", "outside", "beyond"]);
const refrainTokens = (text) => String(text ?? "").toLowerCase().match(/[a-z][a-z'’-]*/g) ?? [];
const carries = (w) => w.length > 3 && !REFRAIN_STOP.has(w);
const longestRun = (hits, n) => { let best = 0, cur = 0; for (let i = 0; i < n; i++) { cur = hits.has(i) ? cur + 1 : 0; best = Math.max(best, cur); } return best; };

/**
 * What a run's narrations keep returning to, session by session (known-issues
 * NARRATOR-REFRAINS). A note under each step cannot see it: in the third
 * live run "hatch" was in 18 of session 3's 23 narrations — the speaker over
 * the hatch, eleven narrations running — and in the second "Tamsin's chair
 * creaks" closed seven of the last thirteen.
 *
 * For each session's narrations of play (the opening and closing scenes apart —
 * `repetitionOf` compares those — and the answers to `@scene` questions apart:
 * an answer is a camera on what the story holds, and the fourth live run's
 * session 3 had "light" in 15 of its 30 narrations — 15 of its 17 narrations
 * of play, and none of its 13 answers):
 *
 *   words    the content words (four letters or more, no common word), by
 *            how many narrations hold each and the longest run of narrations
 *            in a row that do;
 *   phrases  two to four words side by side that end on a content word and
 *            hold two — or begin on a preposition and hold one ("over the
 *            hatch") — counted the same way; a phrase that is in no more
 *            narrations than a longer one holding it is left to the longer;
 *   endings  the narrations whose last two sentences leave someone waiting,
 *            watching or still.
 *
 * `refrains` are the words and phrases in a third or more of the session's
 * narrations of play (REFRAIN_SHARE), and at least three — each with how many
 * of the session's `@scene` answers hold it (`inAnswers`, of `sceneAnswers`:
 * an answer is one by its card, `sceneResponse`, or by the scene question its
 * step put); `worst` is the one in the
 * largest share of a session's, names apart (`name`: a word the session
 * never writes without its capital). A count to start reading from: it finds
 * what is said in the same words, not a device said in new ones each time.
 *
 * @param {Array<{ step: string, phase: string, narrator?: boolean, vignette?: string|null, text: string }>} messages
 * @returns {{ sessions: object[], worst: object|null }}
 */
export function refrainsOf(messages = []) {
  const byPhase = new Map();
  const answersOf = new Map();
  const asked = new Set(messages.filter(m => m.fromPlayer && /^@scene\b/i.test(String(m.text ?? "").trim())).map(m => m.step));
  const isAnswer = (m) => (m.card ?? []).includes("sceneResponse") || asked.has(m.step);
  for (const m of messages) {
    if (!m.narrator || m.vignette || !/^session-/.test(String(m.phase ?? ""))) continue;
    const into = isAnswer(m) ? answersOf : byPhase;
    if (!into.has(m.phase)) into.set(m.phase, []);
    into.get(m.phase).push(m);
    if (!byPhase.has(m.phase)) byPhase.set(m.phase, []);
  }
  const sessions = [];
  for (const [phase, narrations] of byPhase) {
    const answers = answersOf.get(phase) ?? [];
    const n = narrations.length;
    const words = new Map();
    const grams = new Map();
    const hold = (map, key, i) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(i); };
    // A name — a word the session never writes without its capital (Tamsin,
    // Bleakhold) — is counted and said to be one: who a session is about is
    // in most of its narrations, and is no refrain for that.
    const lower = new Set(narrations.flatMap(m => String(m.text ?? "").match(/(?<![A-Za-z'’-])[a-z][a-z'’-]*/g) ?? []).map(t => t.replace(/['’]s$/, "")));
    const isName = (what) => what.split(" ").filter(t => carries(t.replace(/['’]s$/, ""))).every(t => !lower.has(t.replace(/['’]s$/, "")));
    narrations.forEach((m, i) => {
      // A phrase does not run across a sentence's end.
      for (const sentence of sentencesOf(m.text)) {
        const toks = refrainTokens(sentence);
        // A word is counted with its possessive ("Tamsin's" is Tamsin); a phrase is kept as written.
        for (const w of toks.map(t => t.replace(/['’]s$/, ""))) if (carries(w)) hold(words, w, i);
        for (let size = 2; size <= 4; size++) {
          for (let j = 0; j + size <= toks.length; j++) {
            const g = toks.slice(j, j + size);
            if (!carries(g[size - 1])) continue;
            const content = g.filter(carries).length;
            // "galley lamp", "visitor at the hatch" — or "over the hatch": a
            // place said the same way each time.
            const whereItIs = size >= 3 && REFRAIN_PREPOSITIONS.has(g[0]) && g.slice(1, -1).every(w => REFRAIN_ARTICLES.has(w));
            if (!((content >= 2 && carries(g[0])) || (content === 1 && whereItIs))) continue;
            hold(grams, g.join(" "), i);
          }
        }
      }
    });
    // The answers to `@scene` questions, apart: how many of them hold each word or phrase.
    const answerHolds = (what) => answers.filter((m) => sentencesOf(m.text).some((sentence) => {
      const toks = refrainTokens(sentence);
      return what.includes(" ") ? ` ${toks.join(" ")} `.includes(` ${what} `) : toks.some(tk => tk.replace(/['’]s$/, "") === what);
    })).length;
    const floor = Math.max(3, Math.ceil(n * REFRAIN_SHARE - 1e-9));
    const row = (what, hits) => ({
      what, in: hits.size, of: n, share: Number((hits.size / n).toFixed(3)), run: longestRun(hits, n),
      steps: [...new Set([...hits].sort((a, b) => a - b).map(i => narrations[i].step))], ...(isName(what) ? { name: true } : {}),
      ...(answers.length ? { inAnswers: answerHolds(what) } : {}),
    });
    const byCount = (a, b) => b.in - a.in || b.run - a.run || a.what.localeCompare(b.what);
    const wordRows = [...words].filter(([, hits]) => hits.size >= 3).map(([w, hits]) => row(w, hits)).sort(byCount);
    // A phrase a longer one holds, in no more narrations than it: the longer says it.
    const kept = [...grams].filter(([, hits]) => hits.size >= 3);
    const phraseRows = kept
      .filter(([g, hits]) => !kept.some(([longer, more]) => longer !== g && longer.length > g.length && ` ${longer} `.includes(` ${g} `) && more.size >= hits.size))
      .map(([g, hits]) => row(g, hits)).sort(byCount);
    const endings = narrations.map((m) => {
      const plain = String(m.text ?? "").replace(/\*[^*]*\*\s*$/, "").trim();          // an offered move's aside is not the ending
      const sentences = sentencesOf(plain);
      const last = sentences.slice(-2).join(" ");
      return { step: m.step, waiting: REFRAIN_WAITS.test(last), sentence: (sentences.at(-1) ?? "").slice(0, 160) };
    });
    const counted = n >= REFRAIN_MIN_NARRATIONS;
    sessions.push({
      phase, narrations: n, counted, sceneAnswers: answers.length,
      words: wordRows.slice(0, 20), phrases: phraseRows.slice(0, 20),
      refrains: counted ? { words: wordRows.filter(r => r.in >= floor), phrases: phraseRows.filter(r => r.in >= floor) } : { words: [], phrases: [] },
      endings: { waiting: endings.filter(e => e.waiting).length, of: n, steps: endings.filter(e => e.waiting).map(e => ({ step: e.step, sentence: e.sentence })) },
    });
  }
  const worst = sessions.filter(x => x.counted).flatMap(x => [...x.refrains.words, ...x.refrains.phrases].filter(r => !r.name).map(r => ({ phase: x.phase, ...r })))
    .sort((a, b) => b.share - a.share || b.in - a.in)[0] ?? null;
  return { sessions, worst };
}
/** The scorecard's one line of refrainsOf. */
function refrainsResult(r) {
  const counted = r.sessions.filter(x => x.counted);
  if (!counted.length) return "too few narrations in any session to count";
  const own = (x) => [...x.refrains.words, ...x.refrains.phrases].filter(r => !r.name).length;
  const total = counted.reduce((n, x) => n + own(x), 0);
  const waiting = counted.reduce((n, x) => n + x.endings.waiting, 0);
  const w = r.worst;
  const asked = (x) => (x?.sceneAnswers ? ` of play` : "");
  const answers = (x, row) => (x?.sceneAnswers ? `; in ${row.inAnswers ?? 0} of its ${x.sceneAnswers} @scene answers, counted apart` : "");
  const of = counted.reduce((n, x) => n + x.narrations, 0);
  const worstSession = w ? counted.find(x => x.phase === w.phase) : null;
  return `${w ? `"${w.what}" in ${w.in} of ${w.phase}'s ${w.of} narrations${asked(worstSession)} (${w.run} in a row${answers(worstSession, w)})` : "nothing in a third of any session's narrations"}; `
    + `${total} word(s) and phrase(s), names apart, in a third or more of a session's narrations (${counted.map(x => `${x.phase}: ${own(x)}`).join(", ")}); `
    + `${waiting} of ${of} narrations end on someone waiting, watching or still`;
}

// ── session set-pieces: what each was built from (issue #381) ────────────────

/** A session set-piece's kind, by the first line of its user message (as scene-counts.mjs tells them). */
const SET_PIECE_KINDS = [["opening", /^OPENING VIGNETTE\b/], ["closing", /^CLOSING VIGNETTE\b/], ["spotlight", /^SPOTLIGHT VIGNETTE\b/]];

/** A set-piece's kind from its user message, or null for any other call. */
export const setPieceKindOf = (user) => SET_PIECE_KINDS.find(([, re]) => re.test(String(user ?? "").trimStart()))?.[0] ?? null;

/**
 * The MATERIAL block of a set-piece's user message (src/session/sceneSeeds.js
 * formatMaterial): each numbered result with its label, its tables and dice,
 * and the second result under it — "1. What the vignette shows — Spotlight
 * Vignette (37): <result>", "     (if that cannot be true here: <second>)".
 * [] for a message with none. Pure.
 *
 * @param {string} user
 * @returns {Array<{ n: number, label: string, source: string, rolls: string, result: string, second: string|null }>}
 */
export function materialOf(user) {
  const lines = String(user ?? "").split("\n");
  const at = lines.findIndex(l => /^MATERIAL\b/.test(l.trim()));
  if (at < 0) return [];
  const out = [];
  for (const raw of lines.slice(at + 1)) {
    const line = raw.trim();
    if (!line) { if (out.length) break; continue; }
    const m = /^(\d+)\.\s+(.*?)\s+—\s+(.*?)(?:\s+\(([^()]*)\))?:\s+(.+)$/.exec(line);
    if (m) { out.push({ n: Number(m[1]), label: m[2], source: m[3], rolls: m[4] ?? "", result: m[5].trim(), second: null }); continue; }
    const second = /^\(if that cannot be true here:\s*(.*)\)$/.exec(line);
    if (second && out.length) { out.at(-1).second = second[1].trim(); continue; }
    break;
  }
  return out;
}

/** A text as its words, lower case — to find one run of words in another. */
const runOfWords = (text) => (String(text ?? "").replace(/<[^>]*>/g, " ").toLowerCase().replace(/[’‘]/g, "'").match(/[a-z0-9']+/g) ?? []).join(" ");

/** A reply's prose and its fenced JSON fact block, read here and not with the module's parser. Pure. */
function proseAndBlock(text) {
  const s = String(text ?? "");
  const fence = /```json\s*([\s\S]*?)```/i.exec(s);
  if (!fence) return { prose: s.trim(), block: null };
  let block = null;
  try { block = JSON.parse(fence[1]); } catch { block = null; }
  return { prose: s.slice(0, fence.index).trim(), block };
}

/**
 * What each session set-piece was built from, and whether the narration used
 * it — the review's counts 1 and 7 of design #381.
 *
 * Count 1, from the recorded exchanges: for each opening, closing and
 * spotlight call (its user message's first line), each numbered result of its
 * MATERIAL is `used` (the words the reply's fact block gave for it — its
 * `builtFrom` — and the prose holds them), not used (`false`: the block named
 * none the prose holds; the words it gave are `claimed`), or unknown (`null`:
 * no fact block was read); `tookSecond` where the narration took the second
 * result. Read independently of the module's own account (sceneSeeds.js
 * markSeedsUsed, which the card's `builtFrom` flag keeps), so that the two
 * can disagree.
 *
 * Count 7, from the chat: a Begin a Session card that rolled a "Spotlight
 * vignette: <result>" — and did not say it is the table's to envision — is
 * followed by its spotlight cutaway (a `spotlight_begin` card, and a
 * spotlight call whose first result is that one: `told`, with its roll), or
 * by the note that "the narrator did not write it: yours to envision"
 * (`toEnvision`); else it is `missing` — a narration promised and never
 * written, or written for another result.
 *
 * @param {{ exchanges?: object[], messages?: object[] }} o
 * @returns {{ scenes: object[], totals: object, spotlights: object[] }}
 */
export function setPiecesOf({ exchanges = [], messages = [] } = {}) {
  const scenes = [];
  for (const e of exchanges) {
    const kind = setPieceKindOf(e?.user);
    if (!kind) continue;
    const material = materialOf(e.user);
    const { prose, block } = proseAndBlock(replyText(e));
    const account = block && typeof block === "object" ? (Array.isArray(block.builtFrom) ? block.builtFrom : []) : null;
    const told = ` ${runOfWords(prose)} `;
    const results = material.map((r) => {
      const entry = account?.find(a => Number(a?.n) === r.n) ?? null;
      const words = typeof entry?.words === "string" ? entry.words.replace(/\s+/g, " ").trim() : "";
      const held = !!words && !!runOfWords(words) && told.includes(` ${runOfWords(words)} `);
      return {
        n: r.n, label: r.label, rolls: r.rolls, result: r.result,
        used: account === null ? null : held ? words : false,
        ...(words && !held ? { claimed: words } : {}), ...(entry?.second === true && r.second ? { tookSecond: true } : {}),
      };
    });
    scenes.push({ step: e.step ?? null, kind, results, factBlock: account !== null });
  }
  const all = scenes.flatMap(s => s.results);
  const totals = {
    scenes: scenes.length, byKind: Object.fromEntries(SET_PIECE_KINDS.map(([k]) => [k, scenes.filter(s => s.kind === k).length])),
    results: all.length, used: all.filter(r => typeof r.used === "string").length, notUsed: all.filter(r => r.used === false).length,
    unknown: all.filter(r => r.used === null).length, claimed: all.filter(r => r.claimed).length, tookSecond: all.filter(r => r.tookSecond).length,
  };
  // Count 7. A card's text is its markup with the tags taken off: its words
  // still carry their entities ("&#039;"), where the MATERIAL line has none.
  const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&#039;": "'", "&apos;": "'", "&nbsp;": " " };
  const clean = (s) => String(s ?? "").replace(/&(?:amp|lt|gt|quot|#0?39|apos|nbsp);/g, (x) => ENTITIES[x] ?? x).replace(/\s+/g, " ").trim();
  const spotlights = [];
  messages.forEach((m, i) => {
    const text = clean(m.text);
    if (!/^Begin a Session\b/.test(text)) return;
    const rolled = /Spotlight vignette:\s*(.+?)(\s+—\s+yours to envision\.)?\s+All players take\b/.exec(text);
    if (!rolled) return;
    const result = clean(rolled[1]);
    if (rolled[2]) { spotlights.push({ step: m.step ?? null, result, outcome: "theTables", detail: "the card said it is the table's to envision" }); return; }
    const after = messages.slice(i + 1);
    const card = after.find(x => x.vignette === "spotlight_begin") ?? null;
    const scene = scenes.find(s => s.kind === "spotlight" && clean(s.results[0]?.result) === result) ?? null;
    const note = after.find(x => /the narrator did not write it: yours to envision/.test(clean(x.text))) ?? null;
    if (card && scene) spotlights.push({ step: m.step ?? null, result, outcome: "told", roll: scene.results[0].rolls || null, at: card.step ?? null });
    else if (note) spotlights.push({ step: m.step ?? null, result, outcome: "toEnvision", at: note.step ?? null });
    else spotlights.push({ step: m.step ?? null, result, outcome: "missing", detail: card ? "a spotlight cutaway was posted for another result" : "no spotlight cutaway and no note followed" });
  });
  return { scenes, totals, spotlights };
}

/** The scorecard's one line of setPiecesOf. */
function setPiecesResult(p) {
  const t = p.totals;
  const kinds = Object.entries(t.byKind).filter(([, n]) => n).map(([k, n]) => `${n} ${k}${n === 1 ? "" : "s"}`).join(", ");
  const s = (o) => p.spotlights.filter(x => x.outcome === o).length;
  return `${t.scenes} set-piece scene(s)${kinds ? ` (${kinds})` : ""}: ${t.used} of ${t.results} rolled results in their scene, ${t.notUsed} not, ${t.unknown} with no fact block to say`
    + `${t.claimed ? `; ${t.claimed} claimed and not in the prose` : ""}${t.tookSecond ? `; ${t.tookSecond} took the second result` : ""}`
    + (p.spotlights.length ? `; spotlight vignettes rolled: ${p.spotlights.length} — ${s("told")} told, ${s("toEnvision")} left to envision, ${s("theTables")} the table's from the start, ${s("missing")} missing` : "");
}

// ── the recap, sentence by sentence, and the size of the record ──────────────

/** A line of the recap's source: `[s3-2] …`, `[now-1] …`, `[note-1] …`, `[old-1] …` (src/record/recapView.js recapSource). */
const RECAP_SOURCE_LINE = /^\[((?:s\d+|now|note|old)-\d+)\] (.*)$/gm;
/** The recap's request: the narrator's system prompt in the recap's mode (narratorPrompt.js META_NARRATION_HEADING). */
const isRecapRequest = (r) => String(r?.system ?? "").includes("## THIS SUMMARY");
/** A recap paragraph's sentences: recapView.js recapText joins a paragraph's with one space. */
const sentencesIn = (paragraph) => String(paragraph ?? "").split(/(?<=[.!?…]["'”’)]*)\s+(?=[A-Z0-9“"‘'(])/).map(s => s.trim()).filter(Boolean);

/**
 * Each campaign recap the run's table held, sentence by sentence, beside the
 * lines of its source each sentence cites (issue #382 design 11.4, check 5;
 * known-issues RECAP-CITES-UNREAD). The recap's cache keeps, with its text,
 * each paragraph's sentences' cited ids (`campaignRecapCache.cites`,
 * narrator.js getCampaignRecap; lib/table.mjs `helpers.recapCache`); its
 * source is the recorded request it was made from — the last recap request
 * at or before the step the recap was first seen at. A cited id that is no
 * line of that source fails. A paragraph whose sentences cannot be told
 * apart the way it was joined is read whole, beside all its ids. Pure.
 *
 * @param {{ marks?: object[], requests?: object[] }} o — the observer's marks and the module's recorded requests
 * @returns {{ recaps: object[], totals: { recaps: number, sentences: number, cites: number, unknown: number, unpaired: number, readWhole: number } }}
 */
export function recapCitesOf({ marks = [], requests = [] } = {}) {
  const order = new Map(marks.map((m, i) => [m.step, i]));
  const asked = requests.filter(isRecapRequest);
  const seen = new Set();
  const recaps = [];
  for (const mark of marks) {
    const cache = mark.table?.helpers?.recapCache ?? null;
    if (typeof cache?.text !== "string" || !cache.text.trim() || !Array.isArray(cache.cites)) continue;
    const key = `${cache.madeAt ?? ""}|${cache.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const at = order.get(mark.step) ?? -1;
    const request = asked.filter(r => (order.get(r.step) ?? Infinity) <= at).at(-1) ?? null;
    const lines = new Map(request ? [...String(request.user ?? "").matchAll(RECAP_SOURCE_LINE)].map(m => [m[1], m[2].trim()]) : []);
    const paragraphs = cache.text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    const sentences = [];
    let readWhole = 0;
    cache.cites.forEach((ids, p) => {
      const each = (Array.isArray(ids) ? ids : []).map(x => (Array.isArray(x) ? x.map(String) : []));
      const said = sentencesIn(paragraphs[p]);
      if (said.length === each.length) said.forEach((text, i) => sentences.push({ paragraph: p + 1, text, ids: each[i] }));
      else {
        readWhole += 1;
        sentences.push({ paragraph: p + 1, text: paragraphs[p] ?? "", ids: [...new Set(each.flat())], whole: true });
      }
    });
    for (const s of sentences) s.cites = s.ids.map(id => ({ id, line: lines.get(id) ?? null }));
    recaps.push({
      step: mark.step, madeAt: cache.madeAt ?? null, sourceStep: request?.step ?? null, sentences, readWhole,
      unknown: request ? [...new Set(sentences.flatMap(s => s.cites.filter(c => c.line === null).map(c => c.id)))] : [],
    });
  }
  const all = recaps.flatMap(r => r.sentences);
  return {
    recaps,
    totals: {
      recaps: recaps.length, sentences: all.length, cites: all.reduce((n, s) => n + s.ids.length, 0),
      unknown: recaps.reduce((n, r) => n + r.unknown.length, 0), unpaired: recaps.filter(r => r.sourceStep === null).length,
      readWhole: recaps.reduce((n, r) => n + r.readWhole, 0),
    },
  };
}

/** The scorecard's one line of recapCitesOf. */
function recapCitesResult(r) {
  const t = r.totals;
  return `${t.recaps} recap(s), ${t.sentences} sentence(s), ${t.cites} citation(s): `
    + (t.unknown ? `**${t.unknown} cited id(s) no line of the recap's source — fails**` : "every cited id a line of its source")
    + (t.unpaired ? `; ${t.unpaired} with no recorded request to read it against` : "")
    + (t.readWhole ? `; ${t.readWhole} paragraph(s) read whole` : "");
}

/**
 * How large each session's record grows (issue #382 design 11.4's size
 * check; known-issues RECORD-SIZES-UNMEASURED): after each End a Session —
 * the mark at which the session closed — each Session Log page's
 * `sessionRecord` as JSON, in characters (lib/table.mjs `records`), and the
 * run's last reading. Pure.
 *
 * @param {{ marks?: object[] }} o
 * @returns {{ ends: Array<{ step: string, session: number|null, pages: Array<{ name: string, chars: number }> }>, last: { step: string, pages: object[] }|null }}
 */
export function recordSizesOf({ marks = [] } = {}) {
  const pages = (m) => (m.table?.records ?? []).map(r => ({ name: String(r.name ?? "").replace(/ — \d{4}-\d{2}-\d{2}.*$/, ""), chars: r.chars }));
  const ends = [];
  marks.forEach((m, i) => {
    const was = marks[i - 1]?.table?.session;
    const now = m.table?.session;
    if (was?.active === true && now && now.active !== true) ends.push({ step: m.step, session: was.number ?? null, pages: pages(m) });
  });
  const last = [...marks].reverse().find(m => Array.isArray(m.table?.records)) ?? null;
  return { ends, last: last ? { step: last.step, pages: pages(last) } : null };
}

const kchars = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0));

/** The scorecard's one line of recordSizesOf. */
function recordSizesResult(r) {
  const ends = r.ends.map(e => `after End ${e.session ?? "?"} (${e.step}): ${e.pages.map(p => `${p.name} ${kchars(p.chars)}`).join(", ") || "no page"}`);
  const largest = Math.max(0, ...(r.last?.pages ?? []).map(p => p.chars), ...r.ends.flatMap(e => e.pages.map(p => p.chars)));
  return `${ends.join("; ") || "no End a Session"}; the largest ${kchars(largest)} characters`;
}

// ── agency and friction ──────────────────────────────────────────────────────

/**
 * Lines the narrator spoke for the player's character: quoted speech in a
 * sentence that gives it to "you" ("…," you say). A count to start the
 * reading from, with each sentence quoted.
 */
export function spokenFor(messages = []) {
  const out = [];
  const VERBS = "say|said|tell|told|ask|asked|answer|answered|reply|replied|murmur|mutter|whisper|call|shout|add|admit|explain|snap|growl|hear yourself";
  // The speech is given to "you": «"…," you say», or «You answer the hatch.
  // "…"» — the verb outside the quote. «"Careful what you tell her," the
  // voice says» is somebody else speaking.
  const tagged = new RegExp(`["”][,.]?\\s+you\\s+(?:${VERBS})\\b`, "i");
  const leads = new RegExp(`^[^"“]*\\byou\\s+(?:${VERBS})\\b[^"“]*$`, "i");
  const quote = /["“][^"”]{3,}["”]?/;
  for (const m of messages) {
    if (!m.narrator) continue;
    const sentences = sentencesOf(m.text);
    sentences.forEach((s, i) => {
      if (quote.test(s) && tagged.test(s)) out.push({ step: m.step, scene: m.vignette ?? null, sentence: s.slice(0, 240) });
      else if (leads.test(s) && /^\s*["“]/.test(sentences[i + 1] ?? "") && !new RegExp(`["”][,.]?\\s+(?!you\\b)\\S+(?:\\s+\\S+)?\\s+(?:says|said|asks|answers|replies)\\b`, "i").test(sentences[i + 1])) {
        out.push({ step: m.step, scene: m.vignette ?? null, sentence: `${s} ${sentences[i + 1]}`.slice(0, 240) });
      }
    });
  }
  return out;
}

/** A sentence that is one of the narrator's own instructions written as prose (issue #377 item 2). */
const DIRECTIVE_SLIP = /^\s*[*_]*(?:Open on\b|Shape:|How this narration is built\b|Its first sentence\b)/i;
/** A game stat said with its number (issue #374 A11): "Wits 3", "iron 1". */
const STAT_ALOUD = /\b(?:edge|heart|iron|shadow|wits)\s+[0-5]\b/i;
/** A crew role, for the openings of a campaign whose character flies alone (issue #377 item 4). */
const CREW_ROLE = /\b(?:engineer|navigator|cook|mechanic|medic|quartermaster|co-?pilot|first mate|crewmates?|crew)\b/i;

/**
 * What the narrator was told and wrote anyway, sentence by sentence: an
 * instruction written as prose ("Open on the hatch, not you." — issue #377
 * item 2), a game stat read aloud (#374 A11), and the sentences of an opening
 * that name a crew role (item 4 — for a character who flies alone, each is to
 * be read: "no crew" is no invented one). Counts to start the reading from.
 *
 * @param {Array<{ step: string, narrator?: boolean, vignette?: string|null, text: string }>} messages
 * @returns {{ directives: object[], statsAloud: object[], crewInOpenings: object[] }}
 */
export function slipsOf(messages = []) {
  const out = { directives: [], statsAloud: [], crewInOpenings: [] };
  for (const m of messages) {
    if (!m.narrator) continue;
    for (const s of sentencesOf(m.text)) {
      const at = { step: m.step, scene: m.vignette ?? null, sentence: s.slice(0, 240) };
      if (DIRECTIVE_SLIP.test(s)) out.directives.push(at);
      if (STAT_ALOUD.test(s)) out.statsAloud.push(at);
      if (m.vignette === "galley_begin" && CREW_ROLE.test(s)) out.crewInOpenings.push(at);
    }
  }
  return out;
}

// ── what each line of play became ────────────────────────────────────────────

const replyText = (exchange) => (exchange?.response?.content ?? []).map(c => c?.text ?? "").join("");
/** The game's recover moves (the play kit: Sojourn, Heal, Hearten, Resupply, Repair). */
const RECOVER_MOVE_IDS = ["sojourn", "heal", "hearten", "resupply", "repair"];
const replyJson = (exchange) => {
  const found = replyText(exchange).match(/\{[\s\S]*\}/);
  if (!found) return null;
  try { return JSON.parse(found[0]); } catch { return null; }
};
/** A reader's account that it narrated a recovery because there was nothing to recover — its own, or the module's (router.js nothingToRecover: "[nothing to recover: …]"). */
const NOTHING_TO_RECOVER = /\[nothing to recover\b|\bnothing (?:(?:for \w+ )?to (?:recover|heal|restock|restore|mend|treat|repair|resupply|hearten)|left to (?:recover|heal|restock|restore|mend))\b/i;
/** The meter a reading speaks of, by the words it uses for it, and the impact that marks it spent. */
const RECOVERY_METERS = [
  { meter: "health", impact: "wounded", said: /\b(?:heal(?:s|ed|ing)?|health|wounds?|wounded|injur(?:y|ies|ed))\b/i, line: /\bHealth (\d+) of (\d+)(?: \(([^)]*)\))?/ },
  { meter: "spirit", impact: "shaken", said: /\b(?:hearten|spirit|shaken)\b/i, line: /\bSpirit (\d+) of (\d+)(?: \(([^)]*)\))?/ },
  { meter: "supply", impact: "unprepared", said: /\b(?:resuppl(?:y|ies|ied|ying)|supply|supplies|restock(?:s|ed|ing)?|unprepared)\b/i, line: /\bSupply (\d+) of (\d+)(?: \(([^)]*)\))?/ },
  { meter: "integrity", impact: "battered", said: /\b(?:repair(?:s|ed|ing)?|integrity|hull|battered)\b/i, line: /\bintegrity (\d+) of (\d+)(?: \(([^)]*)\))?/ },
];
/**
 * Whether a line the pacing reader narrated was rightly narrated because the
 * recovery it set about had nothing to recover: the reading says so, of the
 * meters it names, and the sheet the reader was shown — its SITUATION block
 * (src/moves/situation.js renderSituation), in the request it read — holds
 * each of those full and its impact clear. The meters, or null: a reading
 * that names none, or one the sheet does not bear out, is no such thing. The
 * fourth live run's beat 22 came with health and supply full, and its eight
 * lines read so were counted as misses. Pure.
 *
 * @param {string|null} reasoning — the pacing reader's
 * @param {string} request — the text it read (its user message)
 * @returns {string[]|null}
 */
export function nothingToRecoverOf(reasoning, request) {
  if (!NOTHING_TO_RECOVER.test(String(reasoning ?? ""))) return null;
  const named = RECOVERY_METERS.filter(m => m.said.test(reasoning));
  if (!named.length) return null;
  const text = String(request ?? "");
  const at = text.indexOf("SITUATION — ");
  if (at < 0) return null;
  const rest = text.slice(at);
  const end = rest.search(/\n\n|\n## /);
  const sheet = end < 0 ? rest : rest.slice(0, end);
  for (const m of named) {
    const read = m.line.exec(sheet);
    if (!read) return null;
    const marked = String(read[3] ?? "").split(",").map(s => s.trim().toLowerCase()).includes(m.impact);
    if (Number(read[1]) < Number(read[2]) || marked) return null;
  }
  return named.map(m => m.meter);
}

/** The pacing reader's reply to a line: whether it is a move, one offered, or narration. */
export function pacingReadOf(exchange) {
  const j = replyJson(exchange);
  return j && typeof j.decision === "string"
    ? { decision: j.decision, suggested: j.suggestedMove ?? null, category: j.category ?? null, reasoning: j.reasoning ?? null }
    : null;
}
/** The move reader's reply to a line: the move it chose, or that none is being made. */
export function moveReadOf(exchange) {
  const j = replyJson(exchange);
  if (!j) return null;
  return { moveId: j.noMove ? null : (j.moveId ?? null), noMove: j.noMove === true, mischief: j.mischiefApplied === true };
}

/**
 * What became of each line of play the player typed — the measure of
 * decisions.md → "A player is never made to name a move". For every line that
 * is not a command or a scene question: how the pacing reader read it (from
 * its own reply — `exchanges` are a run's recorded calls with their replies),
 * the move the move reader chose, whether the line named a move
 * (lib/moveNames.mjs), and — where the line's beat wants a move (the charter
 * beat's `wants`, or its check's moves; its first `setupLines` lines want
 * none) — whether that is the move it got.
 *
 *   rolled    the line was made a move        offered   a move was offered on a button
 *   narrated  narrated, and nothing offered   unknown   no reading was recorded for it
 *
 * A line whose beat wants a recovery, narrated because the sheet had nothing
 * for the recovery it set about (`nothingToRecover`: the meters, as the
 * reader said and its sheet bore out — nothingToRecoverOf), is read right.
 *
 * A count to start reading from: whether a line *should* have been a move is
 * the charter's say for its move beats and the reader's everywhere else.
 *
 * @param {{ messages: object[], exchanges: object[], beats: object[], charter: object|null }} run
 */
export function freeformOf({ messages = [], exchanges = [], beats = [], charter = null }) {
  const asks = [...(charter?.facts ?? []).flatMap(f => f.probes ?? []), ...(charter?.baits ?? [])];
  const call = (step, kind) => exchanges.find(x => x.step === step && kind.test(x.kind ?? "")) ?? null;
  const seen = new Map();   // a beat's lines so far, for its set-up lines
  const lines = messages.filter(m => m.fromPlayer && m.text && !/^[!@]/.test(m.text.trim())).map((m) => {
    const state = beats.find(b => (b.steps ?? []).includes(m.step)) ?? null;
    const beat = state ? (charter?.beats ?? []).find(b => b.id === state.id) ?? null : null;
    const nth = (seen.get(state?.id) ?? 0) + 1;
    if (state) seen.set(state.id, nth);
    // A memory question typed as a line of play: one of the charter's, in a
    // beat that asks them (a line that *states* a fact holds its words too).
    const question = asks.some(p => isProbeLine(m.text, p)) && (beat ? beat.check?.type === "probesAsked" : /\?\s*$/.test(m.text));
    const wanted = !beat || question || nth <= (beat.setupLines ?? 0) ? []
      : [...new Set([...(beat.wants ?? []), ...(beat.check?.moves ?? []), ...(beat.check?.move ? [beat.check.move] : [])])];
    const pacingCall = call(m.step, /classifyInput$/);
    const pacing = pacingReadOf(pacingCall);
    const read = moveReadOf(call(m.step, /interpretMove$/));
    let became = "unknown";
    if (pacing?.decision === "MOVE") became = read?.noMove ? (pacing.suggested ? "offered" : "narrated") : "rolled";
    else if (pacing?.decision === "NARRATIVE_WITH_MOVE_AVAILABLE") became = "offered";
    else if (pacing) became = "narrated";
    else if (read?.moveId) became = "rolled";
    const move = became === "rolled" ? (read?.moveId ?? pacing?.suggested ?? null) : became === "offered" ? (pacing?.suggested ?? null) : null;
    const recovery = became === "narrated" && wanted.some(id => RECOVER_MOVE_IDS.includes(id)) ? nothingToRecoverOf(pacing?.reasoning, pacingCall?.user) : null;
    return {
      step: m.step, beat: state?.n ?? null, text: m.text, question, named: movesNamedIn(m.text), became, move, wanted,
      right: wanted.length ? (!!move && wanted.includes(move)) || !!recovery : null, reasoning: pacing?.reasoning ?? null,
      ...(recovery ? { nothingToRecover: recovery } : {}),
    };
  });
  const wanting = lines.filter(l => l.wanted.length);
  const plain = wanting.filter(l => !l.named.length);
  const tally = (list) => ({
    lines: list.length,
    rolled: list.filter(l => l.became === "rolled" && l.right).length,
    offered: list.filter(l => l.became === "offered" && l.right).length,
    anotherMove: list.filter(l => (l.became === "rolled" || l.became === "offered") && !l.right).length,
    narrated: list.filter(l => l.became === "narrated" && !l.nothingToRecover).length,
    nothingToRecover: list.filter(l => l.nothingToRecover).length,
    unknown: list.filter(l => l.became === "unknown").length,
  });
  const unasked = lines.filter(l => !l.wanted.length && !l.question);
  const questions = lines.filter(l => l.question);
  return {
    lines,
    wanted: tally(wanting), plain: tally(plain),
    named: lines.filter(l => l.named.length).map(l => ({ step: l.step, beat: l.beat, text: l.text, named: l.named })),
    unasked: { lines: unasked.length, rolled: unasked.filter(l => l.became === "rolled").length, offered: unasked.filter(l => l.became === "offered").length },
    questionsAsPlay: { lines: questions.length, offered: questions.filter(l => l.became === "offered").length, rolled: questions.filter(l => l.became === "rolled").length },
    sceneQuestions: messages.filter(m => m.fromPlayer && /^@scene\b/i.test(String(m.text ?? "").trim())).length,
    lastResort: beats.filter(b => b.lastResort).map(b => b.n ?? b.id),
  };
}

/** The scorecard's one line of speedOf: a line of play's wait, and a scene question's, apart. */
function speedResult(speed) {
  const play = speed.lineToReply;
  const scene = speed.sceneQuestionToReply ?? null;
  return `a line of play to its reply: p50 ${secs(play.p50)}, p95 ${secs(play.p95)} (${play.n} lines)`
    + (scene?.n ? `; a scene question to its answer: p50 ${secs(scene.p50)}, p95 ${secs(scene.p95)} (${scene.n})` : "");
}

/** The scorecard's one line of freeformOf. */
function plainLinesResult(f) {
  const w = f.wanted;
  const parts = [
    `${w.lines} line(s) where a move was wanted: ${w.rolled} rolled, ${w.offered} offered it, ${w.anotherMove} read as another move, ${w.narrated} narrated with nothing offered${w.nothingToRecover ? `, ${w.nothingToRecover} rightly narrated with nothing to recover` : ""}${w.unknown ? `, ${w.unknown} with no reading recorded` : ""}`,
    `${f.named.length} line(s) named a move${f.named.length ? ` (plain lines alone: ${f.plain.rolled + f.plain.offered + (f.plain.nothingToRecover ?? 0)} of ${f.plain.lines} read)` : ""}`,
    `${f.lastResort.length} beat(s) at last resort`,
    `${f.questionsAsPlay.lines} memory question(s) asked as play, ${f.sceneQuestions} as @scene`,
  ];
  if (f.unasked.rolled || f.unasked.offered) parts.push(`${f.unasked.rolled} rolled and ${f.unasked.offered} offered a move where none was wanted`);
  return parts.join("; ");
}

/** Actions per beat and per line of play, what the GM was asked, and the steps that went nowhere. */
export function frictionOf({ actions = [], beats = [], autopilot = [], messages = [] }) {
  const lines = actions.filter(a => a.action?.action === "say" && !String(a.action.text ?? "").startsWith("!")).length;
  const failed = actions.filter(a => a.outcome && a.outcome.ok === false);
  const asked = {};
  for (const a of autopilot) asked[a.did] = (asked[a.did] ?? 0) + 1;
  const draftCards = messages.filter(m => m.card?.includes("draftEntityCard")).length;
  return {
    actions: actions.length, lines,
    actionsPerLine: lines ? Number((actions.length / lines).toFixed(2)) : null,
    actionsPerBeat: beats.map(b => ({ id: b.id, status: b.status, actions: b.actions })),
    waits: actions.filter(a => a.action?.action === "wait").length,
    didNotLand: failed.map(a => ({ step: a.step, detail: a.outcome.detail })),
    gmAsked: asked,
    gmAnswers: autopilot.length,
    draftCards,
  };
}

/**
 * Every number of the review that is arithmetic, from a run's calls and
 * actions: speed, caching, cost, prompt length, repetition, friction and
 * the lines spoken for the character. Each action is given what its step
 * cost (`usd`). Used by the runner when a run ends and by `rescore.mjs`.
 *
 * @param {{ moduleRequests: object[], runnerRequests: object[], actions: object[], messages: object[], beats?: object[],
 *   autopilot?: object[], prices: object, spend: object }} run
 * @returns {{ allCalls: object[], data: object }}
 */
export function reviewDataOf({ moduleRequests = [], runnerRequests = [], actions = [], messages = [], beats = [], autopilot = [], prices = {}, spend = null, exchanges = [], charter = null, marks = [] }) {
  const allCalls = [
    ...moduleRequests.map(r => ({ step: r.step, kind: r.kind, model: r.model, usage: r.usage, ms: r.ms, system: r.system, user: r.user })),
    ...runnerRequests.map(r => ({ step: r.step ?? null, kind: `the AI ${r.role}`, model: r.model, usage: r.usage, ms: r.ms, system: r.system, user: r.user })),
  ];
  const usdAt = (step) => allCalls.filter(c => c.step === step && c.usage && prices[c.model]).reduce((n, c) => n + costOf(prices[c.model], c.usage), 0);
  for (const a of actions) a.usd = Number(usdAt(a.step).toFixed(5));
  const lines = actions.filter(a => a.action?.action === "say" && !String(a.action.text ?? "").startsWith("!")).length;
  return {
    allCalls,
    data: {
      speed: speedOf({ requests: allCalls, actions }),
      caching: cachingOf(allCalls, prices),
      cost: costSplit(spend, { actions: actions.length, lines }),
      length: lengthOf(allCalls),
      repetition: repetitionOf(messages),
      refrains: refrainsOf(messages),
      setPieces: setPiecesOf({ exchanges, messages }),
      recapCites: recapCitesOf({ marks, requests: moduleRequests }),
      recordSizes: recordSizesOf({ marks }),
      friction: frictionOf({ actions, beats, autopilot, messages }),
      agency: spokenFor(messages),
      slips: slipsOf(messages),
      freeform: freeformOf({ messages, exchanges, beats, charter }),
    },
  };
}

// ── the generated layers ─────────────────────────────────────────────────────

const usd = (n) => `$${Number(n ?? 0).toFixed(4)}`;
const pct = (n) => `${Math.round((n ?? 0) * 100)}%`;
const secs = (ms) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} s` : "—");
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ");
const table = (head, rows) => [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map(r => `| ${r.map(cell).join(" | ")} |`)].join("\n");
/**
 * What a run is to answer, from the text it was given: one question to a
 * line, a list's bullet or number taken off. Pure.
 *
 * @param {string} text
 * @returns {string[]}
 */
export const questionsOf = (text) => String(text ?? "").split(/\r?\n/).map(q => q.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim()).filter(Boolean);

const TO_WRITE = "_To write — the reader's notes: what went right, what went wrong, and why._";
/** A re-scored run says so, and what its own verdict was. */
const rescoredLine = (run) => (run.rescored
  ? [`**Re-scored ${String(run.rescored.at ?? "").slice(0, 10)}** from this run's own evidence, by the checks as corrected after it (\`rescore.mjs\`). What the table did is unchanged. The run's own verdict was **${run.rescored.was?.classification ?? "?"}** — ${run.rescored.was?.because ?? ""}`, ""]
  : []);
const TO_ANSWER = "_To write — the answer to each, with its evidence, or that the run did not answer it._";
/**
 * The cold read's place, at the head of a live run's scorecard — above its
 * questions, because it is written before they are answered (rules/ci-e2e.md,
 * "Read it cold before you score it"). A rehearsal's narration is stubbed:
 * there is nothing to read cold.
 */
const COLD_READ = [
  "## The cold read", "",
  "_To write before anything below — `transcript.md` read straight through by a reader who has seen neither the charter, this run's questions nor the fixes it was to verify (in a Claude Code session, a sub-agent handed that one file), asked what the session was like to play: what a player would complain of, what repeats, what makes no sense, what the player was made to do. Its findings, each then checked against the evidence — and, first, what the charter itself made the player do that a person at the table would not._", "",
];

/**
 * The annotated transcript with every generated layer filled in: for each
 * step, the beat the player was on and why it acted, what the table did with
 * it (the calls, the roll and its dice, the GM's answers, the checks'
 * findings), what was said, and its time and cost — and under each, a place
 * for the reader's own notes.
 */
export function annotatedTranscript({ charter, run, actions = [], messages = [], requests = [], autopilot = [], beats = [], mechanics = null, interruptions = [] }) {
  const out = [`# ${charter.name} — annotated transcript`, ""];
  out.push(`Run \`${run.id ?? "?"}\` · ${run.mode} · ${run.startedAt ?? ""} · class **${run.classification ?? "?"}** — ${run.because ?? ""}`, "", ...rescoredLine(run));
  out.push("Generated layers: the beat, the player's reason, the table's calls, rolls, the GM's answers, the checks' findings, time and cost.",
    "The notes under each step are the reader's, and are not generated.", "");
  const byStep = (list, step) => list.filter(x => x.step === step);
  const beatAt = (step) => beats.find(b => b.steps?.includes(step)) ?? null;
  const violations = mechanics?.violations ?? [];
  // In the order they happened. A step that posted nothing — a wait, a
  // press that changed a card in place — has no message to place it by: it
  // follows the action before it (they were listed after the last message).
  const steps = [...new Set(messages.map(m => m.step))];
  actions.forEach((a, i) => {
    if (steps.includes(a.step)) return;
    const before = actions.slice(0, i).reverse().map(x => steps.lastIndexOf(x.step)).find(n => n >= 0);
    steps.splice(before === undefined ? 0 : before + 1, 0, a.step);
  });
  let phase = null;
  for (const step of steps) {
    const said = byStep(messages, step);
    const act = actions.find(a => a.step === step) ?? null;
    const nowPhase = said[0]?.phase ?? act?.phase ?? phase;
    if (nowPhase !== phase) { phase = nowPhase; out.push(`## ${phase ?? "?"}`, ""); }
    const beat = beatAt(step);
    out.push(`### ${step}${beat ? ` · beat ${beat.n ?? beat.id}: ${beat.title}` : ""}`, "");
    if (act?.action) {
      out.push(`- **Player:** ${cell(act.summary ?? act.action.action)}${act.action.reason ? ` — _${cell(act.action.reason)}_` : ""}`);
      if (act.action.note) out.push(`- **Notebook:** ${cell(act.action.note)}`);
      if (act.outcome && act.outcome.ok === false) out.push(`- **Did not land:** ${cell(act.outcome.detail)}`);
    } else if (act?.problem) out.push(`- **No action:** ${cell(act.problem)}`);
    const calls = byStep(requests, step);
    if (calls.length) {
      const kinds = {};
      for (const c of calls) (kinds[c.kind] ??= []).push(c);
      out.push(`- **Calls (${calls.length}):** ${Object.entries(kinds).map(([k, list]) => `${k}${list.length > 1 ? ` ×${list.length}` : ""} (${secs(Math.max(...list.map(c => c.ms ?? 0)))})`).join("; ")}`);
    }
    for (const roll of byStep(mechanics?.rolls ?? [], step)) {
      out.push(`- **Roll:** ${roll.moveId} → ${roll.outcome}${roll.scripted ? " (scripted dice)" : ""} — ${cell(roll.dice)}`);
    }
    for (const a of byStep(autopilot, step)) out.push(`- **GM's rules:** ${cell(a.did)}${a.note ? ` (${cell(a.note)})` : ""}`);
    for (const i of byStep(interruptions, step)) out.push(`- **Interruption:** ${cell(i.did)} — ${cell(i.result ?? "")}`);
    for (const b of beats.filter(x => x.doneAt === step)) out.push(`- **Beat ${b.n ?? b.id} ${b.status}:** ${cell(b.detail ?? "")}`);
    for (const v of byStep(violations, step)) out.push(`- **CHECK VIOLATED — ${v.check}:** ${cell(v.detail)}`);
    if (act) out.push(`- **Time:** ${secs(act.ms)}${Number.isFinite(act.repliedAt) && Number.isFinite(act.saidAt) ? `, ${secs(act.repliedAt - act.saidAt)} from the line to its reply` : ""}${Number.isFinite(act.usd) ? ` · **cost:** ${usd(act.usd)}` : ""}`);
    out.push("");
    for (const m of said) {
      const who = m.fromPlayer ? "PLAYER" : m.narrator ? `NARRATOR${m.vignette ? ` (${m.vignette})` : ""}` : "TABLE";
      out.push(`> **${who} — ${m.speaker ?? m.author ?? "?"}**`, ">", ...String(m.text || "(no text)").split("\n").map(l => `> ${l}`), "");
    }
    out.push(TO_WRITE, "");
  }
  return `${out.join("\n")}\n`;
}

/**
 * The scorecard: one row per dimension with its result, its basis and how far
 * to trust it, then the detail. Rows that are judgement say so and are left
 * to write.
 */
export function scorecard({ charter, run, goal = null, beats = [], mechanics = null, ledger = null, baits = [], leaks = [], speed = null, caching = null, cost = null, length = null, repetition = null, refrains = null, setPieces = null, recapCites = null, recordSizes = null, friction = null, agency = [], slips = null, freeform = null }) {
  const done = beats.filter(b => b.status === "done").length;
  const failed = beats.filter(b => b.status === "failed").length;
  const never = beats.filter(b => b.status !== "done" && b.status !== "failed").length;
  const t = ledger?.totals ?? null;
  const worstOpening = Object.values(repetition ?? {}).map(r => r.worst).filter(Boolean).sort((a, b) => b.sharedShare - a.sharedShare)[0] ?? null;
  const helperRows = (ledger?.facts ?? []).flatMap(f => f.refusals.filter(r => !/narration|answer/.test(r.where)).map(r => ({ fact: f.id, ...r })));
  const out = [`# ${charter.name} — scorecard`, "",
    `Run \`${run.id ?? "?"}\` · ${run.mode} · class **${run.classification ?? "?"}** — ${run.because ?? ""}`, "", ...rescoredLine(run),
    ...(run.mode === "live" ? COLD_READ : []),
    ...((run.questions ?? []).length ? ["## What this run was to answer", "", ...run.questions.map((q, i) => `${i + 1}. ${q}`), "", TO_ANSWER, ""] : []),
    table(["Dimension", "Result", "Basis", "Trust"], [
      goal
        ? ["Goal", `${goal.status}${goal.failingLayer ? ` — lost at ${goal.failingLayer}` : ""}: ${goal.reason ?? ""}`, "the observer: the fact in a store, in the question's prompt, in its answer", "medium: presence of words, not comprehension — read the answer"]
        : ["Goal and beats", `${done} done, ${failed} failed, ${never} not exercised of ${beats.length}`, "the observer's checks on the world after each action", "high: arithmetic over the world's records"],
      ["Mechanics", mechanics ? `${mechanics.checks} checks, ${mechanics.violations.length} violated` : "not run", "the game's text (tests/helpers/sequence/rules.js), each roll from its own dice", "high where a check ran; see what was never exercised"],
      ["Continuity — the narrator", t ? `${t.recalled} recalled, ${t.carriedUnasked} carried unasked, ${t.lost} lost, ${t.refused} refused, ${t.notProbed} not probed of ${t.facts}` : "not scored", "fact × probe × layer; refusals; leaks", "medium: presence of words, not comprehension — read each excerpt"],
      ["Continuity — the helpers", ledger ? `${helperRows.length} refusal(s) in summaries, Chronicle entries and recaps` : "not scored", "each helper's writing against the ledger", "medium: a refusal is a contradiction that was thought of"],
      ["Agency", `${agency.length} sentence(s) that speak for the character`, "quoted speech given to \"you\"", "low: a count to start reading from"],
      ...(slips ? [["Told, and written anyway", `${slips.directives.length} instruction(s) written as prose; ${slips.statsAloud.length} stat(s) read aloud; ${slips.crewInOpenings.length} opening sentence(s) naming a crew role`, "each narrated sentence against the instructions' own words, a stat with its number, a crew role in an opening", "medium for the first two; the third is to be read"]] : []),
      ...(freeform ? [["Plain lines", plainLinesResult(freeform), "each line of play's reading, from the two readers' own replies; the move its beat wanted; a move's name looked for in the line", "medium: a count — whether a line should have been a move is the charter's say for its move beats only, and a named move is a phrase match, to be read"]] : []),
      ["Friction", friction ? `${friction.actionsPerLine ?? "—"} actions per line of play; the GM answered ${friction.gmAnswers} prompt(s); ${friction.didNotLand.length} action(s) did not land` : "not counted", "the player's actions and the GM's rules' answers", "high"],
      ["Narrator quality", worstOpening ? `repetition by content: ${pct(worstOpening.sharedShare)} of ${worstOpening.later}'s content words were in ${worstOpening.earlier}; ${worstOpening.repeatedActs.length} repeated who-is-doing-what` : "no two scenes of one kind to compare", "shared content words and repeated acts between scenes of one kind", "medium for repetition; the rest is the reading"],
      ...(setPieces?.totals.scenes || setPieces?.spotlights.length ? [["Set-pieces", setPiecesResult(setPieces), "each opening, closing and spotlight call: its MATERIAL's numbered results, and the words its reply's fact block gave for each (`builtFrom`) found in its prose; each Begin card's spotlight roll followed by its cutaway or by the note that it is the table's to envision", "high for the arithmetic; whether a result is in the scene recognisably, and not only in the words given, is for the reading"]] : []),
      ...(refrains ? [["Refrains", refrainsResult(refrains), "each session's narrations of play, the opening and closing scenes and the @scene answers apart: the content words and the phrases by how many narrations hold them; the last two sentences of each", "medium: it counts what is said in the same words — a device said in new words each time is for the reading"]] : []),
      ...(recapCites?.totals.recaps ? [["Recap — what it rests on", recapCitesResult(recapCites), "each sentence of each campaign recap the table held, beside the lines of its source it cites: the cache's ids (`campaignRecapCache.cites`) against the recap's recorded request", "high for the ids; whether a sentence says only what its lines say is for the reading"]] : []),
      ...(recordSizes?.ends.length || recordSizes?.last?.pages.length ? [["Record sizes", recordSizesResult(recordSizes), "each Session Log page's `sessionRecord` as JSON, in characters, at the step each session closed and at the run's end", "high"]] : []),
      ["Speed", speed ? speedResult(speed) : "not recorded", "each call's latency; the time from a line of play, and from a scene question, to the first narration after it", "high"],
      ["Length", length ? Object.entries(length).filter(([, v]) => v.calls >= 3).sort((a, b) => Math.abs(b[1].charsPerAction) - Math.abs(a[1].charsPerAction)).slice(0, 2).map(([k, v]) => `${k}: ${v.charsPerAction >= 0 ? "+" : ""}${v.charsPerAction} chars/action`).join("; ") || "too few calls to fit" : "not recorded", "prompt size against the action number, per call kind", "high"],
      ["Caching", caching ? `${pct(caching.total.readShare)} of prompt tokens read from cache; saved ${usd(caching.total.savedUsd)}; ${caching.writesNeverRead.length} kind(s) write and never read` : "not recorded", "usage per call kind", "high"],
      ["Cost", cost ? `${usd(cost.total)} — the module ${usd(cost.module.usd)} (${pct(cost.module.share)}), the test's own models ${usd(cost.test.usd)} (${pct(cost.test.share)})` : "not recorded", "the budget's tally by role and the price table", "high for tokens; prices are entered by hand"],
    ]), ""];

  if (beats.length) out.push("## Beats", "", table(["#", "Beat", "Status", "Actions", "At", "Detail"],
    beats.map(b => [b.n ?? b.id, b.title, b.status, b.actions ?? 0, b.doneAt ?? "", b.detail ?? ""])), "");
  if (goal?.milestones) out.push("## The goal, layer by layer", "", table(["Milestone", "Reached"],
    Object.entries(goal.milestones).map(([k, v]) => [k, v === true ? "yes" : v === false ? "no" : String(v ?? "")])), "");

  if (mechanics) {
    out.push("## Mechanics", "", `${mechanics.checks} checks made.`, "",
      table(["Check", "Made", "Violated"], Object.entries(mechanics.byCheck ?? {}).map(([k, v]) => [k, v.made, v.violated])), "");
    if (mechanics.violations.length) out.push(table(["Step", "Check", "What"], mechanics.violations.map(v => [v.step, v.check, v.detail])), "");
    if (mechanics.rolls?.length) out.push("### Rolls", "", table(["Step", "Move", "Outcome", "Dice", "Scripted"],
      mechanics.rolls.map(r => [r.step, r.moveId, r.outcome, r.dice, r.scripted ? "yes" : ""])), "");
    const neverRan = Object.entries(mechanics.byCheck ?? {}).filter(([, v]) => v.made === 0).map(([k]) => k);
    if (neverRan.length) out.push(`Never exercised: ${neverRan.join(", ")}.`, "");
  }

  if (ledger) {
    out.push("## The fact ledger", "", table(["Fact", "Kind", "Planted", "Verdict", "Layer", "Refusals"],
      ledger.facts.map(f => [f.id, f.kind, f.plantedAt ?? "never", (f.lostAt ?? []).length ? `${f.verdict} (at ${f.lostAt.join(", ")})` : f.verdict, f.failingLayer ?? "", f.refusals.length])), "");
    out.push("### Probes", "", table(["Fact", "Probe", "At", "Distance", "Stored", "In the prompt", "In the answer", "Counted", "Answer"],
      // A question about a fact that was never planted is shown as asked,
      // with its answer, and scored at no layer.
      ledger.facts.flatMap(f => f.probes.map(p => [f.id, p.id, p.asked ? p.step : "not asked", p.distance != null ? `${p.distance} (${p.band})` : "",
        p.asked && !p.notPlanted ? (p.stored ? "yes" : "no") : "", p.asked && !p.notPlanted ? (p.inPrompt ? p.promptSections.join(", ") : "no") : "",
        p.asked && !p.notPlanted ? (p.refused ? "REFUSED" : p.inAnswer ? "yes" : "no") : "",
        p.asked ? (p.counted ? "yes" : p.notPlanted ? "no — the fact was never planted" : p.named ? "no — the question named it" : `no — restated first by ${p.primedBy?.by} (${p.primedBy?.step})`) : "",
        p.answerExcerpt ?? ""]))), "");
    const restated = ledger.facts.flatMap(f => f.restatements.map(r => [f.id, r.step, r.scene, r.inItsPrompt ? r.promptSections.join(", ") : "not in its prompt", r.excerpt ?? ""]));
    if (restated.length) out.push("### Restated unasked", "", table(["Fact", "At", "Scene", "In that scene's own prompt", "Text"], restated), "");
    const refused = ledger.facts.flatMap(f => f.refusals.map(r => [f.id, r.step, r.where, r.word, r.sentence]));
    if (refused.length) out.push("### Refusals — each to be read", "", table(["Fact", "At", "Where", "Word", "Sentence"], refused), "");
    // A corrected value still sent to the narrator, by call kind: marked as
    // corrected (the module doing its work) or not (a refusal, above).
    const carried = ledger.facts.flatMap(f => Object.values((f.carried ?? []).reduce((rows, c) => {
      const row = (rows[`${c.kind}|${c.marked}`] ??= { fact: f.id, word: c.word, kind: c.kind, marked: c.marked, prompts: 0, first: c.step, last: c.step, sections: new Set() });
      row.prompts += 1; row.last = c.step; c.sections.forEach(x => row.sections.add(x));
      return rows;
    }, {})));
    if (carried.length) out.push("### A corrected value in later prompts", "",
      table(["Fact", "Old value", "Call", "Prompts", "From", "To", "Says it was corrected", "Sections"],
        carried.map(c => [c.fact, c.word, c.kind, c.prompts, c.first, c.last, c.marked ? "yes" : "NO", [...c.sections].join(", ")])), "");
    out.push("### What the helpers kept", "", table(["Fact", "Helper", "At", "Holds it", "Text"],
      ledger.facts.flatMap(f => f.helpers.map(h => [f.id, `${h.kind} (${h.key})`, h.step, h.holds ? "yes" : "no", h.excerpt ?? ""]))), "");
  }
  if (baits.length) out.push("## Contradiction baits", "", table(["Bait", "At", "Result", "Answer"], baits.map(b => [b.ask, b.step ?? "not asked", b.result, b.answer ?? ""])), "");
  if (leaks.length) out.push("## Hidden plans", "", table(["Plan", "Made", "Revealed", "Suspected leaks"],
    leaks.map(p => [p.subject ?? p.id, p.firstSeen, p.revealedAt ?? "not revealed", p.leaks.length ? p.leaks.map(l => `${l.step} (${pct(l.share)})`).join(", ") : (p.note ?? "none")])), "");

  if (repetition) for (const [kind, r] of Object.entries(repetition)) {
    if (!r.pairs.length) continue;
    out.push(`## Repetition by content — ${kind}`, "", table(["Earlier", "Later", "Content words shared", "Who is doing what, again"],
      r.pairs.map(p => [p.earlier, p.later, `${p.shared} of ${p.words} (${pct(p.sharedShare)})`, p.repeatedActs.map(a => `${a.who}: ${a.doing.join(" ")}`).join("; ")])), "");
  }
  if (setPieces?.scenes.length || setPieces?.spotlights.length) {
    out.push("## Set-pieces — what each was built from", "",
      "Each session set-piece's rolled results (its MATERIAL) and whether its narration used each: the words its fact block gave for the result, found in its prose — read here, apart from the module's own account on the card. A result \"not used\" had no words the prose holds; \"claimed\" words are the fact block's, not the prose's. A spotlight vignette the Begin card rolled is followed by its cutaway or by the note that it is the table's to envision.", "");
    if (setPieces.scenes.length) {
      out.push(table(["At", "Scene", "n", "What it is for", "Rolled", "Used"], setPieces.scenes.flatMap(sc => (sc.results.length ? sc.results : [{ n: "—", label: "(no MATERIAL)", result: "", used: null }]).map(r => [
        sc.step ?? "", sc.kind, r.n, r.label, `${r.result}${r.rolls ? ` (${r.rolls})` : ""}`,
        typeof r.used === "string" ? `"${r.used}"${r.tookSecond ? " (the second)" : ""}` : r.used === false ? `not used${r.claimed ? ` — claimed "${r.claimed}"` : ""}` : "no fact block",
      ]))), "");
    }
    if (setPieces.spotlights.length) {
      out.push(table(["At", "Spotlight vignette rolled", "What followed"], setPieces.spotlights.map(x => [x.step ?? "", x.result,
        x.outcome === "told" ? `its cutaway${x.at ? ` at ${x.at}` : ""}${x.roll ? ` (rolled ${x.roll})` : ""}` : x.outcome === "toEnvision" ? `the note that it is the table's to envision${x.at ? ` (${x.at})` : ""}` : x.outcome === "theTables" ? "nothing — the card said it is the table's to envision" : `MISSING — ${x.detail}`])), "");
    }
  }
  if (refrains?.sessions.some(x => x.counted)) {
    out.push("## Refrains — what each session's narrations keep returning to", "",
      "The words and the phrases that are in a third or more of a session's narrations of play (and at least three), with the longest run of narrations in a row that hold each — and how the narrations end. A name (a word the session never writes without its capital) is listed as one: who a session is about is no refrain. The opening and closing scenes are apart (above), and so are the answers to `@scene` questions — an answer is a camera on what the story holds; how many of them hold each is said beside it. A count to start reading from: what is said in the same words.", "");
    for (const x of refrains.sessions.filter(y => y.counted)) {
      const rows = [...x.refrains.words.map(r => ["word", r]), ...x.refrains.phrases.map(r => ["phrase", r])];
      out.push(`### ${x.phase} — ${x.narrations} narrations${x.sceneAnswers ? ` of play, and ${x.sceneAnswers} @scene answers counted apart` : ""}`, "");
      if (rows.length) out.push(table(["", "What", "In", "Longest run", "At"], rows.map(([kind, r]) => [r.name ? "name" : kind, r.what, `${r.in} of ${r.of} (${pct(r.share)})${x.sceneAnswers ? `; ${r.inAnswers ?? 0} of ${x.sceneAnswers} answers` : ""}`, r.run, r.steps.join(" ")])), "");
      else out.push("Nothing is in a third of them.", "");
      const below = x.phrases.filter(r => !x.refrains.phrases.includes(r)).slice(0, 6);
      if (below.length) out.push(`Phrases in fewer: ${below.map(r => `"${r.what}" ${r.in} (${r.steps.join(" ")})`).join("; ")}.`, "");
      out.push(`Endings that leave someone waiting, watching or still: ${x.endings.waiting} of ${x.endings.of}${x.endings.steps.length ? ` — ${x.endings.steps.map(e => `${e.step}: …${cell(e.sentence.slice(-90))}`).join("; ")}` : ""}.`, "");
    }
  }
  if (recapCites?.recaps.length) {
    out.push("## The recap, sentence by sentence — what each rests on", "",
      "Each campaign recap the table held, each sentence beside the lines of its source it cites (the cache's `cites` against the recap's recorded request): the record's beats (`[s2-5]`), where things stood (`[now-1]`), a player's own note (`[note-1]`), a session from before the record (`[old-1]`). Read each sentence against its lines: what it says beyond them is the narrator's own. A cited id that is no line of the source fails.", "");
    for (const r of recapCites.recaps) {
      out.push(`### At ${r.step}${r.sourceStep ? ` — made from the request at ${r.sourceStep}` : " — no recorded request to read it against"}`, "");
      if (r.unknown.length) out.push(`**Cites no line of its source: ${r.unknown.map(id => `[${id}]`).join(", ")}.**`, "");
      out.push(table(["¶", "Sentence", "Cites", "What the cited lines say"], r.sentences.map(x => [
        `${x.paragraph}${x.whole ? " (whole)" : ""}`, x.text, x.ids.map(id => `[${id}]`).join(" "),
        x.cites.map(c => (c.line === null ? `[${c.id}] — NO SUCH LINE` : `[${c.id}] ${c.line.length > 220 ? `${c.line.slice(0, 220)}…` : c.line}`)).join(" · "),
      ])), "");
    }
  }
  if (recordSizes?.ends.length || recordSizes?.last?.pages.length) {
    out.push("## Record sizes", "", "Each Session Log page's session record (`sessionRecord`) as JSON, in characters, at the step each session closed and at the run's end.", "",
      table(["When", "Page", "Characters"], [
        ...recordSizes.ends.flatMap(e => e.pages.map(p => [`after End ${e.session ?? "?"} (${e.step})`, p.name, p.chars])),
        ...(recordSizes.last ? recordSizes.last.pages.map(p => [`at the end (${recordSizes.last.step})`, p.name, p.chars]) : []),
      ]), "");
  }
  if (agency.length) out.push("## Spoken for the character", "", table(["At", "Scene", "Sentence"], agency.map(a => [a.step, a.scene ?? "", a.sentence])), "");
  const slipRows = slips ? [
    ...slips.directives.map(s => ["an instruction written as prose", s.step, s.scene ?? "", s.sentence]),
    ...slips.statsAloud.map(s => ["a stat read aloud", s.step, s.scene ?? "", s.sentence]),
    ...slips.crewInOpenings.map(s => ["a crew role in an opening", s.step, s.scene ?? "", s.sentence]),
  ] : [];
  if (slipRows.length) out.push("## Told, and written anyway — each to be read", "", table(["What", "At", "Scene", "Sentence"], slipRows), "");
  if (freeform?.lines.length) {
    out.push("## What each line of play became", "",
      "A player is never made to name a move: a plain line that sets about one should be rolled, or offered it on a button. Each line the player typed that was not a command or a scene question — how it was read, and whether its beat wanted a move.", "",
      table(["At", "Beat", "Line", "Named", "Became", "Move", "Wanted"], freeform.lines.map(l => [
        l.step, l.beat ?? "", cell(l.text.slice(0, 140)), l.named.join(", "),
        `${l.became}${l.question ? " (a memory question asked as play)" : ""}${l.nothingToRecover ? ` — right: nothing to recover (${l.nothingToRecover.join(", ")} full)` : ""}${l.right === false ? " — **not what was wanted**" : ""}`,
        l.move ?? "", l.wanted.join(" / "),
      ])), "");
    if (freeform.lastResort.length) out.push(`Beats that came to their last resort (the move named, after plain lines brought nothing): ${freeform.lastResort.join(", ")}.`, "");
  }
  if (friction) {
    out.push("## Friction", "", `${friction.actions} actions, ${friction.lines} lines of play, ${friction.waits} waits, ${friction.draftCards} draft card(s).`, "");
    if (Object.keys(friction.gmAsked).length) out.push(table(["What the GM's rules answered", "Times"], Object.entries(friction.gmAsked)), "");
    if (friction.didNotLand.length) out.push(table(["Step", "The action did not land"], friction.didNotLand.map(d => [d.step, d.detail])), "");
  }
  if (speed) out.push("## Speed", "", table(["Call kind", "Calls", "p50", "p95", "Longest"],
    Object.entries(speed.calls).map(([k, v]) => [k, v.n, secs(v.p50), secs(v.p95), secs(v.max)])), "",
  `A line of play to its reply: p50 ${secs(speed.lineToReply.p50)}, p95 ${secs(speed.lineToReply.p95)}, longest ${secs(speed.lineToReply.max)} over ${speed.lineToReply.n} lines.`
    + (speed.sceneQuestionToReply?.n ? ` A scene question to its answer: p50 ${secs(speed.sceneQuestionToReply.p50)}, p95 ${secs(speed.sceneQuestionToReply.p95)}, longest ${secs(speed.sceneQuestionToReply.max)} over ${speed.sceneQuestionToReply.n}.` : "")
    + (speed.unanswered.length ? ` Unanswered: ${speed.unanswered.join(", ")}.` : ""), "");
  if (length) out.push("## Prompt length against the action number", "", table(["Call kind", "Calls", "First", "Last", "Largest", "Chars per action"],
    Object.entries(length).map(([k, v]) => [k, v.calls, v.first, v.last, v.max, v.charsPerAction])), "");
  if (caching) {
    out.push("## Caching, by call kind", "", table(["Call kind", "Calls", "Prompt tokens", "Read from cache", "Written", "Sent uncached", "Cost", "Saved"],
      [...caching.byKind.map(r => [r.kind, r.calls, r.prompt, `${r.read} (${pct(r.readShare)})`, r.written, r.uncached, usd(r.usd), usd(r.savedUsd)]),
        ["**All**", caching.total.calls, caching.total.prompt, `${caching.total.read} (${pct(caching.total.readShare)})`, caching.total.written, caching.total.uncached, usd(caching.total.usd), usd(caching.total.savedUsd)]]), "");
    if (caching.writesNeverRead.length) out.push(`Writes a cache it never reads: ${caching.writesNeverRead.map(k => `${k.kind} (${k.written} tokens over ${k.calls} call(s))`).join("; ")}.`, "");
    if (caching.uncachedKinds.length) out.push(`Caches nothing: ${caching.uncachedKinds.map(k => `${k.kind} (${k.prompt} tokens over ${k.calls} call(s))`).join("; ")}.`, "");
  }
  if (cost) out.push("## Cost", "", table(["", "Dollars", "Share", "Calls"], [
    ["The module's own calls", usd(cost.module.usd), pct(cost.module.share), cost.module.calls],
    ["The AI player", usd(cost.player.usd), pct(cost.player.share), cost.player.calls],
    ["**Total**", usd(cost.total), "", cost.module.calls + cost.player.calls],
  ]), "", `Per action: ${cost.perAction != null ? usd(cost.perAction) : "—"}. Per line of play: ${cost.perLine != null ? usd(cost.perLine) : "—"}.`, "");
  out.push("## The reading", "", TO_WRITE, "");
  return `${out.join("\n")}\n`;
}
