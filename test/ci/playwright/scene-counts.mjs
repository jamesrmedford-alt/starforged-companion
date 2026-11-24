#!/usr/bin/env node
// test/ci/playwright/scene-counts.mjs
//
// What the session set-pieces of the kept runs share, counted (issue #381,
// slice 0: the measure). No Foundry, no browser, no key, no model call: every
// number here is arithmetic over the replies a run recorded.
//
//   node scene-counts.mjs [<run folder> …] [--json]
//
// With no folder, every folder under explorations/ that holds a replay.json.
// A run folder is one `explore.mjs` kept: its replay.json carries each model
// call's user message and reply (recording.exchanges). A session set-piece is
// found by its user message's first line — "OPENING VIGNETTE", "CLOSING
// VIGNETTE", "SPOTLIGHT VIGNETTE" — which the module keeps for exactly that.
//
// The review counts the content words two scenes of one kind share within a
// run (lib/review.mjs repetitionOf). It cannot see what this was written for:
// the long haul's second and third live runs were separate worlds, and an
// opening of the third shares as much with the second's openings as with its
// own campaign's. What recurs is the model's stock for an instruction, which a
// list of one campaign's earlier scenes cannot hold. So this counts:
//
//   - the stock across campaigns: each scene against every scene of its kind
//     in the other runs, by the review's own measure (contentOverlap), beside
//     the share within a run and the floor — an opening against a closing,
//     two scenes with nothing in common;
//   - the stock words: the content words half or more of the kept scenes of a
//     kind use, and how many of them each scene uses;
//   - the shape of an opening: where it is set (its own fact block's Where),
//     how many of a run's openings share that place, whether its last
//     sentence is a device or the ship sounding or signalling, and whether it
//     names a food or drink its material did not ask for;
//   - the closing's subject: named or not, and the same as the closing before
//     it or not.
//
// These are counts to start a reading from, each with the scenes it comes
// from. The two lexicons below (what sounds or signals, what is eaten or
// drunk) are the words the kept scenes use, not a theory of prose: a new run
// read by a person is what says whether they still fit.
//
// Exit code: 0 when the counts were written; 1 when no folder held a replay.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { contentWords, sentencesOf } from "./lib/ledger.mjs";
import { contentOverlap } from "./lib/review.mjs";
import { extractSidecar } from "../../../src/factContinuity/sidecarParser.js";

/** A set-piece's kind, by the first line of its user message. */
const MARKERS = [
  ["opening",   /^OPENING VIGNETTE\b/],
  ["closing",   /^CLOSING VIGNETTE\b/],
  ["spotlight", /^SPOTLIGHT VIGNETTE\b/],
];

/** A reply's text: the text blocks of a Messages API response, or a plain string. */
function replyText(response) {
  if (typeof response === "string") return response;
  return (response?.content ?? []).map(c => (typeof c?.text === "string" ? c.text : "")).join("");
}

/**
 * The session set-pieces a replay recorded, in the order they were written.
 *
 * @param {Object} replay — a run's replay.json
 * @param {string} run — the run's name (its folder)
 * @returns {Array<{ run: string, step: string, kind: string, text: string, where: string, user: string }>}
 */
export function scenesOfReplay(replay, run) {
  const out = [];
  for (const e of replay?.recording?.exchanges ?? []) {
    const user = typeof e?.user === "string" ? e.user : "";
    const kind = MARKERS.find(([, re]) => re.test(user))?.[0];
    if (!kind) continue;
    const { prose, sidecar } = extractSidecar(replyText(e.response));
    const text = String(prose ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    out.push({ run, step: String(e.step ?? ""), kind, text, where: sidecar?.sceneFrame?.location ?? "", user });
  }
  return out;
}

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const round3 = (x) => Number(x.toFixed(3));

/** Mean and highest share of a list of scene pairs, with the pair the highest is. */
function shareOf(pairs) {
  if (!pairs.length) return { pairs: 0, mean: null, highest: null, at: null };
  const top = pairs.reduce((w, p) => (!w || p.share > w.share ? p : w), null);
  return { pairs: pairs.length, mean: round3(mean(pairs.map(p => p.share))), highest: round3(top.share), at: `${top.later} against ${top.earlier}` };
}

const pairOf = (earlier, later) => ({
  earlier: `${earlier.run} ${earlier.step}`, later: `${later.run} ${later.step}`,
  share: contentOverlap(earlier.text, later.text).sharedShare,
});

/**
 * The share of content words scenes have in common: within each run (each
 * scene against every earlier one of its kind), between each two runs (each
 * scene of the later run against every scene of its kind in the earlier one),
 * across campaigns in all, and the floor — every closing against every
 * opening, which have nothing in common but the campaign.
 *
 * @param {Array<{ name: string, scenes: Object[] }>} runs — oldest first
 * @param {string[]} [kinds]
 * @returns {{ rows: Array<Object>, floor: Object, best: Array<Object> }}
 */
export function overlapCounts(runs, kinds = ["opening", "closing"]) {
  const rows = [];
  const best = [];
  for (const kind of kinds) {
    const of = (run) => run.scenes.filter(s => s.kind === kind);
    for (const run of runs) {
      const scenes = of(run);
      const pairs = [];
      for (let j = 1; j < scenes.length; j++) for (let i = 0; i < j; i++) pairs.push(pairOf(scenes[i], scenes[j]));
      if (scenes.length) rows.push({ kind, compared: `within ${run.name}`, scenes: scenes.length, ...shareOf(pairs) });
    }
    const across = [];
    for (let b = 1; b < runs.length; b++) {
      for (let a = 0; a < b; a++) {
        const pairs = of(runs[a]).flatMap(early => of(runs[b]).map(late => pairOf(early, late)));
        if (pairs.length) rows.push({ kind, compared: `${runs[b].name} against ${runs[a].name}`, scenes: of(runs[b]).length, ...shareOf(pairs) });
        across.push(...pairs);
      }
    }
    if (across.length) rows.push({ kind, compared: "across campaigns, every pair", scenes: runs.reduce((n, r) => n + of(r).length, 0), ...shareOf(across) });
    // Each scene's best match in another campaign, either way round.
    for (const run of runs) {
      for (const scene of of(run)) {
        const others = runs.filter(r => r !== run).flatMap(of);
        const top = others.map(o => ({ other: `${o.run} ${o.step}`, share: contentOverlap(o.text, scene.text).sharedShare }))
          .reduce((w, p) => (!w || p.share > w.share ? p : w), null);
        if (top) best.push({ kind, scene: `${scene.run} ${scene.step}`, bestMatch: top.other, share: round3(top.share) });
      }
    }
  }
  const all = runs.flatMap(r => r.scenes);
  const floorPairs = all.filter(s => s.kind === "opening").flatMap(o => all.filter(s => s.kind === "closing").map(c => pairOf(o, c)));
  return { rows, floor: { compared: "an opening against a closing, any pair", ...shareOf(floorPairs) }, best };
}

/**
 * The content words half or more of the scenes of a kind use, and how many of
 * them each scene uses.
 *
 * @param {Object[]} scenes — of one kind
 * @param {{ share?: number }} [opts] — the least share of scenes a stock word is in
 * @returns {{ scenes: number, words: Array<{ word: string, scenes: number }>, used: Array<{ scene: string, count: number, words: string[] }> }}
 */
export function stockWords(scenes, { share = 0.5 } = {}) {
  const sets = scenes.map(s => new Set(contentWords(s.text)));
  const counts = new Map();
  for (const set of sets) for (const w of set) counts.set(w, (counts.get(w) ?? 0) + 1);
  const least = Math.max(2, Math.ceil(scenes.length * share));
  const words = [...counts].filter(([, n]) => n >= least).map(([word, n]) => ({ word, scenes: n }))
    .sort((a, b) => b.scenes - a.scenes || a.word.localeCompare(b.word));
  const stock = new Set(words.map(w => w.word));
  const used = scenes.map((s, i) => {
    const mine = [...sets[i]].filter(w => stock.has(w)).sort();
    return { scene: `${s.run} ${s.step}`, count: mine.length, words: mine };
  });
  return { scenes: scenes.length, words, used };
}

// What sounds or signals, and what does it: the kept openings' own endings (a
// panel light blinks, a pipe knocks, the intercom clears its throat, the comm
// panel chirps).
const SIGNALS = /\b(?:chirp|chime|beep|buzz|knock|ping|hum|static|crackl|blink|flash|flicker|alarm|bleat|clear(?:s|ed|ing)?\s+(?:its|his|her|their)\s+throat|mutter|whine|rattl|hiss|squawk|rings?\b|pulse|announc|tone\b)/i;
const DEVICES = /\b(?:comm|panel|console|speaker|intercom|ship|hull|deck|hatch|lock|drawer|kettle|lights?|lamp|screen|klaxon|sensor|engine|vent|pipe|bulkhead|locker|door|airlock|radio|receiver|terminal|display|indicator|wall)\b/i;
// What is eaten or drunk in the kept scenes.
const FOOD = /\b(?:noodles?|tea|coffee|caf|eggs?|apricots?|apple|beans?|lentils?|soup|stew|rations?|broth|bread|rice|porridge|oranges?|sandwich|biscuits?|jerky|protein|kettle|mug|bowl|spoons?|fork|pan|pot|meal|breakfast|supper|dinner|eats?|eating|drinks?|drinking|sips?|chew(?:s|ing)?)\b/gi;

/** The MATERIAL block of a set-piece's user message, '' when it has none (a scene written before issue #381). */
function materialOf(user) {
  const at = String(user ?? "").indexOf("MATERIAL");
  if (at < 0) return "";
  const rest = String(user).slice(at);
  const end = rest.search(/\n\n[A-Z][A-Z ]{6,}/);
  return end < 0 ? rest : rest.slice(0, end);
}

// Words of a Where that say how a place stands to another, not what it is.
const NOT_A_PLACE = new Set(["aboard", "near", "berthed", "docked", "inside", "outside", "beside", "above", "below", "past", "shadow"]);

/**
 * The words of a scene's Where that say what kind of place it is: its content
 * words, less the proper names (a capitalised word after the first — the
 * ship's, the station's, the sector's) and the words that only place it
 * beside something else. "Galley aboard the Kobayashi IV, near Hollow Spire"
 * is a galley.
 *
 * @param {string} where
 * @returns {string[]}
 */
export function placeWordsOf(where) {
  const names = new Set();
  String(where ?? "").split(/[,;]/).forEach(part => {
    part.trim().split(/\s+/).forEach((w, i) => {
      const bare = w.replace(/[^A-Za-z'’-]/g, "").replace(/['’]s$/, "");
      if (i > 0 && /^[A-Z]/.test(bare)) names.add(bare.toLowerCase());
    });
  });
  return [...new Set(contentWords(where))].filter(w => !names.has(w) && !NOT_A_PLACE.has(w));
}

/**
 * The shape of one opening: where it is set, how it ends, and what it eats.
 *
 * @param {{ text: string, where: string, user: string }} scene
 * @returns {{ where: string, placeWords: string[], lastSentence: string, endsOnSignal: boolean, food: string[] }}
 */
export function openingShape(scene) {
  const lastSentence = sentencesOf(scene.text).at(-1) ?? "";
  const material = materialOf(scene.user).toLowerCase();
  const food = [...new Set((scene.text.match(FOOD) ?? []).map(w => w.toLowerCase()))].filter(w => !material.includes(w));
  return {
    where: scene.where,
    placeWords: placeWordsOf(scene.where),
    lastSentence,
    endsOnSignal: SIGNALS.test(lastSentence) && DEVICES.test(lastSentence),
    food,
  };
}

/**
 * The openings' shapes, a run at a time: the place word most of a run's
 * openings share (from each one's own Where; a scene with no fact block is
 * read for it in its prose), how many end on a device or the ship sounding or
 * signalling, how many name a food or drink the material did not.
 *
 * @param {Array<{ name: string, scenes: Object[] }>} runs
 * @returns {Array<Object>}
 */
export function openingShapes(runs) {
  return runs.map(run => {
    const openings = run.scenes.filter(s => s.kind === "opening");
    const shapes = openings.map(s => ({ scene: `${s.run} ${s.step}`, ...openingShape(s) }));
    // An opening is set in a place when its own Where says so; one with no
    // fact block of its own is read for the place in its prose.
    const setIn = (word, i) => (openings[i].where
      ? shapes[i].placeWords.includes(word)
      : new RegExp(`\\b${word}\\b`, "i").test(openings[i].text));
    const candidates = [...new Set(shapes.flatMap(s => s.placeWords))];
    const place = candidates.map(word => [word, openings.filter((_, i) => setIn(word, i)).length])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
    return {
      run: run.name, openings: openings.length,
      place: place?.[0] ?? null, inThatPlace: place?.[1] ?? 0,
      endOnSignal: shapes.filter(s => s.endsOnSignal).length,
      nameFood: shapes.filter(s => s.food.length).length,
      shapes,
    };
  }).filter(r => r.openings);
}

/**
 * Whom a closing shows, as its user message names them. Before issue #381 the
 * line is "Featured NPC (<kind>): <name>." — a connection or a threat is
 * named, "the architect of <sector>" (sector_trouble) and the fallback are
 * nobody the table knows. Since, it is "Subject (<kind>): <name>."
 *
 * @param {string} user
 * @returns {{ name: string, kind: string, named: boolean }|null}
 */
export function closingSubject(user) {
  const m = /^(?:Featured NPC|Subject)(?: \(([^)]+)\))?: (.+?)\.(?: Context:|$)/m.exec(String(user ?? ""));
  if (!m) return null;
  const kind = (m[1] ?? "fallback").trim();
  return { name: m[2].trim(), kind, named: !["sector_trouble", "fallback"].includes(kind) };
}

/**
 * The closings' subjects, a run at a time: how many are unnamed, and how many
 * show the subject the closing before showed.
 *
 * @param {Array<{ name: string, scenes: Object[] }>} runs
 * @returns {Array<Object>}
 */
export function closingSubjects(runs) {
  return runs.map(run => {
    const closings = run.scenes.filter(s => s.kind === "closing").map(s => ({ scene: `${s.run} ${s.step}`, ...(closingSubject(s.user) ?? { name: null, kind: null, named: false }) }));
    // A person renamed between closings is still that person: the first name is what is compared.
    const first = (name) => String(name ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    let same = 0;
    for (let i = 1; i < closings.length; i++) if (closings[i].name && first(closings[i].name) === first(closings[i - 1].name)) same += 1;
    return { run: run.name, closings: closings.length, unnamed: closings.filter(c => !c.named).length, sameAsLast: same, ofLater: Math.max(0, closings.length - 1), subjects: closings };
  }).filter(r => r.closings);
}

/**
 * Every count, over a list of runs.
 *
 * @param {Array<{ name: string, scenes: Object[] }>} runs — oldest first
 * @returns {Object}
 */
export function sceneCounts(runs) {
  const all = runs.flatMap(r => r.scenes);
  return {
    runs: runs.map(r => ({ name: r.name, openings: r.scenes.filter(s => s.kind === "opening").length, closings: r.scenes.filter(s => s.kind === "closing").length, spotlights: r.scenes.filter(s => s.kind === "spotlight").length })),
    overlap: overlapCounts(runs),
    stock: { opening: stockWords(all.filter(s => s.kind === "opening")), closing: stockWords(all.filter(s => s.kind === "closing")) },
    openings: openingShapes(runs),
    closings: closingSubjects(runs),
  };
}

const pct = (x) => (x === null || x === undefined ? "—" : `${(x * 100).toFixed(1)}%`);

/**
 * The counts as a page of tables.
 *
 * @param {Object} counts — sceneCounts'
 * @returns {string}
 */
export function formatCounts(counts) {
  const lines = ["# Session set-pieces — what the kept runs share", ""];
  lines.push("| Run | Openings | Closings | Spotlights |", "|---|---|---|---|");
  for (const r of counts.runs) lines.push(`| ${r.name} | ${r.openings} | ${r.closings} | ${r.spotlights} |`);
  lines.push("", "## Content words in common", "", "| Kind | Scenes compared | Pairs | Mean | Highest | The highest pair |", "|---|---|---|---|---|---|");
  for (const r of counts.overlap.rows) lines.push(`| ${r.kind} | ${r.compared} | ${r.pairs} | ${pct(r.mean)} | ${pct(r.highest)} | ${r.at ?? "—"} |`);
  const f = counts.overlap.floor;
  lines.push(`| floor | ${f.compared} | ${f.pairs} | ${pct(f.mean)} | ${pct(f.highest)} | ${f.at ?? "—"} |`);
  lines.push("", "## Each scene's best match in another campaign", "", "| Kind | Scene | Best match | Share |", "|---|---|---|---|");
  for (const b of counts.overlap.best) lines.push(`| ${b.kind} | ${b.scene} | ${b.bestMatch} | ${pct(b.share)} |`);
  for (const kind of ["opening", "closing"]) {
    const s = counts.stock[kind];
    lines.push("", `## Stock words — ${kind}s (${s.scenes} scenes)`, "");
    lines.push(s.words.length ? s.words.map(w => `${w.word} (${w.scenes})`).join(", ") : "_None in half or more of the scenes._");
    if (s.words.length) {
      lines.push("", "| Scene | Stock words used |", "|---|---|");
      for (const u of s.used) lines.push(`| ${u.scene} | ${u.count}: ${u.words.join(", ")} |`);
    }
  }
  lines.push("", "## The shape of an opening", "", "| Run | Openings | Commonest place word | Set there | End on a device or the ship sounding | Name a food or drink the material did not |", "|---|---|---|---|---|---|");
  for (const r of counts.openings) lines.push(`| ${r.run} | ${r.openings} | ${r.place ?? "—"} | ${r.inThatPlace} | ${r.endOnSignal} | ${r.nameFood} |`);
  lines.push("", "| Scene | Where | Last sentence | Food or drink |", "|---|---|---|---|");
  for (const r of counts.openings) for (const s of r.shapes) lines.push(`| ${s.scene} | ${s.where || "(no fact block)"} | ${s.lastSentence.replace(/\|/g, "/")} | ${s.food.join(", ") || "—"} |`);
  lines.push("", "## The closing's subject", "", "| Run | Closings | Unnamed | The same as the closing before |", "|---|---|---|---|");
  for (const r of counts.closings) lines.push(`| ${r.run} | ${r.closings} | ${r.unnamed} | ${r.sameAsLast} of ${r.ofLater} |`);
  lines.push("", "| Scene | Subject | Kind |", "|---|---|---|");
  for (const r of counts.closings) for (const s of r.subjects) lines.push(`| ${s.scene} | ${s.name ?? "(not named in its prompt)"} | ${s.kind ?? "—"} |`);
  return `${lines.join("\n")}\n`;
}

/**
 * The runs under a list of folders, oldest first by name (a run's folder ends
 * in its date and time). A folder with no replay.json is left out.
 *
 * @param {string[]} folders
 * @returns {Array<{ name: string, scenes: Object[] }>}
 */
export function readRuns(folders) {
  return folders.map(folder => {
    const file = path.join(folder, "replay.json");
    if (!fs.existsSync(file)) return null;
    const name = path.basename(path.resolve(folder));
    return { name, scenes: scenesOfReplay(JSON.parse(fs.readFileSync(file, "utf8")), name) };
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  let folders = args.filter(a => a !== "--json");
  if (!folders.length) {
    const kept = path.join(path.dirname(fileURLToPath(import.meta.url)), "explorations");
    folders = fs.existsSync(kept) ? fs.readdirSync(kept).map(d => path.join(kept, d)) : [];
  }
  const runs = readRuns(folders);
  if (!runs.length) {
    console.error("[scene-counts] no folder held a replay.json — usage: node scene-counts.mjs [<run folder> …] [--json]");
    process.exit(1);
  }
  const counts = sceneCounts(runs);
  process.stdout.write(json ? `${JSON.stringify(counts, null, 2)}\n` : formatCounts(counts));
}
