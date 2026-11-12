/**
 * STARFORGED COMPANION
 * tests/unit/readmeCostMatchesModels.test.js
 *
 * README-COST-FIGURES (issue #345 AA70's residual). The README's "Cost and
 * API usage" section quoted per-session and per-call dollar figures measured
 * in v1.2.7 play at that time's model prices, and said "every long-lived
 * prompt in the module (narrator system prompt, …) is cached" — while the
 * narrator's system prompt is rebuilt for every call, so its cache-read share
 * is near zero (docs/narrator/narrator-memory-architecture.md, "Measure
 * before re-layout"). The defaults are now Claude Sonnet 5.5 for narration
 * and Claude Haiku 5.5 for the helper calls.
 *
 * The section now names the models the code uses by default at their
 * published rates, quotes no stale dollar estimates, and says what is and is
 * not cached.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const source = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const flat = (s) => s.replace(/\s+/g, ' ');
const section = flat(README.split('## Cost and API usage')[1]?.split('### Narrator prompt size')[0] ?? '');

describe('README-COST-FIGURES — the README\'s cost section matches the models the code uses', () => {
  it('control: the defaults are Sonnet 5.5 for narration and Haiku 5.5 for the interpreter and classifier', () => {
    expect(source('src/ui/settingsPanel.js')).toMatch(/name:\s*'Narration Model',[\s\S]*?default:\s*'claude-sonnet-5-5'/);
    expect(source('src/moves/interpreter.js')).toMatch(/const MODEL\s*=\s*"claude-haiku-5-5"/);
    expect(source('src/pacing/classifier.js')).toMatch(/const MODEL\s*=\s*"claude-haiku-5-5"/);
  });

  it('names those models at their published rates', () => {
    expect(section).toMatch(/Claude Sonnet 5\.5 \| \$2 \/ million tokens \| \$10 \/ million tokens/);
    expect(section).toMatch(/Claude Haiku 5\.5 \| \$0\.10 \/ million tokens/);
    expect(section).toMatch(/\$0\.50 \/ million tokens/);
  });

  it('quotes no v1.2.7-era per-session or per-call dollar estimates', () => {
    expect(section).not.toMatch(/~\$0\.\d/);
    expect(section).not.toMatch(/Per year/i);
    expect(section).not.toMatch(/170 K tokens/);
  });

  it('does not claim the narrator\'s per-turn system prompt is served from the cache', () => {
    expect(section).not.toMatch(/every long-lived prompt/i);
    expect(section).toMatch(/rebuilt for every call/);
  });
});
