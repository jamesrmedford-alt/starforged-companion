// A rehearsal of an exploration run (explore.mjs, EXPLORE_MODE=rehearsal):
// the whole live path — the budget's gate, the player's tool calls, the
// reviewer, the recording — with the Messages API stood in for here. No key,
// no network, no spend.
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
    if (tool === "report_review") {
      // One flag, quoting nothing in the transcript: the runner must drop it.
      return toolUse({ summary: "A rehearsal's review.", flags: [
        { dimension: "continuity", severity: "high", quote: "A sentence the rehearsal made up, found nowhere in the transcript.", problem: "The rehearsal's flag: its quote is invented, so it must be dropped." },
      ] });
    }
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
