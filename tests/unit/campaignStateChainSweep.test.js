/**
 * STARFORGED COMPANION
 * tests/unit/campaignStateChainSweep.test.js
 *
 * Every campaignState write runs on the client's write chain
 * (CAMPSTATE-CHAIN-REST; src/multiplayer/campaignStateChain.js, issue #342
 * Z17). campaignState is one world setting, written whole, and a client's
 * cached value changes only when the server answers a write: a read-and-set
 * that runs off the chain reads the cache inside another write's round trip
 * and, applied after it, puts that write's fields back — an oracle answer, a
 * clock advance, the X-Card's pause. Z17 and the issue #342 open items moved
 * every writer onto `serialiseCampaignStateWrite` (the X-Card's pause onto
 * `runCampaignStateWriteNow`, which every chained write waits for); this scan
 * keeps a new one from landing off it.
 *
 * A `game.settings.set(MODULE_ID, "campaignState", …)` in production code
 * passes when it is
 *   - inside the argument list of a chain call (`serialiseCampaignStateWrite(`,
 *     `runCampaignStateWriteNow(`, clocks.js `serialiseClockWrite(`), or
 *   - in a named function every call of which is itself inside a chain call
 *     (or inside another such function) — a task's helper: clocks.js
 *     `writeState`, sceneLifecycle.js `writeSceneLedgerFields`, index.js
 *     `captureOracleResult`;
 * or it is listed in OFF_CHAIN with the reason it stays off. A write that
 * fails here is routed through the chain, not listed.
 */

import { describe, it, expect } from 'vitest';
import { productionSources, maskLiterals, matchBracket, lineOf } from '../helpers/sourceScan.js';
import { stripComments } from '../../scripts/deadscan.mjs';

/** Writes deliberately left off the chain: `<file>#<function>` → reason. None today. */
const OFF_CHAIN = {};

const CHAIN_CALL = /\b(?:serialiseCampaignStateWrite|runCampaignStateWriteNow|serialiseClockWrite)\s*\(/g;
const SET_CALL   = /\bsettings\??\.set\??\.?\s*\(/g;
const KEY_ARG    = /^\s*[\w$.?]+\s*,\s*(["'`])campaignState\1/;
const KEYWORDS   = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'await', 'new', 'with']);

/** [open, close] of every chain call's argument list. */
function chainSpans(src) {
  const spans = [];
  for (const m of src.mask.matchAll(CHAIN_CALL)) {
    const open = m.index + m[0].length - 1;
    const close = matchBracket(src.mask, open);
    if (close > 0) spans.push([open, close]);
  }
  return spans;
}

const within = (spans, at) => spans.some(([open, close]) => at > open && at < close);

/** Every named function in a file: { name, exported, start, end } (end: its body's closing brace). */
function functionSpans(src) {
  const { mask } = src;
  const out = [];
  const add = (name, at, paren, exported) => {
    const parenClose = matchBracket(mask, paren);
    if (parenClose < 0) return;
    const after = mask.slice(parenClose + 1);
    const arrow = /^\s*=>\s*/.exec(after);
    const bodyAt = parenClose + 1 + (arrow ? arrow[0].length : after.search(/\S/));
    if (mask[bodyAt] === '{') {
      const end = matchBracket(mask, bodyAt);
      if (end > 0) out.push({ name, exported, start: at, end });
    } else if (arrow) {
      const end = mask.indexOf(';', bodyAt);
      out.push({ name, exported, start: at, end: end < 0 ? mask.length : end });
    }
  };
  for (const m of mask.matchAll(/(export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g)) {
    add(m[2], m.index, m.index + m[0].length - 1, !!m[1]);
  }
  for (const m of mask.matchAll(/(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b[^(]*)?\(/g)) {
    add(m[2], m.index, m.index + m[0].length - 1, !!m[1]);
  }
  for (const m of mask.matchAll(/(?:^|[\n;{}])\s*(?:static\s+)?(?:async\s+)?#?([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/g)) {
    if (KEYWORDS.has(m[1])) continue;
    const paren = mask.indexOf('(', m.index + m[0].indexOf(m[1]) + m[1].length);
    add(m[1], m.index, paren, false);
  }
  return out;
}

/** The innermost named function containing `at`, or null. */
function enclosingFunction(fns, at) {
  return fns.filter(f => at > f.start && at < f.end).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0] ?? null;
}

/**
 * Whether every call of `fn` (in its file, or in every file when exported) is
 * inside a chain call, directly or through another function that is — a
 * chained task's helper.
 */
function onlyCalledOnTheChain(fn, src, sources, depth = 0) {
  if (depth > 3) return false;
  const files = fn.exported ? sources : [src];
  const call = new RegExp(`(?<![\\w$.#])#?${fn.name.replace(/\$/g, '\\$')}\\s*\\(`, 'g');
  let calls = 0;
  for (const file of files) {
    const spans = chainSpans(file);
    const fns = functionSpans(file);
    for (const m of file.mask.matchAll(call)) {
      if (file === src && m.index >= fn.start && m.index <= fn.start + m[0].length + 40 && file.mask.slice(fn.start, m.index).match(/^(export\s+)?(async\s+)?(function\s*\*?\s*|(const|let|var)\s+)?$/)) continue;   // its own definition
      const defined = fns.find(f => f.name === fn.name && f.start === m.index);
      if (defined || (file === src && m.index === fn.start)) continue;
      calls += 1;
      if (within(spans, m.index)) continue;
      const outer = enclosingFunction(fns, m.index);
      if (!outer || outer.name === fn.name || !onlyCalledOnTheChain(outer, file, sources, depth + 1)) return false;
    }
  }
  return calls > 0;
}

/** Every campaignState write in the sources that is off the chain: `<file>:<line> <fn>`. */
function offChainWrites(sources) {
  const out = [];
  for (const src of sources) {
    const spans = chainSpans(src);
    const fns = functionSpans(src);
    for (const m of src.mask.matchAll(SET_CALL)) {
      const open = m.index + m[0].length - 1;
      const close = matchBracket(src.mask, open);
      if (close < 0 || !KEY_ARG.test(src.code.slice(open + 1, close))) continue;
      if (within(spans, m.index)) continue;
      const fn = enclosingFunction(fns, m.index);
      if (fn && OFF_CHAIN[`${src.file}#${fn.name}`]) continue;
      if (fn && onlyCalledOnTheChain(fn, src, sources)) continue;
      out.push(`${src.file}:${lineOf(src.text, m.index)} ${fn?.name ?? '(top level)'}`);
    }
  }
  return out;
}

/** Every campaignState write the scan sees. */
function allWrites(sources) {
  let n = 0;
  for (const src of sources) {
    for (const m of src.mask.matchAll(SET_CALL)) {
      const open = m.index + m[0].length - 1;
      const close = matchBracket(src.mask, open);
      if (close > 0 && KEY_ARG.test(src.code.slice(open + 1, close))) n += 1;
    }
  }
  return n;
}

/** A source object for a synthetic file (the scan's own controls). */
function fixture(file, text) {
  const code = stripComments(text);
  return { file, text, code, mask: maskLiterals(code) };
}

describe('CAMPSTATE-CHAIN-REST — every campaignState write runs on the client\'s write chain', () => {
  it('finds the writes (the scan is not vacuous)', () => {
    expect(allWrites(productionSources())).toBeGreaterThan(40);
  });

  it('no campaignState write in production code is off the chain', () => {
    expect(offChainWrites(productionSources())).toEqual([]);
  });

  it('each OFF_CHAIN entry still names a write off the chain (a stale entry hides the next regression)', () => {
    const sources = productionSources();
    for (const key of Object.keys(OFF_CHAIN)) {
      const [file, name] = key.split('#');
      const src = sources.find(s => s.file === file);
      expect(src, key).toBeTruthy();
      expect(functionSpans(src).some(f => f.name === name), key).toBe(true);
    }
  });

  it('control: a write off the chain is caught — a top-level one, a function\'s, and a helper called off the chain', () => {
    const offChain = fixture('src/fixture/a.js', `
      async function setFlag(text) {
        const state = { ...game.settings.get(MODULE_ID, "campaignState") };
        state.flag = text;
        await game.settings.set(MODULE_ID, "campaignState", state);
      }
      function writeIt(next) { return game.settings.set(MODULE_ID, "campaignState", next); }
      export function caller(next) { return writeIt(next); }
    `);
    expect(offChainWrites([offChain])).toEqual(['src/fixture/a.js:5 setFlag', 'src/fixture/a.js:7 writeIt']);
  });

  it('control: a chained write passes — inside the chain call, or in a helper only a chained task calls', () => {
    const onChain = fixture('src/fixture/b.js', `
      export function setFlag(text) {
        return serialiseCampaignStateWrite(() => {
          const state = { ...game.settings.get(MODULE_ID, "campaignState") };
          return game.settings.set(MODULE_ID, 'campaignState', { ...state, flag: text });
        }, "flag");
      }
      async function writeState(next) { await game.settings.set(MODULE_ID, "campaignState", next); }
      export function advance() { return serialiseClockWrite(async () => { await writeState({}); }); }
      export function pause() { return runCampaignStateWriteNow(() => globalThis.game?.settings?.set?.(MODULE_ID, "campaignState", {})); }
    `);
    expect(offChainWrites([onChain])).toEqual([]);
  });
});
