#!/usr/bin/env node
/**
 * STARFORGED COMPANION — API Proxy
 * proxy/claude-proxy.mjs
 *
 * Thin local reverse proxy for the Foundry Electron renderer, which enforces
 * CORS and cannot make direct calls to external APIs.
 *
 * Routes:
 *   /v1/*           → https://api.anthropic.com/v1/*   (Claude)
 *   /openai/v1/*    → https://api.openai.com/v1/*      (DALL-E)
 *   /health         → 200 OK (health check)
 *
 * Zero dependencies — Node.js built-ins only (http, https).
 *
 * Usage:
 *   npm run proxy                         (from module root)
 *   node proxy/claude-proxy.mjs
 *   node proxy/claude-proxy.mjs --port=3002
 */

import http  from "http";
import https from "https";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const portArg = process.argv.find(a => a.startsWith("--port="));
const PORT    = parseInt(portArg?.split("=")[1] ?? "3001", 10);

const UPSTREAMS = {
  anthropic: { host: "api.anthropic.com", port: 443 },
  openai:    { host: "api.openai.com",    port: 443 },
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": [
    "Content-Type",
    "Authorization",
    "x-api-key",
    "anthropic-version",
    "anthropic-beta",
  ].join(", "),
};

// ─────────────────────────────────────────────────────────────────────────────
// Route resolution
// ─────────────────────────────────────────────────────────────────────────────

function resolveRoute(reqPath) {
  if (reqPath === "/health") {
    return { type: "health" };
  }
  if (reqPath.startsWith("/openai/")) {
    return {
      type:     "proxy",
      upstream: UPSTREAMS.openai,
      path:     reqPath.slice("/openai".length),   // strip /openai prefix
    };
  }
  if (reqPath.startsWith("/v1/")) {
    return {
      type:     "proxy",
      upstream: UPSTREAMS.anthropic,
      path:     reqPath,
    };
  }
  return { type: "notfound" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const route = resolveRoute(req.url);

  // Health check — lets api-proxy.js verify the proxy is running
  if (route.type === "health") {
    res.writeHead(200, { ...CORS_HEADERS, "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", port: PORT }));
    return;
  }

  if (route.type === "notfound") {
    res.writeHead(404, { ...CORS_HEADERS, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Unknown route: ${req.url}` }));
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { ...CORS_HEADERS, "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  // Collect request body
  const chunks = [];
  req.on("data", chunk => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks);

    // Forward headers — strip hop-by-hop headers, set correct host
    const forwardHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (["host", "connection", "content-length"].includes(key.toLowerCase())) continue;
      forwardHeaders[key] = value;
    }
    forwardHeaders["host"]           = route.upstream.host;
    forwardHeaders["content-length"] = Buffer.byteLength(body).toString();

    const options = {
      hostname: route.upstream.host,
      port:     route.upstream.port,
      path:     route.path,
      method:   "POST",
      headers:  forwardHeaders,
    };

    const proxyReq = https.request(options, proxyRes => {
      const responseChunks = [];
      proxyRes.on("data", chunk => responseChunks.push(chunk));
      proxyRes.on("end", () => {
        const responseBody = Buffer.concat(responseChunks);
        res.writeHead(proxyRes.statusCode, {
          ...CORS_HEADERS,
          "Content-Type": proxyRes.headers["content-type"] ?? "application/json",
        });
        res.end(responseBody);
      });
    });

    proxyReq.on("error", err => {
      console.error(`[proxy] Upstream error (${route.upstream.host}):`, err.message);
      res.writeHead(502, { ...CORS_HEADERS, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Upstream request failed", detail: err.message }));
    });

    proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║   Starforged Companion — API Proxy               ║
╠══════════════════════════════════════════════════╣
║   http://127.0.0.1:${PORT}                          ║
║                                                  ║
║   /v1/*        → api.anthropic.com  (Claude)     ║
║   /openai/v1/* → api.openai.com     (DALL-E)     ║
║   /health      → status check                   ║
║                                                  ║
║   Press Ctrl+C to stop                          ║
╚══════════════════════════════════════════════════╝
`.trim());
});

server.on("error", err => {
  if (err.code === "EADDRINUSE") {
    console.error(`[proxy] Port ${PORT} is already in use. Try --port=3002`);
    console.error(`[proxy] If a previous session is still running, kill it first.`);
  } else {
    console.error("[proxy] Server error:", err.message);
  }
  process.exit(1);
});
