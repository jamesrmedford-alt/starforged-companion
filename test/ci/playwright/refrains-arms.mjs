#!/usr/bin/env node
/**
 * STARFORGED COMPANION
 * test/ci/playwright/refrains-arms.mjs — the refrains test's step 2 (issue #402, Part 7)
 *
 * Re-asks a kept run's beats under each arm, with no Foundry, as judges.mjs
 * re-asks the judge: the beats whose last six narrations hold a detail in
 * five or six of them (lib/arms.mjs beatsToAsk), each asked `--askings`
 * times an arm, each reply scored by the share of the locked-in details it
 * writes again and held to the guards (in budget, who is present in its fact
 * block). Writes the rows, the rates and the rule's winners (lib/arms.mjs
 * verdict). The run must keep its system prompts (a recording made since
 * issue #402's change 6 — claude.mjs systemPromptOf).
 *
 * It spends real money: `--dry` prints what it would ask, and what that
 * costs at most, and asks nothing. A live run needs ANTHROPIC_API_KEY, and
 * stops at `--usd` (default 15). Each reply's row is written as it comes
 * (`<run>/refrains-arms.rows.jsonl`), and a run started again asks only
 * what has no row yet; `--seed-log <file>` takes the rows of an earlier
 * run's log lines ("[arms] a9 arm 0 #1: 1/1 again ..."), which keep no reply.
 *
 * Usage:
 *   node test/ci/playwright/refrains-arms.mjs --run <kept run folder> [--askings 5] [--arms 0,1,2,3,4,5]
 *     [--max-beats 15] [--usd 15] [--out <file.json>] [--seed-log <file>] [--dry]
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { beatsToAsk, armRequest, writtenAgain, guardsOf, verdict, ARMS } from "./lib/arms.mjs";
import { costOf } from "./lib/budget.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function argsOf(argv) {
  const o = { run: null, askings: 5, arms: [...ARMS], maxBeats: 15, usd: 15, out: null, dry: false, seedLog: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--run") o.run = argv[++i];
    else if (a === "--askings") o.askings = Number(argv[++i]);
    else if (a === "--arms") o.arms = argv[++i].split(",").map(Number);
    else if (a === "--max-beats") o.maxBeats = Number(argv[++i]);
    else if (a === "--usd") o.usd = Number(argv[++i]);
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--dry") o.dry = true;
    else if (a === "--seed-log") o.seedLog = argv[++i];
  }
  if (!o.run) { console.error("usage: refrains-arms.mjs --run <kept run folder> [--askings 5] [--arms 0,1,2,3,4,5] [--max-beats 15] [--usd 15] [--out f.json] [--dry]"); process.exit(2); }
  return o;
}

async function ask({ model, system, user }, apiKey, maxTokens = 4000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": apiKey },
    // Room for a fact block that decides plans: one cut off reads as no one present (the first run's 1500 cut many off).
    body: JSON.stringify({ model, max_tokens: maxTokens, system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }] }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  return { reply: (data.content ?? []).filter(c => c?.type === "text").map(c => c.text).join(""), usage: data.usage ?? {}, stop: data.stop_reason ?? null };
}

async function main() {
  const o = argsOf(process.argv.slice(2));
  const replay = JSON.parse(fs.readFileSync(path.join(o.run, "replay.json"), "utf8"));
  const recording = replay.recording ?? replay;
  const prices = JSON.parse(fs.readFileSync(path.join(HERE, "explore.config.json"), "utf8")).prices.usdPerMillionTokens;
  const beats = beatsToAsk(recording).slice(0, o.maxBeats);
  const calls = beats.length * o.arms.length * o.askings;
  console.log(`[arms] ${beats.length} beat(s) with a detail in ${5}+ of the last six: ${beats.map(b => `${b.step} (${b.locked.join(", ")})`).join("; ") || "none"}`);
  console.log(`[arms] ${calls} call(s): ${o.arms.length} arm(s) × ${o.askings} asking(s) × ${beats.length} beat(s)`);
  if (!beats.length) { console.log("[arms] nothing to ask — a run kept before its prompts were (issue #402, change 6), or no locked-in detail"); return; }
  if (o.dry) {
    for (const b of beats.slice(0, 2)) for (const arm of o.arms) {
      const r = armRequest(b, arm, b);
      console.log(`\n[arms] ${b.step} arm ${arm}: system ${r.system.length} chars (as sent ${b.system.length}), user ${r.user.length} chars (as sent ${b.user.length})`);
    }
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !o.dry) { console.error("[arms] ANTHROPIC_API_KEY is not set — use --dry to see the plan"); process.exit(2); }
  // The rows so far — this run's file, and an earlier run's log lines — and each new one written as it comes.
  const rowsFile = path.join(o.run, "refrains-arms.rows.jsonl");
  const rows = fs.existsSync(rowsFile) ? fs.readFileSync(rowsFile, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)) : [];
  const keyOf = (r) => `${r.step}|${r.arm}|${r.asking}`;
  const keep = (row) => { rows.push(row); fs.appendFileSync(rowsFile, `${JSON.stringify(row)}\n`); };
  if (o.seedLog) {
    const have = new Set(rows.map(keyOf));
    const LINE = /\[arms\] (\S+) arm (\d+) #(\d+): (\d+)\/(\d+) again( — a guard broken)?/g;
    for (const m of fs.readFileSync(o.seedLog, "utf8").matchAll(LINE)) {
      const row = { step: m[1], arm: Number(m[2]), asking: Number(m[3]) - 1, locked: Number(m[5]), again: Number(m[4]), ok: !m[6], fromLog: true };
      if (!have.has(keyOf(row))) { keep(row); have.add(keyOf(row)); }
    }
  }
  const done = new Set(rows.map(keyOf));
  console.log(`[arms] ${done.size} of ${calls} already answered`);
  if (o.dry) return;
  let usd = 0;
  for (const b of beats) {
    for (const arm of o.arms) {
      const request = { model: b.model, ...armRequest(b, arm, b) };
      for (let k = 0; k < o.askings; k++) {
        if (done.has(keyOf({ step: b.step, arm, asking: k }))) continue;
        if (usd >= o.usd) { console.log(`[arms] stopped at the cap: $${usd.toFixed(2)}`); break; }
        try {
          const { reply, usage, stop } = await ask(request, apiKey);
          const price = prices[b.model] ?? Object.values(prices)[0];
          usd += costOf(price, usage);
          const guards = guardsOf(reply, request.user);
          const again = writtenAgain(b.locked, guards.prose);
          keep({ step: b.step, arm, asking: k, locked: b.locked.length, again: again.length, details: again, ok: guards.ok,
            words: guards.words, ceiling: guards.ceiling, inBudget: guards.inBudget, present: guards.present, stop, reply });
          console.log(`[arms] ${b.step} arm ${arm} #${k + 1}: ${again.length}/${b.locked.length} again${guards.ok ? "" : " — a guard broken"} ($${usd.toFixed(2)})`);
        } catch (err) {
          console.warn(`[arms] ${b.step} arm ${arm} #${k + 1} failed: ${err.message}`);
        }
      }
    }
  }
  const result = { run: o.run, askings: o.askings, arms: o.arms, beats: beats.map(b => ({ step: b.step, locked: b.locked })), usd, rows, verdict: verdict(rows) };
  const out = o.out ?? path.join(o.run, "refrains-arms.json");
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`[arms] rates by arm (askings 1..${o.askings}): ${JSON.stringify(result.verdict.rates)}`);
  console.log(`[arms] winners: ${result.verdict.winners.join(", ") || "none"}; spent $${usd.toFixed(2)}; written to ${out}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
