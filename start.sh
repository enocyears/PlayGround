#!/usr/bin/env bash
# Serve the built Barberia static app in the foreground.
# Layout: source + built output stay inside PROJECT_DIR
# (barberia-app/ and barberia-app/dist). OPENCODE_WEB_DIR is used
# only for worker metadata (deployment-output.json).
set -euo pipefail
cd "$(dirname "$0")"

PROJECT_DIR="$PWD"
APP_DIR="$PROJECT_DIR/barberia-app"
DIST_DIR="$APP_DIR/dist"
PORT="${PORT:-3000}"
WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
OUT_JSON="$WEB_DIR/deployment-output.json"
FIXED_JSON="/home/runner/work/_temp/omgithub-web/deployment-output.json"

/usr/bin/time -p mkdir -p "$WEB_DIR"
/usr/bin/time -p test -d "$APP_DIR"
/usr/bin/time -p test -f "$APP_DIR/package.json"

# Install dependencies when node_modules is missing or manifests are newer.
NEED_INSTALL=0
if [ ! -d "$APP_DIR/node_modules" ]; then
  NEED_INSTALL=1
elif [ "$APP_DIR/package.json" -nt "$APP_DIR/node_modules" ]; then
  NEED_INSTALL=1
elif [ -f "$APP_DIR/package-lock.json" ] && [ "$APP_DIR/package-lock.json" -nt "$APP_DIR/node_modules" ]; then
  NEED_INSTALL=1
fi
if [ "$NEED_INSTALL" = 1 ]; then
  if [ -f "$APP_DIR/package-lock.json" ]; then
    /usr/bin/time -p npm --prefix "$APP_DIR" ci --no-audit --no-fund
  else
    /usr/bin/time -p npm --prefix "$APP_DIR" install --no-audit --no-fund
  fi
fi

# Build only when dist is missing or sources are newer than the bundle.
NEED_BUILD=0
if [ ! -f "$DIST_DIR/index.html" ]; then
  NEED_BUILD=1
elif /usr/bin/time -p find "$APP_DIR/src" "$APP_DIR/index.html" "$APP_DIR/package.json" "$APP_DIR/vite.config.js" "$APP_DIR/tailwind.config.js" -newer "$DIST_DIR/index.html" -print -quit | /usr/bin/time -p grep -q .; then
  NEED_BUILD=1
fi
if [ "$NEED_BUILD" = 1 ]; then
  /usr/bin/time -p npm --prefix "$APP_DIR" run build
fi
/usr/bin/time -p test -f "$DIST_DIR/index.html"

# Publish the built static directory for the controller.
# JSON: {"project": PROJECT_DIR, "directory": absolute dist dir}.
/usr/bin/time -p node -e 'var fs=require("node:fs");var path=require("node:path");var a=process.argv.slice(1);var payload=JSON.stringify({project:a[0],directory:a[1]});[a[2],a[3]].forEach(function(f){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,payload);});' "$PROJECT_DIR" "$DIST_DIR" "$OUT_JSON" "$FIXED_JSON"
/usr/bin/time -p cat "$OUT_JSON"

# Static file server in the foreground (keeps the tmux session alive).
# SPA fallback to index.html; stays on PORT (default 3000).
/usr/bin/time -p node - "$DIST_DIR" "$PORT" <<'SERVER_EOF'
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(process.argv[2] || ".");
const port = Number(process.argv[3] || 3000);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".wasm": "application/wasm" };
const server = http.createServer((req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
    const url = new URL(req.url, "http://localhost");
    let p = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (p !== root && !p.startsWith(root + path.sep)) { res.writeHead(404); res.end("Not found"); return; }
    let isDir = false;
    try { isDir = fs.statSync(p).isDirectory(); } catch { isDir = false; }
    if (isDir) p = path.join(p, "index.html");
    if (!fs.existsSync(p)) p = path.join(root, "index.html");
    const body = fs.readFileSync(p);
    res.writeHead(200, { "Content-Type": MIME[path.extname(p).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
    if (req.method === "HEAD") res.end(); else res.end(body);
  } catch { try { res.writeHead(404); res.end("Not found"); } catch {} }
});
server.listen(port, "0.0.0.0", () => console.log("Serving " + root + " on :" + port));
SERVER_EOF
