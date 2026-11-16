#!/usr/bin/env node
// Zero-dependency local server for the prep app.
// Serves ./public and stores progress in ./data/progress.json.
// Binds to 127.0.0.1 only, so nothing is exposed to your network.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const PORT = Number(process.env.PORT) || 4321;
const HOST = "127.0.0.1";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.PREP_DATA_DIR || path.join(ROOT, "data");
const PROGRESS_FILE = path.join(DATA_DIR, "progress.json");
const MAX_BODY = 2 * 1024 * 1024; // 2 MB

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function readProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

function writeProgress(obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = PROGRESS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, PROGRESS_FILE); // atomic replace: a crash never leaves a half-written file
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function handleApi(req, res) {
  if (req.method === "GET") {
    try {
      return send(res, 200, { progress: readProgress() });
    } catch (e) {
      return send(res, 500, { error: "progress file is unreadable: " + e.message });
    }
  }
  if (req.method === "PUT") {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        send(res, 413, { error: "too large" });
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      if (res.writableEnded) return;
      let obj;
      try {
        obj = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return send(res, 400, { error: "invalid JSON" });
      }
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        return send(res, 400, { error: "expected a JSON object" });
      }
      try {
        writeProgress(obj);
        send(res, 200, { ok: true });
      } catch (e) {
        send(res, 500, { error: e.message });
      }
    });
    return;
  }
  send(res, 405, { error: "method not allowed" });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, "forbidden", "text/plain");
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, "not found", "text/plain");
    send(res, 200, buf, TYPES[path.extname(file)] || "application/octet-stream");
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/progress")) return handleApi(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "method not allowed", "text/plain");
  serveStatic(req, res);
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`Agent prep app running at ${url}`);
    console.log(`Progress is saved to ${PROGRESS_FILE}`);
    console.log("Press Ctrl+C to stop.");
    if (process.argv.includes("--open")) {
      const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      exec(`${cmd} ${url}`);
    }
  });
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      console.log(`Port ${PORT} is already in use. The app is probably already running: open http://localhost:${PORT}`);
      if (process.argv.includes("--open")) exec(`open http://localhost:${PORT}`);
      process.exit(0);
    }
    throw e;
  });
}

module.exports = { server };
