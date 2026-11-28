// A rehearsal of an exploration run (explore.mjs, EXPLORE_MODE=rehearsal):
// the whole live path — the budget's gate, the player's tool calls, the
// recording — with the Messages API stood in for here. No key, no network,
// no spend.
//
// It is for the runner, not the narrator: after a change to the runner it
// shows that a live run would still work, before a live run is paid for. What
// its "narrator" says is decided below, so the goal's score in a rehearsal is
// a property of this file — which is why it comes in two tempers:
//
//   remembering (default) — anything it writes that could carry the charter's
//                 first required fact does, once the fact is in front of it.
//                 The module then stores it, sends it, and the answer holds
//                 it: the run scores `achieved` — if the module's own memory
//                 path carried it from one session to the next.
//   forgetful   (EXPLORE_REHEARSAL_FORGET=1) — nothing it writes carries the
//                 fact: the run scores `not-achieved`, at `storage`.
//
// The player is the charter's `rehearsal` script, given back one action per
// turn through the same tool a model would use.
//
// A charter with beats (issue #373) gets a rehearsal that rolls. The first
// stand-in narrated every line without a roll, so it could find nothing on
// the move path — and the first live run stalled on a question the module
// puts to the GM before the dice. Here the script says which lines are moves
// (`move: { id, stat, … }`), the stand-in line reader reads that move in them
// (src/moves/reader.js: one call, answered in the reader's own reply), the
// module routes the reading to a roll, and the resolver rolls: the
// confirmation, the suffer cards, the victory card and the prompts of all of
// them are reached with no key. The script presses buttons by their label (`click`), picks
// dropdown options (`choose`) and closes windows, finding each on the screen
// its prompt shows, and skips what the table never offered.

import { castMembers, castMemberFor, optionFor } from "./cast.mjs";
import { materialOf } from "./review.mjs";

const API_HOST = "api.anthropic.com";

const textOf = (content) => (typeof content === "string" ? content : (content ?? []).map(c => c?.text ?? "").join(""));

/** { system, user, tool } of a Messages API request body. */
function parse(body) {
  const system = typeof body.system === "string" ? body.system : (body.system ?? []).map(b => b?.text ?? "").join("\n");
  const user = (body.messages ?? []).filter(m => m.role === "user").map(m => textOf(m.content)).join("\n");
  return { system, user, tool: body.tools?.[0]?.name ?? null };
}

const flexible = (variant) => new RegExp(String(variant).trim().split(/[\s-]+/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s-]*"), "i");

/** A line of the recap's source: `[s3-2] …`, `[now-1] …`, `[note-1] …`, `[old-1] …` (record/recapView.js recapSource). */
const SOURCE_LINE = /^\[((?:s\d+|now|note|old)-\d+)\] (.*)$/gm;

/**
 * The campaign recap's reply, as the module asks for it since the recap is a
 * view of the session record (issue #382, slice 2; narratorPrompt.js
 * buildCampaignRecapUserMessage): JSON paragraphs of sentences, each citing
 * the ids of the source lines it rests on — a sentence that cites none is
 * dropped in code, a beat marked LASTING that no sentence cites sends the
 * reply back once, and a reply that is not the JSON leaves the recap empty
 * (narrator.js getCampaignRecap). The stand-in states each fact a line of the
 * source holds, citing those lines — none when it is forgetful — and gives
 * every LASTING beat a sentence of its own that cites it, so it is sent back
 * for neither. Pure.
 *
 * @param {string} user — the recap's user message
 * @param {{ facts?: object[], holds: (text: string, fact: object) => boolean, forget?: boolean }} o
 * @returns {string}
 */
export function citedRecapReply(user, { facts = [], holds, forget = false }) {
  const lines = [...String(user ?? "").matchAll(SOURCE_LINE)].map(m => ({ id: m[1], text: m[2] }));
  const told = (forget ? [] : facts).flatMap((fact) => {
    const because = lines.filter(l => holds(l.text, fact)).map(l => l.id);
    return because.length ? [{ text: fact.statement, because }] : [];
  });
  const cited = new Set(told.flatMap(s => s.because));
  const lasting = lines.flatMap((l) => {
    const what = / — LASTING: (.+)$/.exec(l.text)?.[1]?.trim();
    return what && !cited.has(l.id) ? [{ text: `That stood: ${what}.`, because: [l.id] }] : [];
  });
  const opening = lines.length ? [{ text: "The story so far, as the record has it.", because: [lines[0].id] }] : [];
  return JSON.stringify({ paragraphs: [[...opening, ...told], lasting].filter(p => p.length) });
}

/** A beat of the session summary's source: `[3] …` (record/summaryView.js summarySource). */
const SUMMARY_BEAT = /^\[(\d+)\] (.*)$/gm;

/**
 * The session summary's reply, as the module asks for it since the summary is
 * a view of the session record (issue #382, slice 3; summaryView.js
 * SESSION_SUMMARY_SYSTEM_PROMPT): a JSON list of sentences, each citing the
 * numbers of the beats it tells — a reply that is not that list is asked for
 * once more and then dropped, a beat marked LASTING that no sentence tells
 * sends it back once (narrator.js getRollingSessionSummary). The stand-in
 * opens on the day's business, citing the first beat; states each fact a
 * beat of THE SESSION holds — its fact line, not its TOLD AS, and never a
 * question put to the narrator, as the prompt says — citing those beats (none
 * when it is forgetful: its summary is there, and holds no fact); and tells
 * every LASTING beat. Pure.
 *
 * @param {string} user — the summary's user message
 * @param {{ facts?: object[], holds: (text: string, fact: object) => boolean, forget?: boolean, pc?: string }} o
 * @returns {string}
 */
export function citedSummaryReply(user, { facts = [], holds, forget = false, pc = "The character" }) {
  const session = /## THE SESSION[^\n]*\n([\s\S]*?)(?=\n## |$)/.exec(String(user ?? ""))?.[1] ?? "";
  const beats = [...session.matchAll(SUMMARY_BEAT)].map(m => ({ id: m[1], text: m[2] }));
  if (!beats.length) return "[]";
  const told = (forget ? [] : facts).flatMap((fact) => {
    const because = beats.filter(b => holds(b.text, fact)).map(b => b.id);
    return because.length ? [{ text: fact.statement, because }] : [];
  });
  const cited = new Set(told.flatMap(s => s.because));
  const lasting = beats.flatMap((b) => {
    const what = / — LASTING: (.+)$/.exec(b.text)?.[1]?.trim();
    return what && !cited.has(b.id) ? [{ text: `That stood: ${what}.`, because: [b.id] }] : [];
  });
  return JSON.stringify([{ text: `${pc} went about the day's business.`, because: [beats[0].id] }, ...told, ...lasting]);
}

/**
 * The stand-in's answerer for one charter. Pure but for the player's turn
 * counter: `reply(body)` → the `content` and `stop_reason` of a reply.
 *
 * @param {{ charter: object, forget?: boolean }} options
 */
export function createRehearsal({ charter, forget = false }) {
  if (Array.isArray(charter.beats) && charter.beats.length) return createRollingRehearsal({ charter, forget });
  const fact = (charter.facts ?? []).find(f => f.required !== false) ?? null;
  const pc = charter.seed?.pc?.name ?? "the character";
  const holds = (text) => !!fact && fact.variants.some(v => flexible(v).test(text));
  const script = charter.rehearsal ?? [];
  let turn = 0;

  /** The scripted action as the tool's input, its window found on the screen the prompt shows. */
  function playerInput(user) {
    const a = script[Math.min(turn, script.length - 1)] ?? { action: "stop", reason: "the charter has no rehearsal script" };
    turn += 1;
    const input = { action: a.action, text: "", message: "", button: 0, window: 0, fields: [], seconds: 0, reason: a.reason ?? "the rehearsal's script" };
    if (a.action === "say") input.text = a.text;
    if (a.action === "wait") input.seconds = a.seconds ?? 2;
    if (a.action === "dialog") {
      const escaped = a.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      input.window = Number(new RegExp(`OPEN WINDOW (\\d+): "${escaped}"`).exec(user)?.[1] ?? 0);
      input.text = a.press;
      input.fields = a.fields ?? [];
    }
    return input;
  }

  function reply(body) {
    const { system, user, tool } = parse(body);
    const knows = !forget && holds(`${system}\n${user}`);
    const toolUse = (input) => ({ content: [{ type: "tool_use", id: `toolu_rehearsal_${turn}`, name: tool, input }], stop_reason: "tool_use" });
    const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn" });

    if (tool === "take_action") return toolUse(playerInput(user));
    // The line reader: every line narrated, none a move (a roll asked for, or a move a card chose, aside).
    if (system.startsWith(LINE_READER)) return text(lineReaderReply(system, user, {}));
    if (system.includes("chronicle scribe")) {
      return text(JSON.stringify(knows
        ? { type: "discovery", salience: "notable", text: fact.statement }
        : { type: "scene", salience: "trivial", text: "A quiet moment." }));
    }
    if (system.includes("continuity scribe")) {
      return text(citedSummaryReply(user, { facts: fact ? [fact] : [], holds: (t) => holds(t), forget, pc }));
    }
    if (system.includes("## THIS SUMMARY")) {
      return text(citedRecapReply(user, { facts: fact ? [fact] : [], holds: (t) => holds(t), forget }));
    }
    if (system.includes("NARRATOR ROLE AND VOICE")) {
      const prose = knows ? `You stop for a moment. ${fact.statement}` : "The moment passes. Nothing more comes of it.";
      if (!system.includes("MANDATORY SIDECAR")) return text(prose);
      // The player's own words, tagged as theirs (overhaul 2, D5): untagged, a fact is the narrator's colour and fades.
      const sidecar = { newTruths: knows ? [{ subject: pc, fact: fact.statement, from: "line" }] : [], stateChanges: [] };
      return text(`${prose}\n\n\`\`\`json\n${JSON.stringify(sidecar, null, 2)}\n\`\`\``);
    }
    return text("{}");
  }

  return { reply };
}

// ── a rehearsal that rolls ───────────────────────────────────────────────────

const TITLE = (id) => String(id ?? "").split("_").map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");

// ── the line reader ──────────────────────────────────────────────────────────

/** The line reader's system prompt opens so (src/moves/reader.js ROLE). */
const LINE_READER = "You are the line reader";
/** A roll asked for of a line the script makes no move: Face Danger +wits, as the two readers' stand-in read it. */
const ANY_ROLL = Object.freeze({ id: "face_danger", stat: "wits" });

/**
 * The line reader's reply in its own format — one JSON object, its keys in
 * the order THE REPLY gives them, a key left out where it would be null or
 * false (src/moves/reader.js, as parseReading reads it) — for the scripted
 * entry the table is answering, in the mode the call's user message opens
 * with:
 *
 *   READ THE LINE (open) — a `say` the script makes a move (`move`) is that
 *     move, asked for: its stat, target, ranks and heal situation the
 *     script's, a rolled move's risk high. Asked, because the script's lines
 *     never name a move (decisions.md → "A player is never made to name a
 *     move"), and unasked, the module's own route would offer what the two
 *     readers' stand-in rolled — a move with no roll (Develop Your
 *     Relationship, Reach a Milestone) and a roll after a dense run of rolls
 *     (src/pacing/readAndRoute.js routeReading, rows 6 and 8). A `say` the
 *     script offers a move for (`offer`) is that move unasked, at little
 *     risk: offered. A Make a Connection for someone the SITUATION already
 *     lists among the connections (`connected`), and any other line, is no
 *     move.
 *   A ROLL WAS ASKED FOR (roll) — never no move: the script's move, else its
 *     offer, else Face Danger +wits.
 *   THE MOVE IS CHOSEN (chosen) — the chosen move, with the script's stat
 *     and target where the script's move is that move.
 *
 * Whether a reading is rolled, offered or narrated is the module's
 * (routeReading), never the reader's. Pure.
 *
 * @param {string} system — the call's system prompt: its THE MOVES says which moves are made with no roll
 * @param {string} user — its user message: the MODE line it opens with
 * @param {object} entry — the scripted entry the table is answering ({} for none)
 * @param {{ connected?: string|null }} [o]
 * @returns {string}
 */
function lineReaderReply(system, user, entry, { connected = null } = {}) {
  const chosen = /^MODE — THE MOVE IS CHOSEN: ([a-z_]+)/m.exec(String(user ?? ""))?.[1] ?? null;
  const roll = !chosen && /^MODE — A ROLL WAS ASKED FOR\b/m.test(String(user ?? ""));
  // A move with no roll has no risk (moves/readerCatalogue.js renderReaderCatalogue: `- id (Name; no roll): …`).
  const unrolled = (id) => new RegExp(`^- ${id} \\([^)\\n]*; no roll\\)`, "m").test(String(system ?? ""));
  const read = (move, reason, { asked = false, risk = "high" } = {}) => JSON.stringify({
    move: move.id,
    ...(asked ? { asked: true } : {}),
    ...(unrolled(move.id) ? {} : { risk }),
    category: move.category ?? "exploration",
    confidence: "high",
    reason,
    ...(move.target ? { target: move.target } : {}),
    ...(move.stat ? { stat: move.stat } : {}),
    ...(move.heal ? { healSituation: move.heal } : {}),
    ...(move.expeditionRank ? { expeditionRank: move.expeditionRank } : {}),
    ...(move.rank ? { combatRank: move.rank } : {}),
  });
  const none = (reason) => JSON.stringify({ move: null, category: "social", confidence: "high", reason });
  const said = entry?.action === "say";
  if (chosen) return read(entry?.move?.id === chosen ? entry.move : { id: chosen }, `Rehearsal: the card the table pressed chose ${TITLE(chosen)}.`);
  if (roll) return read(entry?.move ?? entry?.offer ?? ANY_ROLL, "Rehearsal: a roll was asked for.");
  if (said && connected) return none(`Rehearsal: ${connected} is already among the connections; there is no connection to make.`);
  if (said && entry.offer) return read(entry.offer, `Rehearsal: the script offers this line ${TITLE(entry.offer.id)}.`, { risk: "slight" });
  if (said && entry.move) return read(entry.move, `Rehearsal: the script makes this line ${TITLE(entry.move.id)}.`, { asked: true });
  return none("Rehearsal: narrated, no roll.");
}

/**
 * The vow truths a narration's system prompt asks to have told: each plan
 * its THIS BEAT ENDS A VOW block names (by id), with the Truth line the same
 * prompt's UNREVEALED block gives it (narratorPrompt.js vowEndingLines,
 * formatSkeletonEntry). Pure.
 *
 * @param {string} system
 * @returns {Array<{ id: string, truth: string }>}
 */
export function vowTruthsToTell(system) {
  const block = /### THIS BEAT ENDS A VOW\n([\s\S]*?)(?:\n### |\n## |$)/.exec(String(system ?? ""))?.[1] ?? "";
  const ids = [...new Set([...block.matchAll(/\(id (\S+?)\)/g)].map(m => m[1]))];
  return ids.map((id) => {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const truth = new RegExp(`### [^\\n]*\\(id ${escaped}\\)\\n(?:[A-Z][^\\n:]*): ([^\\n]+)`).exec(String(system ?? ""))?.[1] ?? "";
    return { id, truth: truth.replace(/\s*\(already revealed[^)]*\)\s*$/, "").trim() };
  }).filter(e => e.truth);
}

/**
 * What a narration's block says the vow's plan owes the beat (issue #402,
 * change 4 — obligations.js [clue], [culprit], [escalation]): the words a
 * narration that follows its instructions puts in the prose — the clue's or
 * the step's own, the culprit's name. Pure.
 *
 * @param {string} user — the narration's user message
 * @returns {string[]}
 */
export function owedToTell(user) {
  const out = [];
  for (const line of String(user ?? "").split("\n")) {
    const quoted = /^- \[(?:clue|escalation)\] [^"]*"(.+)"\s*$/.exec(line);
    if (quoted) { out.push(quoted[1]); continue; }
    const culprit = /^- \[culprit\] (.+?) enters the story in this beat\b/.exec(line);
    if (culprit) out.push(`${culprit[1]} is there, and you mark the name.`);
  }
  return out;
}

/** What the player's prompt shows: its messages' buttons and dropdowns, its windows, its current beat. Pure. */
export function readScreenText(user) {
  const messages = [];
  let current = null;
  for (const line of String(user ?? "").split("\n")) {
    let m;
    if ((m = /^\[([me]\d+)\] /.exec(line))) { current = { ref: m[1], buttons: [], selects: [] }; messages.push(current); }
    else if (current && (m = /^\s+buttons: (.*)$/.exec(line))) {
      for (const b of m[1].matchAll(/\((\d+)\) "((?:[^"\\]|\\.)*)"/g)) current.buttons.push({ n: Number(b[1]), label: b[2] });
    } else if (current && (m = /^\s+dropdown \((\d+)\)(?: "[^"]*")? = "(?:[^"\\]|\\.)*" options: (.*)$/.exec(line))) {
      current.selects.push({ n: Number(m[1]), options: m[2].split(" | ").map(o => o.trim()) });
    }
  }
  const windows = [...String(user ?? "").matchAll(/^OPEN WINDOW (\d+): "([^"]*)"/gm)].map(w => ({ n: Number(w[1]), title: w[2] }));
  const beat = Number(/^CURRENT BEAT: (\d+) of/m.exec(String(user ?? ""))?.[1] ?? NaN);
  const screenAt = String(user ?? "").indexOf("YOUR SCREEN NOW:");
  return { messages, windows, beat: Number.isFinite(beat) ? beat : null, text: screenAt < 0 ? String(user ?? "") : String(user).slice(screenAt) };
}

/**
 * The rolling stand-in for a charter with beats.
 *
 * The script's entries are the player's actions, each optionally tagged:
 *   beat    — the beat it belongs to: skipped once the pointer is past it;
 *   move    — on a `say` or a `click`: the move the line is (`{ id, stat,
 *             target, rank, heal }`): the line reader reads it so, asked
 *             for, and the module rolls it (a card's chosen move is read
 *             with the script's stat and target);
 *   plants  — fact ids the line states: the narrator repeats and records them;
 *   probe   — a fact id the line asks about: answered if the fact is in
 *             front of the narrator;
 *   bait    — a bait id: corrected if its fact is in front of the narrator;
 *   names   — names the narration of this line uses (so the detector sees them);
 *   detects — names the detector reports from this line's narration as they
 *             are written there, where the cast's full name is not: a cast
 *             member under a part of the name ("Tamsin" for Tamsin Vey — what
 *             the third live run's detector proposed);
 *   offer   — on a `say`: the move the line reader reads in the line
 *             unasked, at little risk (`{ id }`), which the module offers
 *             rather than makes — the narration carries a "Roll …" button: a
 *             step toward a vow said in the fiction is offered its milestone
 *             so (a move with no roll is offered, unasked);
 *   sidecar — a fact block the narrator sends with this line's reply whether
 *             or not one was asked for: an @scene answer is asked for none,
 *             and the module drops one that comes anyway;
 *   patience — how many turns to wait for a button or window that is not on
 *             screen before the entry is skipped (default 4; `optional` = 1).
 *
 * And, where the charter says so (`rehearsalPlan.tellsVowTruth`), the
 * stand-in narrator tells a vow's hidden truth where its prompt says the beat
 * ends that vow (THIS BEAT ENDS A VOW) — states it in the prose and records it
 * revealed — as a narrator that follows its instructions does, so that a
 * rehearsal walks the reveal (known-issues VOW-FULFILLED-WITH-NOBODY-NAMED).
 * It tells nothing a prompt does not ask for. Where the charter says so
 * (`rehearsalPlan.tellsWhatIsOwed`), it tells what a vow's plan owes the beat
 * too — a milestone's clue and culprit, a missed fulfilment's next step
 * (issue #402, change 4; `owedToTell`).
 *
 * The stand-in reader reads the script's move — save one: a Make a
 * Connection for someone the reader's SITUATION block already lists among
 * the character's connections is no move, and the line is narrated, as the
 * live readers read it (the fourth live run, a5–a8). The stand-in used to roll it
 * all the same, so a rehearsal could never show a connection made by a draft
 * card rather than by the roll (known-issues
 * CONNECTION-MADE-BY-CONFIRMING-A-DRAFT); with the GM's rules on that road
 * (EXPLORE_DRAFT_HOLDER=pc) it does.
 *
 * The scripted player keeps to its beats: an entry of a beat the pointer has
 * not come to waits for it — played early, its line would land in the window
 * of the beat before (one that cannot be done is given up after its stall,
 * lib/beats.mjs STALL_ACTIONS), and the beat it was written for would never
 * see it.
 */
export function createRollingRehearsal({ charter, forget = false }) {
  const script = charter.rehearsal ?? [];
  const facts = charter.facts ?? [];
  const pc = charter.seed?.pc?.name ?? "the character";
  const cast = Object.values(charter.cast ?? {}).filter(c => c?.name);
  const members = castMembers(charter.cast);
  const holds = (text, fact) => {
    const sentences = String(text ?? "").split(/(?<=[.!?])\s+|\n+/);
    const has = (t, words) => words.some(w => flexible(w).test(t));
    return fact.anchor?.length ? sentences.some(t => has(t, fact.variants) && has(t, fact.anchor)) : has(text, fact.variants);
  };
  let at = 0;                  // the next script entry
  let waited = 0;              // turns spent waiting on it
  let current = null;          // the entry the table is answering now
  let turn = 0;
  const skipped = [];
  const sameName = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
  // The character's connections, as the line reader's SITUATION block names them
  // (src/moves/readerSituation.js buildReaderSituationBlock: `- Connections: "Tamsin Vey" (…)`).
  const connectionsIn = (text) => [...(/^- Connections: (.*)$/m.exec(String(text ?? ""))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(m => m[1]);
  /** The connection a scripted Make a Connection asks for that the sheet already holds — by name, or as one cast member — or null. */
  const connectedAlready = (entry, text) => {
    if (entry?.move?.id !== "make_a_connection") return null;
    const target = entry.move.target ?? null;
    const member = castMemberFor(target, members)?.name ?? null;
    return connectionsIn(text).find(n => sameName(n, target) || (member && castMemberFor(n, members)?.name === member)) ?? null;
  };

  const base = (reason) => ({ action: "wait", text: "", message: "", button: 0, option: "", window: 0, fields: [], seconds: 0, note: "", reason });

  /** The scripted entry as the tool's input for the screen the prompt shows, or null when it is not there yet. */
  function resolve(entry, screen) {
    const input = base(entry.reason ?? "the rehearsal's script");
    input.action = entry.action;
    if (entry.note) input.note = entry.note;
    switch (entry.action) {
      case "say": {
        // A line made from what the screen shows (`match` → `template`): an id a card lists.
        if (entry.match) {
          const found = new RegExp(entry.match, "i").exec(screen.text ?? "");
          if (!found) return null;
          input.text = entry.template.replace(/\$(\d)/g, (_, n) => found[Number(n)] ?? "");
          return input;
        }
        input.text = entry.text;
        return input;
      }
      case "wait": input.seconds = entry.seconds ?? 2; return input;
      case "stop": return input;
      case "dialog": {
        const w = screen.windows.find(x => x.title === entry.title);
        if (!w) return null;
        input.window = w.n; input.text = entry.press; input.fields = entry.fields ?? [];
        return input;
      }
      case "close": {
        const w = screen.windows.find(x => x.title === entry.title);
        if (!w) return null;
        input.window = w.n;
        return input;
      }
      case "click": {
        const want = String(entry.label).toLowerCase();
        const offering = screen.messages.filter(m => m.buttons.some(b => b.label.toLowerCase().includes(want)));
        const m = entry.first ? offering[0] : offering.at(-1);
        if (!m) return null;
        input.message = m.ref; input.button = m.buttons.find(b => b.label.toLowerCase().includes(want)).n;
        return input;
      }
      case "choose": {
        // The option that holds the words — else the one they plainly mean
        // ("Tamsin Vey" where the card, and so the option, is "Tamsin").
        const want = String(entry.option).toLowerCase();
        const offered = (sel) => sel.options.find(o => o.toLowerCase().includes(want)) ?? optionFor(entry.option, sel.options);
        const m = screen.messages.filter(x => x.selects.some(sel => offered(sel) != null)).at(-1);
        if (!m) return null;
        const sel = m.selects.find(x => offered(x) != null);
        input.message = m.ref; input.button = sel.n; input.option = offered(sel);
        return input;
      }
      default: return input;
    }
  }

  function playerInput(user) {
    const screen = readScreenText(user);
    turn += 1;
    for (;;) {
      const entry = script[at];
      if (!entry) return { ...base("the rehearsal script is done"), action: "stop" };
      // The pointer has moved past this entry's beat: the beat is over.
      if (entry.beat != null && screen.beat != null && screen.beat > entry.beat) { skipped.push({ at, why: `beat ${entry.beat} was over` }); at += 1; waited = 0; continue; }
      // …or has not come to it yet: the beat before is still being walked.
      if (entry.beat != null && screen.beat != null && screen.beat < entry.beat) return { ...base(`waiting for beat ${entry.beat}: beat ${screen.beat} is not over`), seconds: 3 };
      const input = resolve(entry, screen);
      if (input) {
        at += 1; waited = 0;
        if (entry.action === "say" || entry.action === "click") current = entry;
        return input;
      }
      waited += 1;
      const what = entry.label ?? entry.title ?? entry.option ?? entry.match;
      if (waited > (entry.patience ?? (entry.optional ? 1 : 4))) { skipped.push({ at, why: `"${what}" was never on screen` }); at += 1; waited = 0; continue; }
      return { ...base(`waiting for "${what}"`), seconds: 3 };
    }
  }

  const statementsOf = (ids) => facts.filter(f => (ids ?? []).includes(f.id)).map(f => f.statement);

  function narrate(system, user) {
    const entry = current ?? {};
    const front = `${system}\n${user}`.split(entry.text ?? "\u0000").join(" ");
    const known = (id) => { const f = facts.find(x => x.id === id); return !forget && !!f && holds(front, f); };
    const sidecar = { newTruths: [], stateChanges: [] };
    let prose;
    if (/vignette/i.test(user) && !entry.plants && !entry.probe) {
      // A session set-piece — an opening, a closing or a spotlight cutaway
      // (its user message's first line: OPENING / CLOSING / SPOTLIGHT
      // VIGNETTE) — is built from the MATERIAL rolled for it (issue #381):
      // each result in the prose, in its own words, and accounted for in the
      // fact block (`builtFrom`), as the prompt asks. The forgetful stand-in
      // does neither, so the review's count of them can be seen to fail.
      prose = `The ship ticks as it cools, and for a moment nothing is asked of anyone. (Scene ${turn}.)`;
      const material = forget ? [] : materialOf(user);
      if (material.length) {
        // A rolled pair in words of its own — never its two words together,
        // as a label or as a name (the module's [material] check, issue #388
        // #11); a record's name or a place as it is given.
        const told = (r) => (/^(?:Action \+ Theme|Descriptor \+ Focus)$/.test(r.source)
          ? `Something of ${r.result.toLowerCase().split(/\s+/).join(", something of ")}`
          : r.result);
        prose += ` ${material.map(r => `${told(r)}.`).join(" ")}`;
        // "The three to eight words of your prose that are it."
        sidecar.builtFrom = material.map(r => ({ n: r.n, words: told(r).split(/\s+/).slice(0, 8).join(" ") }));
      }
    } else if (entry.plants?.length) {
      const said = statementsOf(entry.plants);
      prose = forget ? "The moment passes. Nothing more comes of it." : `You say it plainly, and it stays said. ${said.join(" ")}`;
      // Said by the player (the plant's own line), so tagged theirs: it binds, and the recalls hold (overhaul 2, D5).
      if (!forget) sidecar.newTruths = said.map(fact => ({ subject: pc, fact, from: "line" }));
    } else if (entry.probe) {
      const fact = facts.find(f => f.id === entry.probe);
      prose = known(entry.probe) ? `It comes back to you at once. ${fact.statement}` : "You reach for it and nothing comes. Whatever it was, it is not here now.";
    } else if (entry.bait) {
      const bait = (charter.baits ?? []).find(b => b.id === entry.bait);
      prose = bait && known(bait.fact) ? `No. ${bait.truth}` : "You could not swear to it either way.";
    } else if (entry.move) {
      prose = `What you set out to do is done, one way or the other, and the place has changed for it. (${TITLE(entry.move.id)}.)`;
    } else {
      prose = "The moment passes. Nothing more comes of it.";
    }
    for (const name of entry.names ?? []) if (!prose.includes(name)) prose += ` ${name} is there, watching how you take it.`;
    // A vow this beat ends: its truth, as the plan gives it, told — and
    // recorded told — where the charter's stand-in is one that does
    // (`rehearsalPlan.tellsVowTruth`): the long haul's every plan has one
    // truth, and a vow's told would read as another plan's leaked.
    const ending = charter.rehearsalPlan?.tellsVowTruth ? vowTruthsToTell(`${system}\n${user}`) : [];
    if (ending.length) prose += ` ${ending.map(e => e.truth).join(" ")}`;
    // What the vow's plan owes this beat — its clue, its culprit, its next step
    // (issue #402, change 4) — told, where the charter's stand-in is one that does.
    if (charter.rehearsalPlan?.tellsWhatIsOwed) for (const said of owedToTell(user)) if (!prose.includes(said)) prose += ` ${said}`;
    // A fact block sent whether or not one was asked for (`sidecar`).
    if (entry.sidecar) return `${prose}\n\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges: [], ...entry.sidecar }, null, 2)}\n\`\`\``;
    if (!system.includes("MANDATORY SIDECAR")) return prose;
    if (ending.length) sidecar.reveals = ending.map(e => ({ id: e.id, revealed: ["truth"], resolved: true }));
    // A plan the narration is asked to decide: decided, and never shown.
    const decide = /### DECIDE NOW([\s\S]*?)(?:\n### |\n## |$)/.exec(system)?.[1] ?? "";
    const ids = [...decide.matchAll(/^- id (\S+):/gm)].map(m => m[1]);
    if (ids.length) {
      sidecar.plans = ids.map(id => ({
        id, subject: charter.rehearsalPlan?.subject ?? "the quiet buyer",
        truth: charter.rehearsalPlan?.truth ?? "The quiet buyer underwrites the lane raids through a shell consortium and means to own the wreck rights outright.",
        wants: "to own what the raids leave behind", knows: "which convoys carry no escort",
        escalation: ["A second convoy goes dark.", "An offer arrives that is also a threat."],
        clues: ["A consortium seal on a raider's crate.", "A ledger page with two sets of initials."],
        resolutions: ["The consortium is named in the open."],
      }));
    }
    return `${prose}\n\n\`\`\`json\n${JSON.stringify(sidecar, null, 2)}\n\`\`\``;
  }

  function reply(body) {
    const { system, user, tool } = parse(body);
    const toolUse = (input) => ({ content: [{ type: "tool_use", id: `toolu_rehearsal_${turn}`, name: tool, input }], stop_reason: "tool_use" });
    const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn" });
    const entry = current ?? {};

    if (tool === "take_action") return toolUse(playerInput(user));
    // The line reader, in the mode it is called in. A Make a Connection for
    // someone already a connection is no move (the live readers' reading).
    if (system.startsWith(LINE_READER)) return text(lineReaderReply(system, user, entry, { connected: connectedAlready(entry, `${system}\n${user}`) }));
    if (system.includes("chronicle scribe")) {
      const said = forget ? [] : facts.filter(f => holds(user, f)).map(f => f.statement);
      return text(JSON.stringify(said.length
        ? { type: "discovery", salience: "notable", text: said.join(" ") }
        : { type: "moment", salience: "scene", text: "A quiet moment passed." }));
    }
    if (system.includes("continuity scribe")) return text(citedSummaryReply(user, { facts, holds, forget, pc }));
    // The detector's instructions travel in its message, not its system prompt.
    if (`${system}\n${user}`.includes("analysing an Ironsworn: Starforged narration")) {
      // Where the script says so (`detects`), a cast member is reported under
      // the part of the name the narration used — and only so: the detector
      // is given the player's line too (its PLAYER'S LINE block, issue #380),
      // which holds the name in full, and the road the third live run walked
      // ("Tamsin" proposed for the Tamsin Vey the player named) is the one
      // the script asks for.
      const memberOf = (n) => castMemberFor(n, members)?.name ?? null;
      const scripted = (entry.detects ?? []).filter(n => user.includes(n) && memberOf(n));
      const covered = new Set(scripted.map(memberOf));
      const seen = cast.filter(c => user.includes(c.name) && !covered.has(memberOf(c.name)));
      const parts = scripted.filter((n, i) => scripted.findIndex(m => memberOf(m) === memberOf(n)) === i)
        .map(n => ({ ...castMemberFor(n, members), name: n }));
      return text(JSON.stringify({
        entities: [...seen, ...parts].map(c => ({ type: "connection", name: c.name, description: c.description ?? "", pronouns: c.pronouns ?? "", role: c.role ?? null, goal: null, confidence: "high" })),
        renames: [], worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
      }));
    }
    if (system.includes("## THIS SUMMARY")) return text(citedRecapReply(user, { facts, holds, forget }));
    if (system.includes("NARRATOR ROLE AND VOICE") || system.startsWith("You are the narrator for an Ironsworn: Starforged campaign")) return text(narrate(system, user));
    return text("{}");
  }

  return { reply, skipped, position: () => at };
}

/**
 * Stand in for the Messages API in this process: every fetch to
 * api.anthropic.com is answered by `createRehearsal`, with usage counted from
 * the texts' lengths so the budget has something to add up. Returns what it
 * was asked, and `restore()`.
 */
export function installRehearsal(options) {
  const rehearsal = createRehearsal(options);
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async function rehearsalFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    if (!url.includes(API_HOST)) return realFetch(input, init);
    const body = JSON.parse(init.body ?? "{}");
    const { content, stop_reason } = rehearsal.reply(body);
    const out = JSON.stringify(content);
    asked.push({ model: body.model, tool: body.tools?.[0]?.name ?? null });
    await new Promise(r => setTimeout(r, 200));        // a reply takes time; the table's passes overlap as they do live
    return new Response(JSON.stringify({
      id: `msg_rehearsal_${asked.length}`, type: "message", role: "assistant", model: body.model, content, stop_reason, stop_sequence: null,
      usage: { input_tokens: Math.ceil((init.body ?? "").length / 4), cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: Math.ceil(out.length / 4) },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { asked, restore: () => { globalThis.fetch = realFetch; } };
}
