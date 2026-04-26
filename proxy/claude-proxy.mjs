#!/usr/bin/env node
/**
 * STARFORGED COMPANION — Claude API Proxy
 * proxy/claude-proxy.mjs
 *
 * Thin local reverse proxy that forwards requests from the Foundry Electron
 * renderer to the Anthropic API. Required because Electron's renderer process
 * enforces CORS, blocking direct calls to api.anthropic.com.
 *
 * Zero dependencies — uses Node.js built-ins only (http, https, url).
 *
 * Usage:
 *   npm run proxy          # from the module root
 *   node proxy/claude-proxy.mjs
 *   node proxy/claude-proxy.mjs --port 3002   # custom port
 *
 * The Foundry module calls http://localhost:PORT/v1/messages
 * The proxy forwards to   https://api.anthropic.com/v1/messages
 *
 * API keys are passed through in the x-api-key header — the proxy never
 * reads or stores them. They travel: Foundry renderer → localhost → Anthropic.
 * The key is never logged.
 */

import http  from "http";
import https from "https";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const PORT          = parseInt(process.argv.find(a => a.startsWith("--port="))?.split("=")[1] ?? "3001");
const ANTHROPIC_HOST = "api.anthropic.com";
const ANTHROPIC_PORT = 443;

// ─────────────────────────────────────────────────────────────────────────────
// CORS headers — allow requests from any localhost origin (Foundry)
// ─────────────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": [
    "Content-Type",
    "x-api-key",
    "anthropic-version",
    "anthropic-beta",
  ].join(", "),
};

// ─────────────────────────────────────────────────────────────────────────────
// Server
// ─────────────────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // Only proxy POST requests to /v1/messages
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

    // Forward headers — pass through x-api-key, anthropic-version, anthropic-beta
    // Strip host, connection, and content-length (Node rebuilds these)
    const forwardHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (["host", "connection", "content-length"].includes(key.toLowerCase())) continue;
      forwardHeaders[key] = value;
    }
    forwardHeaders["host"] = ANTHROPIC_HOST;

    const options = {
      hostname: ANTHROPIC_HOST,
      port:     ANTHROPIC_PORT,
      path:     req.url,
      method:   "POST",
      headers:  {
        ...forwardHeaders,
        "Content-Length": body.length,
      },
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
      console.error("[proxy] Upstream error:", err.message);
      res.writeHead(502, { ...CORS_HEADERS, "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Upstream request failed", detail: err.message }));
    });

    proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`
╔════════════════════════════════════════════╗
║   Starforged Companion — Claude Proxy      ║
║   Listening on http://127.0.0.1:${PORT}      ║
║   Forwarding to api.anthropic.com          ║
║   Press Ctrl+C to stop                     ║
╚════════════════════════════════════════════╝
  `.trim());
});

server.on("error", err => {
  if (err.code === "EADDRINUSE") {
    console.error(`[proxy] Port ${PORT} is already in use. Try --port=3002`);
  } else {
    console.error("[proxy] Server error:", err.message);
  }
  process.exit(1);
});
