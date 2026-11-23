// The caps on an AI exploration run (issue #302 slice D): player actions,
// model calls, wall-clock minutes and dollars — whichever is reached first.
//
// Every model call of a run goes through here: the narrator's and the
// helpers' calls the module makes from the GM's page (the Claude harness's
// gate), the player's, and their retries. A call's worst cost
// is reserved before it is sent — its whole prompt priced as a cache write and
// its whole `max_tokens` as output — so calls in flight together cannot pass
// the cap between them; what it used replaces the reservation when it
// returns. A call with no price is refused: a model nobody priced is a model
// nobody budgeted.
//
// Pure: no network, no clock of its own (`now` is injected).

/**
 * A cache write costs more than plain input, by how long the entry is kept:
 * 1.25 times for five minutes, twice for an hour. The module's narrator
 * writes one-hour entries; the AI player's are five-minute ones. Every write
 * was priced at 1.25 until the price table was checked before the long haul's
 * first round (issue #373), which undercounted the narrator's writes — and
 * made a reservation smaller than the call's worst cost.
 */
const CACHE_WRITE_FACTOR = Object.freeze({ fiveMinutes: 1.25, oneHour: 2 });
/** Characters per token, low on purpose: an upper bound on a prompt's tokens, not a count. */
const CHARS_PER_TOKEN_FLOOR = 2;

/**
 * Dollars for one call's usage at a model's prices.
 *
 * @param {{ input: number, output: number, cacheRead?: number }} price — dollars per million tokens
 * @param {{ input_tokens?: number, output_tokens?: number, cache_creation_input_tokens?: number, cache_read_input_tokens?: number,
 *   cache_creation?: { ephemeral_5m_input_tokens?: number, ephemeral_1h_input_tokens?: number } }} usage — a
 *   reply's `usage`. Its `cache_creation` says how much was written at each lifetime; without it the
 *   whole write is priced as a one-hour one, the dearer, so a cost is never understated.
 * @returns {number}
 */
export function costOf(price, usage = {}) {
  const per = (n, dollarsPerMillion) => (Number(n) || 0) * dollarsPerMillion / 1_000_000;
  const split = usage.cache_creation && typeof usage.cache_creation === "object"
    && (Number.isFinite(usage.cache_creation.ephemeral_5m_input_tokens) || Number.isFinite(usage.cache_creation.ephemeral_1h_input_tokens));
  const written = split
    ? per(usage.cache_creation.ephemeral_5m_input_tokens, price.input * CACHE_WRITE_FACTOR.fiveMinutes)
      + per(usage.cache_creation.ephemeral_1h_input_tokens, price.input * CACHE_WRITE_FACTOR.oneHour)
    : per(usage.cache_creation_input_tokens, price.input * CACHE_WRITE_FACTOR.oneHour);
  return per(usage.input_tokens, price.input)
    + written
    + per(usage.cache_read_input_tokens, price.cacheRead ?? price.input)
    + per(usage.output_tokens, price.output);
}

/** The most a call can cost: its prompt as a one-hour cache write, its `max_tokens` as output. */
export function worstCost(price, { promptChars = 0, maxTokens = 0 } = {}) {
  return costOf(price, {
    cache_creation_input_tokens: Math.ceil(promptChars / CHARS_PER_TOKEN_FLOOR),
    output_tokens: maxTokens,
  });
}

/**
 * @param {{ caps: { actions: number, calls: number, minutes: number, usd: number },
 *   prices: Record<string, { input: number, output: number, cacheRead?: number }>, now?: () => number }} options
 */
export function createBudget({ caps, prices, now = Date.now }) {
  const started = now();
  const open = new Map();          // reservation id → { model, reserved, role }
  const byRole = {};
  let nextId = 1;
  let actions = 0;
  let calls = 0;
  let spent = 0;
  let stopped = null;              // the first cap reached: { cap, detail }

  const reserved = () => [...open.values()].reduce((sum, r) => sum + r.reserved, 0);
  const minutes = () => (now() - started) / 60_000;
  const stop = (cap, detail) => { stopped ??= { cap, detail }; return { ok: false, reason: `${cap}: ${detail}` }; };

  return {
    /** The cap that ended the run, or null while it may go on. Checks the clock. */
    exhausted() {
      if (!stopped && minutes() >= caps.minutes) stop("minutes", `${caps.minutes} minutes of wall clock`);
      return stopped;
    },

    /** Whether another player action fits under the caps. Counts nothing. */
    canAct() { return !this.exhausted() && actions < caps.actions; },

    /** Count one player action; false once the cap is reached (the action is not taken). */
    takeAction() {
      if (this.exhausted()) return false;
      if (actions >= caps.actions) { stop("actions", `${caps.actions} player actions`); return false; }
      actions += 1;
      return true;
    },

    /**
     * Reserve a call before it is sent.
     * @param {{ model: string, maxTokens?: number, promptChars?: number, role?: string }} call
     * @returns {{ ok: true, id: number } | { ok: false, reason: string }}
     */
    reserve({ model, maxTokens = 0, promptChars = 0, role = "module" }) {
      if (this.exhausted()) return { ok: false, reason: `${stopped.cap}: ${stopped.detail}` };
      const price = prices[model];
      if (!price) return stop("unpriced-model", `no price is configured for ${model}`);
      if (calls >= caps.calls) return stop("calls", `${caps.calls} model calls`);
      const worst = worstCost(price, { promptChars, maxTokens });
      if (spent + reserved() + worst > caps.usd) {
        return stop("usd", `$${caps.usd.toFixed(2)} (spent $${spent.toFixed(4)}, in flight $${reserved().toFixed(4)}, this call up to $${worst.toFixed(4)})`);
      }
      const id = nextId++;
      calls += 1;
      open.set(id, { model, reserved: worst, role });
      return { ok: true, id };
    },

    /**
     * A reserved call returned: what it used replaces its reservation. With
     * no usage (the call failed before a reply) nothing is charged.
     */
    settle(id, { usage = null } = {}) {
      const r = open.get(id);
      if (!r) return;
      open.delete(id);
      const cost = usage ? costOf(prices[r.model], usage) : 0;
      spent += cost;
      const tally = (byRole[r.role] ??= { calls: 0, usd: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
      tally.calls += 1;
      tally.usd += cost;
      tally.input += usage?.input_tokens ?? 0;
      tally.output += usage?.output_tokens ?? 0;
      tally.cacheRead += usage?.cache_read_input_tokens ?? 0;
      tally.cacheWrite += usage?.cache_creation_input_tokens ?? 0;
    },

    report() {
      return {
        caps, stopped,
        actions, calls,
        minutes: Number(minutes().toFixed(2)),
        usd: Number(spent.toFixed(4)),
        inFlightUsd: Number(reserved().toFixed(4)),
        byRole: Object.fromEntries(Object.entries(byRole).map(([role, t]) => [role, { ...t, usd: Number(t.usd.toFixed(4)) }])),
      };
    },
  };
}
