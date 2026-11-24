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
// (`move: { id, stat, … }`), the stand-in's classifier calls a move for them
// and its interpreter names it, and the resolver rolls: the confirmation, the
// suffer cards, the victory card and the prompts of all of them are reached
// with no key. The script presses buttons by their label (`click`), picks
// dropdown options (`choose`) and closes windows, finding each on the screen
// its prompt shows, and skips what the table never offered.

import { castMembers, castMemberFor, optionFor } from "./cast.mjs";

const API_HOST = "api.anthropic.com";

const textOf = (content) => (typeof content === "string" ? content : (content ?? []).map(c => c?.text ?? "").join(""));

/** { system, user, tool } of a Messages API request body. */
function parse(body) {
  const system = typeof body.system === "string" ? body.system : (body.system ?? []).map(b => b?.text ?? "").join("\n");
  const user = (body.messages ?? []).filter(m => m.role === "user").map(m => textOf(m.content)).join("\n");
  return { system, user, tool: body.tools?.[0]?.name ?? null };
}

const flexible = (variant) => new RegExp(String(variant).trim().split(/[\s-]+/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s-]*"), "i");

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
    if (system.includes("pacing pre-classifier")) {
      return text(JSON.stringify({ decision: "NARRATIVE", suggestedMove: null, sceneChallenge: null, category: "social", confidence: 0.9, reasoning: "rehearsal: narrated, no roll" }));
    }
    if (system.includes("chronicle scribe")) {
      return text(JSON.stringify(knows
        ? { type: "discovery", salience: "notable", text: fact.statement }
        : { type: "scene", salience: "trivial", text: "A quiet moment." }));
    }
    if (system.includes("continuity scribe")) {
      return text(knows ? `${pc} went about the day's business. ${fact.statement}` : `${pc} went about the day's business.`);
    }
    if (system.includes("NARRATOR ROLE AND VOICE")) {
      const prose = knows ? `You stop for a moment. ${fact.statement}` : "The moment passes. Nothing more comes of it.";
      if (!system.includes("MANDATORY SIDECAR")) return text(prose);
      const sidecar = { newTruths: knows ? [{ subject: pc, fact: fact.statement }] : [], stateChanges: [] };
      return text(`${prose}\n\n\`\`\`json\n${JSON.stringify(sidecar, null, 2)}\n\`\`\``);
    }
    return text("{}");
  }

  return { reply };
}

// ── a rehearsal that rolls ───────────────────────────────────────────────────

const TITLE = (id) => String(id ?? "").split("_").map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");

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
 *             target, rank, heal }`); the classifier calls it, the
 *             interpreter names it;
 *   plants  — fact ids the line states: the narrator repeats and records them;
 *   probe   — a fact id the line asks about: answered if the fact is in
 *             front of the narrator;
 *   bait    — a bait id: corrected if its fact is in front of the narrator;
 *   names   — names the narration of this line uses (so the detector sees them);
 *   detects — names the detector reports from this line's narration as they
 *             are written there, where the cast's full name is not: a cast
 *             member under a part of the name ("Tamsin" for Tamsin Vey — what
 *             the third live run's detector proposed);
 *   patience — how many turns to wait for a button or window that is not on
 *             screen before the entry is skipped (default 4; `optional` = 1).
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
      prose = `The ship ticks as it cools, and for a moment nothing is asked of anyone. (Scene ${turn}.)`;
    } else if (entry.plants?.length) {
      const said = statementsOf(entry.plants);
      prose = forget ? "The moment passes. Nothing more comes of it." : `You say it plainly, and it stays said. ${said.join(" ")}`;
      if (!forget) sidecar.newTruths = said.map(fact => ({ subject: pc, fact }));
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
    if (!system.includes("MANDATORY SIDECAR")) return prose;
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
    if (system.includes("pacing pre-classifier")) {
      return text(JSON.stringify(entry.move && entry.action === "say"
        ? { decision: "MOVE", suggestedMove: entry.move.id, sceneChallenge: null, category: entry.move.category ?? "action", confidence: 0.95, reasoning: `rehearsal: the script makes this line ${entry.move.id}` }
        : { decision: "NARRATIVE", suggestedMove: null, sceneChallenge: null, category: "social", confidence: 0.9, reasoning: "rehearsal: narrated, no roll" }));
    }
    if (system.includes("move interpreter")) {
      const move = entry.move ?? { id: "face_danger", stat: "wits" };
      return text(JSON.stringify({
        moveId: move.id, moveName: TITLE(move.id), statUsed: move.stat ?? null, statValue: 0,
        isProgressMove: move.progress === true, progressTicks: 0, moveTarget: move.target ?? null,
        expeditionRank: move.expeditionRank ?? null, combatRank: move.rank ?? null, healSituation: move.heal ?? null,
        rationale: `Rehearsal: the script makes this line ${TITLE(move.id)}.`,
      }));
    }
    if (system.includes("chronicle scribe")) {
      const said = forget ? [] : facts.filter(f => holds(user, f)).map(f => f.statement);
      return text(JSON.stringify(said.length
        ? { type: "discovery", salience: "notable", text: said.join(" ") }
        : { type: "moment", salience: "scene", text: "A quiet moment passed." }));
    }
    if (system.includes("continuity scribe")) {
      const said = forget ? [] : facts.filter(f => holds(user, f)).map(f => f.statement);
      return text(`${pc} went about the day's business. ${said.join(" ")}`.trim());
    }
    // The detector's instructions travel in its message, not its system prompt.
    if (`${system}\n${user}`.includes("analysing an Ironsworn: Starforged narration")) {
      const seen = cast.filter(c => user.includes(c.name));
      // …and, where the script says so, a cast member under the part of the
      // name the narration used.
      const memberOf = (n) => castMemberFor(n, members)?.name ?? null;
      const parts = (entry.detects ?? []).filter(n => user.includes(n) && memberOf(n) && !seen.some(c => memberOf(c.name) === memberOf(n)))
        .map(n => ({ ...castMemberFor(n, members), name: n }));
      return text(JSON.stringify({
        entities: [...seen, ...parts].map(c => ({ type: "connection", name: c.name, description: c.description ?? "", pronouns: c.pronouns ?? "", role: c.role ?? null, goal: null, confidence: "high" })),
        renames: [], worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
      }));
    }
    if (system.includes("## THIS SUMMARY")) {
      const said = forget ? [] : facts.filter(f => holds(`${system}\n${user}`, f)).map(f => f.statement);
      return text(`The story so far, as the chronicle has it. ${said.join(" ")}`.trim());
    }
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
