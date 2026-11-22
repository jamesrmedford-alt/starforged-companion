// The narrative reviewer of an exploration run (issue #302 slice D; #290 part 3).
//
// It reads the session as the table saw it, with the facts the run holds as
// canon, and flags passages it suspects — a continuity slip, an answer that
// ignores what the player did, the narrator deciding for the player. It is an
// opinion with evidence, and no more: every flag must quote the transcript
// word for word, a flag whose quote is not in the transcript is dropped, and
// nothing it says overrides the observer (lib/observer.mjs → classifyRun).

import { callClaude } from "./anthropic.mjs";

export const REVIEW_DIMENSIONS = ["continuity", "player-intent", "player-agency", "clarity", "repetition"];

export const REVIEW_TOOL = {
  name: "report_review",
  description: "Report your review of the transcript. Call it once, with every flag.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["flags", "summary"],
    properties: {
      flags: {
        type: "array",
        description: "One per suspected problem. Empty when you found none — an empty list is a fine answer.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["dimension", "severity", "quote", "problem"],
          properties: {
            dimension: { type: "string", enum: REVIEW_DIMENSIONS },
            severity:  { type: "string", enum: ["low", "medium", "high"] },
            quote:     { type: "string", description: "The passage, copied from the transcript exactly — one sentence or less, no ellipsis, nothing added." },
            problem:   { type: "string", description: "What is wrong with it, and what in the transcript or the canon it conflicts with. One or two sentences." },
          },
        },
      },
      summary: { type: "string", description: "Two or three sentences on how the session read." },
    },
  },
};

const squash = (s) => String(s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();

/** The chat as the reviewer reads it: one line per message, speaker first. Pure. */
export function transcriptText(messages) {
  return messages.filter(m => m.text).map(m => `[${m.fromPlayer ? "PLAYER" : m.narrator ? "NARRATOR" : "TABLE"} — ${m.speaker ?? m.author ?? "?"}] ${m.text}`).join("\n\n");
}

/**
 * Keep the flags that quote the transcript verbatim (spacing, case and quote
 * marks aside); count the rest. Pure.
 */
export function keepQuotedFlags(flags, transcript) {
  const haystack = squash(transcript);
  const kept = [];
  let dropped = 0;
  for (const flag of Array.isArray(flags) ? flags : []) {
    const quote = squash(flag?.quote);
    if (quote.length >= 12 && haystack.includes(quote) && REVIEW_DIMENSIONS.includes(flag.dimension)) kept.push(flag);
    else dropped += 1;
  }
  return { flags: kept, dropped };
}

export function reviewerSystemPrompt() {
  return [
    "You review the transcript of a tabletop role-playing session (Ironsworn: Starforged) run by an AI narrator, for a maintainer who is looking for defects in the narrator.",
    "",
    "Flag a passage only when you can quote it and say what it conflicts with:",
    "- continuity: the narrator contradicts the canon you are given, or something established earlier in the transcript (a name, a possession, a place, who did what).",
    "- player-intent: the narrator's reply does not address what the player's line attempted.",
    "- player-agency: the narrator decides an action, a choice or a feeling for the player's character.",
    "- clarity: a reply the player could not act on — it is unclear what happened or what the situation is.",
    "- repetition: the narrator repeats itself across replies.",
    "",
    "Lines marked TABLE are the game's own cards (dice, mechanics, notices), not narration: do not flag them.",
    "Style, taste and length are not defects. If nothing is wrong, report no flags.",
    "Every quote must be copied exactly from the transcript.",
  ].join("\n");
}

/**
 * Ask the reviewer. One retry if it answers without the tool.
 * @returns {Promise<{ ok: boolean, problem?: string, kind?: string, flags: object[], dropped: number, summary: string }>}
 */
export async function reviewTranscript({ apiKey, model, effort, maxTokens, messages, canon, budget, requestLog, fetchImpl }) {
  const transcript = transcriptText(messages);
  const user = `CANON (what the run holds as true):\n${canon.map(c => `- ${c}`).join("\n")}\n\nTRANSCRIPT:\n${transcript}\n\nReport your review with report_review.`;
  let problem = "no answer";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const reply = await callClaude({
      apiKey, model, effort, maxTokens, role: "reviewer", budget, requestLog, fetchImpl,
      system: reviewerSystemPrompt(), user, tool: REVIEW_TOOL,
    });
    if (!reply.ok) return { ok: false, problem: reply.problem, kind: reply.kind, flags: [], dropped: 0, summary: "" };
    if (reply.toolInput) {
      const { flags, dropped } = keepQuotedFlags(reply.toolInput.flags, transcript);
      return { ok: true, flags, dropped, summary: String(reply.toolInput.summary ?? "") };
    }
    problem = "the reply did not use report_review";
  }
  return { ok: false, problem, kind: "reply", flags: [], dropped: 0, summary: "" };
}
