#!/usr/bin/env node
// deploy/api-proxy/server.mjs — Stateless API edge (enc-29d7943d, prop-60ea3410=B).
//
// The API container owns no state and touches no host paths: every /api/*
// request (spawn de sesiones pi, streaming SSE, PTY, git, files, settings…)
// streams to the host runner at RUNNER_URL, which is the only process allowed
// to interact with the host. SSE-safe: bodies are piped raw in both directions
// with no buffering and no response timeouts.
//
//   GET /healthz              → liveness of this proxy only (no upstream call)
//   *   /api/*                → proxied to RUNNER_URL + runner token
//   *   anything else         → 404 (the UI lives in the web container)
//
// Env: PORT (3000), RUNNER_URL (http://172.17.0.1:30164), RUNNER_TOKEN (required).
//
// Self-test (real probe, no network needed): node server.mjs --self-test

import http from "node:http";


const PORT = Number(process.env.PORT || 3000);
const RUNNER_URL = new URL(process.env.RUNNER_URL || "http://172.17.0.1:30164");
const RUNNER_TOKEN = () => process.env.RUNNER_TOKEN || "";

// Hop-by-hop headers are per-connection and must never be forwarded.
const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
]);

const upstreamAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 128,
});

function proxyRequest(clientReq, clientRes) {
  const target = new URL(clientReq.url, RUNNER_URL);
  const headers = { ...clientReq.headers };
  for (const header of HOP_BY_HOP) delete headers[header];
  // The runner enforces the browser-facing host/origin checks: preserve the
  // original Host verbatim instead of the runner's own authority.
  headers.host = clientReq.headers.host;
  // The token is the API container's credential — strip anything a client may
  // have sent, then add ours.
  delete headers["x-runner-token"];
  headers["x-runner-token"] = RUNNER_TOKEN();
  const forwardedFor = clientReq.headers["x-forwarded-for"]
    ? `${clientReq.headers["x-forwarded-for"]}, ${clientReq.socket.remoteAddress}`
    : clientReq.socket.remoteAddress;
  headers["x-forwarded-for"] = forwardedFor;
  if (!headers["x-forwarded-proto"]) headers["x-forwarded-proto"] = "http";

  const upstreamReq = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: clientReq.method,
      path: target.pathname + target.search,
      headers,
      agent: upstreamAgent,
    },
    (upstreamRes) => {
      const responseHeaders = { ...upstreamRes.headers };
      for (const header of HOP_BY_HOP) delete responseHeaders[header];
      clientRes.writeHead(upstreamRes.statusCode, responseHeaders);
      upstreamRes.pipe(clientRes);
    },
  );

  upstreamReq.on("error", (error) => {
    if (clientRes.destroyed) return;
    if (clientRes.headersSent) {
      clientRes.destroy();
      return;
    }
    clientRes.writeHead(502, { "content-type": "application/json", "cache-control": "no-store" });
    clientRes.end(JSON.stringify({ error: "runner_unreachable", detail: String(error.code || error.message) }));
  });

  // A disconnected browser must free the runner socket too (EventSource
  // reconnects create these constantly). IncomingMessage 'close' also fires on
  // normal completion, so watch the response: 'close' before it could end
  // cleanly means the client is gone.
  clientRes.on("close", () => {
    if (!clientRes.writableEnded) upstreamReq.destroy();
  });
  clientReq.pipe(upstreamReq);
}

function createServer() {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ ok: true, role: "api-proxy", runner: RUNNER_URL.origin }));
      return;
    }
    if (req.url === "/api" || req.url.startsWith("/api/")) {
      if (!RUNNER_TOKEN()) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "RUNNER_TOKEN is not configured" }));
        return;
      }
      proxyRequest(req, res);
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found", hint: "UI is served by the web container; this service only proxies /api/*" }));
  });
  // requestTimeout would kill long SSE streams (Node default 300 s); headers
  // still get their own sane cap.
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;
  server.keepAliveTimeout = 75_000;
  return server;
}

async function main() {
  const server = createServer();
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[api-proxy] listening on :${PORT} → ${RUNNER_URL.origin} (enc-29d7943d)`);
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// ── self-test ────────────────────────────────────────────────────────────────
// Spins a mock runner + this proxy on ephemeral ports and probes the contract
// the split deployment depends on: passthrough, Host preservation, token
// injection/stripping, SSE streaming (chunks arrive as they are flushed), and
// client-abort propagation.
async function selfTest() {
  let failures = 0;
  const ok = (name, condition) => {
    console.log(`${condition ? "  ✓" : "  ✗"} ${name}`);
    if (!condition) failures++;
  };

  const seen = {};
  const mockRunner = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      seen[req.url] = { method: req.method, headers: req.headers, body };
      if (req.url === "/api/stream") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
        res.write("data: 1\n\n");
        setTimeout(() => res.write("data: 2\n\n"), 120);
        setTimeout(() => { res.write("data: 3\n\n"); res.end(); }, 240);
        return;
      }
      if (req.url === "/api/echo-host") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ host: req.headers.host }));
        return;
      }
      if (req.url === "/api/hang") {
        req.on("close", () => { seen["/api/hang"].aborted = true; });
        res.writeHead(200);
        // never answer; the proxy must propagate the client abort
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise((resolve) => mockRunner.listen(0, "127.0.0.1", resolve));
  const runnerPort = mockRunner.address().port;

  const proxy = createServer();
  process.env.RUNNER_TOKEN = "test-token";
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const proxyPort = proxy.address().port;
  const base = `http://127.0.0.1:${proxyPort}`;
  const runnerBase = `http://127.0.0.1:${runnerPort}`;
  // point the module-level RUNNER_URL at the mock
  RUNNER_URL.href = runnerBase;

  console.log(`[self-test] mock runner :${runnerPort}, proxy :${proxyPort}`);

  // healthz
  const health = await fetch(`${base}/healthz`);
  ok("healthz answers 200 without upstream", health.status === 200 && (await health.json()).ok);

  // method/path/body passthrough + token injection. `fetch` may not set the
  // Host header (forbidden header name), so this probe goes over raw http.
  const seenUrl = await new Promise((resolve, reject) => {
    const probe = http.request(`${base}/api/agent/abc?x=1`, {
      method: "POST",
      headers: { "content-type": "application/json", host: "exohuman.test:30152", "x-runner-token": "spoofed-by-browser" },
    }, (res) => {
      res.resume();
      res.on("end", () => resolve("/api/agent/abc?x=1"));
    });
    probe.on("error", reject);
    probe.end(JSON.stringify({ hello: "world" }));
  });
  ok("POST /api proxied with 200", Boolean(seenUrl));
  const seenPost = seen[seenUrl];
  ok("path and query preserved", Boolean(seenPost));
  ok("method preserved", seenPost?.method === "POST");
  ok("body streamed through", seenPost?.body === JSON.stringify({ hello: "world" }));
  ok("original Host preserved", seenPost?.headers.host === "exohuman.test:30152");
  ok("runner token injected", seenPost?.headers["x-runner-token"] === "test-token");
  ok("x-forwarded-for added", typeof seenPost?.headers["x-forwarded-for"] === "string");

  // a browser-sent token is replaced, not forwarded
  ok("spoofed client token stripped", seenPost?.headers["x-runner-token"] === "test-token");

  // SSE: chunk arrival times must track the mock's flushes (no buffering)
  const events = [];
  const sseStart = Date.now();
  await new Promise((resolve, reject) => {
    const req = http.get(`${base}/api/stream`, { headers: { host: "exohuman.test:30152" } }, (res) => {
      ok("SSE content-type preserved", res.headers["content-type"].includes("text/event-stream"));
      res.on("data", (chunk) => events.push({ t: Date.now() - sseStart, data: String(chunk) }));
      res.on("end", resolve);
      res.on("error", reject);
    });
    req.on("error", reject);
  });
  ok("SSE: all 3 events arrived", events.length === 3);
  ok("SSE: streamed, not buffered", events.length === 3
    && events[1].t >= 100 && events[1].t < 220
    && events[2].t >= 210);

  // client abort reaches the runner
  await new Promise((resolve) => {
    const req = http.get(`${base}/api/hang`, { headers: { host: "exohuman.test:30152" } }, () => {});
    req.on("error", () => {});
    setTimeout(() => req.destroy(), 150);
    setTimeout(resolve, 500);
  });
  ok("client abort propagated to runner", Boolean(seen["/api/hang"]?.aborted));

  // non-API path 404s
  const root = await fetch(`${base}/`);
  ok("non-API path 404s (UI lives in web container)", root.status === 404);

  // upstream down → 502 (not a hang)
  RUNNER_URL.href = "http://127.0.0.1:1";
  const dead = await fetch(`${base}/api/sessions`);
  ok("runner unreachable → 502 json", dead.status === 502 && (await dead.json()).error === "runner_unreachable");

  proxy.close();
  mockRunner.close();
  console.log(failures === 0 ? "[self-test] PASS" : `[self-test] FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

if (process.argv.includes("--self-test")) {
  selfTest().catch((error) => {
    console.error("[self-test] crashed:", error);
    process.exit(1);
  });
} else {
  main().catch((error) => {
    console.error("[api-proxy] fatal:", error);
    process.exit(1);
  });
}
